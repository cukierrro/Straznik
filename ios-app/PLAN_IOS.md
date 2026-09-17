# Strażnik na iPhone — plan (17.09.2026)

Punkt wyjścia: Android 1.7.57 (commit `69f44e1`). Ten katalog to osobny projekt;
nie zmienia `frontend/`, `backend/`, `android-app/`, `docs/`, `scripts/`.
Zmiany we wspólnym kodzie są tylko **opisane** w `POTRZEBNE_ZMIANY_WSPOLNE.md`.

---

## 1. Najważniejsze w skrócie

| | Android (dziś) | iPhone (co da się zrobić) |
|---|---|---|
| Mapa, panel, historia, tryb awaryjny | tak | **tak** — ta sama warstwa webowa |
| Alarm przy zamkniętej aplikacji | push FCM, telefon sam buduje alarm | push FCM z blokiem `apns` — **powiadomienie wyświetla iOS**, nie aplikacja |
| Alarm pełnoekranowy nad blokadą | tak | **nie** — Apple nie pozwala zwykłym aplikacjom |
| Syrena w kółko, aż wyciszysz | tak (INSISTENT) | **nie** — dźwięk powiadomienia gra raz, maks. 30 s |
| Podnoszenie głośności | tak (za zgodą) | **nie** — brak takiego API |
| Przebijanie trybu cichego / „Nie przeszkadzać” | kanał alarmowy | tylko z **Critical Alerts** (wniosek do Apple, niepewny); bez tego „Time Sensitive” przebija Skupienie, ale **nie** wyciszony dzwonek |
| Aktualizacja z GitHuba | tak | **nie** — tylko App Store / TestFlight |
| „Postaw kawę” | tak | **ukryte** (zasady App Store) |

Uczciwie: na iPhonie Strażnik będzie ostrzegał **słabiej** niż na Androidzie.
Czerwony alarm to wyraźne powiadomienie z dźwiękiem syreny, ale bez pełnego
ekranu i bez gwarancji, że przebije wyciszony telefon.

---

## 2. Aktualny stan narzędzi (sprawdzone 17.09.2026)

| Co | Stan | Źródło |
|---|---|---|
| `@capacitor/ios` | 8.5.2 (npm `latest`); wymaga iOS 15+, **Xcode 26+**, Node 22+ | registry.npmjs.org/@capacitor/ios; capacitorjs.com/docs/updating/8-0 |
| Menedżer pakietów iOS w Capacitor 8 | **Swift Package Manager** domyślnie (`npx cap add ios`) | ionic.io/blog/announcing-capacitor-8 (9.12.2025) |
| `@capacitor/local-notifications` | 8.3.1, działa na iOS | capacitorjs.com/docs/apis/local-notifications |
| Firebase Apple SDK | 12.19.2 (17.09.2026); Xcode 26.2+, iOS 15+; SPM `github.com/firebase/firebase-ios-sdk` | firebase.google.com/support/release-notes/ios |
| Push FCM na iOS | wymaga **klucza APNs (.p8)** wgranego w konsoli Firebase i fizycznego telefonu; tematy działają | firebase.google.com/docs/cloud-messaging/ios/client (akt. 16.09.2026) |
| firebase-admin (Python) | 7.5.0; **brak pola `interruption_level`** — przekazuje się przez `Aps(custom_data=…)` | pypi.org/project/firebase-admin; kod `_messaging_encoder.py` |
| GitHub Actions macOS | `macos-26` (arm64), domyślnie Xcode 26.6; **bez opłat dla repo publicznego**; prywatne ~0,062 USD/min | docs.github.com/…/github-hosted-runners; …/actions-minute-multipliers |
| Wymóg Apple przy wysyłce | od 28.04.2026 Xcode 26 + iOS 26 SDK; **od kwietnia 2027 iOS 27 SDK** | developer.apple.com/news/upcoming-requirements; news ?id=k1mtkt1k (9.09.2026) |
| Apple Developer Program | **99 USD/rok**; cena w PLN pokazywana przy zapisie (nie potwierdzono kwoty) | developer.apple.com/help/account/membership/program-enrollment |
| Osoba prywatna w App Store | tak, bez D-U-N-S; jako sprzedawca widnieje **imię i nazwisko** | j.w. |
| Status „trader” (DSA, UE) | trader → adres, telefon, e-mail **publicznie**; non-trader → bez tego. Hobbystyczna, darmowa apka bez zarobku — „mało prawdopodobne”, że trader | developer.apple.com/help/app-store-connect/…/digital-services-act-trader-requirements |
| Critical Alerts | uprawnienie na wniosek (formularz po zalogowaniu); jakie zastosowania Apple akceptuje — **nie potwierdzono u Apple** | developer.apple.com/contact/request/notifications-critical-alerts-entitlement |
| Time Sensitive | `interruption-level: time-sensitive`, iOS 15+, przebija Skupienie i podsumowanie powiadomień (użytkownik może to wyłączyć); dodawane w Xcode jako capability | developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel |
| AlarmKit (iOS 26+) | alarmy na ekranie blokady; inżynier Apple (VI 2026) poleca go do alarmów awaryjnych zamiast Critical Alerts; **uruchomienie pushem — brak udokumentowanej drogi** | developer.apple.com/documentation/alarmkit; forums thread 833511 |
| Live Activity push-to-start | iOS 17.2+; FCM obsługuje (`apns.live_activity_token`), ale **per urządzenie, nie per temat** | firebase.google.com/docs/cloud-messaging/customize-messages/live-activity |
| Napiwki / linki zewnętrzne | 3.1.1: napiwek dla dewelopera tylko przez zakup w aplikacji; 3.1.1(a): poza USA bez przycisków do innych płatności → „Postaw kawę” do ukrycia | developer.apple.com/app-store/review/guidelines |
| Nowość | iOS 27 / Xcode 27 wydane (9.09.2026), obraz `xcode-27` w GitHub Actions w podglądzie | j.w. |

