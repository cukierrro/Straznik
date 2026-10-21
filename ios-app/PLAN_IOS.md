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

**Sesja audio a wyciszony dzwonek (23.09.2026).** Aplikacja długo nie ruszała
`AVAudioSession`, więc WKWebView grał syrenę w domyślnej kategorii `soloAmbient`,
którą przełącznik na boku telefonu ucisza. Czytelnik na iOS 26.7 zgłosił, że
„syrena nie działa” — dotyczyło to obu testów dźwięku i czerwonego alarmu przy
otwartej aplikacji. Plugin ma teraz `dzwiekAlarmu({wlacz})`: na czas syreny
kategoria `playback` (gra mimo wyciszenia), po syrenie sesja wraca do innych
aplikacji. Wywołania są w `app.js` (`sesjaAudioAlarmu`), żółty sygnał uwagi
celowo zostaje przy domyślnej. Dźwięku samego **powiadomienia push** to nie
zmienia — wyciszony telefon nadal go nie zagra, na to trzeba Critical Alerts
(wniosek `442YB6VV2L`). Do sprawdzenia na urządzeniu z wyciszonym dzwonkiem:
„▶ Test: syrena”, „▶ Test: pełny alarm”, a potem muzyka w innej aplikacji —
powinna wrócić sama po zakończeniu syreny.

**Odnośniki zewnętrzne (24.09.2026).** Zgłoszenie czytelnika: w oknie
„O aplikacji” dotknięcie odnośnika NEPTUN nie otwiera niczego (Android działa).
Capacitor 8.5.2 ma własną obsługę (`WebViewDelegationHandler`), ale w
`decidePolicyFor` otwiera adres tylko przy `windowScene.activationState ==
.foregroundActive`, a nawigację i tak anuluje — gdy warunek nie wyjdzie,
kliknięcie ginie bez śladu. Wtyczki mają pierwszeństwo (`shouldOverrideLoad`),
więc plugin bierze odnośniki zewnętrzne na siebie: kliknięcie w odnośnik albo
próba nowego okna, `http(s)`, host spoza aplikacji → Safari. Żadnej zmiany we
wspólnym `frontend/` to nie wymaga. Jeśli kliknięcie ginie wcześniej, w stronie,
poprawka nic nie da — dlatego wersja testowa dopisuje do diagnostyki ostatni
odnośnik widziany przez część natywną (`link:` w wierszu wersji iOS).

**Kontrakt pobierania stanu (27.09.2026).** Ważne przy wydaniach iOS, bo build
czeka w przeglądzie Apple dzień lub dwa i wersja ze sklepu może być starsza niż
serwer. Backend obsługuje **trzy warianty równolegle**, potwierdzone przez sesję
główną i objęte testem `scripts/test_czesci_stanu.py`:

* `/api/state` bez parametrów — pełny stan, bez `aux_v` (wydania sprzed 1.7.82),
* `/api/state?part=main` (+ `&v=`) — rdzeń z odciskiem `aux_v`,
* `/api/state?part=aux` — same `adsb` i `health`.

Najgorszy skutek rozjechania wersji to **większy transfer, nie awaria**: starsza
aplikacja dostanie pełny stan. Sesja główna zobowiązała się uprzedzać przed każdą
zmianą tego kontraktu; otwarty pomysł (różnice per obiekt w sekcji `neptun`) jest
odłożony jako zbyt ryzykowny na ścieżce alarmu.

**Paczki GROTY a zmiana hostingu (27.09.2026).** Adres paczek (`PACZKI_URL`,
`grota/offline.js`) jest **wkompilowany w paczkę aplikacji**, a paczki pobieramy
nagłówkiem `Range` (stąd `CapacitorWebFetch`, nie most — `104dfed`). Na iOS źródłem
jest `capacitor://localhost`, więc każde takie zapytanie jest międzyźródłowe i leci
z preflightem. Wniosek: **przeniesienie paczek pod inny adres psuje każde wydanie,
które już jest u ludzi** — nie tylko to czekające w przeglądzie. Zdalny adres
(kanałem `wylaczniki` w `/api/state`) pomoże dopiero od wydania, w którym wejdzie.

