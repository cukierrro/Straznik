import Foundation

/// PRÓBA (21.09.2026): czerwony alarm, który przebija przełącznik wyciszenia.
///
/// Zwykłe powiadomienie iOS przy wyciszonym iPhonie jest bezgłośne; przebić to mogą
/// tylko Critical Alerts (wniosek do Apple złożony 19.09, czekamy) albo alarm z AlarmKit
/// (iOS 26+). Apple pisze wprost, że alarm AlarmKit „breaks through the silent mode and
/// the current focus”, i nie wymaga żadnej zgody Apple — tylko zgody użytkownika
/// (klucz NSAlarmKitUsageDescription w Info.plist).
///
/// Nikt jeszcze nie potwierdził, czy alarm da się zaplanować z tła, gdy przyjdzie
/// powiadomienie z serwera — tego dotyczy próba. Dlatego:
///   • działa tylko w wersji testowej (TestFlight / DEBUG) i tylko po włączeniu
///     przełącznika próby w aplikacji,
///   • serwer dokleja `alarmkit=1` i `content-available` wyłącznie do tematów `test_…`,
///   • każda próba zostawia ślad (czas, droga, wynik) do odczytu w aplikacji.
///
/// Alarm jest „tylko alertem”: bez odliczania, więc nie potrzebuje rozszerzenia z Live
/// Activity (wymagane jest wyłącznie przy odliczaniu — dokumentacja AlarmKit).
public enum AlarmKitProba {
    public static let kluczWlaczona = "straznik.proba.alarmkit"
    static let kluczOstatni = "straznik.proba.alarmkit.ostatni"
    static let kluczDelegat = "straznik.proba.alarmkit.appdelegate"

    static var defaults: UserDefaults { .standard }

    /// Przełącznik próby — zapisywany przez aplikację, czytany przez AppDelegate w tle.
    public static var wlaczona: Bool { defaults.bool(forKey: kluczWlaczona) }

    /// Ślad ostatniej próby, pokazywany testerce w aplikacji.
    public static func zapiszSlad(_ tekst: String) {
        let czas = ISO8601DateFormatter().string(from: Date())
        defaults.set("\(czas) · \(tekst)", forKey: kluczOstatni)
    }

    public static var ostatniSlad: String { defaults.string(forKey: kluczOstatni) ?? "" }

    /// AppDelegate zaznacza przy starcie, że ma dostęp do tego modułu — gdyby import
    /// z celu aplikacji się nie udał, testerka zobaczy „tło: niepodłączone”.
    public static func oznaczDelegata() { defaults.set(true, forKey: kluczDelegat) }
    static var delegatPodlaczony: Bool { defaults.bool(forKey: kluczDelegat) }

    public static var dostepna: Bool {
        if #available(iOS 26.0, *) { return true }
        return false
    }
}

#if canImport(AlarmKit)
import AlarmKit
import ActivityKit
import SwiftUI

@available(iOS 26.0, *)
extension AlarmKitProba {
    struct Meta: AlarmMetadata {}

    static var stanZgody: String {
        switch AlarmManager.shared.authorizationState {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    static func poprosOZgode() async -> String {
        _ = try? await AlarmManager.shared.requestAuthorization()
        return stanZgody
    }

    /// Planuje jednorazowy alarm za `zaSekund` sekund. Syrena z paczki aplikacji
    /// (8 s; od iOS 26.1 alarm powtarza dźwięk, aż ktoś go przesunie, żeby zatrzymać).
    @discardableResult
    public static func zadzwon(tytul: String, zaSekund: TimeInterval) async throws -> UUID {
        let mgr = AlarmManager.shared
        if mgr.authorizationState == .notDetermined { _ = try await mgr.requestAuthorization() }
        guard mgr.authorizationState == .authorized else {
            throw NSError(domain: "AlarmKitProba", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "brak zgody na alarmy (\(stanZgody))"])
        }
        let napis = LocalizedStringResource(String.LocalizationValue(tytul))
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = AlarmPresentation.Alert(title: napis)
        } else {
            alert = AlarmPresentation.Alert(
                title: napis,
                stopButton: AlarmButton(text: "Wycisz", textColor: .white, systemImageName: "stop.circle"))
        }
        let atrybuty = AlarmAttributes<Meta>(presentation: AlarmPresentation(alert: alert),
                                             metadata: nil, tintColor: .red)
        let konfiguracja = AlarmManager.AlarmConfiguration<Meta>(
            countdownDuration: nil,
            schedule: .fixed(Date().addingTimeInterval(max(1, zaSekund))),
            attributes: atrybuty,
            stopIntent: nil,
            secondaryIntent: nil,
            sound: .named("alarm_syrena.wav"))
        let id = UUID()
        _ = try await mgr.schedule(id: id, configuration: konfiguracja)
        return id
    }
}
#endif

extension AlarmKitProba {
    /// Wywoływane z AppDelegate, gdy przyjdzie powiadomienie z serwera.
    /// Zwraca true, jeśli ładunek był przeznaczony dla próby (niezależnie od wyniku).
    public static func obsluzPowiadomienie(_ userInfo: [AnyHashable: Any], droga: String,
                                           gotowe: @escaping () -> Void) -> Bool {
        guard (userInfo["alarmkit"] as? String) == "1" else { return false }
        guard wlaczona else {
            zapiszSlad("\(droga): przyszło, ale próba wyłączona w aplikacji")
            gotowe(); return true
        }
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let tytul = (userInfo["alarmkit_tytul"] as? String) ?? "Strażnik — czerwony alarm (próba)"
            Task {
                do {
                    try await zadzwon(tytul: tytul, zaSekund: 1)
                    zapiszSlad("\(droga): alarm zaplanowany")
                } catch {
                    zapiszSlad("\(droga): BŁĄD \(error.localizedDescription)")
                }
                gotowe()
            }
            return true
        }
        #endif
        zapiszSlad("\(droga): iOS starszy niż 26 — AlarmKit niedostępny")
        gotowe()
        return true
    }

    /// Stan do pokazania w aplikacji (tylko wersja testowa).
    static func stan() -> [String: Any] {
        var out: [String: Any] = [
            "dostepna": dostepna,
            "wlaczona": wlaczona,
            "tlo": delegatPodlaczony,
            "ostatni": ostatniSlad,
            "zgoda": "unavailable",
        ]
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) { out["zgoda"] = stanZgody }
        #endif
        return out
    }
}
