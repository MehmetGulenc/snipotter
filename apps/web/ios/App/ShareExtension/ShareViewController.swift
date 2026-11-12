import UIKit
import UniformTypeIdentifiers

/// "Share → Snipotter": saves the shared text or link to the clipboard history,
/// shows a short confirmation and closes.
final class ShareViewController: UIViewController {
    private let card = UIView()
    private let icon = UIImageView()
    private let label = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.25)

        card.backgroundColor = UIColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1)
        card.layer.cornerRadius = 20
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        icon.tintColor = UIColor(red: 0.55, green: 0.45, blue: 0.96, alpha: 1)
        icon.contentMode = .scaleAspectFit
        icon.isHidden = true
        label.textColor = .white
        label.font = .preferredFont(forTextStyle: .headline)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textAlignment = .center
        label.text = "Snipotter'a kaydediliyor…"
        spinner.color = .white
        spinner.startAnimating()

        let stack = UIStackView(arrangedSubviews: [spinner, icon, label])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.widthAnchor.constraint(equalToConstant: 260),
            icon.widthAnchor.constraint(equalToConstant: 40),
            icon.heightAnchor.constraint(equalToConstant: 40),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await handleShare() }
    }

    private func handleShare() async {
        let text = await sharedText()
        let outcome = await SnipotterShared.save(text: text ?? "", source: "ios-share")
        switch outcome {
        case .saved:
            finish(symbol: "checkmark.circle.fill", message: "Snipotter'a kaydedildi")
        case .queued:
            finish(symbol: "clock.fill", message: "Kaydedildi. Snipotter'ı açınca diğer cihazlarına gönderilecek.")
        case .empty:
            finish(symbol: "exclamationmark.circle.fill", message: "Paylaşılan içerikte metin yok")
        }
    }

    @MainActor
    private func finish(symbol: String, message: String) {
        spinner.stopAnimating()
        spinner.isHidden = true
        icon.image = UIImage(systemName: symbol)
        icon.isHidden = false
        label.text = message
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    /// First plain text or URL among the shared items.
    private func sharedText() async -> String? {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }
        for type in [UTType.plainText, UTType.url] {
            for provider in providers where provider.hasItemConformingToTypeIdentifier(type.identifier) {
                if let value = try? await provider.loadItem(forTypeIdentifier: type.identifier) {
                    if let text = value as? String { return text }
                    if let url = value as? URL { return url.absoluteString }
                    if let data = value as? Data { return String(data: data, encoding: .utf8) }
                }
            }
        }
        return nil
    }
}
