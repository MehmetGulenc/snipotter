import UIKit
import Capacitor

/// The app's root view controller (Main.storyboard). Registers plugins that live
/// in the app target rather than in an npm package.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SnipotterNativePlugin())
    }
}
