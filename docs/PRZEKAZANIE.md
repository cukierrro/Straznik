# Strażnik — przekazanie projektu

Stan na 1 sierpnia 2026, wersja aplikacji **1.4.5** (versionCode 10).
Ostatnie opublikowane wydanie: **v1.4.4**. Dokument opisuje, czym jest projekt,
jak jest zbudowany, co po kolei zdiagnozowano i naprawiono oraz co zostało do zrobienia.

---

## 1. Czym jest Strażnik

Nieoficjalny system wczesnego ostrzegania o zagrożeniach powietrznych dla Polski.
Zbiera sygnały z pięciu publicznych źródeł, przelicza je na punkty osobno dla każdego
z 16 województw i alarmuje po przekroczeniu progu.

**To nie jest źródło oficjalne.** Nie zastępuje syren, RCB ani RSO — komunikat o tym
jest w interfejsie, w powiadomieniach i w każdym wydaniu. Nie usuwaj go.

- Repozytorium: https://github.com/cukierrro/Straznik
- Instrukcja: https://cukierrro.github.io/Straznik/
- Licencja: MIT

### Progi i okno

| Rzecz | Wartość |
| --- | --- |
| Okno fuzji | 60 min, pełna waga przez 30 min, potem liniowe wygaszanie do zera |
| Podwyższona uwaga (żółty) | ≥ 2 pkt |
| Wysoki priorytet (czerwony) | ≥ 4 pkt |
| Cooldown powiadomienia | 10 min |
| Kaskada do sąsiadów | ×0,4 na każdy krąg, do 5 kręgów, próg wkładu 0,1 pkt |

### Źródła i punkty

| Źródło | Co daje | Punkty |
| --- | --- | --- |
| NEPTUN (neptun.in.ua) | obiekt kursem na granicę PL | 0–8, iloczyn: waga typu × √liczba × k_odległości × k_wiarygodności × k_potwierdzeń × k_cyklu |
| Alarmy obwodów UA | oficjalny alarm w przygranicznym obwodzie Ukrainy | +1 |
| Media regionalne (RSS) | syreny, wybuchy, naruszenie przestrzeni | +2 |
| Media bałtyckie (EE/LV/LT) | incydent powietrzny u sąsiadów NATO | +1 (podlaskie, warmińsko-mazurskie) |
| RCB (scraping gov.pl) | nowy komunikat | +2 |
| ADS-B (adsb.lol) | ruch wojskowy ponad 2× odniesienia z 7 dni | +1 |
| PAŻP (airspace.pansa.pl) | rzadka ADHOC/R/NPZ/D GND–F, bez rutyny i powtórek 7 dni | +0,5 |

Limity wkładu jednego źródła na województwo: media 2, RCB 2, ADS-B 1, PAŻP 1, NEPTUN 8.

---

## 2. Architektura — trzy implementacje tej samej reguły

To najważniejsza rzecz do zrozumienia przed jakąkolwiek zmianą w punktacji.
Ta sama logika fuzji istnieje **w trzech miejscach** i musi być trzymana w zgodzie:

| Gdzie | Plik | Kiedy działa | Stan trzyma w |
| --- | --- | --- | --- |
| Backend (serwer, `straznik.eu`) | `backend/app/fusion.py`, `config.py`, `collectors/` | **domyślny** — liczy fuzję dla wszystkich | SQLite |
| Aplikacja (WebView) | `frontend/engine.js` | fallback, gdy serwer niedostępny | `localStorage` |
| ~~Usługa w tle (natywna)~~ | ~~`Fusion.java`, `Sources.java`~~ | **WYCOFANA w 1.5.0** | — |

> **⚠️ Aktualizacja 1.5.0.** Aplikacja **domyślnie korzysta z serwera** (`straznik.eu`);
> wbudowany silnik `engine.js` to fallback. Natywna **usługa pierwszoplanowa w tle
> została wycofana** (Android 15/16 ubijał `dataSync` FGS) — alarmy przy zamkniętej
> aplikacji dostarcza teraz **FCM push** (temat `voiv_<region>`, `StraznikFcmService`).
> Poniższe sekcje o „usłudze w tle", `ubilling` i deduplikacji między trzema
> implementacjami opisują stan **sprzed 1.5.0** (już tylko historia / martwy kod).
> Aktualny, spójny opis architektury: **[README](../README.md)**.

