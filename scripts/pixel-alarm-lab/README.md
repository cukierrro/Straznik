# Strażnik — odizolowany test na Pixelu

Zgoda użytkownika: testy wyłącznie na Pixelu, zmiany produkcji dopiero po
osobnej akceptacji. Ten projekt nie aktualizuje ani nie uruchamia aplikacji
`pl.straznik.app`. Instaluje osobny pakiet `pl.straznik.offlinelab`.

## Bariery bezpieczeństwa

- Brak uprawnień INTERNET, POST_NOTIFICATIONS i alarmów w manifeście.
- Brak Firebase, Capacitor, usług, odbiorników i sekretów. Adresy w lokalnym
  archiwum to wyłącznie dane; żaden nie jest odpytywany.
- WebView blokuje ruch sieciowy; CSP blokuje połączenia i multimedia.
- Z produkcji kopiowane są dwie funkcje decyzyjne oraz czysta funkcja sumowania
  z jej stałymi. Dźwięk, UI alarmu i notyfikacje zastępuje lokalny zapis decyzji.
- Testy wykonuje WebView na emulatorze, bez powiadomień i dźwięków.
- Odrębny podpis debug, żadnych kluczy podpisu wydania. Nie publikować APK.

## Zakres

109 asercji wykonywanych na Pixelu: 12 dotychczasowej logiki UI/standalone,
32 syntetyczne scenariusze eskalacji, 11 sprawdzeń porannego archiwum,
18 kontroli proponowanego kontraktu danych obserwacji i 36 testów tożsamości,
sesji incydentu oraz ścieżek łączonych. Osobno prawdziwy restart procesu
aplikacji z zachowaniem lokalnego zapisu Androida.
Interaktywny podgląd progów i osobny widok archiwalnego poranka.
To nie jest test backendowego procesu, dostarczenia push ani syreny.
Nowe reguły pozostają prototypem; nie są podłączone do produkcji.

## Budowanie

Z JBR Android Studio, używając wrappera istniejącego projektu:
`gradlew.bat -p <ten-katalog> --offline --no-daemon assembleDebug`.
Na Windows użyj ścieżek 8.3 i ASCII cwd zgodnie z procedurą projektu.
Wynik: `test-out/pixel-alarm-lab/build/outputs/apk/debug/`.
Instaluj tylko z jawnie wybranym `adb -s emulator-...` po sprawdzeniu,
że `emu avd name` zwraca `Pixel_7`. Nigdy na fizycznym telefonie.
Wyniki: `adb -s emulator-... logcat -d -s StraznikOfflineLab:I '*:S'`.

Po zbudowaniu `run-pixel-only.ps1` sprawdza AVD i brak uprawnień w APK,
włącza tryb samolotowy Pixela i otwiera osobny podgląd. Pozostawia Pixel offline.
Nie włącza samodzielnie sieci ani nie uruchamia produkcyjnego Strażnika.

## Wynik 2026-09-08, 06:47 CEST

Pixel_7 (Android 14): **12/12 PASS**, wykonane w WebView emulatora.
Kontrola `aapt dump permissions`: pakiet `pl.straznik.offlinelab`, brak
deklaracji uprawnień. Tryb samolotowy potwierdzony jako `1`.

SHA-256 badanego `frontend/app.js`:
`8944936236d52eb6bdfb81570732c7425988d741e96f9de2052cbe16667240c0`.

Wynik: wzrost 2,0 → 2,3 → 2,8 → 3,0 → 3,9 nie powoduje kolejnego alarmu;
przekroczenie 4,0 wywołuje decyzję o czerwonym. Wszystkie decyzje zostały
zapisane lokalnie, bez wywołań dźwięku i dostarczenia powiadomień.
Zrzut: `test-out/pixel-alarm-lab/overview.png`.

Nie testowano backendowego cooldownu/dostarczenia FCM ani poprawności sumy
4,3 z nocy. Zmiany reguł i produkcji pozostają do osobnej akceptacji.

## Wymagania użytkownika: eskalacja w żółtym (2026-09-08)