Rozważany wariant: stary adres oddaje 302 na nowy host. Zanim ktokolwiek to
zarekomenduje, trzeba **zmierzyć**, bo przekierowanie zapytania po preflightcie to
miejsce, w którym WebKit potrafi odmówić, a cel musi oddawać `Access-Control-Allow-Origin`,
wpuszczać `Range` i wystawiać `Content-Range` przez `Access-Control-Expose-Headers`.
Uzgodniona kolejność (taniej najpierw): strona w przeglądarce → WebView Androida →
Safari na iPhonie (ten sam silnik co aplikacja, bez budowania czegokolwiek) →
dopiero na końcu build testowy dla testera. **Strona testowa musi stać pod innym
źródłem niż adres przekierowujący**, inaczej pierwszy skok jest z tego samego źródła
i preflightu w ogóle nie będzie — zmierzylibyśmy co innego. Safari wysyła `Origin`
jako `https://…`, a aplikacja `capacitor://localhost`, więc przejście w Safari nie
jest dowodem, ale wywalenie się w Safari jest rozstrzygające.

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


### 4.1 Podpis w chmurze — co naprawdę działa (18.09.2026)
Pierwszy build z podpisem wymagał czterech poprawek. Zapisane, żeby nie szukać drugi raz:
1. **Key ID i Issuer ID muszą pasować do klucza** — 401 `NOT_AUTHORIZED` z App Store
   Connect mówi tylko „nie znaleziono profilu”. Dlatego workflow ma krok
   *Sprawdzenie klucza App Store Connect*: buduje token, pyta `/v1/apps` i wypisuje
   aplikacje na koncie (bez pokazywania sekretów).
2. **PEP 668** na macOS 26 — `pip install` do Pythona systemowego jest zablokowany,
   więc krok sprawdzający używa `python3 -m venv`.
3. **`CODE_SIGN_IDENTITY = "iPhone Developer"`** z szablonu Capacitora usunięty
   z `project.pbxproj`; ręczne nadpisanie na „Apple Distribution” daje z kolei
   `conflicting provisioning settings`.
4. **`aps-environment`** w `App.entitlements` ustawione na `production`.
5. **Archiwum bez podpisu** (`CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`),
   podpis dystrybucyjny nadaje `-exportArchive` z `-allowProvisioningUpdates`.
   Inaczej Xcode żąda profilu deweloperskiego, a ten wymaga zarejestrowanego
   urządzenia („Your team has no devices”) — konto ich nie ma i nie musi mieć.

Wynik: **1.7.57 build 2609181648** w TestFlight (Ready to Submit), 18.09.2026,
czas budowania ok. 5 minut.
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
8. ✅ Push gałęzi `ios` 17.09 → kompilacja w chmurze OK (Xcode 26.6).
9. ✅ 18.09 (użytkownik): Apple Developer Program opłacony i aktywny, App ID
   `pl.straznik.app` z Push + Time Sensitive, klucz APNs wgrany do Firebase
   (development i production), aplikacja iOS w Firebase, klucz API iOS w Google
   Cloud ograniczony do `pl.straznik.app`, aplikacja w App Store Connect pod nazwą
   **Strażnik: alarm powietrzny** (samo „Strażnik” zajęte), klucz App Store
   Connect API (Admin) i **5 sekretów w GitHubie**.
10. ⏳ Pierwszy build z podpisem → TestFlight → test na iPhonie.
11. ⏳ Zmiana A w backendzie (sesja główna) → test pushy na temat testowy.

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

---

## Tematy testowe — jak aplikacja poznaje, że jest wersją testową

**Po co to jest:** wersja z TestFlight zapisuje się dodatkowo do tematów
`test_voiv_*`, żeby dało się wysłać prawdziwy push bez budzenia użytkowników
Androida na `voiv_*`. Wersja z App Store nie może ich subskrybować.

**Co poszło nie tak (18.09.2026):** push na `test_voiv_lubelskie` nie dotarł do
testerki. Sesja główna odtworzyła ładunek na serwerze — blok `apns` był
kompletny (911 B przy limicie 4096, nagłówki i `interruption-level` na miejscu),
więc wiadomość nie poszła jako „cicha”. Telefon miał potwierdzoną subskrypcję,
ale **tylko** `voiv_lubelskie` — a tego na ekranie nie widać, bo aplikacja
wyświetla nazwy województw, nie surowe tematy. Jedynym niesprawdzonym ogniwem
zostało wykrywanie wersji testowej w `StraznikBackgroundPlugin.swift`.

**Jak to działało:** `Bundle.main.appStoreReceiptURL?.lastPathComponent ==
"sandboxReceipt"`. Warunek pozytywny: cokolwiek innego (puste, inna nazwa)
oznacza „to nie jest test” i tematy testowe po cichu znikają. `appStoreReceiptURL`
jest wycofywane w nowszych wersjach iOS, więc to założenie przestaje być pewne.