**`scripts/test_spojnosc.py` pilnuje, żeby te trzy implementacje się nie rozjechały.**
Porównuje progi, okno, kaskadę, kolejność województw, limity, punkty za sygnał,
formaty kluczy deduplikacji, listę województw przygranicznych i komplet źródeł.
Uruchamiaj po KAŻDEJ zmianie w punktacji.

### Klucz deduplikacji

Każdy sygnał ma klucz. Jest on jedynym spoiwem scalania stanu między aplikacją
a usługą — gdy formaty się rozjadą, ten sam sygnał policzy się dwa razy.

| Źródło | Format klucza |
| --- | --- |
| NEPTUN | `neptun:{id}:t{tier}` gdzie `tier = floor(punkty × 2)` |
| NEPTUN alert | `neptun_alert:{obwód}:{województwo}:{godzina ISO}` |
| Media | `media:{link}` |
| Media bałtyckie | `baltic:{link}:{nazwa województwa}` |
| RCB | `rcb:{href}:{nazwa województwa}` |
| ADS-B | `adsb:{nazwa województwa}:{YYYY-MM-DDTHH w UTC}` |
| PAŻP | `pansa:{designator}:{endDate}` |

Uwaga: **nazwa** województwa, nie indeks. Strona natywna trzyma stan po indeksach,
ale w kluczu musi być nazwa, bo aplikacja indeksów nie zna.

### Alarmy obwodów UA mają dwa niezależne źródła

Neptun wysyła ramki `alerts` **wyłącznie WebSocketem**, a usługa w tle korzysta
ze snapshotu REST — gniazdo utrzymywane przez dobę kosztuje baterię bez zysku.
Przy stale zamkniętej aplikacji ten sygnał więc w ogóle nie powstawał.

