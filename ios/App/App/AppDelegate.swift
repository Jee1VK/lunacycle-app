import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let privacyOverlayTag = 994821

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        excludeLocalVaultFromCloudBackup()
        return true
    }

    private func excludeLocalVaultFromCloudBackup() {
        let paths: [FileManager.SearchPathDirectory] = [.libraryDirectory, .documentDirectory]
        for dir in paths {
            guard var url = FileManager.default.urls(for: dir, in: .userDomainMask).first else { continue }
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? url.setResourceValues(values)
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        guard let win = window, win.viewWithTag(privacyOverlayTag) == nil else { return }
        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterialDark))
        blur.frame = win.bounds
        blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        blur.tag = privacyOverlayTag
        win.addSubview(blur)
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        window?.viewWithTag(privacyOverlayTag)?.removeFromSuperview()
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