**Jak działa teraz (19.09.2026, po pomiarze):** warunek pozytywny wrócił
(`receiptName == "sandboxReceipt"`), bo diagnostyka na iPhonie z TestFlight
(iOS 26.6.2) pokazała, że paragon nazywa się dokładnie `sandboxReceipt`.
**Hipoteza z 18.09 była błędna** — to nie wykrywanie wersji testowej wyciszyło
tematy. Odwrócony warunek istniał tylko jedną dobę, z ostrożności.

Wersja testowa dopisuje do pola `osVersion` (wiersz, w którym aplikacja pokazuje
wersję iOS) stan zapisu na tematy — po to, żeby nie zgadywać, na czym staje:

```
iOS 26.6.2 · test: test_voiv_lubelskie · APNs: tak · FCM: tak · zapis: gotowe · sandboxReceipt
```

Pola: lista potwierdzonych tematów testowych, obecność tokenu APNs, obecność
tokenu FCM, stan ostatniej próby zapisu (`czekam na token APNs`, `zapisuję N
tematów`, `gotowe`, `błąd: N z M (treść błędu z Firebase)`) i nazwa paragonu.
Treść błędu z Firebase była wcześniej wyrzucana — zostawała sama liczba.

Dzięki temu zrzut ekranu od testera odróżnia trzy różne awarie, które wyglądają
tak samo: brak tokenu APNs, odrzucenie tematu przez Firebase i poprawny zapis,
przy którym milczy dopiero dostawa.

**Sprawdzian przed wysyłką (dalej obowiązuje):** wersja
przeznaczona do App Store **nie może** zapisywać się na `test_voiv_*`. Sposób
sprawdzenia bez sklepu: w kompilacji Release z paragonem `receipt` pole
`testTopics` w `status()` musi być fałszem, a wiersz z wersją iOS — bez dopisku
`· test:`. Dopóki tego nie potwierdzimy, nie wysyłamy aplikacji do przeglądu.

## 9. Rozszerzenie powiadomień (NSE) — zatwierdzone na PO 1.7.95

**Decyzja usera z 14.10.2026:** `UNNotificationServiceExtension` robimy **osobnym
wydaniem po 1.7.95**, z własnymi testami na TestFlighcie. Do tego czasu w aplikacji
zostaje notka „alarmy przychodzą po polsku".

### Co to naraz załatwia

Dwie rzeczy, których dziś na iPhonie nie da się zrobić, bo treść i dźwięk
powiadomienia składa SERWER (data-only przy zamkniętej aplikacji nic nie pokazuje):

1. **Język powiadomienia.** Rozszerzenie przepisuje tytuł i stałe zdania na język
   aplikacji, korzystając z pól, które push już niesie (`level`, `score`, `voiv`,
   `reasons`). Powody i cytaty z mediów zostają po polsku — to polska proza
   z `alarm_headline` / `reasons_split` i cudze tytuły prasowe.
   Po wejściu **D2** (aplikacja bez zapisanego wyboru bierze język telefonu)
   rozjazd dotyczy każdego z nietypowym językiem systemu, nie tylko tych, którzy
   sami przestawili — czyli skala rośnie, a nie maleje.
2. **Cisza żółtego** (B11 w `POTRZEBNE_ZMIANY_WSPOLNE.md`): rozszerzenie może zdjąć
   `sound`, zanim powiadomienie się pokaże. Dziś przełącznik „Głośność sygnału
   uwagi" nie ma na iPhonie wpływu na powiadomienie i notka mówi to wprost.

**Dlaczego NIE `loc-key`:** ładunek APNs jest wspólny dla wszystkich wersji
aplikacji. Telefon ze starszą nie ma kluczy w pakiecie i iOS pokazuje **surowy klucz
zamiast treści alarmu**; `title-loc-key` ma pierwszeństwo nad `title`, więc zwykły
tytuł nie działa jako zapas. Sprawdzone i odrzucone 11.10.
**Dlaczego nie sam sufiks języka w temacie FCM:** działa i jest zgodny wstecz
(napisane, `ece2709`, cofnięte świadomie w `ac7af31`), ale nie rozwiązuje ciszy
żółtego i mnoży tematy w najbardziej kruchej części systemu.

### Czego to będzie wymagać — i gdzie może boleć

