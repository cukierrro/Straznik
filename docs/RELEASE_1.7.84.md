# Strażnik 1.7.84 — widać, po której stronie granicy jest obiekt

**28 września 2026**, versionCode 113. Poprzednie wydanie:
[1.7.83](RELEASE_1.7.83.md) (ikona stoi tam, gdzie zgłoszono obiekt).

<!-- Blok poniżej to JEDYNE, co widzi użytkownik w oknie aktualizacji w telefonie.
     Krótkie, całe zdania, bez nagłówków i bez odsyłaczy — reszta notatek zostaje
     dla czytających na GitHubie. Parser: backend/app/app_updates.py, _change_items. -->
<!-- zmiany -->
- Koło niepewności wokół obiektu nie zaciemnia już mapy. Zostaje sam przerywany okrąg, więc widać, co jest pod spodem — miejscowości po polskiej stronie przestały wyglądać na objęte zagrożeniem.
- Obiekt bliżej niż 10 km od granicy ma pod ikoną napisaną odległość, na przykład „0,2 km od granicy”. Przy takiej odległości sama ikona nie rozstrzyga, po której stronie granicy jest obiekt.
- Odległości mają wreszcie polski przecinek zamiast kropki.
- Na iPhonie doszedł przycisk zgody na alarm mimo wyciszenia. Apple przyznało nam to uprawnienie; zgoda jest dobrowolna i dotyczy wyłącznie czerwonego alarmu.
<!-- /zmiany -->

**To wydanie kończy sprawę z 28 września: mapa pokazywała drona tuż za granicą
tak, że wyglądał na lecącego nad Polską. [1.7.83](RELEASE_1.7.83.md) naprawiło
przyczynę — rysowaną pozycję. Tu poprawiamy to, co zostało: sam rysunek.**

## Dlaczego to nie wystarczyło naprawić pozycji

Po 1.7.83 ikona stoi dokładnie tam, gdzie zgłosił ją NEPTUN. Ale obraz nadal
wprowadzał w błąd z dwóch powodów, niezależnych od współrzędnych.

**Koło niepewności kładło się na Polsce.** Promień ±4 km to uczciwa informacja —
źródło nie zna pozycji co do metra. Tyle że rysowaliśmy je jako przyciemnioną
plamę, a przy obiekcie 200 m za Bugiem ta plama nakrywała Dorohusk, Turkę,
Istrów i Okopy. Człowiek patrzący na mapę nie czyta „gdzieś w tym kole”, tylko
„to jest nad nami”. Teraz zostaje sam przerywany okrąg: ta sama informacja,
niczego nie zasłania.

**Ikona jest większa niż to, co pokazuje.** Sylwetka ma około 30 px. Przy widoku
województwa to kilka kilometrów terenu, więc obiekt 200 m za granicą i obiekt
2 km nad Polską wyglądają identycznie. Rysunek tego nie rozstrzygnie przy żadnej
poprawce graficznej — może to zrobić tylko liczba. Dlatego obiekt bliżej niż
10 km od granicy ma teraz pod ikoną podpis „0,2 km od granicy”.

## Co zostało sprawdzone przy podpisach

Użytkownik słusznie zapytał, czy podpisy nie zderzą się z nazwami wsi tam, gdzie
jest ich gęsto — Berdyszcze, Świerże, Dorohusk. Sprawdzone na mapie, przy zoomach
od 8 do 13, także na fali ośmiu obiektów wzdłuż 50 km granicy:

- w gęstych miejscach przy granicy podpisy **nie zakrywają nazw miejscowości** —
  siadają nad stroną ukraińską, gdzie nazw jest rzadko;
- prawdziwy problem okazał się inny: **przy mocnym oddaleniu podpisy zderzają się
  ze sobą**, układając się w drabinkę i zakrywając własne ikony. Dlatego odległość
  pokazujemy dopiero od zoomu 9; niżej zostaje sama ikona, tak jak dotąd.

Dwie pułapki warte zapisania, bo obie kosztowały czas:

- **`text-allow-overlap` nie przyjmuje wyrażeń zależnych od danych.** MapLibre
  odrzuca wtedy całą warstwę zdarzeniem `error` — bez wyjątku, bez wpisu w
  konsoli, po prostu podpisów nie ma. W makiecie działało, bo ustawiałem to przez
  `setLayoutProperty`, które nie waliduje. Stąd osobna warstwa `threats-dist`,
  gdzie nachodzenie jest stałą.
- **Próg zoomu 9,5 zadziałałby dopiero od 10.** MapLibre wylicza układ symboli na
  całkowitym zoomie kafla, nie na bieżącym.

Przy okazji: separator dziesiętny bierze się teraz z języka. „0,2 km” po polsku
i ukraińsku, „0.2 km” po angielsku. Wcześniej wszędzie była kropka, co na mapie
rzucało się w oczy.

## Alarm krytyczny na iPhonie

Apple przyznało 28 września uprawnienie **Critical Alerts** dla Strażnika.
Pozwala ono czerwonemu alarmowi zadzwonić, gdy telefon jest wyciszony
przełącznikiem albo w trybie Skupienia.

Uprawnienie samo z siebie nic nie robi: iOS wymaga **osobnej, wyraźnej zgody
użytkownika** i pyta o nią tylko raz. Dlatego w ustawieniach, w zakładce Alarmy,
pojawia się przycisk **„Włącz alarm mimo wyciszenia”** — widoczny wyłącznie na
iPhonie. Po odmowie nie pytamy drugi raz w próżnię, tylko otwieramy Ustawienia
telefonu, bo tylko tam da się to jeszcze włączyć.

Zgoda jest dobrowolna i w każdej chwili odwracalna. **Dotyczy wyłącznie czerwonego
poziomu** — żółty sygnał uwagi zostaje cichy i tego nie zmienimy: uprawnienie
nadane przez Apple na wyższym poziomie niż „znajdź bezpieczne miejsce” można
stracić, a straciliby je wtedy wszyscy użytkownicy.

Strona serwerowa poszła osobno, razem z 1.7.83: alarm z dźwiękiem krytycznym leci
na osobny temat FCM, na który zapisują się tylko telefony ze zgodą. Telefony bez
niej dostają dokładnie to, co dotąd.

## Co zostało zmienione

- `frontend/app.js`: warstwa `uncertainty` (wypełnienie) usunięta, zostaje
  `uncertainty-line` jako przerywany kontur; nowa warstwa `threats-dist`
  z odległością od granicy; `threats-age` oddaje jej miejsce od zoomu 9;
  funkcja `odleglosc()` z separatorem zależnym od języka; obsługa przycisku
  zgody na alarm krytyczny.
- `frontend/index.html`, `style.css`, `i18n.js`: przycisk i akapit objaśniający
  w trzech językach.
- Klucze cache: `app.js`, `style.css`, `i18n.js` → 1.7.84.

## Czego to NIE zmienia

Punktacja, progi, treść alarmów i powiadomienia — bez zmian. Zmienia się
wyłącznie rysunek na mapie i jeden nowy przycisk na iPhonie.