---

## 3. Architektura wersji iOS

```
ios-app/
  package.json            Capacitor 8 (core, cli, ios, local-notifications)
  capacitor.config.json   appId pl.straznik.app, webDir www
  skrypty/przygotuj.mjs   kopia frontend/ → www i dźwięków alarmu → ios/App/App
  straznik-background/    lokalny plugin Capacitor (Swift + Package.swift z FirebaseMessaging)
  ios/                    projekt Xcode wygenerowany przez `npx cap add ios`
  PLAN_IOS.md, INSTRUKCJA_*.md, POTRZEBNE_ZMIANY_WSPOLNE.md
```

### 3.1 Warstwa webowa
Bez zmian: `www` to kopia `frontend/` robiona skryptem przed każdym buildem
(tak samo jak na Androidzie, katalog `www` nie trafia do gita).

### 3.2 Plugin `StraznikBackground` w Swift
Ta sama nazwa JS co na Androidzie, więc `app.js` go znajdzie. Zrobiony jako
**lokalny pakiet** (`straznik-background/`, zależność `file:` w `package.json`):
`cap sync` sam dołącza go do projektu Xcode razem z Firebase (przez SPM), bez
ręcznej edycji pliku projektu, który łatwo zepsuć bez Maca.

| Metoda | iOS |
|---|---|
| `setObservedVoivodeships`, `setHomeVoivodeship` | **tak** — subskrypcja tematów FCM `voiv_*`, ta sama zamiana polskich znaków co w Javie, stan potwierdzony przez Firebase, flaga `alertsOff` w `UserDefaults` |
| `status` | **tak** — zgoda na powiadomienia, tematy potwierdzone, błędy; `appVersion` celowo pusty (żeby app.js nie proponował APK), wersja w `iosAppVersion`; pola Androidowe z bezpiecznymi wartościami (`sdk: 0`, `fullScreenAllowed: true`, `batteryUnrestricted: true`) + `platform: "ios"`, `osVersion`, `timeSensitiveAllowed`, `criticalAllowed` |
| `openNotificationSettings`, `openSoundSettings` | **tak** — ekran ustawień Strażnika w iOS |
| `testNativeAlarm` | **tak** — lokalne powiadomienie za 5 s z dźwiękiem syreny, poziom Time Sensitive (sprawdza prawdziwą drogę powiadomienia) |
| zdarzenie `fcmAlarm` | **tak** — gdy aplikacja jest na wierzchu, push trafia do WebView (jak na Androidzie) zamiast banera |
| `setForceMaxVolume` | nieobsługiwane — zwraca `forceMaxVolume: false, supported: false` |
| `canInstallUpdates`, `requestInstallPermission`, `installUpdate` | nieobsługiwane — `reject("UNSUPPORTED")`, `allowed: false` |
| `requestFullScreenPermission`, `requestBatteryExemption` | nieobsługiwane — `resolve()` bez działania |

Rejestracja pushy: `FirebaseApp.configure()` + `registerForRemoteNotifications()`;
token APNs przekazuje do Firebase sam plugin (`FirebaseAppDelegateProxyEnabled = NO`,
bez podmiany metod AppDelegate — przewidywalniej).
Pushe przy otwartej aplikacji odbieramy przez router powiadomień Capacitora
(tak robi oficjalny plugin `@capacitor/push-notifications`), więc nie kłócimy się
z `LocalNotifications`.

### 3.3 Dźwięk
`alarm_syrena.wav` (~8 s) i `alert_uwaga.wav` z Androida kopiowane do paczki
aplikacji iOS (limit Apple dla dźwięku powiadomienia: 30 s). Pliki pochodzą
z `scripts/build_sounds.py` — nie zmieniamy ich.

