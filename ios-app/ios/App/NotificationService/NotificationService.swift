import UserNotifications

/// Rozszerzenie powiadomień: dostaje alarm z serwera ZANIM iOS go pokaże i może
/// zmienić treść oraz dźwięk. Na iPhonie to jedyna droga do dwóch rzeczy, których
/// inaczej zrobić się nie da, bo powiadomienie przy zamkniętej aplikacji składa
/// SERWER (data-only nic nie wyświetla):
///
///   1. alarm w języku aplikacji — dziś każdy dostaje polski,
///   2. cichy żółty, gdy człowiek tak ustawił — dziś dźwięk wybiera serwer.
///
/// iOS uruchamia to wyłącznie dla ładunków z `mutable-content: 1`. Dopóki
/// `notify.py` tego nie wysyła, cały plik jest martwy i nic nie zmienia — patrz
/// `PLAN_IOS.md` §10.
///
/// ZASADA NADRZĘDNA: przy każdej wątpliwości zostawiamy to, co przysłał serwer.
/// Alarm, który dotarł po polsku, jest nieskończenie lepszy od alarmu, który nie
/// dotarł wcale albo doszedł okrojony, bo coś się nie sparsowało.
class NotificationService: UNNotificationServiceExtension {

    private var oddaj: ((UNNotificationContent) -> Void)?
    private var tresc: UNMutableNotificationContent?

    /// Wspólny kontener z aplikacją. Rozszerzenie ma własny `UserDefaults`,
    /// więc bez grupy nie zobaczyłoby ani języka, ani ustawienia żółtego.
    private static let grupa = "group.pl.straznik.app"
    private static let kluczJezyka = "straznik_push_lang"
    private static let kluczZoltego = "straznik_zolty_poziom"

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        oddaj = contentHandler
        guard let kopia = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        tresc = kopia
        let dane = request.content.userInfo
        let wysoki = (dane["level"] as? String) == "high"
        let ustawienia = UserDefaults(suiteName: Self.grupa)

        // 1. Cisza żółtego. Czerwonego NIE dotykamy nigdy — ani tu, ani nigdzie
        //    indziej w tym pliku. Alarmu nie wolno wyciszyć ustawieniem, które
        //    człowiek robił z myślą o sygnale uwagi.
        if !wysoki, ustawienia?.string(forKey: Self.kluczZoltego) == "silent" {
            kopia.sound = nil
        }

        // 2. Język. Podmieniamy WYŁĄCZNIE zdania, które sami wysyłamy ze stałej
        //    treści. Nagłówek, powody i cytaty z mediów zostają takie, jakie są —
        //    to polska proza i cudze tytuły prasowe, których nie tłumaczymy.
        let jezyk = Self.jezyk(ustawienia?.string(forKey: Self.kluczJezyka))
        if jezyk != "pl" {
            kopia.title = Self.przetlumaczTytul(kopia.title, jezyk: jezyk)
            kopia.body = Self.przetlumaczTresc(kopia.body, jezyk: jezyk)
        }

        contentHandler(kopia)
    }

    /// iOS daje rozszerzeniu około 30 s. Gdy czas się kończy, musimy oddać
    /// cokolwiek — inaczej system pokaże wersję z serwera bez naszych zmian.
    /// Tu i tak nie ma sieci ani dysku, więc to zabezpieczenie na wszelki wypadek.
    override func serviceExtensionTimeWillExpire() {
        if let oddaj, let tresc { oddaj(tresc) }
    }

    // MARK: - tłumaczenie stałych zdań

    private static func jezyk(_ wartosc: String?) -> String {
        let l = (wartosc ?? "").lowercased()
        return (l == "en" || l == "uk") ? l : "pl"
    }

    /// Tytuł z serwera: „WYSOKI PRIORYTET: lubelskie", z „TEST — " na początku
    /// w wersji testowej. Podmieniamy samą etykietę poziomu; nazwa województwa
    /// zostaje po polsku, bo tak brzmi w całej aplikacji i na mapie.
    private static func przetlumaczTytul(_ tytul: String, jezyk: String) -> String {
        var wynik = tytul
        for (pl, tlumaczenia) in POZIOMY where wynik.contains(pl) {
            wynik = wynik.replacingOccurrences(of: pl, with: tlumaczenia[jezyk] ?? pl)
            break
        }
        return wynik
    }

    /// Treść z serwera kończy się dwoma stałymi zdaniami (`notify.py`, `tail`).
    /// Podmieniamy je dosłownym dopasowaniem: gdy serwer zmieni brzmienie,
    /// dopasowanie po prostu nie zadziała i zostanie tekst polski. Lepsze to niż
    /// sklejanie treści od nowa, które przy nieznanym kształcie potrafi ją uciąć.
    private static func przetlumaczTresc(_ tresc: String, jezyk: String) -> String {
        var wynik = tresc
        for (pl, tlumaczenia) in ZDANIA where wynik.contains(pl) {
            wynik = wynik.replacingOccurrences(of: pl, with: tlumaczenia[jezyk] ?? pl)
        }
        return wynik
    }

    /// Etykiety poziomów — te same słowa co `LEVEL_LABEL` w `app.js`, żeby
    /// powiadomienie i ekran mówiły tym samym głosem.
    private static let POZIOMY: [String: [String: String]] = [
        "WYSOKI PRIORYTET": ["en": "HIGH PRIORITY", "uk": "ВИСОКИЙ ПРІОРИТЕТ"],
        "PODWYŻSZONA UWAGA": ["en": "ELEVATED ATTENTION", "uk": "ПІДВИЩЕНА УВАГА"],
    ]

    /// Stałe zdania z `notify.py`. Kolejność nieistotna — podmieniamy wszystkie,
    /// które wystąpią.
    private static let ZDANIA: [String: [String: String]] = [
        // Brzmienie zmienione 17.10.2026 („schron" → „miejsce schronienia", decyzja
        // usera z 15.10). ZNAMY OBA: serwer dostaje nowe wcześniej, niż ludzie
        // dostają tę wersję ze sklepu, a w tym oknie tłumaczenie nie może przepaść.
        // Starego nie usuwać, dopóki w sklepie są wersje sprzed tej zmiany.
        "Co zrobić: przejdź do miejsca schronienia lub pomieszczenia bez okien i śledź komunikaty RCB.": [
            "en": "What to do: go to a place of shelter or a room without windows and follow RCB messages.",
            "uk": "Що робити: перейдіть до укриття або кімнати без вікон і стежте за повідомленнями RCB.",
        ],
        "Co zrobić: przejdź do schronu lub pomieszczenia bez okien i śledź komunikaty RCB.": [
            "en": "What to do: go to a shelter or a room without windows and follow RCB messages.",
            "uk": "Що робити: перейдіть до укриття або кімнати без вікон і стежте за повідомленнями RCB.",
        ],
        "Co zrobić: zachowaj czujność i sprawdź komunikaty RCB.": [
            "en": "What to do: stay alert and check RCB messages.",
            "uk": "Що робити: будьте пильні та перевірте повідомлення RCB.",
        ],
        "NIEOFICJALNE źródło — kieruj się syrenami, RCB i RSO.": [
            "en": "UNOFFICIAL source — follow sirens, RCB and RSO.",
            "uk": "НЕОФІЦІЙНЕ джерело — орієнтуйтеся на сирени, RCB та RSO.",
        ],
        "Oficjalny Alert RCB dla województwa": [
            "en": "Official RCB alert for the province",
            "uk": "Офіційна тривога RCB для воєводства",
        ],
    ]
}
