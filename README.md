<div align="center">

<img src="docs/ikona.png" width="96" alt="Strażnik">

# Strażnik

**Nieoficjalne wczesne ostrzeganie o zagrożeniach powietrznych**

Fuzja kilku niezależnych sygnałów dla Polski, z priorytetem dla ściany wschodniej.
Żaden pojedynczy sygnał nie jest rozstrzygający — dopiero kombinacja podnosi
wiarygodność ostrzeżenia.

### 📖 [**Pełna instrukcja użytkownika ze zrzutami ekranu →**](https://cukierrro.github.io/straznik/)

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
i sumuje w oknie 30 minut osobno dla każdego województwa. Przy **≥ 2 pkt**
włącza podwyższoną uwagę (ciche powiadomienie), przy **≥ 4 pkt** — głośny alarm
z syreną. UI zawsze pokazuje pełne rozbicie: które sygnały, skąd, ile punktów.

| Sygnał | Warunek | Punkty |
|---|---|---|
| **NEPTUN** | obiekt (uav/missile/ballistic/kab/MiG-31K) kursem na granicę PL, < 100 km, confidence **high** | **+3** |
| **NEPTUN** | jw., confidence medium/low | **+1.5** |
| **NEPTUN** | oficjalny alarm powietrzny w obwodzie UA graniczącym z PL | **+1** |
| **Media/RSS** | słowa kluczowe (syreny, alarm, dron…) w mediach danego województwa | **+2** |
| **RCB** | nowy komunikat na gov.pl/web/rcb | **+2** |
| **ADS-B** | liczba maszyn wojskowych nad województwem > 2× baseline z 7 dni | **+1** |
| **PAŻP** | nowa aktywna strefa (TSA/TRA/D) nad województwem | **+1** |
| **Media LT/LV/EE** | incydent powietrzny wg mediów bałtyckich → podlaskie + warmińsko-mazurskie | **+1** |

Klasyfikacja mediów jest dwupoziomowa (`textmatch.py`): słowa **mocne**
("zawyły", "alarm powietrzny", "zestrzel", "naruszenie przestrzeni"…) wystarczą
same; słowa **słabe** ("syren", "dron", "rakieta"…) wymagają ≥2 różnych trafień;
kontekst administracyjny/ćwiczebny ("wymiana syren", "przetarg", "próba syren"…)
wyklucza dopasowanie. Jedna klasa źródła ma limit wkładu do sumy
(media ≤2, RCB ≤2, ADS-B ≤1, PAŻP ≤1) — pięć artykułów o tym samym zdarzeniu
to wciąż jedno potwierdzenie. Nadmiarowe sygnały są widoczne w UI
z przekreśloną punktacją.

Propagacja jest **kaskadowa**: region z sumą ≥ 2 pkt przekazuje 40 % wyniku
sąsiadom, ci 40 % tego swoim sąsiadom i tak dalej, licząc po najkrótszej drodze
(BFS) aż wkład spadnie poniżej 0,1 pkt. Alarm 5 pkt w lubelskim rozkłada się więc
tak: sąsiedzi +2,0 (żółty próg), drugi krąg +0,8, trzeci +0,3, czwarty +0,1.
Zagrożenie na wschodzie podnosi czujność w całym kraju, ale proporcjonalnie do
odległości. Każdy wkład jest osobnym sygnałem „Przeniesienie z woj. X (… , 2. krąg)",
więc nigdy nie miesza się z własnym sygnałem regionu.

## Architektura

```
[Neptun WS] ──┐                                   ┌─ mapa 3D (przeglądarka)
[RSS media] ──┤   backend FastAPI (PC)            ├─ aplikacja Android (APK)
[RCB gov.pl]──┼─► fuzja punktowa ─► SQLite ─► API ┤
[ADS-B mil] ──┤   progi 2 / 4 pkt                 ├─ ntfy (telefon)
[PAŻP AUP*] ──┘                                   └─ Telegram / Web Push
```

