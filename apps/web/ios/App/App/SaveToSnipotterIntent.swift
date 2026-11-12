import AppIntents
import UIKit

/// "Snipotter'a kaydet" action for the Shortcuts app. A two-step shortcut
/// (Get Clipboard → Snipotter'a kaydet) bound to Back Tap saves whatever was
/// just copied without opening the app.
@available(iOS 16.0, *)
struct SaveToSnipotterIntent: AppIntent {
    static var title: LocalizedStringResource = "Snipotter'a kaydet"
    static var description = IntentDescription("Metni Snipotter pano geçmişine kaydeder; diğer cihazların hemen görür.")
    static var openAppWhenRun = false

    @Parameter(title: "Metin", inputOptions: String.IntentInputOptions(multiline: true))
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$text) metnini Snipotter'a kaydet")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        switch await SnipotterShared.save(text: text, source: "ios-shortcut") {
        case .saved:
            return .result(dialog: "Snipotter'a kaydedildi")
        case .queued:
            return .result(dialog: "Kaydedildi; Snipotter'ı açınca diğer cihazlarına gönderilecek")
        case .empty:
            return .result(dialog: "Kaydedilecek metin yok")
        }
    }
}

/// A saved clip as Siri and Shortcuts see it (pinned clips and the latest ones).
@available(iOS 16.0, *)
struct ClipEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Kayıt"
    static var defaultQuery = ClipQuery()

    let id: String
    let text: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(String(text.replacingOccurrences(of: "\n", with: " ").prefix(60)))")
    }
}

@available(iOS 16.0, *)
struct ClipQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [ClipEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [ClipEntity] {
        let needle = string.lowercased()
        return all().filter { $0.text.lowercased().contains(needle) }
    }

    func suggestedEntities() async throws -> [ClipEntity] { all() }

    private func all() -> [ClipEntity] {
        SnipotterShared.recent().map { ClipEntity(id: $0.id, text: $0.text) }
    }
}

/// "Snipotter'dan kopyala": puts a saved clip on the clipboard without opening the app.
@available(iOS 16.0, *)
struct CopyFromSnipotterIntent: AppIntent {
    static var title: LocalizedStringResource = "Snipotter'dan kopyala"
    static var description = IntentDescription("Sabitlediğin ya da son kaydettiğin bir metni panoya kopyalar.")
    static var openAppWhenRun = false

    @Parameter(title: "Kayıt")
    var clip: ClipEntity

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$clip) kaydını kopyala")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await MainActor.run { UIPasteboard.general.string = clip.text }
        return .result(dialog: "Kopyalandı")
    }
}

@available(iOS 16.0, *)
struct SnipotterShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SaveToSnipotterIntent(),
            phrases: ["\(.applicationName) ile kaydet", "\(.applicationName)'a kaydet"],
            shortTitle: "Snipotter'a kaydet",
            systemImageName: "doc.on.clipboard"
        )
        AppShortcut(
            intent: CopyFromSnipotterIntent(),
            phrases: ["\(.applicationName)'dan kopyala", "\(.applicationName) kaydını kopyala"],
            shortTitle: "Snipotter'dan kopyala",
            systemImageName: "doc.on.doc"
        )
    }
}
