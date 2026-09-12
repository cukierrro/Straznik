<div align="center">

<img src="docs/ikona.png" width="96" alt="Strażnik">

# Strażnik

Wersja 1.7.23: przebudowana nawigacja — dolne zakładki Mapa / Sygnały / Historia /
Więcej, pięć ikon w górnym pasku, jeden dolny stos komunikatów zamiast pięciu
pływających ramek i okna dialogowe, które nie wchodzą na systemowy pasek nawigacji.
Karta obiektu otwiera się jako miniatura w rogu z przyciskiem rozwinięcia, a zaznaczony
obiekt ma na mapie biały pierścień. Ustawienia w czterech zakładkach, tryb historii
nazwany wprost i większy suwak. Aktualizacje sprawdzane przy każdym uruchomieniu, a nie
raz na dobę. Szczegóły: `docs/RELEASE_1.7.23.md`.

Wersja 1.7.22: limit klasy źródła liczony po wygaszeniu wiekiem (świeży obiekt
przy granicy nie wnosi już 0 pkt w dłuższym ataku), poziom przeliczany co 45 s
także bez nowego sygnału i trwały po restarcie, push z terminem ważności i
ponowieniami, alarmy powietrzne z ukraińskich rejonów oraz zasada, że samo
przeniesienie od sąsiada nie wysyła powiadomienia. Okna informacyjne mają
ograniczoną wysokość i przewijanie, a elementy przy dolnej krawędzi omijają
systemowy pasek nawigacji. Szczegóły: `docs/RELEASE_1.7.22.md`.

Wersja 1.7.21: pozycje oznaczone przez NEPTUN jako przybliżone oraz rozpoznane
punkty środkowe miejscowości są pokazywane jako rejony zgłoszeń, bez sztucznego
przesuwania, pozornej trasy i ETA. Dystans rejonowy jest zaokrąglany, ma niższą
wagę, a nowe ID w tym samym punkcie nie są automatycznie sumowane. „Moje miejsca”
przechowują na urządzeniu do 8 profili i opcjonalne
jednorazowe pozycje. Powiadomienia w tle nadal dotyczą województwa; po otwarciu
aplikacji dokładny punkt służy do lokalnego wyświetlenia odległości i — tylko
przy wystarczających danych o locie — orientacyjnego ETA. Biblioteka zdjęć ma
również bezpieczne przykłady dla rozpoznanych kodów modeli bez opisu dostawcy.

**Nieoficjalne wczesne ostrzeganie o zagrożeniach powietrznych**

Fuzja kilku niezależnych sygnałów dla Polski, z priorytetem dla ściany wschodniej.
Żaden pojedynczy sygnał nie jest rozstrzygający — dopiero kombinacja podnosi
wiarygodność ostrzeżenia.

### 📖 [**Pełna instrukcja użytkownika ze zrzutami ekranu →**](https://cukierrro.github.io/Straznik/)