Dotyczy dodatkowych ostrzeżeń między 2 a 4 pkt, nie automatycznej zmiany
podstawowej punktacji. Implementacja najpierw wyłącznie w odizolowanym
teście na Pixelu; produkcja wymaga osobnej akceptacji użytkownika.

- Podstawą mają być nowe, świeże zmiany w krótkim oknie: nowy odrębny
  obiekt lub istotne zbliżenie już obserwowanego obiektu do chronionego regionu.
- Propagacja punktów z innych województw nie kwalifikuje do ponownego alarmu.
- RSS nie ma samodzielnie uzasadniać ponownego alarmu: artykuły mogą
  relacjonować ten sam alert RCB lub powielać doniesienia innych mediów.
- Nowy identyfikator śladu nie dowodzi nowego fizycznego obiektu. Trzeba
  uwzględnić ponowne wykrycie, zmianę ID oraz niepewność pozycji; drobny skok
  lokalizacji nie może udawać istotnego zbliżenia.
- Świeżość oceniać względem czasu obserwacji, nie tylko pobrania danych.
  Opóźnione, stare raporty i wygasłe ślady nie są nowym pogorszeniem.
- Przekroczenie progu samo w sobie nie wystarcza: kwalifikująca świeża
  zmiana musi rzeczywiście uzasadniać wzrost, nie tylko współwystąpić z RSS.
- Użytkownik zatwierdził stopnie 2,5 / 3,0 / 3,5 pkt do testów. Wdrożenie
  produkcyjne nadal wymaga osobnej akceptacji.
- Okno obserwacji 5 minut pozostaje parametrem eksperymentu. Nie stosować
  sztywnej blokady 10 minut: świeże pogorszenie po 5 minutach ma być zauważone.
  Tłumić powtórzenia tego samego stopnia/zmiany, nie każdą kolejną informację.
- Jeden komunikat dla najwyższego osiągniętego stopnia, bez serii przy
  przeskoku kilku progów i bez ponawiania od oscylacji wyniku wokół progu.
- Ograniczenie częstotliwości żółtych ostrzeżeń nie może blokować wejścia
  w czerwony. Żadnych nowych alarmów opartych na ETA w ramach tego ustalenia.
- Komunikat ma podawać konkretną zmianę i niepewność; punktów nie przedstawiać
  jako prawdopodobieństwa zagrożenia ani czasu gwarantowanego na schronienie.

## Test prototypu eskalacji — 2026-09-08, 06:57 CEST

Wykonanie wyłącznie na Pixel_7, Android 14, w WebView osobnej aplikacji
bez uprawnień, z trybem samolotowym. Log: `ESCALATION_RESULT 32/32 PASS NO_SEND`.
Ponownie sprawdzona dotychczasowa logika: `RESULT 12/12 PASS`.

| Przypadek syntetyczny | Wynik |
| --- | --- |
| 2,1 → 2,5 → 3,0 → 3,5 dzięki nowym obiektom | Trzy osobne stopnie eskalacji |
| Świeże pogorszenie po 5 min | Ostrzeżenie, bez blokady 10 min |
| Skok 2,1 → 3,6 dzięki obiektowi | Jeden komunikat, stopień 3,5 |
| RSS lub propagacja, także z drobnym nowym sygnałem | Bez eskalacji nieuzasadnionej przyrostem obiektów |
| Nowy wynik RSS po wcześniejszej eskalacji | Nie zawyża zapamiętanego punktu odniesienia |
| Nowy odrębny obiekt / istotne zbliżenie | Eskalacja po osiągnięciu stopnia |
| Stare, przyszłe, powtórzone dane / niepewna tożsamość | Bez eskalacji |
| Zmiana raw ID, ale ten sam physicalId | Nie traktowana jako nowy obiekt |
| Zbliżenie w granicach niepewności / oddalanie | Bez eskalacji |
| Zniknięcie obiektu równoważy nowy obiekt | Bez fałszywego wzrostu |
| Oscylacja wyniku wokół progu | Bez powtórnego alarmu tego stopnia |
| Próg czerwony po dodatkowym żółtym | Natychmiastowa decyzja o czerwonym, bez wysyłki |

Widok interaktywny obejmuje pięć scenariuszy do wyboru, przyciski „Następny
krok” i „Od początku”. Zrzut: `test-out/pixel-alarm-lab/escalation-step.png`.

