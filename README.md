<div align="center">

<img src="docs/ikona.png" width="96" alt="Strażnik">

# Strażnik

**Nieoficjalne wczesne ostrzeganie o zagrożeniach powietrznych**

Fuzja kilku niezależnych sygnałów dla Polski, z priorytetem dla ściany wschodniej.
Żaden pojedynczy sygnał nie jest rozstrzygający — dopiero kombinacja podnosi
wiarygodność ostrzeżenia.

### 📖 [**Pełna instrukcja użytkownika ze zrzutami ekranu →**](https://cukierrro.github.io/Straznik/)

[⬇ Pobierz APK](Straznik.apk) · [☕ Postaw kawę](https://buycoffee.to/cukierrro)

</div>

> [!WARNING]
> **NIEOFICJALNE źródło dodatkowe.** Nie zastępuje syren, alertów RCB ani RSO.
> W razie realnego zagrożenia kieruj się oficjalnymi kanałami. Aplikacja korzysta
> ze źródeł publicznych, w tym crowdsourcingowych, które mogą się mylić, spóźniać
> lub milczeć.

---

## Co to robi

Aplikacja zbiera sygnały z kilku niezależnych źródeł, przydziela im punkty
i sumuje w oknie 60 minut (pełna waga przez 30 minut, potem liniowe wygaszanie)
osobno dla każdego województwa. Przy **≥ 2 pkt**
włącza podwyższoną uwagę (ciche powiadomienie), przy **≥ 4 pkt** — głośny alarm
z syreną. UI zawsze pokazuje pełne rozbicie: które sygnały, skąd, ile punktów.

| Sygnał | Warunek | Punkty |
|---|---|---|
| **NEPTUN** | obiekt kursem na granicę PL — punktacja zależna od typu, liczby, odległości i liczby potwierdzeń (niżej) | **0–8** |
| **NEPTUN** | oficjalny alarm powietrzny w obwodzie UA graniczącym z PL | **+1** |
| **Media/RSS** | słowa kluczowe (syreny, alarm, dron…) w mediach danego województwa — sam artykuł nie alarmuje, próg przekracza dopiero potwierdzenie | **+1,5** |
| **RCB** | nowy komunikat na gov.pl/web/rcb | **+2** |
| **ADS-B** | ≥3 maszyny wojskowe nad województwem i >2× baseline **z tej samej pory doby** z 7 dni | **+1** |
| **PAŻP** | rzadka strefa ADHOC/R/NPZ/D obejmująca całą kolumnę od ziemi w górę; TRA/TSA/MRT/ATZ i designatory powtarzane w ciągu 7 dni nie punktują | **+0,5** |
| **Media LT/LV/EE** | incydent powietrzny wg mediów bałtyckich → podlaskie + warmińsko-mazurskie; komunikat kończący wygasza wkład tego samego zdarzenia | **+1** |
| **Sąsiedzi (RO/EE/LT)** | aktywne zamknięcie przestrzeni u sąsiada NATO — sygnał obserwacyjny, wyprzedzający | **+0,3** |

### Punktacja obiektów NEPTUN

Jeden Shahed 80 km od granicy to co innego niż sześć Shahedów 50 km od granicy,
a dron FPV o zasięgu kilkunastu kilometrów nie zagraża Polsce w ogóle. Zamiast
jednej stawki za „obiekt kursem na PL" punkty są iloczynem czterech czynników:

```
punkty = waga_typu × √liczba × k_odległości × k_wiarygodności × k_potwierdzeń × k_cyklu
```

| Czynnik | Wartości |
|---|---|
| **waga typu** | balistyczna 3,0 · MiG-31K 2,6 · manewrująca 2,4 · KAB 1,8 · Shahed 1,4 · dron 1,1 · zwiadowczy 0,5 · **FPV 0** |
| **liczba** (`count`) | pierwiastek — cztery obiekty ważą 2× tyle co jeden, nie 4× |
| **odległość** | <30 km ×1,6 · <60 ×1,3 · <100 ×1,0 · <150 ×0,55 · <250 ×0,25 · dalej 0 |
| **wiarygodność** | high ×1,0 · medium ×0,6 · low ×0,35 |
| **potwierdzenia** (`sourceCount`) | 1 ×0,7 · 2 ×0,9 · 3–4 ×1,1 · ≥5 ×1,25 |
| **cykl życia** | confirmed ×1,1 · uncertain ×0,85 · created ×0,7 |

Wkład całego NEPTUN-a ograniczony do **8 pkt** — przy kilkudziesięciu obiektach
suma i tak dawno przekroczyła próg alarmu, a trzycyfrowa punktacja psułaby skalę.

**Kalibracja.** Wagi dobrano na żywych danych NEPTUN i sprawdzono na
udokumentowanych zdarzeniach oraz na 354 migawkach zebranych przez backend
(1998 obserwacji obiektów w 7,5 h):

| Scenariusz | Punkty | Reakcja |
|---|---|---|
| masowe naruszenie granicy (~19 dronów blisko) | 8,0 | alarm |
| rakieta manewrująca 25 km od granicy | 4,7 | alarm |
| 6 Shahedów 50 km, 5 potwierdzeń | 6,1 | alarm |
| rutynowy nalot na zachodnią Ukrainę (110–130 km) | 1,3 | brak reakcji |
| pojedynczy dron 90 km, jedno zgłoszenie | 0,4 | brak reakcji |
| FPV tuż przy granicy | 0,0 | brak reakcji |
| zebrana historia (wszystkie obiekty ≥ 542 km) | 0,0 | brak reakcji |

Klasyfikacja mediów jest dwupoziomowa (`textmatch.py`): słowa **mocne**
("zawyły", "alarm powietrzny", "zestrzel", "naruszenie przestrzeni"…) wystarczą
same; słowa **słabe** ("syren", "dron", "rakieta"…) wymagają ≥2 różnych trafień;
kontekst administracyjny/ćwiczebny ("wymiana syren", "przetarg", "próba syren"…)
wyklucza dopasowanie. Jedna klasa źródła ma limit wkładu do sumy
(media ≤2, RCB ≤2, ADS-B ≤1, PAŻP ≤1, sąsiedzi ≤0,6) — pięć artykułów o tym
samym zdarzeniu to wciąż jedno potwierdzenie. Nadmiarowe sygnały są widoczne
w UI z przekreśloną punktacją.

**Alarm czasowy NEPTUN.** Dla obiektu o znanym albo wiarygodnie wyliczonym
kursie, średniej/wysokiej pewności i co najmniej dwóch potwierdzeniach działa
dodatkowe zabezpieczenie ETA: żółty przy konserwatywnym czasie ≤10 min, czerwony
przy ≤5 min. Od surowego czasu odejmowane jest **2,5 min** (p90 opóźnienia
źródła z pomiaru 27–30.08.2026). Brak kursu, niska pewność lub jedno zgłoszenie
nie mogą samodzielnie uruchomić alarmu ETA.

Propagacja jest **kaskadowa**: region z sumą ≥ 2 pkt przekazuje 40 % wyniku
sąsiadom, ci 40 % tego swoim sąsiadom i tak dalej, licząc po najkrótszej drodze
(BFS) aż wkład spadnie poniżej 0,1 pkt. Alarm 5 pkt w lubelskim rozkłada się więc
tak: sąsiedzi +2,0 (żółty próg), drugi krąg +0,8, trzeci +0,3, czwarty +0,1.
Zagrożenie na wschodzie podnosi czujność w całym kraju, ale proporcjonalnie do
odległości. Każdy wkład jest osobnym sygnałem „Przeniesienie z woj. X (… , 2. krąg)",
więc nigdy nie miesza się z własnym sygnałem regionu.

## Architektura

```
[Neptun WS] ──┐                                    ┌─ aplikacja Android (push FCM per województwo)
[RSS media] ──┤   backend FastAPI na VPS           ├─ straznik.eu (mapa 3D w przeglądarce)
[RCB gov.pl]──┼─► fuzja punktowa ─► SQLite ─► API ─┤
[ADS-B mil] ──┤   progi 2 / 4 pkt   + WebSocket    ├─ ntfy / Telegram / Web Push
[PAŻP AUP*] ──┘   (za Cloudflare, HTTPS)           └─ fallback: wbudowany silnik w apce
```

**Aplikacja domyślnie korzysta z serwera** (`https://straznik.eu`): fuzja liczona
jest raz na serwerze, a nie na każdym telefonie osobno — mniejsze zużycie baterii
i darmowych limitów API. Gdy serwer jest niedostępny, aplikacja schodzi na
**wbudowany silnik** (`frontend/engine.js` — lustrzana kopia logiki fuzji w JS;
natywne żądania HTTP z WebView omijają CORS) jako fallback.

**Powiadomienia push (FCM).** Serwer przy wzroście poziomu wysyła wiadomość na
temat `voiv_<region>`; telefon subskrybuje temat swojego województwa i dostaje
alarm nawet przy zamkniętej aplikacji, wygaszonym ekranie i w trybie Doze — bez
usługi działającej w tle (Android 15/16 taką usługę pierwszoplanową i tak ubijał,
więc została wycofana). Poziom czerwony wyzwala pełnoekranowy alarm nad blokadą
(`AlarmActivity`), żółty — powiadomienie heads-up.

**Wdrożenie.** Backend działa na VPS, wystawiony tunelem Cloudflare pod
`https://straznik.eu` (TLS na brzegu Cloudflare, bez otwierania portu na origin).
Klucz konta serwisowego FCM leży poza repozytorium, w `backend/data/` (`.gitignore`).

**Alarmy obwodów UA.** Neptun wysyła ramki `alerts` WebSocketem; backend utrzymuje
to gniazdo stale, więc oficjalne alarmy powietrzne w obwodach UA graniczących z PL
docierają na bieżąco i są punktowane (`ua_alert_border`). Stan źródła widać w
`health.ua_alerts` i na diodzie „Alarmy UA".

**Historia 12 h — przewijana po stronie klienta.** Zamiast pytać serwer o każdą
pozycję suwaka (`/api/history?at=` — przy wielu użytkownikach przewijających naraz
mnożyło zapytania i obciążało VPS), aplikacja pobiera całą historię **raz**
(`/api/history/bundle`: migawki pozycji + surowe sygnały okna) i trzyma ją w
**pamięci (RAM), nie na dysku**. Suwak liczy fuzję dla każdej chwili lokalnie tym
samym `accumulate` co silnik offline (`engine.js` `historyFrom`/`timelineFrom`),
więc przewijanie jest płynne i **nie generuje ruchu do serwera**. Bufor to okno
kroczące 12 h (~0,5–2 MB), samo się przycina i odświeża z żywego feedu WebSocket
(te same dane, które i tak płyną do mapy) — otwarta godzinami apka nie dociąga nic
dodatkowego. Tryb offline trzyma migawki w `localStorage` (też okno 12 h). Stary
backend bez `/api/history/bundle` jest znoszony łagodnie (krótsza historia).

\* PAŻP: airspace.pansa.pl nie ma udokumentowanego API, ale jego mapa karmi się
publicznym GeoJSON-em — `/map-configuration/uup` i `/map-configuration/aup`
(adresy wskazuje `/meta/configuration`). Kolektor bierze stamtąd geometrię stref,
okna rezerwacji i pułapy, a przypisanie do województwa liczy przez
point-in-polygon na centroidzie strefy.

## Uruchomienie backendu (Windows)

```bash
cd backend
py -m pip install -r requirements.txt
copy .env.example .env     # uzupełnij NTFY_TOPIC itd.
py -m uvicorn app.main:app --host 0.0.0.0 --port 8600 --app-dir .
```

Dashboard: `http://localhost:8600` · API: `/api/state`, `/api/health`, `/api/history/bundle`, `/api/docs`

> Produkcyjnie backend działa na VPS na porcie `40141`, wystawiony tunelem
> Cloudflare pod `https://straznik.eu`. Push FCM wymaga klucza konta serwisowego
> w `backend/data/fcm-service-account.json` (zob. „Powiadomienia").

Test warstwy Neptun bez serwera:

```bash
cd backend
py -m app.cli neptun    # strumień WS na żywo z oceną odległości/kursu do granicy PL
py -m app.cli score     # jednorazowy snapshot REST
```

Test fuzji end-to-end (endpoint domyślnie **wyłączony** — najpierw ustaw
`TEST_SIGNAL_ENABLED=true` w `.env`, żeby nie był publicznie dostępny na produkcji):

```bash
curl -X POST http://localhost:8600/api/test-signal -H "Content-Type: application/json" -d "{\"voivodeship\":\"lubelskie\",\"points\":2.5,\"title\":\"test\"}"
```

Tryb wbudowany w przeglądarce: `http://localhost:8600/?standalone=1`

## Powiadomienia

- **FCM (push do aplikacji Android) — główna ścieżka.** Serwer przy wzroście
  poziomu wysyła wiadomość `data` na temat `voiv_<region>`; aplikacja subskrybuje
  temat swojego województwa (`BackgroundPlugin.syncFcmSubscription`) i dostaje
  alarm nawet przy zamkniętej aplikacji. Wymaga projektu Firebase: pliku
  `google-services.json` w `android-app/android/app/` oraz klucza konta
  serwisowego na serwerze w `backend/data/fcm-service-account.json` (`.gitignore`).
  Włączane flagą `FCM_ENABLED` (domyślnie `true`). Poziom czerwony → pełnoekranowy
  alarm z syreną; żółty → heads-up.
- **ntfy:** zainstaluj aplikację ntfy, wymyśl długi losowy temat, wpisz go w
  `.env` (`NTFY_TOPIC=`) i zasubskrybuj w aplikacji. Poziom WYSOKI idzie
  z priorytetem `urgent`.
- **Telegram:** `@BotFather` → `/newbot` → token do `.env`; napisz do bota,
  odczytaj `chat_id` z `https://api.telegram.org/bot<TOKEN>/getUpdates`.
- **Web Push (VAPID):** przycisk 🔔 w dashboardzie/na `straznik.eu` (wymaga
  `http://localhost` lub HTTPS). Ta sama ścieżka obsłuży PWA na iOS 16.4+
  (po „Dodaj do ekranu początkowego").

## Podpisywanie wydania

Każde APK musi być podpisane, a Android przyjmie aktualizację tylko wtedy, gdy
jest podpisana **tym samym kluczem** co wersja już zainstalowana. Buildy debug
używają klucza `debug.keystore` o publicznie znanym haśle (`android`), który
narzędzia potrafią zregenerować — na nim nie da się utrzymać ciągłości
aktualizacji, a aplikacja ma wtedy włączoną flagę `debuggable` i ufa certyfikatom
zainstalowanym przez użytkownika.

**Klucz tworzy się raz.** Jego utrata oznacza, że użytkownicy nie zainstalują
żadnej kolejnej wersji bez odinstalowania aplikacji (i utraty ustawień), więc
zrób kopię pliku i zapisz hasła w menedżerze haseł.

```bash
cd android-app/android
"C:/Program Files/Android/Android Studio/jbr/bin/keytool" -genkeypair -v -keystore straznik-release.jks -alias straznik -keyalg RSA -keysize 4096 -validity 10000
```

Polecenie zapyta o hasło (dwa razy) i o dane właściciela — wystarczy imię lub
nazwa projektu, reszta może zostać pusta. Następnie:

```bash
cp keystore.properties.example keystore.properties
```

…i wpisz w nim swoje hasła. Plik `keystore.properties`, `*.jks` i `*.keystore`
są w `.gitignore`, więc nie trafią do repozytorium.

Budowanie podpisanego wydania:

```bash
cd android-app/android
JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleRelease
```

Wynik: `app/build/outputs/apk/release/app-release.apk`. Weryfikacja podpisu:

```bash
"$ANDROID_HOME/build-tools/37.0.0/apksigner" verify --print-certs -v app/build/outputs/apk/release/app-release.apk
```

Bez `keystore.properties` build wydania nadal się wykona, ale APK **nie zostanie
podpisany** — to celowe, żeby wydanie nigdy nie wyszło z kluczem debug.

> Build release nie honoruje `debug-overrides` z `network_security_config`, więc
> nie ufa certyfikatom zainstalowanym przez użytkownika. Na maszynie z
> antywirusem skanującym TLS (Avast, Kaspersky, ESET) emulator może wtedy nie
> pobrać danych — na zwykłych telefonach problemu nie ma.

## Przebudowa APK

```bash
cd android-app
rm -rf www && cp -r ../frontend www && rm www/sw.js
npx cap sync android
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug
```

Wynik: `android-app/android/app/build/outputs/apk/debug/app-debug.apk`
(kopia w katalogu głównym jako `Straznik.apk`).

> Push FCM wymaga pliku `android-app/android/app/google-services.json` (z projektu
> Firebase) — bez niego wtyczka `google-services` się nie aktywuje i push nie
> działa. Na maszynie z antywirusem skanującym TLS (Avast/Kaspersky/ESET) Gradle
> może nie pobrać zależności Firebase (`PKIX path building failed`) — trzeba wskazać
> JVM magazyn certyfikatów z CA antywirusa (import certu do kopii `cacerts` +
> `-Djavax.net.ssl.trustStore=…`); po jednorazowym pobraniu deps wpadają do cache.

## Struktura

- `backend/app/collectors/` — neptun.py (WS+REST), rss_media.py, rcb.py, adsb.py, pansa.py
- `backend/app/fusion.py` — silnik punktowy (przejrzysty, nie ML)
- `backend/app/geo.py` — punkty referencyjne granicy, haversine, ocena kursu
- `backend/data/straznik.db` — SQLite: pełny log sygnałów (ts, źródło, punkty, województwo)
- `frontend/` — mapa 3D MapLibre GL, panel sygnałów, legenda, ekran „O aplikacji"
- `frontend/engine.js` — wbudowany silnik (fallback, gdy serwer niedostępny)
- `backend/app/notify.py` — kanały powiadomień: FCM (tematy per województwo),
  ntfy, Telegram, Web Push (VAPID)
- `android-app/` — opakowanie Capacitor (WebView) + projekt Gradle
- `android-app/android/app/src/main/java/pl/straznik/app/` — warstwa natywna:
  `StraznikFcmService` (odbiór pushy FCM → powiadomienie/alarm), `Alarms` (kanały
  powiadomień i budowa alarmu), `AlarmActivity` (pełnoekranowy alarm nad blokadą),
  `BackgroundPlugin` (most do JS: subskrypcja tematów FCM, zgody na powiadomienia
  i alarm pełnoekranowy), `MainActivity`
- `android-app/android/app/google-services.json` — konfiguracja Firebase (niesekretna)
- `docs/` — instrukcja użytkownika (GitHub Pages) i zrzuty ekranu
- `scripts/build_cams.py` — odświeżanie listy kamer
- `scripts/build_sounds.py` — generowanie dźwięków alarmów do `res/raw/`

## Zgodność z urządzeniami

`minSdk 24` (Android 7.0) — `targetSdk 36` (Android 16). Obsłużone różnice:
kanały powiadomień od API 26, uprawnienie `POST_NOTIFICATIONS` od API 33, zgoda
`USE_FULL_SCREEN_INTENT` od API 34, wyjątek od optymalizacji baterii od API 23.
Layout używa `env(safe-area-inset-*)`, więc pasek nie chowa się pod wycięciem ani
paskiem systemowym; na wąskich ekranach przyciski zwijają się do ikon. Testowane
na fizycznym urządzeniu (Android 16) i emulatorze Pixel 7 (Android 14).

**Alarmy przy zamkniętej aplikacji: FCM push, nie usługa w tle.** Wcześniejsze
wersje pilnowały źródeł natywną usługą pierwszoplanową (`MonitorService`), ale
Android 15/16 agresywnie ją ubijał (`Stop FGS timeout` kilka sekund po starcie),
więc została wycofana. Teraz alarm wysyła serwer przez FCM na temat `voiv_<region>`,
a `StraznikFcmService` buduje z niego powiadomienie — działa przy zamkniętej
aplikacji, w trybie Doze i po restarcie telefonu, bez usługi w tle i bez drenowania
baterii. Gdy serwer jest niedostępny, aplikacja i tak działa na wbudowanym silniku
(alarmy wtedy przy otwartej aplikacji).

**Alarm pełnoekranowy** (`AlarmActivity.java`) przy poziomie czerwonym działa
jak połączenie przychodzące: zapala ekran, pokazuje się nad blokadą, miga
(te same barwy i tempo co `#alarm-overlay` w CSS), gra syrenę w pętli i wibruje
do czasu potwierdzenia. Jest natywny, nie w WebView — musi pojawić się
natychmiast także wtedy, gdy proces aplikacji nie żyje. Wyzwala go full-screen
intent z powiadomienia FCM (`StraznikFcmService`).

Od Androida 14 uprawnienie `USE_FULL_SCREEN_INTENT` nie jest przyznawane
automatycznie aplikacjom innym niż budzik i telefon, a **po aktualizacji potrafi
się cofnąć**. Bez niego start aktywności z tła jest blokowany, więc aplikacja prosi
o zgodę w ustawieniach (`⚙ → 🚨 Zgoda na alarm pełnoekranowy`), przypomina o niej
banerem „Napraw", a w razie jej braku ratuje się wake lockiem: zapala ekran, żeby
powiadomienie z syreną było widoczne.

**Dźwięki** generuje `scripts/build_sounds.py` do `res/raw/` — te same przebiegi,
które otwarta aplikacja syntetyzuje w Web Audio (żółty: dwutonowy sygnał
740↔988 Hz, czerwony: modulowana syrena 380↔860 Hz przez filtr dolnoprzepustowy).
Dzięki temu tło brzmi identycznie jak pierwszy plan. Po zmianie brzmienia
w `app.js` uruchom skrypt ponownie. Kanały powiadomień mają sufiks wersji
(`-v3`), bo raz utworzony kanał ignoruje późniejsze zmiany dźwięku.

**Źródła fuzji:** NEPTUN (obiekty + alarmy obwodów UA), media regionalne,
ogólnopolskie i bałtyckie, RCB, PAŻP, strefy sąsiadów (RO płn./EE/LT — sygnał
obserwacyjny, 0,3 pkt) oraz ADS-B (sygnał pomocniczy o wadze 1 pkt, wymaga
tygodnia próbek do baseline). Wszystkie liczy backend. Rozpoznawanie
województwa z tekstu obejmuje wszystkie 16 (`VOIV_KEYWORDS`), a jeden ogólnopolski
kanał Google News pokrywa regiony bez własnego feedu.

Lista aktualności łotewskich sił zbrojnych (`mil.lv`) jest dodatkowo sprawdzana
co 30 sekund jako **instrumentacja bez punktów**. Rejestruje początek i koniec
oficjalnego zagrożenia, aby mierzyć opóźnienia mediów; sama nie może wywołać
alarmu. Komunikaty bałtyckie typu „alert over / zagrożenie zakończone” również
nie dodają punktów — wygaszają wcześniejszy wpis tego samego incydentu.

**Region i kaskada.** Fuzja obejmuje wszystkie 16 województw, ze zdarzeniem na
wschodzie „przelewającym się" na sąsiadów (kaskada, `config.VOIV_NEIGHBORS`).
Push dociera tylko o **wybranym województwie** — telefon subskrybuje temat
`voiv_<region>` (bez wyboru: cztery przygraniczne), więc nie dostaje alertów
o zdarzeniach po drugiej stronie kraju, a wkład z sąsiedztwa i tak podnosi jego
poziom. Przykład: zdarzenie 5 pkt w lubelskim u użytkownika z ustawionym
mazowieckim daje „PODWYŻSZONA UWAGA: woj. mazowieckie (2.0 pkt)" z rozbiciem
„Przeniesienie z woj. lubelskie (5.0 pkt, sąsiad)".

Zweryfikowane na fizycznym urządzeniu (Android 16) przy zamkniętej aplikacji:
żółty wystawia heads-up bez budzenia ekranu; czerwony przy wygaszonym
i zablokowanym ekranie zapala go i pokazuje pełnoekranowy `AlarmActivity` nad
blokadą z syreną, a potwierdzenie zatrzymuje dźwięk i wibrację.

## Ograniczenia (świadome)

- **NEPTUN to agregator OSINT/crowdsourcingowy, nie radar** — UI zawsze pokazuje
  `confidenceLevel` i `±uncertaintyKm`. Wymagana atrybucja „Dane: NEPTUN" jest w UI.
- Neptun pokazuje zagrożenia **nad Ukrainą** — obiekt, który wleci w polską
  przestrzeń, znika z danych źródłowych; system służy jako *wyprzedzenie*, nie śledzenie.
- **ADS-B nie widzi lotnictwa nad Ukrainą** (sprawdzone: 0 maszyn nad zachodnią
  Ukrainą przy 219 wojskowych globalnie). Wojsko UA i RU nie nadaje transponderów,
  przestrzeń jest zamknięta. Widać za to AWACS-y, tankowce i transportowce NATO
  nad Polską, Rumunią i Bałtykiem. To publiczne transpondery maszyn, które *chcą*
  być widoczne — nie namierzanie obiektów przeciwnika.
- Oprócz globalnej listy oznaczonej przez dostawcę jako wojskowa Strażnik odpytuje
  dwa ograniczone obszary geograficzne nad krajami bałtyckimi i lokalnie wybiera
  znane typy, operatorów oraz callsigny wojskowe. Ogranicza to pominięcia wynikające
  z błędnej flagi w rejestrze, ale nie zmienia wagi ADS-B ani nie obejmuje maszyn
  z wyłączonym transponderem.
- **Myśliwców w akcji nie zobaczy żadne źródło ADS-B, jeżeli nie nadają jawnie** — ani naziemne, ani
  satelitarne. Maszyny bojowe w misjach QRA nadają szyfrowany Mode 5 (IFF),
  a nie ADS-B; satelity (Aireon, Spire) odbierają dokładnie ten sam sygnał, więc
  zmiana dostawcy niczego nie doda. Multilateracja (MLAT) w ADSBexchange bywa
  w stanie wyliczyć pozycję maszyny nadającej tylko Mode S, ale i tak nie obejmie
  lotnictwa z wyłączonym transponderem. Dlatego ADS-B jest tu sygnałem
  pomocniczym o wadze 1 pkt, a nie podstawą alarmu.
- **Ślady lotu Neptuna są w praktyce puste** (pole `trail` zawiera 0–2 punkty,
  zwykle zduplikowane), dlatego aplikacja buduje własną trajektorię z kolejnych
  obserwacji pozycji i dolicza dead-reckoning z prędkości typowej dla klasy obiektu.
- **Kamery tylko z Polski** — 641 publicznych kamer miejskich i turystycznych
  (worldcam.pl) we wszystkich 16 województwach, w tym 582 plenerowe; każda
  zweryfikowana pobraniem świeżego obrazu przy budowie listy. Pierwotnie użyłem
  kamer drogowych traxelektronik.pl — okazało się, że wymagają logowania.
  Listę odświeżysz skryptem `scripts/build_cams.py`. Kamer z Ukrainy świadomie
  nie podpinam: od 2022 r. transmisje na żywo są tam zakazane, bo umożliwiają
  korygowanie ostrzału.
- Baseline ADS-B potrzebuje ~tygodnia zbierania próbek, wcześniej warstwa nie punktuje.
- RSS/scraping może się zepsuć, gdy serwisy zmienią strukturę — status w LED-ach
  i `/api/health`.
- **Rozpoznawanie województwa z nagłówka jest heurystyczne.** Opiera się na nazwach
  miast i regionów, więc pomija nazwy kolidujące ze słowami pospolitymi („piła",
  „żary", „hel", „brzeg"), a przy zbieżnościach („Chełm" i „Chełmno", „Radom"
  i „Radomsko") wygrywa pierwsze dopasowanie w kolejności listy. Regiony bez
  własnego kanału RSS pokrywa jedno ogólnopolskie zapytanie Google News, więc
  docierają do nich tylko mocne frazy („alarm powietrzny", „zawyły syreny").

## Licencja

[MIT](LICENSE) — możesz używać, zmieniać i rozpowszechniać kod, zachowując
informację o autorstwie. Oprogramowanie jest udostępniane „tak jak jest",
bez gwarancji: to nieoficjalne źródło dodatkowe, nie system ratunkowy.

## Dane i atrybucja

[NEPTUN](https://neptun.in.ua) (agregator OSINT; obiekty i alarmy obwodów UA) ·
adsb.lol · airspace.pansa.pl · gov.pl/RCB · media regionalne i bałtyckie ·
kamery worldcam.pl ·
mapa © [CARTO](https://carto.com/attributions), © [OpenStreetMap](https://www.openstreetmap.org/copyright)