### 3.4 Serwer (propozycja, nie wdrażam)
Blok `apns` w `notify.py`: tytuł i treść jak w `Alarms.postAlarm` na Androidzie,
`sound` syrena/sygnał, czerwony `time-sensitive` (po zgodzie Apple — `critical`),
`apns-priority: 10`, `apns-expiration` = TTL 15 min, `apns-collapse-id` =
temat, `thread-id` = województwo. **Android zostaje data-only** — FCM wysyła
blok `android` tylko do Androida, a `apns` tylko do iOS. Szczegóły i test
w `POTRZEBNE_ZMIANY_WSPOLNE.md`.

### 3.5 Czego iOS nie zrobi tak jak Android (ważne dla opisu)
- **Wyłączone alarmy** (`alertsOff`): Android odrzuca push sam. Na iOS
  powiadomienie wyświetla system, więc działa tylko **wypisanie z tematów**
  (potwierdzane przez Firebase). Filtrowanie w telefonie wymaga rozszerzenia
  Notification Service Extension + osobnego uprawnienia od Apple — etap 2.
- **„Opóźnione o X min”**: Android dopisuje to w telefonie. Na iOS wiadomość
  starsza niż 15 min po prostu nie dotrze (`apns-expiration`); dopisek — etap 2
  (to samo rozszerzenie).
- **Syrena przy otwartej aplikacji**: gra przez Web Audio w WKWebView; Safari
  wymaga wcześniejszego dotknięcia ekranu — do sprawdzenia na TestFlight.
- **Tryb awaryjny bez serwera**: alarmy tylko przy otwartej aplikacji (jak na
  Androidzie), ale iOS szybciej usypia aplikację w tle.

---

## 4. Budowanie bez Maca

- **GitHub Actions, runner `macos-26`** (za darmo, bo repo jest publiczne).
- Podpis: **klucz App Store Connect API** (plik .p8 + Key ID + Issuer ID) i
  automatyczne podpisywanie w chmurze Apple (`xcodebuild -allowProvisioningUpdates
  -authenticationKeyPath …`). Dzięki temu **nie trzeba Maca do tworzenia
  certyfikatów** ani eksportu plików .p12. Klucz musi mieć rolę **Admin**
  (inaczej Apple nie wystawi certyfikatu w chmurze) — dlatego tylko w GitHub Secrets.
- Wysyłka do TestFlight tym samym kluczem.
- Bezpieczeństwo w publicznym repo: workflow uruchamia się **tylko** z gałęzi
  `ios` (push) — nigdy z pull requestów obcych osób (one i tak nie dostają
  sekretów). Numer builda = numer uruchomienia workflowu.
- Ograniczenie GitHuba: ręczny przycisk „Run workflow” pojawia się tylko, gdy
  plik workflowu jest też na `main`. Na razie wystarczy uruchamianie pushem
  gałęzi `ios`; przycisk — dopiero po połączeniu z `main` (decyzja użytkownika).
- Pliki workflowów GitHub czyta **wyłącznie** z `.github/workflows/` w katalogu
  głównym repo — nie da się go trzymać w `ios-app/`.

Codemagic: niepotrzebny, dopóki GitHub Actions jest darmowy.

---

## 5. Etapy

**Etap 1 — TestFlight (cel tej sesji)** — stan 17.09.2026
1. ✅ Rozpoznanie, ten plan.
2. ✅ Szkielet `ios-app/` (Capacitor 8.5.2, SPM) + `skrypty/przygotuj.mjs`
   (kopia `frontend/` i dźwięków) + `npx cap add ios` — wygenerowany na Windowsie.
3. ✅ Plugin Swift `straznik-background/` (tabela 3.2), dźwięki, `Info.plist`
   (lokalizacja, szyfrowanie, ciemny motyw), `PrivacyInfo.xcprivacy`,
   `App.entitlements` (Push + Time Sensitive), iOS 16+, tylko iPhone, ikona 1024
   i ekran startowy z rysunku Androida. **Nieskompilowane** — Windows nie ma
   Xcode; pierwsza kompilacja = tryb „sprawdzenie” w GitHub Actions.
4. ✅ `.github/workflows/ios.yml` na gałęzi `ios` (zgoda 17.09): bez sekretów
   kompilacja bez podpisu, z sekretami podpis w chmurze + TestFlight.
5. ✅ `INSTRUKCJA_KONTA_APPLE.md` (w tym ograniczenie klucza API iOS w Google
   Cloud do `pl.straznik.app` — prośba użytkownika).
6. ✅ `POTRZEBNE_ZMIANY_WSPOLNE.md` — backend (`apns`) i frontend.
7. ✅ Tryb testowy: build TestFlight/debug zapisuje się dodatkowo do `test_voiv_*`.
8. ⏳ Push gałęzi `ios` (po zgodzie) → wynik kompilacji → poprawki.
9. ⏳ Konta Apple/Firebase i sekrety (użytkownik) → pierwszy build w TestFlight.
10. ⏳ Zmiana A w backendzie (sesja główna) → test pushy na temat testowy.