### Granice wniosków

`escalation-prototype.js` nie jest podłączony do produkcji. Test operuje
syntetycznymi, już rozpoznanymi tożsamościami (`physicalId`, `identityConfirmed`)
i zadanymi naliczonymi punktami. Nie potwierdza jakości identyfikacji obiektów
NEPTUN, jakości ich czasu obserwacji ani poprawności nocnej sumy 4,3 pkt.

Założenia niezatwierdzone produkcyjnie: okno 5 minut oraz zbliżenie większe
od sumy niepewności obu pozycji i jednocześnie większe niż 10 km.
Nie dodano alarmowania o ETA. Zegar symulacji jest przyspieszony; nie czekano
realnych 5 minut między krokami.

Przed integracją wymagane: obsługa rzeczywistych identyfikatorów/duplikatów,
ustalenie geometrii odległości do regionu, reset incydentu i trwałość stanu
po restarcie, izolowane testy backendu oraz zgoda na dalszy zakres.
Obecny prototyp pamięta osiągnięte stopnie do ręcznego resetu scenariusza.
Nie testowano dostarczenia FCM ani dźwięku. Nic nie wysłano i nie wdrożono.

## Powrót do progów — 2026-09-08, popołudnie

Radio odłożone; wiele lokalizacji dopiero po progach. Ponowny build offline
i uruchomienie na Pixel_7: **71/71 PASS**, wszystkie cztery zestawy zakończone.
Odczyt dotyczył bieżącego PID osobnej aplikacji, nie starego logu.
Emulator pozostał w trybie samolotowym, bez powiadomień i produkcyjnego APK.

### Odtworzenie rzeczywistej punktacji

Archiwum `test-out/audit-red-2026-09-08-history.json`, SHA-256:
`8271feea4552936eb49c97b53665380e3127f362a85da444046e58a3ce74d9bc`.
Build wycina wyłącznie sygnały i migawki 03:30–04:45 UTC; nie uruchamia
kolektorów. Funkcja `accumulate` jest kopiowana z frontend/engine.js.

- 06:34:02 CEST: 2,805644 pkt; 06:34:03: 4,3056 pkt.
- Wariant porównawczy bez +1,5 artykułu: 2,8056 pkt.
- O 06:36:20 wynik zaokrągla się do 4,3, zgodnie ze zrzutem użytkownika.
- Pięć punktowanych wcześniej ID nie występuje w poprzedzającej migawce
  06:33:44. Nie oznacza to dowodu zestrzelenia ani pięciu fizycznych dronów.
- Test nie pobiera danych z przyszłości i nie mutuje wariantu oryginalnego.

Pełny artykuł przeczytany z publicznej strony: aktualizowana relacja obejmuje
atak na Kijów, działania polskiego wojska, RCB i późniejsze odwołania.
Nie zachowaliśmy dokładnej wersji treści/RSS z 06:34. Wariant bez +1,5 jest
wyłącznie porównaniem, nie potwierdzonym wynikiem deduplikacji artykułu.
Kopia odczytanej później strony: `test-out/radio-lublin-2026-09-08.html`.

### Kontrola wejścia do eskalacji

`observation-contract.js` to laboratoryjny kontrakt: wymaga osobnego czasu
obserwacji ze strefą, rozpoznanej tożsamości, aktualnej obecności, naliczonych
punktów i odległości do regionu. Nie zastępuje ich czasem `signal.ts`, raw ID,
punktami surowymi ani odległością do granicy Polski. Wykrywa brak danych,
nie rozpoznaje automatycznie fizycznych obiektów i nie jest zintegrowany
z kolektorem ani produkcyjnym systemem. Weryfikację obecności/tożsamości
dostarcza w testach jawna syntetyczna przesłanka, nie magiczny resolver.

W aktualnym archiwum sygnałów NEPTUN nie ma osobnego czasu obserwacji:
nie da się go uczciwie odtworzyć z czasu dodania sygnału. Odrzucenie takiej
obserwacji dotyczy tylko dodatkowego żółtego; nie kasuje historii i nie
ustanawia nowej blokady czerwonego. Nie zmieniono progów produkcyjnych.

