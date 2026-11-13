import Foundation
import Capacitor
import WidgetKit
import EventKit
import EventKitUI
import UserNotifications
import ActivityKit

/// Bridge between the web app and the native extensions. The web app owns the
/// Supabase session and the clip list; it mirrors what the extensions need here.
@objc(SnipotterNativePlugin)
public class SnipotterNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SnipotterNativePlugin"
    public let jsName = "SnipotterNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "registerPush", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "copyRich", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRecentClips", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWorkspaceKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWorkspaceKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWorkspaceKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveActivityToken", returnType: CAPPluginReturnPromise),
    ]

    private var pushCall: CAPPluginCall?
    private var pushTimeout: DispatchWorkItem?

    public override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(pushRegistered(_:)), name: .snipotterPushRegistered, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(pushFailed(_:)), name: .snipotterPushFailed, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(pushAction(_:)), name: .snipotterPushAction, object: nil)
        if let action = AppDelegate.pendingPushAction {
            AppDelegate.pendingPushAction = nil
            notifyListeners("pushAction", data: action, retainUntilConsumed: true)
        }
    }

    @objc func registerPush(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pushCall == nil else { call.reject("Bildirim kaydı sürüyor"); return }
            self.pushCall = call
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
                DispatchQueue.main.async {
                    guard granted, error == nil else {
                        self.pushCall?.reject("Bildirim izni verilmedi")
                        self.pushCall = nil
                        return
                    }
                    let timeout = DispatchWorkItem { [weak self] in
                        self?.pushCall?.reject("APNs kaydı zaman aşımına uğradı")
                        self?.pushCall = nil
                    }
                    self.pushTimeout = timeout
                    DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timeout)
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    @objc private func pushRegistered(_ notification: Notification) {
        pushTimeout?.cancel()
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        pushCall?.resolve(["token": notification.object as? String ?? "", "environment": environment])
        pushCall = nil
    }

    @objc private func pushFailed(_ notification: Notification) {
        pushTimeout?.cancel()
        pushCall?.reject("APNs kaydı başarısız")
        pushCall = nil
    }

    @objc private func pushAction(_ notification: Notification) {
        guard let data = notification.userInfo as? [String: Any] else { return }
        AppDelegate.pendingPushAction = nil
        notifyListeners("pushAction", data: data, retainUntilConsumed: true)
    }

    /// Push-to-start token for the shared-space Dynamic Island (iOS 17.2+); empty when unavailable.
    @objc func liveActivityToken(_ call: CAPPluginCall) {
        guard #available(iOS 17.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve([:]); return }
        let wait = Task { () -> String? in
            for await data in Activity<SpaceNoteAttributes>.pushToStartTokenUpdates {
                return data.map { String(format: "%02x", $0) }.joined()
            }
            return nil
        }
        Task {
            let timeout = Task { try? await Task.sleep(nanoseconds: 8_000_000_000); wait.cancel() }
            let token = await wait.value
            timeout.cancel()
            if let token { call.resolve(["token": token]) } else { call.resolve([:]) }
        }
    }

    @objc func copyRich(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else { call.reject("Metin eksik"); return }
        DispatchQueue.main.async {
            var item: [String: Any] = ["public.utf8-plain-text": text]
            if let html = call.getString("html") { item["public.html"] = Data(html.utf8) }
            UIPasteboard.general.setItems([item])
            call.resolve()
        }
    }

    @objc func syncSession(_ call: CAPPluginCall) {
        guard let url = call.getString("url"),
              let anonKey = call.getString("anonKey"),
              let accessToken = call.getString("accessToken"),
              let expiresAt = call.getDouble("expiresAt"),
              let userId = call.getString("userId"),
              let workspaceId = call.getString("workspaceId") else {
            call.reject("Eksik oturum bilgisi")
            return
        }
        SnipotterShared.storeSession(.init(
            url: url, anonKey: anonKey, accessToken: accessToken,
            expiresAt: expiresAt, userId: userId, workspaceId: workspaceId
        ))
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        SnipotterShared.clearSession()
        SnipotterShared.storeRecent([])
        reloadWidgets()
        call.resolve()
    }

    @objc func setRecentClips(_ call: CAPPluginCall) {
        let items = (call.getArray("items") as? [[String: Any]] ?? []).compactMap { item -> SnipotterShared.RecentClip? in
            guard let id = item["id"] as? String, let text = item["text"] as? String else { return nil }
            return .init(
                id: id,
                text: String(text.prefix(300)),
                createdAt: item["createdAt"] as? String ?? "",
                pinned: item["pinned"] as? Bool ?? false
            )
        }
        SnipotterShared.storeRecent(items)
        reloadWidgets()
        call.resolve()
    }

    @objc func takePending(_ call: CAPPluginCall) {
        let items = SnipotterShared.takePending().map { ["text": $0.text, "source": $0.source] }
        call.resolve(["items": items])
    }

    // MARK: End-to-end encryption key (shared Keychain, readable by the extensions)

    @objc func setWorkspaceKey(_ call: CAPPluginCall) {
        guard let workspaceId = call.getString("workspaceId"), UUID(uuidString: workspaceId) != nil,
              let b64 = call.getString("key"), let key = Data(base64Encoded: b64), key.count == 32 else {
            call.reject("Geçersiz anahtar")
            return
        }
        SnipotterShared.storeWorkspaceKey(key, workspaceId: workspaceId)
        call.resolve()
    }

    @objc func getWorkspaceKey(_ call: CAPPluginCall) {
        guard let workspaceId = call.getString("workspaceId") else { call.reject("Eksik çalışma alanı"); return }
        call.resolve(["key": SnipotterShared.loadWorkspaceKey(workspaceId: workspaceId)?.base64EncodedString() as Any])
    }

    @objc func deleteWorkspaceKey(_ call: CAPPluginCall) {
        guard let workspaceId = call.getString("workspaceId") else { call.reject("Eksik çalışma alanı"); return }
        SnipotterShared.deleteWorkspaceKey(workspaceId: workspaceId)
        call.resolve()
    }

    private let eventStore = EKEventStore()
    private var eventDelegate: EventEditDelegate?

    /// Opens the system "New Event" sheet prefilled; the user confirms or cancels there.
    @objc func addEvent(_ call: CAPPluginCall) {
        guard let title = call.getString("title"), let startMs = call.getDouble("start") else {
            call.reject("Eksik etkinlik bilgisi")
            return
        }
        let present = { [weak self] in
            guard let self else { return }
            let event = EKEvent(eventStore: self.eventStore)
            event.title = title
            event.startDate = Date(timeIntervalSince1970: startMs / 1000)
            event.endDate = event.startDate.addingTimeInterval(call.getDouble("durationMin", 60) * 60)
            event.notes = call.getString("notes")
            let editor = EKEventEditViewController()
            editor.eventStore = self.eventStore
            editor.event = event
            let delegate = EventEditDelegate { action in
                call.resolve(["saved": action == .saved])
            }
            self.eventDelegate = delegate
            editor.editViewDelegate = delegate
            self.bridge?.viewController?.present(editor, animated: true)
        }
        if #available(iOS 17.0, *) {
            // The editor runs out of process and needs no calendar permission.
            DispatchQueue.main.async(execute: present)
        } else {
            eventStore.requestAccess(to: .event) { granted, _ in
                guard granted else {
                    call.reject("Takvim izni verilmedi")
                    return
                }
                DispatchQueue.main.async(execute: present)
            }
        }
    }

    private func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}

private final class EventEditDelegate: NSObject, EKEventEditViewDelegate {
    private let done: (EKEventEditViewAction) -> Void
    init(done: @escaping (EKEventEditViewAction) -> Void) { self.done = done }

    func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true)
        done(action)
    }
}
