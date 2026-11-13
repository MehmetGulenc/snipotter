import UIKit
import Capacitor
import UserNotifications
import ActivityKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    static var pendingPushAction: [String: Any]?
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if DEBUG
        // Simulator check of the Dynamic Island layout: launch with -debugActivity.
        if ProcessInfo.processInfo.arguments.contains("-debugActivity"), #available(iOS 16.2, *) {
            let attrs = SpaceNoteAttributes(spaceId: UUID().uuidString.lowercased(), personId: "none", wrappedKey: "", spaceName: "")
            let state = SpaceNoteAttributes.ContentState(noteId: UUID().uuidString.lowercased(), title: "", author: "", authorId: "")
            _ = try? Activity.request(attributes: attrs, content: .init(state: state, staleDate: nil))
        }
        #endif
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let call = UNNotificationAction(identifier: "call", title: "Ara", options: [.foreground])
        let map = UNNotificationAction(identifier: "map", title: "Haritada aç", options: [.foreground])
        let copy = UNNotificationAction(identifier: "copy", title: "Kopyala", options: [.foreground])
        let open = UNNotificationAction(identifier: "open", title: "Aç", options: [.foreground])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: "SNIPOTTER_PHONE", actions: [call, copy], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "SNIPOTTER_ADDRESS", actions: [map, copy], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "SNIPOTTER_URL", actions: [open, copy], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: "SNIPOTTER_COPY", actions: [copy], intentIdentifiers: [], options: []),
        ])
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // The app is open: "new note" Live Activities have done their job.
        if #available(iOS 16.2, *) {
            Task {
                for activity in Activity<SpaceNoteAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .snipotterPushRegistered, object: token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .snipotterPushFailed, object: nil)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        defer { completionHandler() }
        let info = response.notification.request.content.userInfo
        // "New note in your shared space": open that space's notes. Ids only; content stays encrypted.
        if response.notification.request.content.categoryIdentifier == "SNIPOTTER_SPACE_NOTE" {
            guard let space = info["space_id"] as? String, UUID(uuidString: space) != nil,
                  let note = info["note_id"] as? String, UUID(uuidString: note) != nil else { return }
            let action: [String: Any] = ["actionId": note, "kind": "space_note", "payload": space, "button": "open"]
            DispatchQueue.main.async {
                AppDelegate.pendingPushAction = action
                NotificationCenter.default.post(name: .snipotterPushAction, object: nil, userInfo: action)
            }
            return
        }
        guard ["SNIPOTTER_PHONE", "SNIPOTTER_ADDRESS", "SNIPOTTER_URL", "SNIPOTTER_COPY"].contains(response.notification.request.content.categoryIdentifier),
              let id = info["action_id"] as? String, UUID(uuidString: id) != nil,
              let kind = info["kind"] as? String, ["phone", "address", "iban", "url", "text"].contains(kind),
              let payload = info["payload"] as? String, payload.count <= 2000 else { return }
        let allowed: [String]
        switch kind {
        case "phone": allowed = ["call", "copy"]
        case "address": allowed = ["map", "copy"]
        case "url": allowed = ["open", "copy"]
        default: allowed = ["copy"]
        }
        let button = allowed.contains(response.actionIdentifier) ? response.actionIdentifier : "open"
        let action: [String: Any] = ["actionId": id, "kind": kind, "payload": payload, "button": button]
        DispatchQueue.main.async {
            AppDelegate.pendingPushAction = action
            NotificationCenter.default.post(name: .snipotterPushAction, object: nil, userInfo: action)
        }
    }

}


extension Notification.Name {
    static let snipotterPushRegistered = Notification.Name("snipotterPushRegistered")
    static let snipotterPushFailed = Notification.Name("snipotterPushFailed")
    static let snipotterPushAction = Notification.Name("snipotterPushAction")
}
