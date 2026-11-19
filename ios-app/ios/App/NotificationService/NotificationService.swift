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

        // 3. Alarmy powiatowe (etap 3, 19.11.2026). Tu dźwięk zdejmujemy wyłącznie
        //    POWTÓRCE: ta sama wiadomość przyszła drugą drogą albo to samo zdarzenie
        //    już dzwoniło. Pierwszy alarm — także czerwony, krytyczny — zostaje nietknięty.
        let powiatowy = (dane["typ"] as? String) == "pow"
        if let tor = ustawienia?.string(forKey: Self.kluczToru), powiatowy != (tor == "pow") {
            // a) Tor nieaktywny. W chwili przejścia telefon jest zapisany do obu torów,
            //    a serwer wysyła oba — drugi baner tego samego zdarzenia ma być cichy.
            //    Rozszerzenie nie może powiadomienia ukryć (bez osobnego uprawnienia
            //    Apple), więc tylko je wycisza.
            Self.wycisz(kopia)
            kopia.userInfo["_tor_nieaktywny"] = "1"
        } else if powiatowy, let klucz = dane["klucz_zdarzenia"] as? String, !klucz.isEmpty {
            // b) Kilka miejsc w różnych powiatach = kilka wiadomości jednego zdarzenia.
            //    Pierwsza dzwoni, kolejne tego samego (lub niższego) poziomu w 10 min
            //    dopisują się bez dźwięku; wyższy poziom i ponowienie dzwonią. Ta sama
            //    zasada co Laczenie.java na Androidzie (test_laczenie_powiadomien.cjs).
            let miejsce = (dane["miejsce"] as? String) ?? ""
            let wynik = Self.laczenie(ustawienia, klucz: klucz, level: dane["level"] as? String ?? "",
                                      ponowienie: (dane["ponowienie"] as? String) == "1", miejsce: miejsce)
            if !wynik.dzwoni {
                Self.wycisz(kopia)
                kopia.userInfo["_dolacz"] = "1"
                // Serwer daje alarmom powiatu collapse-id = klucz zdarzenia, więc ten baner
                // ZASTĘPUJE poprzedni — dopisujemy w nim wcześniejsze miejsca.
                let inne = wynik.miejsca.filter { $0 != miejsce }
                if !inne.isEmpty {
                    kopia.body = Self.tekstTakze(jezyk) + inne.joined(separator: "; ") + "\n" + kopia.body
                }
            }
        }

        contentHandler(kopia)
    }

    // MARK: - łączenie alarmów powiatowych (etap 3)

    private static let kluczToru = "straznik_tor_aktywny"
    private static let kluczLaczenia = "straznik_laczenie"
    private static let okno: TimeInterval = 10 * 60          // 10 min, jak Laczenie.OKNO_MS
    private static let trzymaj: TimeInterval = 3 * 60 * 60

    /// Bez dźwięku i bez przebijania Skupienia — tylko dla powtórki, nigdy dla pierwszego.
    private static func wycisz(_ kopia: UNMutableNotificationContent) {
        kopia.sound = nil
        if #available(iOS 15.0, *) { kopia.interruptionLevel = .active }
    }

    private static func ranga(_ level: String) -> Int {
        level == "high" ? 2 : (level == "elevated" ? 1 : 0)
    }

    private static func zdarzenie(_ klucz: String) -> String {
        guard let i = klucz.firstIndex(of: "|") else { return klucz }
        return String(klucz[klucz.index(after: i)...])
    }

    /// Stan w grupie aplikacji: [klucz rangi#klucz: [dzwonek (s), miejsca…]].
    /// Przy błędzie odczytu dzwonimy — lepiej powiadomienie za dużo niż cisza.
    static func laczenie(_ ustawienia: UserDefaults?, klucz: String, level: String,
                         ponowienie: Bool, miejsce: String,
                         teraz: TimeInterval = Date().timeIntervalSince1970) -> (dzwoni: Bool, miejsca: [String]) {
        guard let ustawienia else { return (true, [miejsce]) }
        var stan = (ustawienia.dictionary(forKey: kluczLaczenia) as? [String: [String]]) ?? [:]
        stan = stan.filter { _, w in
            guard let t = w.first.flatMap(Double.init) else { return false }
            return teraz - t <= trzymaj && t - teraz <= okno
        }
        let zd = zdarzenie(klucz)
        if !ponowienie {
            for (k, w) in stan {
                guard let hash = k.firstIndex(of: "#"), let r = Int(k[..<hash]),
                      let t = w.first.flatMap(Double.init) else { continue }
                let wiek = teraz - t
                if r < ranga(level) || wiek < 0 || wiek >= okno { continue }
                if zdarzenie(String(k[k.index(after: hash)...])) != zd { continue }
                var nowe = w
                if !miejsce.isEmpty && !nowe.dropFirst().contains(miejsce) { nowe.append(miejsce) }
                stan[k] = nowe
                ustawienia.set(stan, forKey: kluczLaczenia)
                return (false, Array(nowe.dropFirst()))
            }
        }
        stan["\(ranga(level))#\(klucz)"] = [String(teraz)] + (miejsce.isEmpty ? [] : [miejsce])
        ustawienia.set(stan, forKey: kluczLaczenia)
        return (true, miejsce.isEmpty ? [] : [miejsce])
    }

    private static func tekstTakze(_ jezyk: String) -> String {
        switch jezyk {
        case "en": return "Same alert also for: "
        case "uk": return "Та сама тривога також для: "
        default: return "Ten sam alarm także dla: "
        }
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
        // Serwer skrócił treść 21.10.2026 (OGON_CZERWONY / OGON_ZOLTY w notify.py):
        // zamiast dwóch zdań jedna linia „co zrobić · źródło NIEOFICJALNE".
        // Dawne brzmienia zostają NIŻEJ — telefon może dostać pusha sprzed
        // wdrożenia serwera, a w tym oknie tłumaczenie nie może przepaść.
        "Co zrobić: przejdź do miejsca schronienia lub pomieszczenia bez okien · źródło NIEOFICJALNE": [
            "en": "What to do: go to a place of shelter or a room without windows · UNOFFICIAL source",
            "uk": "Що робити: перейдіть до укриття або кімнати без вікон · НЕОФІЦІЙНЕ джерело",
        ],
        "Zachowaj czujność · źródło NIEOFICJALNE": [
            "en": "Stay alert · UNOFFICIAL source",
            "uk": "Будьте пильні · НЕОФІЦІЙНЕ джерело",
        ],
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
        // Etap 3: nagłówek alarmu powiatu (app/powiaty.py, naglowek).
        "Oficjalny Alert RCB dla powiatu": [
            "en": "Official RCB alert for the county",
            "uk": "Офіційна тривога RCB для повіту",
        ],
        "Oficjalny Alert RCB dla województwa": [
            "en": "Official RCB alert for the province",
            "uk": "Офіційна тривога RCB для воєводства",
        ],
    ]
}