Zrzuty prawdziwego WebView Pixela: `test-out/pixel-alarm-lab/afternoon-test.png`
oraz `test-out/pixel-alarm-lab/archive-replay.png`.
Do dalszych testów przed integracją pozostają identyfikacja i czas źródłowy,
reset incydentu/trwałość stanu oraz dostarczenie eskalacji bez duplikacji.

## Dopracowanie na polecenie użytkownika — 2026-09-08

Wyniki końcowe na Pixel_7: **109/109 PASS** oraz
`PROCESS_RESTART VERIFIED PASS NO_SEND`. Proces 5709 przygotował zapis;
po jego force-stop nowy proces 5860 odczytał go i przeszedł sprawdzenie.
To rzeczywisty restart Androidowego procesu, nie tylko nowy obiekt JavaScript.
APK nadal bez uprawnień i z wyłączoną siecią. Kod produkcji bez zmian.

### Zaimplementowane w laboratorium

- `track-guard.js`: zachowuje do godziny poprzednie ślady (limit 1000).
  Nowy ID w obszarze możliwego przemieszczenia poprzednika traktuje jako
  podejrzenie ponownego wykrycia. Uwzględnia niepewność obu pozycji i jawny
  eksperymentalny limit prędkości. Zmiana klasy obiektu nie omija kontroli.
  Powtórzenie tej samej obserwacji nie jest kolejnym potwierdzeniem.
  Dwa rosnące czasy spójnego śladu są warunkiem testowym, nie dowodem dwóch
  niezależnych raportów. Grupy count>1 i niejednoznaczne nakładanie odrzuca.
- Zwraca ciągłość **śladu źródłowego**, nie rozpoznanie fizycznego drona.
  Nie ustawia automatycznie `identityConfirmed` w kontrakcie eskalacji.
  Nie należy wdrażać jako kompletnego identyfikatora fizycznych obiektów.
- `observation-contract.js`: dowód obecności musi dotyczyć tego samego
  czasu obserwacji i regionu, nie starszej wersji tego samego ID.
  `updatedAt` o nieudokumentowanej semantyce nadal nie zastępuje observed_at.
- `incident-session.js`: zapis wersjonowanego stanu, regionu, progu,
  punktu odniesienia, potwierdzenia i numeru incydentu. Walidacja przy odczycie;
  uszkodzony/obcy stan oznacza ostrożne ustanowienie punktu odniesienia bez
  odgrywania zaległych dodatkowych żółtych. Potwierdzenie nie resetuje progów.
- Zapis rezerwacji decyzji przed jej zwróceniem; brak trwałego zapisu
  wstrzymuje dodatkowy żółty. Istniejącego czerwonego nie blokuje, zgłasza
  ostrzeżenie o zapisie. To NIE gwarantuje dokładnie jednej dostawy FCM:
  nie ma tu wysyłki ani transakcyjnej kolejki dostarczania.
- Rzeczywisty test SharedPreferences: zachowanie stopnia 2,5, potwierdzenia
  i rejestru śladów po zabiciu procesu; brak ponownego 2,5, dopuszczenie
  świeżego 3,0; podejrzany nowy ID przy poprzedniej pozycji nadal odrzucony.

### Parametry wyłącznie eksperymentalne

Reset po 60 minutach **ciągle potwierdzonego** wyniku poniżej 2. Brak danych
nie jest spokojem. Przerwa między ocenami >2 minut przerywa liczenie spokoju
i nie pozwala odgrywać narosłych stopni po powrocie. Ta granica jest kontrolą
ciągłości, nie pięciominutowym/10-minutowym cooldownem alarmów: osobny test
potwierdził dodatkowy żółty po 5 minutach z regularnymi ocenami po drodze.
Nie zastępuje wcześniejszych uzgodnień o 60-minutowej historii.

W testach trajektorii użyto jawnego przykładowego pułapu 300 km/h; nie jest
to ustalona prędkość wszystkich dronów/rakiet. Dobór dla każdej klasy wymaga
osobnego sprawdzenia. Szeroki obszar osiągalności ogranicza fałszywe nowe ID,
ale może pominąć rzeczywiście nowe bliskie obiekty. Dotyczy dodatkowego
żółtego, nie usuwania ich z mapy/historii ani zmiany podstawowego czerwonego.

