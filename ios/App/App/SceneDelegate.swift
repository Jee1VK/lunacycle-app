import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let privacyOverlayTag = 994821

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        if window == nil {
            window = UIWindow(windowScene: windowScene)
            window?.rootViewController = CAPBridgeViewController()
            window?.makeKeyAndVisible()
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        // Shield cycle, pregnancy, and PIN screens from iOS App Switcher snapshots
        guard let win = window, win.viewWithTag(privacyOverlayTag) == nil else { return }
        let shield = UIView(frame: win.bounds)
        shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shield.backgroundColor = UIColor(red: 0.227, green: 0.051, blue: 0.094, alpha: 0.94)
        shield.tag = privacyOverlayTag

        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterialDark))
        blur.frame = shield.bounds
        blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shield.addSubview(blur)

        win.addSubview(shield)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        window?.viewWithTag(privacyOverlayTag)?.removeFromSuperview()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