**Etap 2 — po pierwszych testach na iPhonach**
- Wniosek o Critical Alerts (tekst wniosku przygotuję).
- Notification Service Extension: „opóźnione o X min”, ewentualne filtrowanie
  przy wyłączonych alarmach.
- Prototyp AlarmKit (czy da się go wywołać po pushu — sprawdzić na telefonie).

**Etap 3 — App Store**
- Zrzuty ekranu (6,9″ i 6,5″), opis, polityka prywatności (link), etykiety
  prywatności („brak zbierania danych” — do potwierdzenia z backendem),
  status non-trader, kategoria.
- Ryzyka przeglądu Apple:
  - **4.2 minimalna funkcjonalność** — aplikacja „opakowująca stronę” bywa
    odrzucana; argumenty: natywne pushe per województwo, powiadomienia
    testowe, tryb awaryjny bez serwera, miejsca zapisane w telefonie.
  - **1.4 ryzyko szkody fizycznej / 1.1.6 fałszywe informacje** — wyraźny
    disclaimer „nieoficjalne, kieruj się RCB/RSO/syrenami” (już jest w apce).
  - **5.1.5** — lokalizacja nie jako „usługa ratunkowa”.
  - Live Activities i AlarmKit nie na start — mniej powodów do odrzucenia.

Live Activity push-to-start: odłożone. FCM wysyła je do konkretnego urządzenia,
a nie do tematu — serwer musiałby przechowywać tokeny telefonów (zmiana
architektury i prywatności).

---

## 6. Koszty

| Co | Koszt |
|---|---|
| Apple Developer Program | 99 USD/rok (kwota w PLN widoczna przy zapisie) |
| GitHub Actions macOS | 0 zł przy publicznym repo |
| Firebase Cloud Messaging | 0 zł |
| TestFlight | 0 zł (w ramach programu) |
| Mac / iPhone | niepotrzebne do budowania; **do testu pushy potrzebny prawdziwy iPhone** (testerzy) |

---

## 7. Decyzje użytkownika (17.09.2026)
1. `GoogleService-Info.plist` → **GitHub Secrets** (`IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64`),
   nie w repo; klucz API iOS ograniczony w Google Cloud do `pl.straznik.app`.
2. `.github/workflows/ios.yml` → **tak, tylko na gałęzi `ios`**. Gałąź wypchnięta
   17.09; pierwszy build w chmurze: Xcode 26.6, **BUILD SUCCEEDED**.
3. `npm install` w `ios-app/` → **tak** (99 pakietów, 27 MB, `node_modules` poza gitem).
4. Zakres → **etap 1**; Critical Alerts, Notification Service Extension, AlarmKit po testach.
5. **Wieczór 17.09 — kierunek: pełna aplikacja w App Store, konto z deklaracją
   „to nie jest konto handlowca”.** Droga „strona dodana do ekranu początkowego”
   **odrzucona**: kilka osób sprawdzało i powiadomienia im nie przychodziły
   (znane ograniczenia Web Push na iOS). Wracamy więc do natywnej aplikacji
   z tej gałęzi.
6. **Wsparcie autora w wersji z App Store:** żadnego przycisku ani linku
   nazwanego „kawa”/„wesprzyj” w aplikacji (zasada 3.1.1(a)). W aplikacji
   zostają neutralne linki: „Instrukcja użytkownika ↗” i „Strona Strażnika ↗”;
   wsparcie jest na stronie. Zalecenie: strona, do której linkuje aplikacja,
   **nie pokazuje przycisku kawy** — inaczej recenzent może uznać link za
   obejście płatności.
7. Otwarte: nazwa w App Store; żółty alarm `active` czy `time-sensitive`;
   publiczne imię i nazwisko sprzedawcy (konto Individual — nie da się ukryć
   bez konta firmowego z D-U-N-S).

## 8. Co dalej (stan 17.09 wieczór)
1. Użytkownik: Apple Developer Program (99 USD/rok), App ID, klucz APNs → Firebase,
   klucz App Store Connect API, 5 sekretów w GitHubie — `INSTRUKCJA_KONTA_APPLE.md`.
2. Sesja główna: zmiana A (blok `apns`) i B (ukrycia + teksty) —
   `POTRZEBNE_ZMIANY_WSPOLNE.md`.
3. Ta sesja po sekretach: build do TestFlight, test pushy na temat testowy,
   potem przygotowanie zgłoszenia do App Store (zrzuty, opis, prywatność,
   argumenty przeciw zasadzie 4.2 „opakowana strona”) i wniosek o Critical Alerts.
