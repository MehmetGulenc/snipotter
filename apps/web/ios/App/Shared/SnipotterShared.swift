import Foundation
import CryptoKit
import Security

/// Shared between the app, the Share extension and the widget through the
/// `group.com.snipotter.app` App Group.
///
/// The app is the only process that refreshes the Supabase session: refresh
/// tokens rotate, so a second refresher would sign the app out. Extensions use
/// the access token the app last stored while it is still valid, and queue the
/// text otherwise; the app uploads the queue the next time it becomes active.
enum SnipotterShared {
    static let appGroup = "group.com.snipotter.app"
    private static let sessionService = "com.snipotter.session"
    private static let pendingKey = "pendingClips"
    private static let recentKey = "recentClips"
    private static let maxPending = 200
    private static let maxTextLength = 100_000

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    // MARK: Session (Keychain, shared through the App Group access group)

    struct Session: Codable {
        let url: String
        let anonKey: String
        let accessToken: String
        /// Seconds since 1970.
        let expiresAt: Double
        let userId: String
        let workspaceId: String

        var isUsable: Bool { Date().timeIntervalSince1970 < expiresAt - 60 }
    }

    static func storeSession(_ session: Session) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        clearSession()
        var query = baseKeychainQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }

    static func loadSession() -> Session? {
        var query = baseKeychainQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    static func clearSession() {
        SecItemDelete(baseKeychainQuery() as CFDictionary)
    }

    private static func baseKeychainQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: sessionService,
            kSecAttrAccount as String: "current",
            kSecAttrAccessGroup as String: appGroup,
        ]
    }

    // MARK: Pending queue (texts saved while no usable session was available)

    struct PendingClip: Codable {
        let text: String
        let source: String
        let createdAt: Double
    }

    static func enqueue(_ text: String, source: String) {
        var items = pending()
        items.append(PendingClip(text: text, source: source, createdAt: Date().timeIntervalSince1970))
        writePending(Array(items.suffix(maxPending)))
    }

    /// Returns and removes everything queued.
    static func takePending() -> [PendingClip] {
        let items = pending()
        writePending([])
        return items
    }

    private static func pending() -> [PendingClip] {
        guard let data = defaults?.data(forKey: pendingKey) else { return [] }
        return (try? JSONDecoder().decode([PendingClip].self, from: data)) ?? []
    }

    private static func writePending(_ items: [PendingClip]) {
        defaults?.set(try? JSONEncoder().encode(items), forKey: pendingKey)
    }

    // MARK: Recent clips (written by the app, shown by the widget)

    struct RecentClip: Codable, Identifiable {
        let id: String
        let text: String
        let createdAt: String
        let pinned: Bool
    }

    static func storeRecent(_ clips: [RecentClip]) {
        defaults?.set(try? JSONEncoder().encode(Array(clips.prefix(20))), forKey: recentKey)
    }

    static func recent() -> [RecentClip] {
        guard let data = defaults?.data(forKey: recentKey) else { return [] }
        return (try? JSONDecoder().decode([RecentClip].self, from: data)) ?? []
    }

    // MARK: Saving

    enum SaveOutcome {
        case saved, queued, empty
    }

    /// Uploads the text now when a valid session is stored, otherwise queues it for the app.
    static func save(text raw: String, source: String) async -> SaveOutcome {
        let text = String(raw.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxTextLength))
        guard !text.isEmpty else { return .empty }
        guard let session = loadSession(), session.isUsable else {
            enqueue(text, source: source)
            return .queued
        }
        do {
            try await upload(text: text, source: source, session: session)
            return .saved
        } catch {
            enqueue(text, source: source)
            return .queued
        }
    }

    private static func upload(text: String, source: String, session: Session) async throws {
        guard let url = URL(string: "\(session.url)/rest/v1/clipboard_items") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue(session.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        // Same row shape the web app writes (src/lib/api.ts createClipFromText).
        let body: [String: Any?] = [
            "workspace_id": session.workspaceId,
            "created_by": session.userId,
            "content_type": "text",
            "text": text,
            "hash": sha1Hex(text),
            "html": nil,
            "source_app": source,
            "pinned": false,
            "ai": nil,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body.mapValues { $0 ?? NSNull() })
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    static func sha1Hex(_ text: String) -> String {
        Insecure.SHA1.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