- Nowy target w Xcode, **własny App ID** (`pl.straznik.app.NotificationService`)
  i **własny profil provisioningu**, czyli zmiany w `skrypty/podpis_apple.py`
  i w `.github/workflows/ios.yml`. To jest jedyne poważne ryzyko: podpisywanie
  raz już kosztowało nas odrzucony build (ITMS-90035, 1.7.63).
- Backend: `mutable-content: 1` w ładunku. Dla starszych aplikacji nieszkodliwe —
  ignorują je, więc zmiana jest bezpieczna dla wszystkich wersji naraz
  (inaczej niż `loc-key`).
- Rozszerzenie ma ~30 s i działa też przy alarmie krytycznym; dźwięku nie rusza,
  o ile sami go nie zdejmiemy.
- **Nie zaczynać przy okazji innego wydania.** Ma iść samo, żeby przy awarii
  podpisu było wiadomo, co ją spowodowało.

### Co sprawdzić na urządzeniu, zanim pójdzie do sklepu

Czerwony i żółty przy zamkniętej aplikacji, w trzech językach interfejsu; alarm
krytyczny ze zgodą (czy rozszerzenie nie zdejmuje mu dźwięku); zachowanie, gdy
rozszerzenie nie zdąży albo się wywróci — iOS pokazuje wtedy treść z serwera,
czyli polską, i to jest akceptowalny zapas.

## 10. NSE — plan wykonania (17.10.2026, zakres 1.7.96 pkt 12)

Założenia i powody są w §9. Tu kolejność robót dobrana tak, żeby **ryzyko
podpisywania ujawniło się jak najwcześniej i bez konsekwencji dla ludzi**.

### Najważniejsza własność: rozszerzenie jest BEZCZYNNE, póki serwer nie doda `mutable-content`

iOS uruchamia `UNNotificationServiceExtension` wyłącznie dla powiadomień
z `mutable-content: 1` w ładunku. Dopóki `notify.py` tego nie wysyła, rozszerzenie
jest w aplikacji obecne i nic nie robi — **można je wydać bez zmiany czegokolwiek
dla użytkowników**. To zdejmuje z tej zmiany większość strachu: nie ma momentu,
w którym „alarm nagle idzie nową drogą" bez naszej decyzji.

### Kolejność

| Etap | Co | Czym ryzykuje | Jak sprawdzam |
|---|---|---|---|
| A | Źródła rozszerzenia + wpięcie targetu w `project.pbxproj` | kompilacja, nie podpis | CI `tryb=sprawdzenie` |
| B | Drugi App ID (`pl.straznik.app.NotificationService`) i jego profil w `podpis_apple.py` | **tu jest całe ryzyko** — ITMS-90035 | CI `tryb=sprawdzenie` czyta oba profile |
| C | Build TestFlight + testy na telefonie Adriana | brak, push tylko na `test_voiv_*` | pomiar na urządzeniu |
| D | `mutable-content: 1` w `notify.py` | wspólny kod alarmów | opis dla sesji głównej + **osobna zgoda usera** |

Etapy A–C nie zmieniają niczego dla użytkowników. Dopiero D włącza mechanizm.

### Język: skąd rozszerzenie ma go wziąć

Rozszerzenie ma **własny kontener** — `UserDefaults.standard` z wtyczki jest dla
niego niewidoczny. Dwie drogi:

1. **App Group** (`group.pl.straznik.app`) — wtyczka zapisuje wybrany język do
   wspólnego kontenera, rozszerzenie go czyta. Zgodne z przełącznikiem w aplikacji.
   Koszt: kolejna zdolność na obu App ID i przebudowa profili.
2. **Język telefonu** (`Locale.preferredLanguages`) — zero dodatkowych uprawnień,
   ale rozmija się z własnym przełącznikiem w aplikacji. Po **D2** (aplikacja bez
   zapisanego wyboru bierze język telefonu) dla większości ludzi to to samo —
   rozjazd dotyczy wyłącznie tych, którzy świadomie przestawili język w Strażniku.

**Wybór: App Group.** Zrobienie tego „prawie dobrze" przy alarmie oznaczałoby, że
ktoś, kto celowo ustawił sobie ukraiński, dostaje alarm po angielsku, bo tak ma
telefon. Jeśli App Group okaże się kłopotliwa w profilach, droga 2 zostaje jako
awaryjna — ale wtedy trzeba to powiedzieć wprost w ustawieniach.

