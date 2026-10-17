import Foundation
import UIKit
import AVFoundation
import UserNotifications
import Capacitor
import WebKit
import FirebaseCore
import FirebaseMessaging

/// Most JS ↔ iOS pod tą samą nazwą co na Androidzie (`StraznikBackground`), żeby
/// wspólny `app.js` działał bez zmian.
///
/// Różnica względem Androida: tam wiadomość FCM jest `data-only` i telefon sam
/// buduje alarm. Na iOS aplikacja zamknięta nie dostaje takiej wiadomości —
/// powiadomienie wyświetla system z bloku `apns` przygotowanego przez serwer.
/// Ten plugin dba więc tylko o to, żeby telefon był zapisany do właściwych
/// tematów, pokazuje stan zgód i przekazuje push do WebView, gdy aplikacja jest
/// na wierzchu. Metod Androidowych bez odpowiednika w iOS nie ma sensu udawać —
/// zwracają „nieobsługiwane” albo nic nie robią.
///
/// UWAGA: Capacitor CLI rozpoznaje klasę pluginu po PIERWSZYM wystąpieniu
/// `@objc(` w pliku — nie dodawać wyżej innych adnotacji tego typu.
@objc(StraznikBackgroundPlugin)
public class StraznikBackgroundPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol, MessagingDelegate {
    public let identifier = "StraznikBackgroundPlugin"
    public let jsName = "StraznikBackground"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setHomeVoivodeship", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setObservedVoivodeships", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPushLanguage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setYellowLevel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setForceMaxVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testNativeAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dzwiekAlarmu", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "zgodaKrytyczna", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canInstallUpdates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestInstallPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "installUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestFullScreenPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBatteryExemption", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSoundSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise)
    ]

    /// Ta sama lista i kolejność co `Alarms.VOIVS` (Android), `config.VOIVODESHIPS`
    /// (backend) i `VOIVODESHIPS` (engine.js).
    static let voivodeships = [
        "lubelskie", "podkarpackie", "podlaskie", "mazowieckie", "świętokrzyskie",
        "małopolskie", "warmińsko-mazurskie", "łódzkie", "śląskie", "kujawsko-pomorskie",
        "pomorskie", "zachodniopomorskie", "lubuskie", "wielkopolskie", "dolnośląskie",
        "opolskie"
    ]

    /// Jak `Alarms.STALE_AFTER_MS`: starszy push nie przejmuje ekranu otwartej aplikacji.
    static let staleAfter: TimeInterval = 10 * 60

    /// Prefiks tematów testowych — `config.TEST_TOPIC_PREFIX` w backendzie.
    static let testTopicPrefix = "test_"

    private enum Key {
        static let home = "straznik_home_voiv"
        static let regions = "straznik_observed_voivs"
        static let alertsOff = "straznik_alerts_off"
        static let topics = "straznik_fcm_topics"
        static let topicsOkAt = "straznik_fcm_topics_ok_at"
        static let topicsError = "straznik_fcm_topics_error"
        static let unsubscribing = "straznik_fcm_unsubscribing"
        static let unsubAt = "straznik_fcm_unsub_at"
        /// Ostatnio widziana zgoda na alarm krytyczny. `syncTopics` musi znać ją
        /// natychmiast, a `getNotificationSettings` jest asynchroniczne.
        static let critical = "straznik_critical_allowed"
        /// Tematy, z których wypis się nie powiódł — próbujemy przy każdej kolejnej
        /// synchronizacji, inaczej telefon zostałby na nich na zawsze (podwójny alarm).
        static let stale = "straznik_fcm_stale_topics"
        /// Wersja testowa pyta o zgodę krytyczną sama, ale tylko RAZ (patrz `load`).
        static let criticalAsked = "straznik_critical_asked"
        /// Wynik tego jednorazowego pytania — wyłącznie do diagnostyki testowej.
        static let criticalProbe = "straznik_critical_probe"
        /// Na czym stanęła ostatnia próba zapisu na tematy — tylko do diagnostyki.
        static let syncState = "straznik_fcm_sync_state"
    }

    private let defaults = UserDefaults.standard
    private var firebaseReady = false
    private var apnsRegistered = false
    /// Ostatni odnośnik zewnętrzny przepuszczony przez `shouldOverrideLoad` —
    /// wyłącznie do diagnostyki wersji testowej (patrz `statusData`).
    private var ostatniLink = ""
    /// Odtwarzacz syreny (iOS gra ją natywnie — Web Audio w WKWebView milczy
    /// przy wyciszonym dzwonku, zmierzone na iPhonie 24.09.2026).
    private var syrena: AVAudioPlayer?
    /// Bezpiecznik: syrena bez polecenia „wyłącz” nie gra w nieskończoność.
    private var syrenaStoper: Timer?
    /// Ostatni wynik uruchomienia syreny — diagnostyka wersji testowej.
    private var syrenaStan = "nie grała"
    /// Czy trzymamy sesję audio przełączoną na czas alarmu (patrz `dzwiekAlarmu`).
    private var sesjaAlarmuWlaczona = false
    /// Wynik starszej synchronizacji nie może nadpisać nowszej (szybkie zmiany miejsc).
    private var syncGeneration = 0

    // MARK: - start

    override public func load() {
        // Pushe przy otwartej aplikacji trafiają do willPresent poniżej. Lokalne
        // powiadomienia (test alarmu) obsługuje dalej plugin LocalNotifications.
        bridge?.notificationRouter.pushNotificationHandler = self

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(didRegisterForRemote(_:)),
                           name: .capacitorDidRegisterForRemoteNotifications, object: nil)
        center.addObserver(self, selector: #selector(didFailToRegisterForRemote(_:)),
                           name: .capacitorDidFailToRegisterForRemoteNotifications, object: nil)

        // Gdy aplikacja idzie w tło w trakcie syreny, iOS i tak ucisza nasz dźwięk
        // (nie mamy trybu audio w tle). Oddajemy wtedy sesję, żeby muzyka innych
        // aplikacji wróciła sama.
        center.addObserver(self, selector: #selector(poszloWTlo),
                           name: UIApplication.didEnterBackgroundNotification, object: nil)

        // 29.09.2026: na telefonie testera `criticalAlertSetting` zwróciło
        // `.notSupported`, więc `app.js` schował przycisk zgody — a bez przycisku
        // nikt nie mógł o zgodę poprosić. Klasyczne zapętlenie: nie wiemy, czy iOS
        // mówi „brak uprawnienia”, bo profil podpisu go nie niesie, czy dlatego, że
        // aplikacja jeszcze ani razu nie zapytała. Wersja testowa pyta więc sama,
        // jeden raz, i zapisuje wynik w diagnostyce. Wersja ze sklepu nigdy —
        // tam pytanie wychodzi wyłącznie z przycisku, po przeczytaniu wyjaśnienia.
        if Self.isTestBuild && !defaults.bool(forKey: Key.criticalAsked) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.pytajRazKrytyczne() }
        }

        configureFirebase()
        // Token APNs dostajemy także bez zgody na powiadomienia — zgoda decyduje
        // tylko o tym, czy system je pokaże. Dzięki temu tematy zapisują się od razu.
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func configureFirebase() {
        if FirebaseApp.app() == nil {
            // Plik trafia do builda z GitHub Secrets. Bez niego FirebaseApp.configure()
            // zakończyłby aplikację — lepiej pokazać stan w ustawieniach.
            guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
                defaults.set("Brak konfiguracji Firebase w tym buildzie — alarmy push nie działają.",
                             forKey: Key.topicsError)
                return
            }
            FirebaseApp.configure()
        }
        // FirebaseAppDelegateProxyEnabled = NO w Info.plist: token APNs przekazujemy
        // sami (poniżej), zamiast polegać na podmianie metod AppDelegate.
        Messaging.messaging().delegate = self
        firebaseReady = true
    }

    @objc private func didRegisterForRemote(_ note: Notification) {
        guard let token = note.object as? Data else { return }
        apnsRegistered = true
        guard firebaseReady else { return }
        Messaging.messaging().apnsToken = token
        syncTopics()
    }

    @objc private func didFailToRegisterForRemote(_ note: Notification) {
        let reason = (note.object as? Error)?.localizedDescription ?? "nieznany błąd"
        defaults.set("iOS nie zarejestrował powiadomień push: \(reason)", forKey: Key.topicsError)
    }

    /// Nowy token FCM (np. po przywróceniu kopii telefonu) nie ma żadnych tematów —
    /// jak `onNewToken` na Androidzie zapisujemy wszystkie od nowa.
    public func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard fcmToken != nil else { return }
        DispatchQueue.main.async { self.syncTopics() }
    }

    // MARK: - województwa i tematy FCM

    static func isKnownVoivodeship(_ value: String?) -> Bool {
        guard let value = value else { return false }
        return voivodeships.contains(value)
    }

    /// Temat FCM dla województwa — ten sam slug co `config.voiv_topic` (backend)
    /// i `BackgroundPlugin.voivTopic` (Android).
    static func voivTopic(_ name: String) -> String {
        let ascii: [Character: Character] = [
            "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o", "ś": "s", "ź": "z", "ż": "z"
        ]
        return "voiv_" + String(name.lowercased().map { ascii[$0] ?? $0 })
    }

    /// Telefony ze zgodą na alarm krytyczny słuchają OSOBNEGO tematu — ten sam
    /// slug plus sufiks (`voiv_lubelskie_krytyczne`). Dzięki temu serwer nie musi
    /// zgadywać wersji aplikacji: rozdziela po faktycznej zgodzie. Na tym temacie
    /// idą OBA poziomy — czerwony jako krytyczny, żółty jako zwykły — bo telefon
    /// po przepisaniu nie słucha już tematu podstawowego.
    static let criticalSuffix = "_krytyczne"

    /// Nazwa pliku paragonu: `sandboxReceipt` = TestFlight/sandbox,
    /// `receipt` = App Store, `brak` = iOS nie podał adresu. Pokazujemy ją
    /// w diagnostyce, bo 18.09.2026 to była jedyna niesprawdzona wartość.
    static var receiptName: String {
        Bundle.main.appStoreReceiptURL?.lastPathComponent ?? "brak"
    }

    /// Build z TestFlight (albo debug) zapisuje się DODATKOWO do tematów testowych,
    /// żeby push dało się sprawdzić bez wysyłania alarmu do prawdziwych użytkowników.
    /// Wersja z App Store nigdy ich nie subskrybuje.
    static var isTestBuild: Bool {
        #if DEBUG
        return true
        #else
        // 19.09.2026, zmierzone na iPhonie z TestFlight (iOS 26.6.2): paragon
        // nazywa się `sandboxReceipt`, więc warunek pozytywny jest poprawny.
        // Dzień wcześniej odwróciliśmy go z ostrożności, podejrzewając, że to on
        // wycisza tematy testowe — diagnostyka pokazała, że nie. Wracamy do wersji
        // bezpiecznej dla sklepu: wersja z App Store nigdy nie ma tu prawdy.
        return receiptName == "sandboxReceipt"
        #endif
    }

    private func topics(for regions: [String]) -> Set<String> {
        var out = Set<String>()
        let krytyczne = defaults.bool(forKey: Key.critical)
        for region in regions where Self.isKnownVoivodeship(region) {
            let topic = Self.voivTopic(region) + (krytyczne ? Self.criticalSuffix : "")
            out.insert(topic)
            if Self.isTestBuild { out.insert(Self.testTopicPrefix + topic) }
        }
        return out
    }

    private func targetTopics() -> Set<String> {
        if defaults.bool(forKey: Key.alertsOff) { return [] }
        return topics(for: defaults.stringArray(forKey: Key.regions) ?? [])
    }

    private static var nowMs: Int { Int(Date().timeIntervalSince1970 * 1000) }

    /// Jak Android (audyt B3): przy każdym starcie zapisujemy WSZYSTKIE docelowe
    /// tematy (operacja idempotentna), a stan utrwalamy dopiero po potwierdzeniu
    /// przez Firebase. Ustawienia pokazują więc prawdę, a nie zamiar.
    private func syncTopics() {
        guard firebaseReady else {
            defaults.set("brak Firebase", forKey: Key.syncState)
            return
        }
        guard Messaging.messaging().apnsToken != nil else {
            // Firebase na iOS nie wyda tokenu FCM bez tokenu APNs — wrócimy tu
            // z didRegisterForRemote. Do 19.09.2026 to wyjście było nieme i nie
            // dało się odróżnić „jeszcze nie zdążył” od „nigdy nie dostanie”.
            defaults.set("czekam na token APNs", forKey: Key.syncState)
            return
        }
        syncGeneration += 1
        let generation = syncGeneration
        let messaging = Messaging.messaging()
        let target = targetTopics()
        let lock = NSLock()
        let group = DispatchGroup()

        if target.isEmpty {
            // Wypisujemy ze WSZYSTKICH województw (także testowych), nie tylko z zapamiętanych.
            defaults.set("", forKey: Key.topicsError)
            defaults.set(true, forKey: Key.unsubscribing)
            defaults.set(Self.nowMs, forKey: Key.unsubAt)
            var failed = 0
            // Obie odmiany każdego województwa, bo zgoda mogła się zmienić między
            // zapisem a wypisem — inaczej telefon zostałby na temacie krytycznym.
            var wszystkie = topics(for: Self.voivodeships)
            for voiv in Self.voivodeships {
                let baza = Self.voivTopic(voiv)
                for t in [baza, baza + Self.criticalSuffix] {
                    wszystkie.insert(t)
                    wszystkie.insert(Self.testTopicPrefix + t)
                }
            }
            for topic in wszystkie {
                group.enter()
                messaging.unsubscribe(fromTopic: topic) { error in
                    if error != nil { lock.lock(); failed += 1; lock.unlock() }
                    group.leave()
                }
            }
            group.notify(queue: .main) {
                guard generation == self.syncGeneration else { return }
                self.defaults.set(false, forKey: Key.unsubscribing)
                if failed == 0 {
                    self.defaults.set([String](), forKey: Key.topics)
                    self.defaults.set(Self.nowMs, forKey: Key.topicsOkAt)
                    self.defaults.set("", forKey: Key.topicsError)
                } else {
                    self.defaults.set("nie potwierdzono wypisania z \(failed) tematów", forKey: Key.topicsError)
                }
            }
            return
        }

        defaults.set(false, forKey: Key.unsubscribing)
        // NAJPIERW zapis, dopiero potem wypis ze zbędnych (niżej, w `group.notify`).
        // Odwrotna kolejność przy przepisywaniu na temat krytyczny mogła zostawić
        // telefon zapisany na NIC: wypis z `voiv_X` udany, zapis na wariant krytyczny
        // nieudany — alarm nie dochodzi wcale i nikt tego nie widzi. Chwilowy dubel
        // jest nieprzyjemny, ale serwer skleja oba w jeden baner (wspólny collapse-id).
        let current = Set(defaults.stringArray(forKey: Key.topics) ?? [])
        var confirmed = Set<String>()
        // Treść błędu z Firebase była do tej pory wyrzucana — zostawała sama
        // liczba. Przy temacie testowym, który milczał, to za mało.
        var firstError = ""
        defaults.set("zapisuję \(target.count) tematów", forKey: Key.syncState)
        for topic in target {
            group.enter()
            messaging.subscribe(toTopic: topic) { error in
                lock.lock()
                if let error {
                    if firstError.isEmpty { firstError = "\(topic): \(error.localizedDescription)" }
                } else {
                    confirmed.insert(topic)
                }
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .main) {
            guard generation == self.syncGeneration else { return }
            // Dopiero teraz wypis ze zbędnych — razem z tymi, których wypis nie udał
            // się wcześniej. Nieudany wypis zostaje na liście do następnego razu;
            // bez tego telefon zostałby na starym temacie na zawsze i dostawał
            // każdy alarm dwa razy.
            let zalegle = Set(self.defaults.stringArray(forKey: Key.stale) ?? [])
            let doWypisu = zalegle.union(current).subtracting(target)
            var nieudane = Set<String>()
            let wypis = DispatchGroup()
            for topic in doWypisu {
                wypis.enter()
                messaging.unsubscribe(fromTopic: topic) { error in
                    if error != nil { lock.lock(); nieudane.insert(topic); lock.unlock() }
                    wypis.leave()
                }
            }
            wypis.notify(queue: .main) {
                self.defaults.set(Array(nieudane), forKey: Key.stale)
            }
            self.defaults.set(Array(confirmed), forKey: Key.topics)
            if confirmed.count == target.count {
                self.defaults.set(Self.nowMs, forKey: Key.topicsOkAt)
                self.defaults.set("", forKey: Key.topicsError)
                self.defaults.set("gotowe", forKey: Key.syncState)
            } else {
                let brak = target.count - confirmed.count
                let opis = firstError.isEmpty ? "" : " (\(firstError))"
                self.defaults.set("nie potwierdzono \(brak) z \(target.count) tematów" + opis,
                                  forKey: Key.topicsError)
                self.defaults.set("błąd: \(brak) z \(target.count)" + opis, forKey: Key.syncState)
            }
        }
    }

    // MARK: - ustawienia dla rozszerzenia powiadomień

    /// Wspólny kontener z rozszerzeniem (`NotificationService`). Rozszerzenie ma
    /// własny `UserDefaults`, więc wszystko, co ma znać w chwili alarmu, musi
    /// wylądować TUTAJ, a nie w `UserDefaults.standard`. Patrz `PLAN_IOS.md` §10.
    private static let grupa = "group.pl.straznik.app"
    private var wspolne: UserDefaults? { UserDefaults(suiteName: Self.grupa) }

    /// Język treści alarmu. Rozszerzenie podmienia stałe zdania na ten język;
    /// nagłówek i powody zostają po polsku, bo pisze je serwer.
    @objc func setPushLanguage(_ call: CAPPluginCall) {
        let l = (call.getString("lang") ?? "").lowercased()
        guard ["pl", "en", "uk"].contains(l) else { return call.resolve(["lang": "pl"]) }
        DispatchQueue.main.async {
            self.wspolne?.set(l, forKey: "straznik_push_lang")
            call.resolve(["lang": l])
        }
    }

    /// Głośność żółtego sygnału. Na iOS treść i dźwięk powiadomienia składa serwer,
    /// więc telefon może je zmienić dopiero w rozszerzeniu — stąd zapis do grupy,
    /// a nie do kanału jak na Androidzie. **Czerwonego to nie dotyka**: rozszerzenie
    /// nie zdejmuje dźwięku alarmowi, cokolwiek tu stoi.
    @objc func setYellowLevel(_ call: CAPPluginCall) {
        let poziom = call.getString("level") ?? "normal"
        guard ["normal", "quiet", "silent"].contains(poziom) else {
            return call.reject("nieznany poziom: \(poziom)")
        }
        DispatchQueue.main.async {
            self.wspolne?.set(poziom, forKey: "straznik_zolty_poziom")
            call.resolve(["yellowLevel": poziom])
        }
    }

    @objc func setHomeVoivodeship(_ call: CAPPluginCall) {
        let value = call.getString("voivodeship")
        let regions = Self.isKnownVoivodeship(value) ? [value!] : []
        DispatchQueue.main.async {
            self.defaults.set(value ?? "", forKey: Key.home)
            self.defaults.set(regions, forKey: Key.regions)
            self.syncTopics()
            call.resolve()
        }
    }

    /// Dostaje wyłącznie listę województw. Nazwy miejsc, adresy i współrzędne
    /// nigdy nie trafiają do Firebase.
    @objc func setObservedVoivodeships(_ call: CAPPluginCall) {
        var regions: [String] = []
        for item in call.getArray("voivodeships") ?? [] {
            if let value = item as? String, Self.isKnownVoivodeship(value), !regions.contains(value) {
                regions.append(value)
            }
        }
        let alertsOff = call.getBool("alertsOff") ?? false
        DispatchQueue.main.async {
            self.defaults.set(regions.first ?? "", forKey: Key.home)
            self.defaults.set(regions, forKey: Key.regions)
            self.defaults.set(alertsOff, forKey: Key.alertsOff)
            self.syncTopics()
            call.resolve()
        }
    }

    // MARK: - stan

    @objc func status(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                // Stan czytamy tu i tak, więc to najtańsze miejsce, żeby wyłapać
                // zgodę cofniętą w Ustawieniach iOS.
                self.zapamietajZgodeKrytyczna(settings.criticalAlertSetting == .enabled)
                call.resolve(self.statusData(settings, osVersion: UIDevice.current.systemVersion))
            }
        }
    }

    private func statusData(_ s: UNNotificationSettings, osVersion: String) -> PluginCallResultData {
        let grantedStates: [UNAuthorizationStatus] = [.authorized, .provisional, .ephemeral]
        let allowed = grantedStates.contains(s.authorizationStatus)
        let permission: String
        switch s.authorizationStatus {
        case .notDetermined: permission = "prompt"
        case .denied: permission = "denied"
        default: permission = "granted"
        }
        let info = Bundle.main.infoDictionary ?? [:]
        let unsubAt = defaults.integer(forKey: Key.unsubAt)
        let unsubscribing = defaults.bool(forKey: Key.unsubscribing) && Self.nowMs - unsubAt < 120_000
        var topicsError = defaults.string(forKey: Key.topicsError) ?? ""
        if defaults.bool(forKey: Key.unsubscribing) && !unsubscribing && topicsError.isEmpty {
            topicsError = "Firebase nie potwierdził wypisania"
        }

        // Diagnostyka wersji testowej: aplikacja pokazuje listę tematów tylko dla
        // województw (`voiv_*`), więc z ekranu nie da się poznać, czy telefon jest
        // zapisany na temat testowy. Dopisujemy to do wiersza z wersją iOS, który
        // app.js i tak wyświetla — dzięki temu wystarczy zrzut ekranu od testerki,
        // bez zmian we wspólnym kodzie. W wersji z App Store ten dopisek nie
        // powstaje, bo `isTestBuild` jest wtedy fałszem.
        var osLine = osVersion
        if Self.isTestBuild {
            let zapisane = defaults.stringArray(forKey: Key.topics) ?? []
            let testowe = zapisane.filter { $0.hasPrefix(Self.testTopicPrefix) }
            osLine += " · test: " + (testowe.isEmpty ? "brak tematów" : testowe.joined(separator: ", "))
            // Bez tego widać tylko wynik, a nie miejsce, w którym zapis staje:
            // brak tokenu APNs wygląda identycznie jak odrzucony temat.
            osLine += " · APNs: " + (apnsRegistered ? "tak" : "nie")
            if firebaseReady {
                osLine += " · FCM: " + (Messaging.messaging().fcmToken == nil ? "nie" : "tak")
            } else {
                osLine += " · Firebase: nie"
            }
            osLine += " · zapis: " + (defaults.string(forKey: Key.syncState) ?? "nie zaczęty")
            // `topicsError` niesie m.in. powód odmowy rejestracji push z iOS,
            // ale app.js zamienia go na jedno ogólne zdanie o niepotwierdzonych
            // subskrypcjach. W wersji testowej pokazujemy oryginał.
            if !topicsError.isEmpty { osLine += " · błąd: " + topicsError }
            // Czy dotknięcie odnośnika w ogóle dochodzi do części natywnej: pusto
            // znaczy, że kliknięcie ginie jeszcze w stronie, a nie przy otwieraniu.
            osLine += " · link: " + (ostatniLink.isEmpty ? "brak" : ostatniLink)
            osLine += " · syrena: " + syrenaStan
            osLine += " · krytyczne: " + (s.criticalAlertSetting == .enabled ? "tak"
                : (s.criticalAlertSetting == .notSupported ? "brak uprawnienia" : "odmowa"))
            if let proba = defaults.string(forKey: Key.criticalProbe) { osLine += " · " + proba }
            osLine += " · " + Self.receiptName
        }

        return [
            "platform": "ios",
            "osVersion": osLine,
            "manufacturer": "Apple",
            // Pola Androida z wartościami, przy których app.js nie pokazuje
            // ostrzeżeń niemających sensu na iPhonie (pełny ekran, bateria).
            "sdk": 0,
            "fullScreenAllowed": true,
            "batteryUnrestricted": true,
            "forceMaxVolume": false,
            "notificationsAllowed": allowed,
            "notificationsPermission": permission,
            // app.js pokazuje ostrzeżenie o wyłączonym dźwięku, gdy to pole jest false
            "redChannelSound": s.soundSetting != .disabled,
            "lockScreenAllowed": s.lockScreenSetting != .disabled,
            "timeSensitiveAllowed": s.timeSensitiveSetting == .enabled,
            "criticalAllowed": s.criticalAlertSetting == .enabled,
            // Czy build w ogóle ma uprawnienie od Apple. Bez tego `app.js` chowa
            // przycisk zgody — inaczej użytkownik klikałby coś, co nic nie robi.
            "criticalSupported": s.criticalAlertSetting != .notSupported,
            // Czy aplikacja KIEDYKOLWIEK poprosiła o zgodę krytyczną. iOS zgłasza
            // `notSupported` także wtedy, gdy nikt jeszcze nie pytał — bez tego
            // rozróżnienia `app.js` chowa przycisk, a bez przycisku nie ma jak
            // zapytać (zapętlenie wykryte 29.09.2026 na telefonie testera).
            // Reguła dla interfejsu: pokazuj przycisk, dopóki `criticalAsked`
            // jest fałszem; chowaj dopiero, gdy pytaliśmy, a system nie potrafi.
            "criticalAsked": defaults.bool(forKey: Key.criticalAsked),
            // Pusty `appVersion` celowo: app.js porównuje go z wydaniem APK na GitHubie
            // i proponowałby „aktualizację”, której na iPhonie nie da się zainstalować
            // (a Apple odrzuca aplikacje, które to proponują). Wersja iOS jest niżej.
            "appVersion": "",
            "iosAppVersion": info["CFBundleShortVersionString"] as? String ?? "",
            "iosBuild": info["CFBundleVersion"] as? String ?? "",
            "homeVoivodeship": defaults.string(forKey: Key.home) ?? "",
            "observedVoivodeships": defaults.stringArray(forKey: Key.regions) ?? [],
            "topicsConfirmed": defaults.stringArray(forKey: Key.topics) ?? [],
            // Co naprawdę zobaczy rozszerzenie powiadomień w chwili alarmu.
            // Pusto = aplikacja jeszcze nic nie zapisała do wspólnego kontenera,
            // czyli alarm przyjdzie po polsku i z dźwiękiem z serwera.
            "pushLang": wspolne?.string(forKey: "straznik_push_lang") ?? "",
            "yellowLevel": wspolne?.string(forKey: "straznik_zolty_poziom") ?? "",
            "topicsOkAt": defaults.integer(forKey: Key.topicsOkAt),
            "topicsError": topicsError,
            "topicsUnsubscribing": unsubscribing,
            "alertsOff": defaults.bool(forKey: Key.alertsOff),
            "alertsOffSet": defaults.object(forKey: Key.alertsOff) != nil,
            "firebaseConfigured": firebaseReady,
            "apnsRegistered": apnsRegistered,
            "testTopics": Self.isTestBuild
        ]
    }

    // MARK: - test alarmu

    /// Test prawdziwą drogą powiadomienia systemowego: za kilka sekund, można
    /// zablokować ekran i sprawdzić, jak alarm wygląda nad blokadą. Tekst jak
    /// `Alarms.postAlarm` na Androidzie.
    ///
    /// 11.10.2026 — czego ten test NIE robił: czerwony szedł zawsze zwykłym
    /// dźwiękiem i jako `.timeSensitive`, nigdy jako alarm krytyczny. Na wyciszonym
    /// iPhonie milczał więc u KAŻDEGO — także u ludzi, u których prawdziwy czerwony
    /// push (`CriticalSound`, temat `voiv_X_krytyczne`) by zagrał. Zgłoszenie brzmiało
    /// „alarm nie działa", a cichy był test, nie alarm. Teraz test idzie tą samą drogą
    /// co prawdziwy alarm, a gdy iść nią nie może — mówi w treści dlaczego.
    @objc func testNativeAlarm(_ call: CAPPluginCall) {
        let high = call.getString("level") != "elevated"
        let delayMs = max(0, min(call.getInt("delayMs") ?? 0, 30_000))
        let requested = call.getString("voivodeship")
        let voiv = Self.isKnownVoivodeship(requested) ? requested! : Self.voivodeships[0]
        // Język interfejsu przekazuje app.js (`lang`). Nieznany albo brak — polski,
        // bo tak działały wszystkie wydania do 1.7.93 i tak pisze serwer.
        let lang = Self.jezykTestu(call.getString("lang"))
        let center = UNUserNotificationCenter.current()

        center.getNotificationSettings { settings in
            // `krytyczny` znaczy: ten telefon MA zgodę Apple na alarm przebijający
            // wyciszenie. Tylko wtedy wolno użyć `criticalSoundNamed` — bez zgody
            // system i tak ściąłby dźwięk do zwykłego, a my obiecalibyśmy za dużo.
            let schedule = { (krytyczny: Bool) in
                let content = UNMutableNotificationContent()
                // Tytuł jak w prawdziwym alarmie z serwera (`notify.py`): bez „woj."
                // i bez punktów. Powód jest zmierzony — 19.09.2026 iPhone uciął tytuł
                // dokładnie na nazwie województwa, czyli na najważniejszym słowie.
                // Test, który wygląda inaczej niż alarm, niczego nie dowodzi.
                // Nazwa województwa zostaje po polsku także w EN i UK, bo serwer
                // wysyła ją po polsku.
                content.title = "TEST — "
                    + (high ? Self.tekst(lang, "WYSOKI PRIORYTET", "HIGH PRIORITY", "ВИСОКИЙ ПРІОРИТЕТ")
                            : Self.tekst(lang, "PODWYŻSZONA UWAGA", "ELEVATED ATTENTION", "ПІДВИЩЕНА УВАГА"))
                    + ": \(voiv)"
                // Kolejność linii nie jest kosmetyczna: ekran blokady pokazuje
                // trzy–cztery wiersze, resztę chowa za „…". Gdy test może zagrać
                // w ciszę, wyjaśnienie idzie WYŻEJ niż porada „co zrobić" — to
                // odpowiedź na pytanie, które człowiek zada sobie za chwilę.
                let ciche = high && !krytyczny
                let coZrobic = high
                    ? Self.tekst(lang,
                        // Brzmienie zrównane z serwerem i Androidem 17.10.2026
                        // („schron" → „miejsce schronienia", decyzja usera z 15.10).
                        // Test ma mówić dokładnie to, co powie prawdziwy alarm —
                        // inaczej uczy ludzi słów, których potem nie zobaczą.
                        "Co zrobić: przejdź do miejsca schronienia lub pomieszczenia bez okien i śledź komunikaty RCB.",
                        "What to do: go to a place of shelter or a room without windows and follow RCB messages.",
                        "Що робити: перейдіть до укриття або кімнати без вікон і стежте за повідомленнями RCB.")
                    : Self.tekst(lang,
                        "Co zrobić: zachowaj czujność i sprawdź komunikaty RCB.",
                        "What to do: stay alert and check RCB messages.",
                        "Що робити: будьте пильні та перевірте повідомлення RCB.")
                let oCiszy = Self.wyjasnienieCiszy(high: high, krytyczny: krytyczny, lang: lang)
                // Punkty otwierają treść — tak samo jak w alarmie z serwera, gdzie
                // zeszły z tytułu, żeby zmieściła się nazwa regionu.
                content.body = (["\(high ? "4.0" : "2.0") \(Self.tekst(lang, "pkt", "pts", "бал."))",
                                 Self.tekst(lang, "TEST: sprawdzenie dźwięku i powiadomienia",
                                                  "TEST: checking sound and notifications",
                                                  "ТЕСТ: перевірка звуку та сповіщень"),
                                 Self.tekst(lang, "To jest test alarmu — nie ma zagrożenia.",
                                                  "This is an alert test — there is no threat.",
                                                  "Це тест тривоги — загрози немає.")]
                                + (ciche ? [oCiszy, coZrobic] : [coZrobic, oCiszy])
                                // Test jest w języku interfejsu, a prawdziwy alarm przychodzi
                                // po polsku — treść pusha składa serwer (`notify.py`) i nie zna
                                // języka telefonu. Mówimy to w EN i UA wprost, żeby test nie
                                // obiecywał czegoś, czego alarm nie dotrzyma. Tłumaczenie
                                // stałych części powiadomienia to osobne zadanie po 1.7.94.
                                + [Self.tekst(lang, "NIEOFICJALNE źródło — kieruj się syrenami, RCB i RSO.",
                                                    "UNOFFICIAL source — follow sirens, RCB and RSO. "
                                                    + "Real alerts arrive in Polish, whatever the app language.",
                                                    "НЕОФІЦІЙНЕ джерело — орієнтуйтеся на сирени, RCB та RSO. "
                                                    + "Справжні тривоги приходять польською, незалежно від мови застосунку.")])
                               .joined(separator: "\n")
                content.sound = krytyczny
                    ? UNNotificationSound.criticalSoundNamed(UNNotificationSoundName("alarm_syrena.wav"),
                                                             withAudioVolume: 1.0)
                    : UNNotificationSound(named: UNNotificationSoundName(high ? "alarm_syrena.wav" : "alert_uwaga.wav"))
                content.interruptionLevel = krytyczny ? .critical : (high ? .timeSensitive : .active)
                content.threadIdentifier = voiv
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, Double(delayMs) / 1000), repeats: false)
                let request = UNNotificationRequest(identifier: "straznik-test-\(UUID().uuidString)",
                                                    content: content, trigger: trigger)
                center.add(request) { error in
                    if let error = error {
                        call.reject("Nie udało się zaplanować testu: \(error.localizedDescription)")
                    } else {
                        // `critical` i `silentRisk` są dla interfejsu: pozwalają
                        // uprzedzić człowieka PRZED testem, czego ma się spodziewać.
                        // Starszy app.js czyta tylko `scheduled` i nic nie traci.
                        call.resolve(["scheduled": true, "critical": krytyczny,
                                      "silentRisk": high && !krytyczny])
                    }
                }
            }
            switch settings.authorizationStatus {
            case .notDetermined:
                // Tu zgody krytycznej nie ma z definicji — o zwykłe powiadomienia
                // dopiero pytamy, a krytyczne są osobnym pytaniem (zgodaKrytyczna).
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                    if granted { schedule(false) } else { call.resolve(["scheduled": false, "reason": "denied"]) }
                }
            case .denied:
                call.resolve(["scheduled": false, "reason": "denied"])
            default:
                schedule(high && settings.criticalAlertSetting == .enabled)
            }
        }
    }

    /// Zdanie o ciszy w treści testu. Pisane do człowieka, który właśnie patrzy na
    /// ekran blokady i nic nie usłyszał: ma od razu wiedzieć, czy to usterka, czy
    /// ustawienie jego telefonu — i co zmienić, żeby zagrało.
    private static func wyjasnienieCiszy(high: Bool, krytyczny: Bool, lang: String) -> String {
        if !high {
            return tekst(lang,
                "Żółty poziom przy wyciszonym telefonie jest cichy — tak ma być. "
                + "Mimo wyciszenia odzywa się tylko czerwony alarm.",
                "On a muted phone the yellow level stays silent — that is by design. "
                + "Only a red alert sounds despite silent mode.",
                "На вимкненому звуці жовтий рівень мовчить — так і має бути. "
                + "Попри вимкнений звук озивається лише червона тривога.")
        }
        if krytyczny {
            return tekst(lang,
                "Ten test poszedł tą samą drogą co prawdziwy czerwony alarm: "
                + "przebija wyciszenie i tryb Skupienia. Słychać go — usłyszysz i alarm.",
                "This test took the same path as a real red alert: it breaks through "
                + "silent mode and Focus. If you can hear it, you will hear the alert too.",
                "Цей тест пішов тим самим шляхом, що й справжня червона тривога: "
                + "пробиває вимкнений звук і режим Фокусування. Чути його — почуєте й тривогу.")
        }
        // Nazwa przycisku musi brzmieć DOKŁADNIE jak w aplikacji (app.js, `btn-critical`),
        // inaczej człowiek szuka na ekranie czegoś, czego tam nie ma.
        return tekst(lang,
            "Jeśli nic nie zagrało, a telefon jest wyciszony — tak właśnie działa iPhone: "
            + "bez zgody na alarm krytyczny ucina dźwięk powiadomień. Włącz ją w aplikacji: "
            + "⚙ → Alarmy → „Włącz alarm mimo wyciszenia”. Wtedy czerwony zagra nawet przy "
            + "wyciszonym dzwonku; żółty zostanie cichy.",
            "If nothing sounded and your phone is muted, that is how iPhone works: without "
            + "the critical-alert permission iOS cuts notification sound. Turn it on in the app: "
            + "⚙ → Alerts → “Turn on alert despite silent mode”. Then a red alert sounds even "
            + "on a muted ringer; yellow stays silent.",
            "Якщо нічого не прозвучало, а звук телефона вимкнено — так працює iPhone: "
            + "без дозволу на критичну тривогу iOS прибирає звук сповіщень. Увімкніть його "
            + "в застосунку: ⚙ → Тривоги → «Увімкнути тривогу попри вимкнений звук». "
            + "Тоді червона тривога озветься навіть при вимкненому дзвінку; жовта залишиться тихою.")
    }

    /// Język treści testu. app.js przysyła „pl" / „en" / „uk"; cokolwiek innego
    /// (stare wydanie, literówka) traktujemy jak polski — tak brzmią alarmy z serwera.
    private static func jezykTestu(_ wartosc: String?) -> String {
        let l = (wartosc ?? "").lowercased()
        return (l == "en" || l == "uk") ? l : "pl"
    }

    private static func tekst(_ lang: String, _ pl: String, _ en: String, _ uk: String) -> String {
        switch lang {
        case "en": return en
        case "uk": return uk
        default:   return pl
        }
    }

    // MARK: - alarm krytyczny

    /// Zgoda na alarm krytyczny jest OSOBNA od zwykłych powiadomień i tylko ona
    /// pozwala przebić wyciszony dzwonek oraz tryb skupienia. Apple przyznało
    /// nam to uprawnienie 28.09.2026 (wniosek 442YB6VV2L).
    ///
    /// Po zmianie zgody telefon przepisuje się na inny temat FCM, więc od razu
    /// synchronizujemy tematy — serwer rozdziela odbiorców po zgodzie, nie po
    /// wersji aplikacji.
    @objc func zgodaKrytyczna(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { przed in
            // Przy odrzuconych powiadomieniach iOS w ogóle nie pokaże okna, a WSZYSTKIE
            // ustawienia raportuje jako `notSupported`. Gdybyśmy odnotowali „pytaliśmy”,
            // interfejs schowałby przycisk na zawsze i człowiek z wyłączonymi
            // powiadomieniami nie miałby jak wrócić. Odsyłamy więc do Ustawień
            // i NIE zapisujemy pytania.
            guard przed.authorizationStatus != .denied else {
                DispatchQueue.main.async {
                    call.resolve(["allowed": false, "supported": true, "asked": false,
                                  "reason": "powiadomienia-odrzucone", "error": ""])
                }
                return
            }
            // Odnotowujemy, że pytanie poszło — `criticalSupported` sam nie rozróżnia
            // „jeszcze nie pytaliśmy” od „pytaliśmy i system nie potrafi”.
            self.defaults.set(true, forKey: Key.criticalAsked)
            center.requestAuthorization(options: [.alert, .sound, .badge, .criticalAlert]) { _, error in
                center.getNotificationSettings { s in
                    DispatchQueue.main.async {
                        let zgoda = s.criticalAlertSetting == .enabled
                        self.zapamietajZgodeKrytyczna(zgoda)
                        call.resolve(["allowed": zgoda,
                                      "supported": s.criticalAlertSetting != .notSupported,
                                      "asked": true,
                                      "reason": "",
                                      "error": error?.localizedDescription ?? ""])
                    }
                }
            }
        }
    }

    /// Tylko wersja testowa: jednorazowa próba, żeby rozstrzygnąć, czy `.notSupported`
    /// bierze się z profilu podpisu, czy z tego, że nikt jeszcze nie pytał.
    private func pytajRazKrytyczne() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { s in
            guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else { return }
            self.defaults.set(true, forKey: Key.criticalAsked)
            center.requestAuthorization(options: [.alert, .sound, .badge, .criticalAlert]) { _, error in
                center.getNotificationSettings { po in
                    DispatchQueue.main.async {
                        let opis: String
                        switch po.criticalAlertSetting {
                        case .enabled: opis = "tak"
                        case .disabled: opis = "odmowa"
                        default: opis = "brak uprawnienia"
                        }
                        self.defaults.set("pytanie: " + opis + (error == nil ? "" : " (" + error!.localizedDescription + ")"),
                                          forKey: Key.criticalProbe)
                        self.zapamietajZgodeKrytyczna(po.criticalAlertSetting == .enabled)
                    }
                }
            }
        }
    }

    /// Zgodę można cofnąć w Ustawieniach iOS bez udziału aplikacji — dowiadujemy
    /// się o tym przy najbliższym odczycie stanu. Wtedy trzeba wrócić na temat
    /// podstawowy, inaczej telefon słuchałby tematu, którego system już nie honoruje.
    private func zapamietajZgodeKrytyczna(_ zgoda: Bool) {
        guard defaults.bool(forKey: Key.critical) != zgoda else { return }
        defaults.set(zgoda, forKey: Key.critical)
        syncTopics()
    }

    // MARK: - odnośniki zewnętrzne

    /// Czytelnik zgłosił (iOS 26, 23.09.2026), że w oknie „O aplikacji” dotknięcie
    /// odnośnika NEPTUN nie otwiera niczego — na Androidzie działa. Capacitor ma
    /// własną obsługę takich odnośników, ale otwiera je tylko wtedy, gdy uzna okno
    /// aplikacji za aktywne (`windowScene.activationState`), a przy `target="_blank"`
    /// nawigacja bywa cofana bez śladu. Wtyczki dostają pierwszeństwo przed tą
    /// obsługą, więc bierzemy odnośniki zewnętrzne na siebie: `true` = „nie ładuj
    /// tego w aplikacji”, a adres otwieramy w Safari.
    ///
    /// Świadomie wąsko: tylko kliknięcie w odnośnik albo próba otwarcia nowego okna,
    /// tylko `http(s)` i tylko adres spoza aplikacji. Wszystko inne (`capacitor://`,
    /// `about:blank`, `tel:`, `mailto:`, ładowanie własnych plików) zostawiamy
    /// Capacitorowi — zwracamy `nil`, czyli „nie mam zdania”.
    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        let noweOkno = navigationAction.targetFrame == nil
        guard navigationAction.navigationType == .linkActivated || noweOkno,
              let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host?.lowercased(),
              host != "localhost" else { return nil }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { [weak self] otwarte in
                self?.ostatniLink = host + (otwarte ? " ok" : " nie otwarte")
            }
        }
        return NSNumber(value: true)
    }

    // MARK: - dźwięk alarmu (sesja audio)

    /// Na iPhonie syrenę odtwarza część natywna, nie strona. Powód zmierzony
    /// na urządzeniu (24.09.2026): sama kategoria `playback` ustawiona z wtyczki
    /// nie dociera do Web Audio w WKWebView — przy wyciszonym dzwonku syrena
    /// dalej milczała. Dowód: muzyka w innej aplikacji ściszała się i wracała
    /// przy OBU poziomach, także przy żółtym, który o sesję nigdy nie prosi —
    /// czyli sesją steruje WebKit. `AVAudioPlayer` w kategorii `playback` gra
    /// mimo przełącznika wyciszenia, tak jak w aplikacjach alarmowych.
    ///
    /// Wymaga tego, żeby `app.js` na iOS NIE tworzył własnej syreny — inaczej
    /// przy niewyciszonym telefonie grałyby dwie naraz. Żółtego sygnału uwagi
    /// to nie dotyczy: zostaje w stronie i celowo podlega wyciszeniu.
    ///
    /// To NIE dotyczy dźwięku powiadomienia push — ten wciąż podlega wyciszeniu
    /// i wymagałby uprawnienia Critical Alerts od Apple (wniosek 442YB6VV2L).
    @objc func dzwiekAlarmu(_ call: CAPPluginCall) {
        let wlacz = call.getBool("wlacz") ?? false
        DispatchQueue.main.async {
            let blad = self.ustawSesjeAlarmu(wlacz)
            call.resolve(["active": self.sesjaAlarmuWlaczona,
                          "gra": self.syrena?.isPlaying ?? false,
                          "error": blad ?? ""])
        }
    }

    @objc private func poszloWTlo() {
        if sesjaAlarmuWlaczona { _ = ustawSesjeAlarmu(false) }
    }

    /// Ten sam plik, który gra w powiadomieniu (8 s), puszczany w kółko —
    /// alarm powietrzny nie milknie sam z siebie, milknie na polecenie ze strony.
    /// Bezpiecznik 10 minut jest na wypadek, gdyby polecenie „wyłącz” nigdy nie
    /// przyszło (przeładowanie strony, błąd w JS): telefon ma nie zostać z syreną
    /// bez końca i bez przycisku.
    private func wlaczSyrene() -> String? {
        if syrena?.isPlaying == true { return nil }
        guard let plik = Bundle.main.url(forResource: "alarm_syrena", withExtension: "wav") else {
            syrenaStan = "brak pliku alarm_syrena.wav"
            return syrenaStan
        }
        do {
            let odtwarzacz = try AVAudioPlayer(contentsOf: plik)
            odtwarzacz.numberOfLoops = -1
            odtwarzacz.volume = 1.0
            odtwarzacz.prepareToPlay()
            odtwarzacz.play()
            syrena = odtwarzacz
            syrenaStoper?.invalidate()
            syrenaStoper = Timer.scheduledTimer(withTimeInterval: 600, repeats: false) { [weak self] _ in
                self?.zatrzymajSyrene()
            }
            syrenaStan = "gra"
            return nil
        } catch {
            syrenaStan = "błąd: " + error.localizedDescription
            return error.localizedDescription
        }
    }

    private func zatrzymajSyrene() {
        syrenaStoper?.invalidate()
        syrenaStoper = nil
        syrena?.stop()
        syrena = nil
        if syrenaStan == "gra" { syrenaStan = "zatrzymana" }
    }

    /// Zwraca opis błędu albo `nil`. Nieudana zmiana sesji nie może przerwać alarmu —
    /// powiadomienie systemowe i tak zagra, a mapa ma działać dalej.
    @discardableResult
    private func ustawSesjeAlarmu(_ wlacz: Bool) -> String? {
        let sesja = AVAudioSession.sharedInstance()
        do {
            if wlacz {
                if !sesjaAlarmuWlaczona {
                    try sesja.setCategory(.playback, mode: .default)
                    try sesja.setActive(true)
                    sesjaAlarmuWlaczona = true
                }
                return wlaczSyrene()
            }
            zatrzymajSyrene()
            guard sesjaAlarmuWlaczona else { return nil }
            sesjaAlarmuWlaczona = false
            try sesja.setActive(false, options: .notifyOthersOnDeactivation)
            return nil
        } catch {
            sesjaAlarmuWlaczona = wlacz ? false : sesjaAlarmuWlaczona
            return error.localizedDescription
        }
    }

    // MARK: - metody tylko dla Androida

    @objc func setForceMaxVolume(_ call: CAPPluginCall) {
        // iOS nie pozwala aplikacji zmieniać głośności.
        call.resolve(["forceMaxVolume": false, "supported": false])
    }

    @objc func canInstallUpdates(_ call: CAPPluginCall) {
        call.resolve(["allowed": false, "supported": false])
    }

    @objc func requestInstallPermission(_ call: CAPPluginCall) {
        call.reject("Na iPhonie aktualizacje instaluje App Store albo TestFlight.", "UNSUPPORTED")
    }

    @objc func installUpdate(_ call: CAPPluginCall) {
        call.reject("Na iPhonie aktualizacje instaluje App Store albo TestFlight.", "UNSUPPORTED")
    }

    @objc func requestFullScreenPermission(_ call: CAPPluginCall) {
        call.resolve()   // iOS nie ma zgody na alarm pełnoekranowy
    }

    @objc func requestBatteryExemption(_ call: CAPPluginCall) {
        call.resolve()   // iOS nie ma wyjątków oszczędzania baterii dla aplikacji
    }

    // MARK: - ustawienia systemowe

    @objc func openSoundSettings(_ call: CAPPluginCall) {
        // iOS nie pozwala otworzyć ekranu dźwięków — ustawienia powiadomień Strażnika
        // (tam jest przełącznik dźwięku) są najbliższym odpowiednikiem.
        openSettings(UIApplication.openNotificationSettingsURLString)
        call.resolve()
    }

    @objc func openNotificationSettings(_ call: CAPPluginCall) {
        openSettings(UIApplication.openNotificationSettingsURLString)
        call.resolve()
    }

    private func openSettings(_ urlString: String) {
        DispatchQueue.main.async {
            guard let url = URL(string: urlString) ?? URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        }
    }

    // MARK: - push przy otwartej aplikacji

    /// Audyt B1 z Androida: aplikacja na wierzchu dostaje push jako zdarzenie
    /// „fcmAlarm” i sama pokazuje alarm (z syreną WebView) dla każdego
    /// obserwowanego województwa. Gdy WebView nie nasłuchuje albo wiadomość jest
    /// stara — pokazuje ją system, więc nic nie przepada.
    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let userInfo = notification.request.content.userInfo
        if firebaseReady { _ = Messaging.messaging().appDidReceiveMessage(userInfo) }
        if defaults.bool(forKey: Key.alertsOff) { return [] }

        var data: [String: Any] = [:]
        for (key, value) in userInfo {
            if let key = key as? String, key != "aps", let text = value as? String { data[key] = text }
        }
        let fresh = !Self.isStale(data["sent_at"] as? String)
        if fresh, data["voiv"] != nil, data["level"] != nil, hasListeners("fcmAlarm") {
            notifyListeners("fcmAlarm", data: data)
            return []
        }
        return [.banner, .list, .sound]
    }

    public func didReceive(response: UNNotificationResponse) {
        // Dotknięcie powiadomienia otwiera aplikację; app.js sam pobiera świeży stan
        // przy powrocie na wierzch (visibilitychange).
    }

    static func isStale(_ sentAt: String?) -> Bool {
        guard let sentAt = sentAt, let date = ISO8601DateFormatter().date(from: sentAt) else { return false }
        return Date().timeIntervalSince(date) > staleAfter
    }
}
