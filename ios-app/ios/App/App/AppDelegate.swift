import UIKit
import Capacitor
#if canImport(StraznikBackgroundPlugin)
import StraznikBackgroundPlugin
#endif

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if canImport(StraznikBackgroundPlugin)
        AlarmKitProba.oznaczDelegata()
        #endif
        return true
    }

    // PRÓBA AlarmKit (21.09.2026): serwer dokleja `content-available` i `alarmkit=1`
    // tylko do tematów testowych. iOS budzi wtedy aplikację (także zamkniętą, w tle)
    // na ~30 s — sprawdzamy, czy w tym czasie da się zaplanować alarm przebijający
    // wyciszenie. Zwykłe powiadomienia idą dalej bez zmian: baner i dźwięk rysuje system.
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        #if canImport(StraznikBackgroundPlugin)
        let droga = application.applicationState == .active ? "push (aplikacja otwarta)" : "push w tle"
        if AlarmKitProba.obsluzPowiadomienie(userInfo, droga: droga, gotowe: { completionHandler(.newData) }) {
            return
        }
        #endif
        completionHandler(.noData)
    }

    // Token APNs → plugin StraznikBackground (przekazuje go do Firebase i zapisuje
    // telefon do tematów województw). Standardowy sposób z dokumentacji Capacitora.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
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