[Instrukcja po polsku](https://cukierrro.github.io/Straznik/) · [English user guide](https://cukierrro.github.io/Straznik/en.html)

Instrukcja dla 1.7.23 opisuje „Moje miejsca”, rozdział alertów wojewódzkich i
lokalnych obliczeń na pierwszym planie oraz bibliotekę fotografii PL/EN. Zrzuty
otwierają się także w pełnym rozmiarze.

[⬇ Pobierz APK](https://github.com/cukierrro/Straznik/releases/latest/download/Straznik.apk) · [☕ Postaw kawę](https://buycoffee.to/cukierrro)

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
włącza podwyższoną uwagę (sygnał uwagi i powiadomienie), przy **≥ 4 pkt** — głośny alarm
z syreną. UI zawsze pokazuje pełne rozbicie: które sygnały, skąd, ile punktów.

| Sygnał | Warunek | Punkty |
|---|---|---|
| **NEPTUN** | obiekt kursem na granicę PL — punktacja zależna od typu, liczby, odległości i liczby potwierdzeń (niżej) | **0–8** |
| **NEPTUN** | oficjalny alarm powietrzny w obwodzie UA graniczącym z PL | **+1** |
| **Media/RSS** | obiekt + zdarzenie: 1 pkt; jednoznaczna bieżąca relacja operacyjna: 1,5 pkt; historia, ćwiczenia i następstwa prawne: 0 pkt. Całe RSS ma limit 1,5 pkt i samo nie alarmuje | **0 / +1 / +1,5** |
| **RCB** | nowy komunikat na gov.pl/web/rcb | **+2** |
| **ADS-B** | ≥3 maszyny wojskowe nad województwem i >2× baseline **z tej samej pory doby** z 7 dni | **+1** |
| **PAŻP** | rzadka strefa ADHOC/R/NPZ/D obejmująca całą kolumnę od ziemi w górę; TRA/TSA/MRT/ATZ i designatory powtarzane w ciągu 7 dni nie punktują | **+0,5** |
| **Media LT/LV/EE** | incydent powietrzny wg mediów bałtyckich → podlaskie + warmińsko-mazurskie; komunikat kończący wygasza wkład tego samego zdarzenia | **+1** |
| **Sąsiedzi (RO/EE/LT)** | aktywne zamknięcie przestrzeni u sąsiada NATO — sygnał obserwacyjny, wyprzedzający | **+0,3** |

### Punktacja obiektów NEPTUN

Jeden Shahed 80 km od granicy to co innego niż sześć Shahedów 50 km od granicy,
a lokalny dron FPV nie jest punktowany w tym modelu — nie oznacza to, że jest
nieszkodliwy. Zamiast jednej stawki za „obiekt kursem na PL" punkty uwzględniają
kilka czynników:

```
punkty = waga_typu × √liczba × k_odległości × k_wiarygodności × k_potwierdzeń × k_cyklu × k_kursu
```

| Czynnik | Wartości |
|---|---|
| **waga typu** | balistyczna 3,0 · MiG-31K 2,6 · manewrująca 2,4 · KAB 1,8 · Shahed 1,4 · dron 1,1 · zwiadowczy 0,5 · **FPV 0** |
| **liczba** (`count`) | pierwiastek — cztery obiekty ważą 2× tyle co jeden, nie 4× |
| **odległość** | płynna interpolacja: 0 km ×1,7 · 15 ×1,6 · 45 ×1,3 · 80 ×1,0 · 110 ×0,7 · 150 ×0,4 · 200 ×0,25 · 250 ×0,1; od 250 km wkład 0 |
| **wiarygodność** | high ×1,0 · medium ×0,6 · low ×0,35 |
| **potwierdzenia** (`sourceCount`) | 1 ×0,7 · 2 ×0,9 · 3–4 ×1,1 · ≥5 ×1,25 |
| **cykl życia** | confirmed ×1,1 · uncertain ×0,85 · created ×0,7 |

Wkład całego NEPTUN-a ograniczony do **8 pkt** — przy kilkudziesięciu obiektach
suma i tak dawno przekroczyła próg alarmu, a trzycyfrowa punktacja psułaby skalę.

**Historyczna kalibracja (wcześniejsza krzywa odległości).** Poniższe wyniki
opisują wcześniejszy model i nie są aktualną tabelą progów. Obecny algorytm ma
płynną krzywą, współczynnik kursu, minimum dla ciężkich obiektów przy granicy
i progi ETA opisane w [aktualnej instrukcji](https://cukierrro.github.io/Straznik/#punkty).
Wagi dobrano na żywych danych NEPTUN i sprawdzono na
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

Klasyfikacja mediów ma trzy jawne wyniki (`textmatch.py`): **0 pkt** dla
ćwiczeń, administracji, publicystyki, historii oraz postępowań prawnych po
zdarzeniu; **1 pkt** dla jednoczesnego obiektu powietrznego i zdarzenia
(AIR + EVENT); **1,5 pkt** dla jednoznacznej
bieżącej reakcji operacyjnej, np. alarmu powietrznego, syren, poderwania
lotnictwa, zestrzelenia lub upadku obiektu. Sama fraza „naruszenie przestrzeni
powietrznej” jest niejednoznaczna czasowo i należy do poziomu 1 pkt.
Łączny wkład całej klasy RSS jest ograniczony do 1,5 pkt, więc same artykuły
nie mogą uruchomić żółtego progu. Wykluczenia mają pierwszeństwo. Filtry mogą się mylić.
Jedna klasa źródła ma limit wkładu do sumy
(media ≤1,5, RCB ≤2, ADS-B ≤1, PAŻP ≤1, sąsiedzi ≤0,6) — pięć artykułów o tym
samym zdarzeniu to wciąż jedno potwierdzenie. Nadmiarowe sygnały są widoczne
w UI z przekreśloną punktacją. Artykuł rozpoznany po treści, regionie i czasie
jako powtórzenie świeżego Alertu RCB pozostaje widoczny, ale wnosi 0 pkt; sama
wzmianka o RCB nie wycina artykułu z nową informacją.

**Alarm czasowy NEPTUN.** Dla obiektu o znanym albo wiarygodnie wyliczonym
kursie, średniej/wysokiej pewności i co najmniej dwóch potwierdzeniach działa
dodatkowe zabezpieczenie ETA do **granicy Polski**, nie adresu użytkownika:
żółty przy konserwatywnym czasie ≤10 min, czerwony
przy ≤5 min. Od surowego czasu odejmowane jest **2,5 min** (p90 opóźnienia
źródła z pomiaru 27–30.08.2026). Brak kursu, niska pewność lub jedno zgłoszenie
nie mogą samodzielnie uruchomić alarmu ETA.

Propagacja jest **kaskadowa**: region z sumą ≥ 2 pkt po wyłączeniu regionalnych
Alertów RCB/RSO przekazuje 40 % pozostałego wyniku
sąsiadom, ci 40 % tego swoim sąsiadom i tak dalej, licząc po najkrótszej drodze
(BFS) aż wkład spadnie poniżej 0,1 pkt. Alarm 5 pkt w lubelskim rozkłada się więc
tak: sąsiedzi +2,0 (żółty próg), drugi krąg +0,8, trzeci +0,3, czwarty +0,1.
Oficjalny nadawca sam wskazuje obszar Alertu RCB, więc ten wkład nie jest
powielany u sąsiadów. Pozostałe zagrożenie na wschodzie podnosi czujność w całym
kraju proporcjonalnie do odległości. Każdy wkład jest osobnym sygnałem „Przeniesienie z woj. X (… , 2. krąg)",
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
  (po „Dodaj do ekranu początkowego"). Subskrypcja zawiera wyłącznie listę
  obserwowanych województw — bez nazw miejsc, adresów i GPS. Trwale odrzucone
  endpointy są usuwane, a ponowne otwarcie strony aktualizuje przypisanie regionów.

## Tryb cienia progresji

Backend obserwuje na żywych danych hipotetyczne dodatkowe stopnie 2,5 / 3,0 /
3,5, ale nie łączy ich z żadnym kanałem powiadomień. Rejestruje również
eksperymentalny stopień oznaczony `1,5` dla świeżego, ciągłego śladu obiektu
lecącego w stronę Polski. Zasięg zależy od typu: do 250 km dla rakiet i
MiG-31K, 120 km dla KAB, 100 km dla dronów/Shahedów oraz 60 km dla obiektu
rozpoznawczego. Drugi wariant to wynik 1,5–2,0 potwierdzony przez co najmniej
dwie niezależne klasy źródeł, w tym NEPTUN/alarm UA, ADS-B albo PAŻP.
Obejmuje to dostępne dziś klasy wzmożonej czujności: wiarygodny obiekt lecący
ku Polsce (rakieta, pocisk, KAB, Shahed/dron, nosiciel lub rozpoznanie) oraz
zbieżność alarmu przy granicy, nietypowego ruchu wojskowego ADS-B, istotnej
strefy PAŻP, sygnału sąsiedniego i mediów. Nie każdy z nich wystarcza sam:
pozycje przybliżone, grupy, obiekt lecący od Polski, pojedynczy RSS, sama
propagacja, stare obserwacje i pierwszy niepotwierdzony meldunek nie kwalifikują
stopnia. Stan i próbki trafiają na 14 dni do tabel SQLite
`escalation_shadow_state` oraz `escalation_shadow_events`.

`ESCALATION_SHADOW_ENABLED=false` wyłącza obserwację. Nawet po jej włączeniu
moduł nie importuje warstwy powiadomień i nie wysyła push, dźwięku ani alarmu.

Oficjalne alarmy lotnicze RCB/RSO są ponadto zapisywane jako punkty odniesienia.
Dla każdego nowego komunikatu backend zachowuje 30 minut wcześniejszych klatek
mapy, sygnałów, punktacji i kandydatów trybu cienia. Osobno przechowuje surowy
`valid_from` RSO, jego znormalizowany czas oraz chwilę pierwszego wykrycia na
VPS. `valid_from` nie jest dowodem doręczenia SMS użytkownikowi; publiczne dane
nie ujawniają takiego czasu. Wpisy zastane podczas startu są oznaczone jako
niekwalifikujące się do pomiaru wyprzedzenia. Dane referencyjne są zachowywane
30 dni w `rcb_reference_events`, bez wpływu na wynik i wysyłkę.

`RCB_REFERENCE_AUDIT_ENABLED=false` wyłącza ten audyt.

## Podpisywanie wydania

Każde APK musi być podpisane, a Android przyjmie aktualizację tylko wtedy, gdy
jest podpisana **tym samym kluczem** co wersja już zainstalowana. Buildy debug
używają klucza `debug.keystore` o publicznie znanym haśle (`android`), który
narzędzia potrafią zregenerować — na nim nie da się utrzymać ciągłości
aktualizacji. Build debug ma włączoną flagę `debuggable`; zaufanie certyfikatom
wynika osobno z konfiguracji sieci, nie z samego rodzaju podpisu.

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

> Od wersji 1.7.12 aplikacja ufa wyłącznie systemowym certyfikatom i blokuje
> zewnętrzny HTTP. Jedyny wyjątek to dokładnie `localhost`: wirtualny interfejs
> Capacitor, pozostawiony pod HTTP dla zachowania ustawień użytkowników.
> Sieć lub antywirus przechwytujący TLS certyfikatem użytkownika może blokować
> pobieranie danych. Nie wyłączamy weryfikacji certyfikatów jako obejścia.
> Zmiana wymaga nowego APK; starsze wydanie 1.7.11 nadal ufa certyfikatom
> użytkownika. Samo zaktualizowanie serwera nie zmienia jego zabezpieczeń.

## Przebudowa APK

```bash
cd android-app
rm -rf www && cp -r ../frontend www && rm www/sw.js
npx cap sync android
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleRelease
```

Wynik: `android-app/android/app/build/outputs/apk/release/app-release.apk`.
Po testach i sprawdzeniu podpisu wydania kopiujemy go jako `Straznik.apk`.
Nigdy nie publikujemy `app-debug.apk` jako wydania. Przed publikacją sprawdź
`apksigner verify --print-certs`, brak `debuggable` oraz skompilowaną konfigurację
sieci. Aktualizacja musi zachować certyfikat podpisujący poprzednie wydanie.

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
także wtedy, gdy proces aplikacji nie działa, o ile system pozwoli na dostarczenie
powiadomienia i jego pełnoekranową prezentację. Wyzwala go full-screen
intent z powiadomienia FCM (`StraznikFcmService`).

Na Androidzie 14+ należy sprawdzić uprawnienie `USE_FULL_SCREEN_INTENT`
w ustawieniach, również po aktualizacji. Bez niego pełny ekran nie jest
gwarantowany, więc aplikacja prosi
o zgodę w ustawieniach (`⚙ → 🚨 Zgoda na alarm pełnoekranowy`), przypomina o niej
banerem „Napraw". Przy braku zgody pozostaje powiadomienie systemowe; aplikacja
podejmuje próbę wybudzenia, ale nie gwarantuje zapalenia ekranu. Działanie zależy
też od ustawień powiadomień, kanałów, trybu Nie przeszkadzać i ograniczeń systemu.

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

Wcześniejsze wydanie sprawdzono na fizycznym urządzeniu (Android 16) przy zamkniętej aplikacji:
żółty wystawia heads-up bez budzenia ekranu; czerwony przy wygaszonym
i zablokowanym ekranie zapala go i pokazuje pełnoekranowy `AlarmActivity` nad
blokadą z syreną, a potwierdzenie zatrzymuje dźwięk i wibrację.
Testy bieżącej zmiany zabezpieczeń wykonano na emulatorze Pixel 7 / Android 14;
nie są gwarancją działania każdego telefonu. [Raport testów](docs/TESTY_BEZPIECZENSTWA_2026-09-03.md).

### Aktualizacje poza Google Play

Aplikacja sprawdza `GET /api/app-version`, a po wykryciu nowego wydania może
pobrać `Straznik.apk` bezpośrednio i otworzyć systemowy instalator Androida.
Przed instalacją natywnie sprawdza SHA-256 pliku; Android dodatkowo wymaga podpisu
tym samym kluczem autora. Zwykłą aktualizację można odłożyć przyciskiem „Później”
do końca bieżącej sesji. Wydanie oznaczone w opisie GitHub niewidocznym markerem
`<!-- critical-update -->` nie ma przycisku odłożenia. Systemowe potwierdzenie
instalacji pozostaje obowiązkowe — aplikacja nigdy nie instaluje się po cichu.

Każde kolejne wydanie GitHub Release musi mieć krótki opis zmian w punktach.
Aplikacja pokazuje maksymalnie trzy pierwsze punkty w oknie aktualizacji jako
sekcję „Co się zmienia”; opisuj w nich efekt widoczny dla użytkownika, nie detale
techniczne.

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
  zwykle zduplikowane). Dla pozycji nieoznaczonych jako przybliżone aplikacja może
  budować trajektorię z kolejnych obserwacji. Przy `positionQuality=approx` pokazuje
  wyłącznie rejon zgłoszenia: bez dead-reckoning, pozornej trasy i ETA. Usunięcie
  wpisu przez źródło nie określa, czy obiekt zestrzelono, utracono czy zgłoszono
  ponownie pod innym identyfikatorem.
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