### Czego rozszerzenie NIE przetłumaczy

Nagłówka i powodów — to polska proza z `alarm_headline` / `reasons_split`
(`threat_label_pl`, „ok. 88 km od granicy") oraz **dosłowne cytaty z tytułów
medialnych**. Przetłumaczymy ramę: etykietę poziomu, „Co zrobić…", disclaimer.
Pełne tłumaczenie wymaga kodów powodów zamiast prozy po stronie serwera — osobny
temat, nie ten.

### Cichy żółty

Drugi powód istnienia rozszerzenia: przy wyborze „Bez dźwięku" dla żółtego
rozszerzenie zdejmuje `sound` z powiadomienia, zanim iOS je pokaże. Ustawienie
jedzie tą samą drogą co język — wspólnym kontenerem. **Czerwonego nie dotykamy
nigdy**, niezależnie od ustawień.

### Etapy A i B ZROBIONE (17.10.2026) — podpis przeszedł za pierwszym razem

Przebiegi `39042090888` i `39042409126`, tryb **`podpis`** (nowy: pełne
podpisywanie i eksport, **bez wysyłki do Apple**). Co się potwierdziło:

- **Unieważniony profil naprawił się sam.** Dopisanie grupy do `pl.straznik.app`
  unieważniło „Straznik CI App Store" — skrypt zobaczył go jako `INVALID`,
  skasował i utworzył nowy. Dokładnie tak, jak zakładaliśmy; **nic nie trzeba było
  robić ręcznie**.
- **Dwa profile**: aplikacja i `...NotificationService`, oba na tym samym trwałym
  certyfikacie. `EXPORT SUCCEEDED`.
- **Podpisana aplikacja ma teraz** `aps-environment`, `critical-alerts`,
  `time-sensitive` **i** `com.apple.security.application-groups` z naszą grupą.
- **Rozszerzenie jest w paczce** i ma wspólny kontener — pilnuje tego nowa bramka
  w `ios.yml`, która przerywa budowanie przy braku `PlugIns/NotificationService.appex`
  albo braku grupy w jego uprawnieniach.

Grupy aplikacji **nie da się założyć przez API** — ani utworzyć, ani przypiąć do
identyfikatora (sprawdzone u Apple 17.10). Zrobił to user ręcznie w portalu:
grupa `group.pl.straznik.app`, nowy identyfikator rozszerzenia i dopisanie grupy
do identyfikatora głównego. Gdyby trzeba było to kiedyś odtworzyć — to są te trzy
kroki, a `podpis_apple.py` mówi o tym w komunikacie błędu.

### Co zostało

- **Etap C**: build TestFlight i pomiary na telefonie — za słowem usera.
  Sprawdzić: alarm testowy w trzech językach, cichy żółty, oraz że czerwony
  **nigdy** nie traci dźwięku.
- **Etap D**: `"mutable-content": 1` w bloku `aps` w `notify.py` — wspólny kod
  alarmów, opis dla sesji głównej i **osobna zgoda usera**. Do tego czasu
  rozszerzenie jest w aplikacji i nic nie robi.
- Po włączeniu D trzeba zmienić notkę `#yv-ios-note`: przestanie być prawdą, że na
  iPhonie ustawienie żółtego nie dotyczy powiadomień.

### Etap C w toku — WSTRZYMANE DO POMIARU (17.10.2026)

Build **1.7.96, 2610171533** jest w TestFlighcie, instrukcja wysłana testerowi
(`INSTRUKCJA_ADRIAN_1796.md`). **Decyzja usera: do czasu pomiaru nic nie idzie do
publikacji.**

**Odkryte przy pisaniu instrukcji, ważne na przyszłość:** rozszerzenie uruchamia
się **wyłącznie dla powiadomień zdalnych**. Nasz test 5 s jest powiadomieniem
LOKALNYM, więc iOS nigdy nie przepuszcza go przez rozszerzenie — tester
z angielskim interfejsem zobaczyłby polski komunikat i zgłosiłby błąd, którego
nie ma. Dlatego instrukcja mówi to wprost, a pomiar wymaga **pushu z
`mutable-content: 1` na `test_voiv_lubelskie`** (prośba wysłana do sesji głównej;
bez wdrażania zmiany na produkcję).

Co pomiar ma rozstrzygnąć:
1. żółty z ustawieniem „Bez dźwięku" — **czy jest cichy**;
2. czerwony przy tym samym ustawieniu — **czy dźwięk zostaje** (nic nie ma prawa
   wyciszyć alarmu);
3. czy tytuł i dwa stałe zdania są w języku aplikacji, a nazwa województwa
   i opis sytuacji zostają po polsku.

## 11. Bezpiecznik syreny — ZROBIONE (21.10.2026, `70db553`)

**Wykonane przy scaleniu `main 1701adf`:** bezpiecznik 600 → 1200 s,
tabela `ZDANIA` w NSE zrównana z nowymi ogonami serwera, treść testu 5 s
zrównana z alarmem, test zdań naprawiony (patrz niżej — oślepł).
**Sprawdzone w kodzie, nie na słowo:** `wyciszAlarmPoLimicie()` woła
`stopSiren()`, więc limit 15 min zatrzymuje też natywną syrenę na iPhonie.
Build dopiero przy wydaniu 1.7.100.

Sesja główna wprowadza w 1.7.100 limit **15 minut** — po tym czasie syrena,
wibracja i miganie gasną same, a ekran zostaje z dopiskiem „Wyciszono
automatycznie po 15 min". Limit wołają przez `stopSiren()`.

Na iOS syrenę gra **część natywna**, nie strona: `AVAudioPlayer` z
`numberOfLoops = -1`, uruchamiany przez `dzwiekAlarmu({wlacz:true})`.
`stopSiren()` ją zatrzyma — wywołanie `sesjaAudioAlarmu(false)` stoi tam
celowo **poza** warunkiem `if (sirenNodes)`, bo na iPhonie `sirenNodes` nigdy
nie powstaje. Tę część sprawdziłem, działa bez zmian.

**Problem jest gdzie indziej.** W `wlaczSyrene()` siedzi
`Timer.scheduledTimer(withTimeInterval: 600)` → `zatrzymajSyrene()` —
bezpiecznik **10 minut** na wypadek, gdyby „wyłącz" nigdy nie przyszło
(przeładowanie strony, błąd w JS). Jest **krótszy** niż nowy limit 15 min, więc
bez zmiany na iPhonie wyszłoby:

- w 10. minucie syrena milknie sama,
- ekran dalej pokazuje trwający alarm,
- w 15. minucie dopisek o automatycznym wyciszeniu pojawia się **pięć minut po**
  tym, jak dźwięk ucichł,
- świadoma reguła 15 min **nigdy się nie wykonuje** — bezpiecznik zawsze wygrywa.

**Potwierdzone przez sesję główną 21.10:** zostaje 15 min (decyzja usera), moja
propozycja przyjęta. Regułę trzyma JS: `ALARM_MAX_MIN = 15` w `app.js`,
`ustawLimitAlarmu` / `wyciszAlarmPoLimicie` → `stopSiren()`.

**Do sprawdzenia po scaleniu, zanim zbuduję:** czy `wyciszAlarmPoLimicie`
naprawdę woła `stopSiren()`, a nie sam tor Web Audio. To jest cały sedno dla iOS —
natywną syrenę zatrzymuje wyłącznie `sesjaAudioAlarmu(false)` ze środka
`stopSiren()`. Gdyby limit gasił dźwięk własną ścieżką, na iPhonie syrena
grałaby dalej aż do bezpiecznika — czyli po zmianie na 1200 s **dłużej niż dziś**.
Sprawdzić w kodzie, nie zakładać.

**Zmiana:** `600` → `1200` (20 min) w `StraznikBackgroundPlugin.swift`, żeby
bezpiecznik znów był bezpiecznikiem, a regułę trzymał JS — jeden limit dla obu
platform. Komentarz nad stoperem poprawić razem z liczbą.

**Dlaczego nie wcześniej:** sam bezpiecznik 20 min bez limitu 15 min w JS to krok
w tył (telefon po awarii JS zostałby z syreną dwa razy dłużej). Te dwie zmiany
muszą wejść jednym wydaniem.

Natywnej pętli wibracji nie ma — w całej wtyczce jest dokładnie jeden `Timer`,
ten od syreny. Gaszenie wibracji i migania zostaje po stronie frontendu.

**Po wdrożeniu serwera (skrócone body w `notify.py`):** uruchomić
`ios-app/skrypty/test_zdania_rozszerzenia.py` i zrównać tabelę `ZDANIA`
w rozszerzeniu. Niezgodność nie psuje alarmu — push przyjdzie po polsku, ale
cały; nigdy ucięty. NSE i tak nieaktywne do etapu D.
