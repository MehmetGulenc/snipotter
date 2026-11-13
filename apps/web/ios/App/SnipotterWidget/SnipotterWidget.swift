import WidgetKit
import SwiftUI
import ActivityKit

/// Home screen widget with the latest clips. Tapping one opens the app, which
/// copies it (snipotter://copy?id=…). The app reloads this widget whenever its
/// clip list changes.
struct ClipEntry: TimelineEntry {
    let date: Date
    let clips: [SnipotterShared.RecentClip]
}

struct ClipProvider: TimelineProvider {
    func placeholder(in context: Context) -> ClipEntry {
        ClipEntry(date: Date(), clips: [
            .init(id: "1", text: "Toplantı notu: Perşembe 14:00", createdAt: "", pinned: false),
            .init(id: "2", text: "https://snipotter.com", createdAt: "", pinned: false),
            .init(id: "3", text: "Alışveriş: süt, yumurta, kahve", createdAt: "", pinned: false),
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (ClipEntry) -> Void) {
        let clips = SnipotterShared.recent()
        completion(clips.isEmpty && context.isPreview ? placeholder(in: context) : ClipEntry(date: Date(), clips: clips))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ClipEntry>) -> Void) {
        completion(Timeline(entries: [ClipEntry(date: Date(), clips: SnipotterShared.recent())], policy: .never))
    }
}

struct SnipotterWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ClipEntry

    private var limit: Int {
        switch family {
        case .systemSmall: return 1
        case .systemLarge: return 6
        default: return 3
        }
    }

    var body: some View {
        if #available(iOSApplicationExtension 16.0, *), family == .accessoryRectangular || family == .accessoryInline {
            LockScreenClipView(clip: entry.clips.first(where: \.pinned) ?? entry.clips.first, inline: family == .accessoryInline)
        } else {
            homeScreen
        }
    }

    private var homeScreen: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "doc.on.clipboard.fill")
                    .foregroundStyle(Color.accent)
                Text("Snipotter")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
            }
            if entry.clips.isEmpty {
                Spacer()
                Text("Kopyaladıkların burada görünecek")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Spacer()
            } else {
                ForEach(entry.clips.prefix(limit)) { clip in
                    Link(destination: URL(string: "snipotter://copy?id=\(clip.id)")!) {
                        Text(clip.text.replacingOccurrences(of: "\n", with: " "))
                            .font(family == .systemSmall ? .footnote : .subheadline)
                            .lineLimit(family == .systemSmall ? 4 : 2)
                            .foregroundStyle(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 6)
                            .padding(.horizontal, 8)
                            .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                    }
                    .accessibilityLabel("Kopyala: \(clip.text)")
                }
                Spacer(minLength: 0)
            }
        }
        .widgetBackground(Color(red: 0.06, green: 0.06, blue: 0.08))
    }
}

/// Lock screen: the first pinned clip (IBAN, Wi-Fi password, door code…), tap to copy.
@available(iOSApplicationExtension 16.0, *)
struct LockScreenClipView: View {
    let clip: SnipotterShared.RecentClip?
    let inline: Bool

    var body: some View {
        Group {
            if inline {
                Label(clip.map { oneLine($0.text) } ?? "Snipotter", systemImage: "doc.on.clipboard")
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Label(clip?.pinned == true ? "Sabitlenmiş" : "Son kopyalanan", systemImage: "pin.fill")
                        .font(.caption2.weight(.semibold))
                        .widgetAccentable()
                    Text(clip.map { oneLine($0.text) } ?? "Bir kaydı sabitle, burada görünsün")
                        .font(.headline)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .widgetURL(clip.flatMap { URL(string: "snipotter://copy?id=\($0.id)") })
        .lockScreenBackground()
    }

    private func oneLine(_ text: String) -> String {
        text.replacingOccurrences(of: "\n", with: " ")
    }
}

extension View {
    @ViewBuilder
    func lockScreenBackground() -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(.clear, for: .widget)
        } else {
            self
        }
    }
}

extension Color {
    static let accent = Color(red: 0.55, green: 0.45, blue: 0.96)
}

extension View {
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(color, for: .widget)
        } else {
            padding().background(color)
        }
    }
}

@main
struct SnipotterWidgets: WidgetBundle {
    var body: some Widget {
        SnipotterWidget()
        if #available(iOSApplicationExtension 16.1, *) {
            SpaceNoteLiveActivity()
        }
    }
}

struct SnipotterWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SnipotterRecentClips", provider: ClipProvider()) { entry in
            SnipotterWidgetView(entry: entry)
        }
        .configurationDisplayName("Son kopyalananlar")
        .description("Pano geçmişindeki son kayıtlar. Dokununca kopyalanır.")
        .supportedFamilies(Self.families)
    }

    private static var families: [WidgetFamily] {
        var families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge]
        if #available(iOSApplicationExtension 16.0, *) {
            families += [.accessoryRectangular, .accessoryInline]
        }
        return families
    }
}

// MARK: Dynamic Island / Lock Screen: new note in a shared space

@available(iOSApplicationExtension 16.1, *)
struct SpaceNoteLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SpaceNoteAttributes.self) { context in
            let t = SpaceNoteText.open(context.attributes, context.state)
            HStack(spacing: 12) {
                Image(systemName: "person.2.fill").font(.title2).foregroundColor(.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(t.author) · \(t.space)").font(.caption).foregroundColor(.secondary).lineLimit(1)
                    Text(t.title).font(.headline).lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.8))
            .activitySystemActionForegroundColor(.white)
            .widgetURL(Self.url(context.attributes, context.state))
        } dynamicIsland: { context in
            let t = SpaceNoteText.open(context.attributes, context.state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "person.2.fill").foregroundColor(.purple).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(t.space).font(.caption).foregroundColor(.secondary).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(t.author) yeni not ekledi").font(.caption).foregroundColor(.secondary).lineLimit(1)
                        Text(t.title).font(.headline).lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "person.2.fill").foregroundColor(.purple)
            } compactTrailing: {
                Text(t.author).font(.caption2).lineLimit(1).frame(maxWidth: 64)
            } minimal: {
                Image(systemName: "note.text").foregroundColor(.purple)
            }
            .widgetURL(Self.url(context.attributes, context.state))
            .keylineTint(.purple)
        }
    }

    static func url(_ a: SpaceNoteAttributes, _ s: SpaceNoteAttributes.ContentState) -> URL? {
        URL(string: "snipotter://not?space=\(a.spaceId)&note=\(s.noteId)")
    }
}