Aplikacja Android działa **domyślnie bez backendu**: `frontend/engine.js` to
lustrzana kopia logiki fuzji w JS, a natywne żądania HTTP z WebView omijają CORS.
Backend jest opcjonalny i daje pełny log SQLite, całodobowy baseline ADS-B,
warstwę PAŻP oraz ntfy/Telegram/Web Push.

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

Dashboard: `http://localhost:8600` · API: `/api/state`, `/api/health`, `/api/docs`

Test warstwy Neptun bez serwera:

```bash
cd backend
py -m app.cli neptun    # strumień WS na żywo z oceną odległości/kursu do granicy PL
py -m app.cli score     # jednorazowy snapshot REST
```

Test fuzji end-to-end:

```bash
curl -X POST http://localhost:8600/api/test-signal -H "Content-Type: application/json" -d "{\"voivodeship\":\"lubelskie\",\"points\":2.5,\"title\":\"test\"}"
```

Tryb wbudowany w przeglądarce: `http://localhost:8600/?standalone=1`

## Powiadomienia

- **ntfy (zalecane na telefon):** zainstaluj aplikację ntfy, wymyśl długi
  losowy temat, wpisz go w `.env` (`NTFY_TOPIC=`) i zasubskrybuj w aplikacji.
  Poziom WYSOKI idzie z priorytetem `urgent`.
- **Telegram:** `@BotFather` → `/newbot` → token do `.env`; napisz do bota,
  odczytaj `chat_id` z `https://api.telegram.org/bot<TOKEN>/getUpdates`.
- **Web Push:** przycisk 🔔 w dashboardzie (wymaga `http://localhost` lub HTTPS).

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

## Struktura

- `backend/app/collectors/` — neptun.py (WS+REST), rss_media.py, rcb.py, adsb.py, pansa.py
- `backend/app/fusion.py` — silnik punktowy (przejrzysty, nie ML)
- `backend/app/geo.py` — punkty referencyjne granicy, haversine, ocena kursu
- `backend/data/straznik.db` — SQLite: pełny log sygnałów (ts, źródło, punkty, województwo)
- `frontend/` — mapa 3D MapLibre GL, panel sygnałów, legenda, ekran „O aplikacji"
- `frontend/engine.js` — wbudowany silnik dla APK (lustrzana kopia logiki backendu)
- `android-app/` — opakowanie Capacitor (WebView) + projekt Gradle
- `android-app/android/app/src/main/java/pl/straznik/app/` — warstwa natywna:
  `MonitorService` (nasłuch w tle), `AlarmActivity` (alarm pełnoekranowy),
  `Fusion` + `Sources` (fuzja i kolektory w tle), `BackgroundPlugin` (most do JS)
- `docs/` — instrukcja użytkownika (GitHub Pages) i zrzuty ekranu
- `scripts/build_cams.py` — odświeżanie listy kamer
- `scripts/build_sounds.py` — generowanie dźwięków alarmów do `res/raw/`

## Zgodność z urządzeniami

`minSdk 24` (Android 7.0) — `targetSdk 36` (Android 16). Obsłużone różnice:
kanały powiadomień od API 26, uprawnienie `POST_NOTIFICATIONS` od API 33,
typ usługi `dataSync` wymagany od API 34, wyjątek od optymalizacji baterii od
API 23. Layout używa `env(safe-area-inset-*)`, więc pasek nie chowa się pod
wycięciem ani paskiem systemowym; na wąskich ekranach przyciski zwijają się do
ikon. Testowane na emulatorze Pixel 7 (Android 14).

**Nasłuch w tle** (`MonitorService.java`) to natywna usługa pierwszoplanowa,
która sama odpytuje źródła i wystawia powiadomienia także przy wygaszonym
ekranie. Android wymaga przy tym stałego powiadomienia „nasłuch aktywny"
(pokazuje stan źródeł, np. `Neptun✓ Media✓ RCB✓`) — to warunek systemu.
Usługa wraca po restarcie telefonu oraz przy otwarciu aplikacji (jeśli nasłuch
jest włączony, a usługi nie ma — np. po wymuszonym zatrzymaniu), i prosi
o wyłączenie optymalizacji baterii, bo Xiaomi/Samsung/Huawei potrafią ubijać
usługi w tle.