Usługa bierze go teraz z REST-owego pośrednika
[`ubilling.net.ua/aerialalerts`](https://wiki.ubilling.net.ua/doku.php?id=aerialalertsapi),
który sam scala kilka serwisów alarmowych (Mørk Skogen, JAAM, alerts.in.ua,
ukrainealarm) i zwraca jednolity JSON bez klucza i rejestracji. Limit to
2 zapytania na sekundę na host; usługa pyta raz na 90 sekund.

Obie strony produkują **ten sam klucz** `neptun_alert:{obwód}:{województwo}:{godzina}`
i to samo źródło `neptun`, więc przy otwartej aplikacji sygnał nie policzy się
dwa razy. Mapowanie obwód → województwa musi być identyczne po obu stronach —
pilnuje tego `test_spojnosc.py`.

Sami autorzy pośrednika proszą, żeby nie opierać na nim ważnych decyzji.
U nas waży 1 pkt, czyli sam z siebie nie przekracza progu alarmu (2 pkt).

### Podział obowiązków przy powiadomieniach

Gdy nasłuch w tle jest włączony i usługa żyje, **to ona wystawia powiadomienia
systemowe**. Aplikacja ich wtedy nie dubluje (`bgServiceOwnsAlerts` w `engine.js`),
ale nadal pokazuje alarm w interfejsie — pełny ekran i syrenę.

Kanały powiadomień tworzy **wyłącznie strona natywna**
(`MonitorService.createChannels`, wołane z `MainActivity.onCreate`). Silnik w WebView
celowo ich nie tworzy — kiedyś odtwarzał kanały skasowane jako przestarzałe
i użytkownik widział w ustawieniach systemu osierocone pozycje.

Aktualne kanały: `straznik-status`, `straznik-info-v3`, `straznik-high-v3`.
Sufiks wersji jest konieczny: raz utworzony kanał ignoruje zmiany dźwięku,
wibracji i ważności, więc każda taka zmiana wymaga nowego identyfikatora.

---

## 3. Historia problemów i napraw

Chronologicznie, bo kolejne wydania odkrywały coraz głębsze warstwy tego samego objawu:
„alarmy nie przychodzą, a po otwarciu aplikacji pojawiają się od razu".

### v1.1.0 — alarm pełnoekranowy w tle
Alarm wysokiego priorytetu wystawiał tylko powiadomienie; ekran zostawał wygaszony.
Dodano natywną `AlarmActivity` z full-screen intentem, własne dźwięki (żółty:
dwuton 740↔988 Hz, czerwony: modulowana syrena 380↔860 Hz) i prośbę o zgodę
`USE_FULL_SCREEN_INTENT`, którą Android 14 odbiera domyślnie.

### v1.2.0 — cała Polska i kaskada
Usługa liczyła punkty tylko dla czterech województw przygranicznych, więc użytkownik
z centrum nie dostawał w tle alarmu o swoim regionie. Rozszerzono na 16 województw
i dodano kaskadowe przenoszenie sygnału (×0,4 na krąg, po najkrótszej drodze).

### v1.3.0 — podpis własnym kluczem
Wcześniejsze wydania były buildami deweloperskimi podpisanymi kluczem o publicznie
znanym haśle. **`straznik-release.jks` i `keystore.properties` są w `.gitignore`
i nigdy nie trafiły do historii repozytorium** — w repo jest tylko
`keystore.properties.example`. Utrata pliku `.jks` oznacza brak możliwości
aktualizowania aplikacji u użytkowników. Trzymaj kopię poza repozytorium.

### v1.4.0 — usługa nie miała kompletu źródeł
Prawdziwa przyczyna „alarmów czekających na otwarcie aplikacji": usługa sprawdzała
trzy źródła, a aplikacja pięć. Brakowało PAŻP (34 z 59 sygnałów w zebranej bazie)
i mediów bałtyckich. Przy zamkniętej aplikacji te sygnały po prostu nie powstawały.
W tym samym wydaniu przebudowano punktację NEPTUN-a na iloczyn czynników
(skalibrowany na 354 migawkach, 1998 obserwacji) i oparto odniesienie ADS-B
o tę samą porę doby — ruch lotniczy waha się w ciągu doby 78-krotnie.

### v1.4.1 — kto właścicielem alertów
Usługa i aplikacja alarmowały niezależnie, ale pamiętały o tym inaczej: usługa
trwale, aplikacja tylko w RAM. Po każdym starcie aplikacja „odkrywała" ten sam
poziom od nowa. Ustalono, że przy działającej usłudze to ona wystawia powiadomienia.
Dodano też tolerancję trzech nieudanych prób, zanim dioda źródła zgaśnie.

### v1.4.2 — biała mapa za antywirusem
Objaw: biała mapa i wszystkie diody na czerwono, mimo działającego internetu.
Przyczyna: antywirus skanujący HTTPS (Avast Web Shield i podobne) podstawia własny
certyfikat, a build release ufał wyłącznie certyfikatom systemowym. Naprawa:
`network_security_config.xml` ufa też certyfikatom użytkownika.

To bezpieczny kompromis — aplikacja pobiera wyłącznie publiczne dane do odczytu,
nie ma logowania ani danych wrażliwych.

W tym samym wydaniu: propozycja włączenia nasłuchu w tle przy pierwszym starcie
(bez niego Android usypia aplikację) i podniesienie żółtego poziomu do heads-up.

### v1.4.3 — porządek w kanałach
Silnik w WebView odtwarzał przy starcie kanały, które warstwa natywna kasuje jako
przestarzałe. Efekt: dwie zbędne pozycje w ustawieniach systemu. Kanały tworzy
teraz wyłącznie strona natywna.

### v1.4.4 — jedna punktacja zamiast dwóch

**Zgłoszenie:** powiadomienie w tle pokazywało 1.0 pkt, a aplikacja po otwarciu
0 pkt i „brak sygnałów".

**Przyczyna główna.** To nie był błąd wyświetlania. Usługa i aplikacja liczyły
z dwóch niezależnych zbiorów, które nigdy się nie wymieniały: usługa ze
`SharedPreferences`, aplikacja z `localStorage`. A `localStorage` zapełnia się
**tylko wtedy, gdy aplikacja jest otwarta** — po godzinie zamknięcia okno 60 min
było z definicji puste, choć usługa liczyła bez przerwy. `BackgroundPlugin.status()`
nie zwracał ani punktów, ani sygnałów, więc interfejs fizycznie nie widział stanu usługi.

**Trzy rozjazdy w samych źródłach:**

1. **PAŻP** — aplikacja trzymała zbiór stref z poprzedniego obiegu wyłącznie w RAM
   (`let prevZones = null`). Po każdym starcie pierwszy obieg tylko zapamiętywał stan,
   więc strefa aktywowana przy zamkniętej aplikacji **nigdy** nie wchodziła do punktacji.
   Usługa zapisywała `pansa_zones` trwale i tę samą strefę punktowała: równo **1.0 pkt**
   — dokładnie liczba z paska.
2. **RCB** — komunikat bez rozpoznanego regionu usługa rozsyłała po 2 pkt do
   **wszystkich 16** województw. Aplikacja i backend (`PRIORITY_VOIVODESHIPS`)
   ograniczały się do czterech przygranicznych. Jeden ogólnokrajowy wpis wystarczał,
   żeby kaskada podniosła w tle pół Polski do „podwyższonej uwagi".
3. **ADS-B** — źródło miała tylko aplikacja. Usługa nie widziała skoków ruchu
   lotnictwa wojskowego, więc tu rozjazd szedł w drugą stronę: aplikacja pokazywała
   więcej niż pasek.

**Co zmieniono:**

- `Fusion.ingest` zapisuje klucz deduplikacji przy sygnale, `Fusion.export` wystawia
  zbiór na zewnątrz.
- `BackgroundPlugin.signals()` — aplikacja wczytuje sygnały usługi.
- `BackgroundPlugin.pushSignals()` — aplikacja oddaje w drugą stronę to, czego usługa
  nie ma skąd wziąć, przede wszystkim alarmy w obwodach UA (Neptun wysyła je wyłącznie
  WebSocketem, a usługa świadomie czyta REST, bo gniazdo przez dobę kosztuje baterię).
- `engine.js`: `syncWithBackground()` co 30 s, scalanie po kluczu, więc nic nie liczy
  się dwa razy. Wołane **przed** własnymi kolektorami, żeby pierwsze sekundy po
  otwarciu nie pokazywały zera mimo alertu na pasku.
- Klucze RCB i mediów bałtyckich po nazwie województwa, nie po indeksie.
- PAŻP w aplikacji zapisuje zbiór stref w `localStorage`.
- RCB bez regionu trafia na ścianę wschodnią, nie na cały kraj.
- Usługa dostała własny kolektor ADS-B (`Sources.adsb`) z odniesieniem do tej samej
  pory doby z ostatniego tygodnia; historia próbek rzadsza niż odpytywanie, żeby nie
  rozdąć zapisu w preferencjach.
- `scripts/test_spojnosc.py` — nowy test spójności trzech implementacji.

---

## 4. Jak budować i testować

Wszystko dzieje się na Windowsie użytkownika. W katalogu głównym są trzy skrypty
do uruchomienia dwuklikiem; wyniki lądują w `test-out/` (katalog jest w `.gitignore`).

| Skrypt | Co robi |
| --- | --- |
| `1_buduj_i_testuj.bat` | testy spójności i słów kluczowych → kopia frontendu do `www` → `cap sync` → podpisany build release → suma SHA-256 → start emulatora → instalacja → zbiór dowodów (powiadomienia, logcat, zrzut ekranu) |
| `2_build_debug.bat` | build debug i instalacja — potrzebny, bo tylko dla niego działa `adb shell run-as` |
| `3_wstrzyknij_sygnal.bat` | podkłada usłudze kontrolny sygnał 2.0 pkt w lubelskim i porównuje pasek z aplikacją |

### Pułapki, na które już się nadziano

- **`python` w PATH to zaślepka ze Sklepu Microsoft.** Skrypty szukają prawdziwego
  interpretera w `%LOCALAPPDATA%\Programs\Python\...`.
- **Systemowe `JAVA_HOME` wskazuje Javę 8**, a wtyczka Androida wymaga 11+.
  Skrypty ustawiają JBR dołączony do Android Studio (`%ProgramFiles%\Android\Android Studio\jbr`).
- **Pliki `.ps1` muszą być w czystym ASCII.** Windows PowerShell 5.1 czyta skrypt
  bez BOM jako ANSI, więc polskie znaki rozsypują parsowanie i skrypt kończy się
  błędem składni, zanim cokolwiek zrobi.
- **Nie filtruj przez `grep` w `adb shell`** — cudzysłowy giną po drodze i polecenie
  cicho zwraca pustkę. Filtruj po stronie Windows (`Select-String`).
- **Nie przekierowuj `adb exec-out screencap -p > plik.png` w PowerShellu** —
  przekoduje strumień i zepsuje PNG. W `.bat` działa, w PowerShellu użyj
  `adb shell screencap -p /sdcard/x.png` + `adb pull`.
- **Emulator z obrazem Google Play nie da roota** („adbd cannot run as root in
  production builds"). Do podkładania plików potrzebny build debug i `run-as`.
- **Świeża instalacja nie ma zgody na powiadomienia** (Android 13+ pyta osobno).
  Usługa działa, ale paska nie widać. `adb shell pm grant pl.straznik.app
  android.permission.POST_NOTIFICATIONS`.
- **Avast na komputerze potrafi wstrzymać uruchomienie świeżo utworzonego `.bat`.**
  Jeśli dwuklik nic nie robi, wpisz pełną ścieżkę skryptu w pasku adresu Eksploratora.

### Wynik testu v1.4.4 na emulatorze Pixel (Android 14)

Usłudze podłożono jeden kontrolny sygnał 2.0 pkt w lubelskim — taki, o którym
aplikacja nie miała prawa wiedzieć z własnych źródeł.

- Pasek powiadomień: `Strażnik — nasłuch aktywny · lubelskie 2.0 pkt · Neptun✓ Media✓ RCB✓ ADS-B✓ PAŻP✓`
- Alarm: `PODWYŻSZONA UWAGA: woj. lubelskie (2.0 pkt)`
- Panel aplikacji: `Lubelskie 2.0 pkt — PODWYŻSZONA UWAGA`, kaskada 0.8 pkt
  u sąsiadów (mazowieckie, świętokrzyskie, podkarpackie, podlaskie), 0.3 pkt w 2. kręgu
- Mapa: lubelskie wytłoczone na żółto

Przed poprawką aplikacja pokazałaby w tej sytuacji 0 pkt i „brak sygnałów".
Dioda `ADS-B✓` w pasku potwierdza, że usługa ma teraz komplet pięciu źródeł.

### v1.4.5 — alarmy obwodów UA docierają przy zamkniętej aplikacji

Ostatnia luka po v1.4.4: alarm powietrzny w przygranicznym obwodzie Ukrainy
powstawał wyłącznie w aplikacji. Usługa dostała własny kolektor
(`Sources.uaAlerts`) korzystający z REST-owego pośrednika — szczegóły w sekcji
o architekturze. Test spójności pilnuje teraz również mapowania obwód →
województwa i formatu klucza tego sygnału.

---

## 5. Wydawanie

1. Podbij `versionCode` i `versionName` w `android-app/android/app/build.gradle`.
2. `1_buduj_i_testuj.bat` — build i testy.
3. Skopiuj APK do `Straznik.apk` w katalogu głównym (skrypt robi to sam) i zacommituj.
4. `4_wydaj.bat` — kontrola bezpieczeństwa, push, wydanie z notatkami po polsku
   opisującymi **objaw i przyczynę**, nie listę plików. Skrypt przerywa pracę,
   jeśli klucz podpisu albo hasła znajdą się w repozytorium lub w historii,
   APK w repo różni się od zbudowanego albo podpis się nie weryfikuje.
   Tytuł wydania idzie osobno, przez API z pliku JSON — argument przekazany
   przez cmd zostałby przekodowany i polskie znaki by się rozsypały.
5. `5_sprawdz_wydanie.bat` — pobiera plik spod linku „Pobierz APK" i porównuje
   sumę SHA-256 z lokalnym. Sprawdza też, że wydanie nie jest szkicem ani
   wersją wstępną i że GitHub uznaje je za najnowsze.

Link „Pobierz APK" w instrukcji i README wskazuje
`releases/latest/download/Straznik.apk`, więc prowadzi do najnowszego wydania
sam z siebie — nie podbijaj go ręcznie. Warunek: zasób w wydaniu musi nazywać
się dokładnie `Straznik.apk`.

Suma SHA-256 w notatkach jest bezpieczna do publikacji — to odcisk palca publicznego
pliku, nie sekret. Prawdziwą ochronę daje podpis APK kluczem autora: Android przy
każdej aktualizacji wymusza ten sam podpis.

---

## 6. Co zostało do zrobienia

- **`test_spojnosc.py` porównuje stałe i formaty, nie zachowanie.** Test właściwej
  fuzji (te same sygnały na wejściu → te same punkty w trzech implementacjach)
  byłby mocniejszy.
- **Historia próbek ADS-B w usłudze jest przycinana do 5000 wpisów.** Przy dłuższej
  pracy odniesienie sięga wtedy krócej niż tydzień. Do rozważenia: agregaty godzinowe
  zamiast surowych próbek.

---

## 7. Zasady pracy z tym repozytorium

- **Komunikaty commitów i notatki wydań po polsku**, opisujące objaw i przyczynę
  z punktu widzenia użytkownika, nie listę zmienionych plików.
- **Komentarze w kodzie tłumaczą DLACZEGO**, nie co robi linijka. W repozytorium jest
  ich sporo i są celowe — opisują pułapki, na które już się nadziano.
- **Każda zmiana w punktacji wymaga uruchomienia `scripts/test_spojnosc.py`**
  i wyrównania wszystkich trzech implementacji.
- **Nie ruszaj zastrzeżenia o nieoficjalnym źródle** w interfejsie, powiadomieniach
  i notatkach wydań.
- **Klucz podpisu i hasła nigdy nie trafiają do repozytorium.**