### Pozostałe warunki przed produkcją

1. Potwierdzić znaczenie źródłowych timestampów i zapisywać je wraz z czasem
   odbioru; nie rekonstruować brakującego czasu z historycznych signal.ts.
2. Zweryfikować łączenie/rozdzielanie rzeczywistych śladów na materiałach,
   w których znamy czas źródłowy. Heurystyka negatywna nie dowodzi tożsamości.
3. Podłączyć jeden autorytatywny mechanizm incydentu i trwałą kolejkę zdarzeń
   na backendzie, z idempotentnym ID po stronie Androida/UI/standalone.
   W laboratorium ID jest stabilne tylko w poprawnie zachowanym incydencie;
   utrata zapisu wymaga nowej przestrzeni ID w docelowym systemie.
4. Zweryfikować granice czasu/reset, awarię pomiędzy zapisem a dostarczeniem
   i przejścia serwer ↔ standalone. Wymagana oddzielna zgoda na produkcję.

Zrzut końcowy: `test-out/pixel-alarm-lab/refinement-results.png`.
Interaktywny scenariusz progów pozostaje syntetycznym modelem; trwały zapis
sprawdzany jest w osobnym harnessie restartu, nie przez przycisk resetu demo.

## Rzeczywiste dane — końcowy odczyt 17:30 CEST

Dodano `real-day-replay.js` i generowany z lokalnych kopii `real-day-fixture.js`.
Build wymaga także `test-out/real-replay-2026-09-08-history.json` i
`test-out/real-replay-2026-09-08-state.json`; sam niczego nie pobiera.
Jednorazowe pobranie było publicznym GET, poza emulatorem.

Łącznie 119 kontroli PASS (109 wcześniejszych + 10 odtworzenia rzeczywistego
dnia) i sprawdzenie restartu. Nie utożsamiać PASS ze skutecznością alarmów:
7325/7325 pozycji nie ma czasu obserwacji, zatem kwalifikacja świeżych
zmian pozostaje nierozstrzygnięta. Nie podłączono produkcyjnej wysyłki.
Pełny wynik, czasy, hashe i ograniczenia:
`docs/TEST_RZECZYWISTE_DANE_2026-09-08.md`.

## Przygotowana archiwizacja backendu

`archive-metadata-tests.js`: 18/18 kontroli projekcji nowego source_metadata
na Pixelu PASS. Łącznie 137 kontroli + test pamięci po restarcie.
`archive-schema.js` jest generowany dopiero po statycznym audycie AST
`scripts/check_neptun_archive_static.py`; budowanie wymaga interpretera Python
(ustaw STRAZNIK_AUDIT_PYTHON albo -ParchiveAuditPython=pełna_ścieżka).
Nie importuje to backendu i nie wykonuje jego funkcji. Runtime Python i
integracja WS/REST/SQLite nie zostały przetestowane — nie utożsamiać tego
z testem integracyjnym. Szczegóły: `docs/ARCHIWIZACJA_NEPTUN.md`.

## Odtworzenie skoków z 10 września 2026

Do `escalation-tests.js` dodano dwa przypadki wyliczone ponownie kodem z
aktualnego `main`, już po deduplikacji aktualizacji tego samego `track_id`,
powtórzeń RCB/media i materiałów historycznych:

- rano: 1,21 → 3,166 po RCB, następnie 3,146 po wtórnym artykule z zerowym
  wkładem — jeden pierwszy żółty, bez zaległych stopni i bez czerwonego;
- po południu: 0,95 → 2,95 (w UI 3,0), następnie spadek do 2,92 — jeden
  pierwszy żółty, bez ponownego ostrzeżenia od aktualizacji tego samego toru.

Zestaw samego prototypu progresji: **34/34 PASS, NO_SEND**. Są to przypadki
kontrolne pierwszego skoku przez kilka pasm, nie dowód kolejnej eskalacji po
wcześniejszym żółtym. Nie zmieniono progów produkcyjnych ani wysyłki.