**Alarm pełnoekranowy** (`AlarmActivity.java`) przy poziomie czerwonym działa
jak połączenie przychodzące: zapala ekran, pokazuje się nad blokadą, miga
(te same barwy i tempo co `#alarm-overlay` w CSS), gra syrenę w pętli i wibruje
do czasu potwierdzenia. Jest natywny, nie w WebView — musi pojawić się
natychmiast także wtedy, gdy proces aplikacji nie żyje.

Od Androida 14 uprawnienie `USE_FULL_SCREEN_INTENT` nie jest przyznawane
automatycznie aplikacjom innym niż budzik i telefon. Bez niego start aktywności
z tła jest blokowany (`BAL_BLOCK`), więc aplikacja prosi o zgodę w ustawieniach
(`⚙ → 🚨 Zgoda na alarm pełnoekranowy`), a w razie jej braku ratuje się
wake lockiem: zapala ekran, żeby powiadomienie z syreną było widoczne.

**Dźwięki** generuje `scripts/build_sounds.py` do `res/raw/` — te same przebiegi,
które otwarta aplikacja syntetyzuje w Web Audio (żółty: dwutonowy sygnał
740↔988 Hz, czerwony: modulowana syrena 380↔860 Hz przez filtr dolnoprzepustowy).
Dzięki temu tło brzmi identycznie jak pierwszy plan. Po zmianie brzmienia
w `app.js` uruchom skrypt ponownie. Kanały powiadomień mają sufiks wersji
(`-v2`), bo raz utworzony kanał ignoruje późniejsze zmiany dźwięku.

**Zasięg nasłuchu w tle:** wszystkie 16 województw, z tą samą kaskadą co mapa.
Powiadomienia dotyczą regionu wybranego przez użytkownika (`Fusion.setHomeVoivodeship`,
ustawiane z JS przy zapisie ustawień) — bez tego filtra telefon dostawałby alerty
o zdarzeniach po drugiej stronie kraju. Bez wybranego regionu usługa pilnuje
czterech przygranicznych. Rozpoznawanie województwa z tekstu obejmuje wszystkie 16
(`VOIV_KEYWORDS` / `VOIV_KEYS`), a jeden ogólnopolski kanał Google News pokrywa
regiony bez własnego feedu.

Tablica sąsiedztwa w `Fusion.java` jest po indeksach `Sources.VOIVS` — przy zmianie
kolejności województw trzeba ją przeliczyć. Zgodność z `config.VOIV_NEIGHBORS`
i symetrię sąsiedztwa warto sprawdzić skryptem porównującym oba źródła.

Zweryfikowane na emulatorze Pixel 7 (Android 14) przy ubitym procesie aplikacji
i wygaszonym ekranie: żółty poziom wystawia powiadomienie i **nie** budzi ekranu,
czerwony budzi ekran (`Asleep → Awake`) i wypycha `AlarmActivity` na wierzch
(`BAL_ALLOW_PENDING_INTENT`), a potwierdzenie zatrzymuje dźwięk i wibrację.
Kaskada sprawdzona osobno: zdarzenie 5 pkt w lubelskim wywołało u użytkownika
z ustawionym mazowieckim powiadomienie „PODWYŻSZONA UWAGA: woj. mazowieckie
(2.0 pkt)" z rozbiciem „Przeniesienie z woj. lubelskie (5.0 pkt, sąsiad)".

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

[NEPTUN](https://neptun.in.ua) (agregator OSINT) · adsb.lol · airspace.pansa.pl ·
gov.pl/RCB · media regionalne · kamery worldcam.pl ·
mapa © [CARTO](https://carto.com/attributions), © [OpenStreetMap](https://www.openstreetmap.org/copyright)
