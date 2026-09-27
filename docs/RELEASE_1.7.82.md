# Strażnik 1.7.82 — mniej danych: lżejsza aplikacja i mniej pobierania

**27 września 2026**, versionCode 111. Poprzednie wydanie:
[1.7.81](RELEASE_1.7.81.md) (alarm da się odczytać czytnikiem ekranu).

<!-- Blok poniżej to JEDYNE, co widzi użytkownik w oknie aktualizacji w telefonie.
     Krótkie, całe zdania, bez nagłówków i bez odsyłaczy — reszta notatek zostaje
     dla czytających na GitHubie. Parser: backend/app/app_updates.py, _change_items. -->
<!-- zmiany -->
- Aplikacja waży o 12 MB mniej. Ilustracje obiektów są w lżejszym formacie, wyglądają tak samo.
- Mapa Ukrainy pobiera się dopiero wtedy, gdy są tam alarmy. Wcześniej ładowała się przy każdym otwarciu, choć zwykle nic nie pokazywała.
- Przy pełnej ciszy w kraju Strażnik rzadziej pyta serwer o stan, co oszczędza baterię i transfer. Gdy gdziekolwiek jest podniesiony poziom, sprawdza tak często jak dotąd, a przy alarmie częściej.
- Serwer przysyła teraz tylko tę część stanu, która się zmieniła.
- Zdjęcie maszyny w zwiniętej karcie jest większe i wreszcie coś na nim widać.
<!-- /zmiany -->

**Najważniejsze: to wydanie niczego nie dodaje — zmniejsza zużycie danych, pamięci
i baterii. Punktacja, progi i alarmowanie zostają bez zmian.**

## Skąd się to wzięło

24 września strona miała **119 209 unikalnych użytkowników i 231 737 odsłon**,
a Cloudflare przepuścił **428 GB w dobę**. Rozbicie tego ruchu po typach treści
pokazało coś, czego nikt nie podejrzewał: największą pojedynczą pozycją nie były
dane o zagrożeniach ani mapa, tylko **obrazy — 127 GB**.

Płacili za to głównie ludzie na danych komórkowych, otwierający Strażnika
w trakcie zdarzenia. Czyli dokładnie ci, którym ma być lekko.

## Ilustracje obiektów: 12,4 MB → 91 KB

Osiem ilustracji klas obiektów (dron, Shahed, rakieta, KAB, MiG-31K…) było
zapisanych jako PNG 1536×1024, po ~1,6 MB każda. To są gładkie rendery na
jednolitym granatowym tle — dla takiej grafiki PNG jest po prostu złym formatem,
bo nie ma kompresji stratnej.

Karta rysuje ilustrację na 285 px szerokości, więc 900 px starcza nawet na ekrany
o trzykrotnej gęstości. Po zmianie na WebP 900×600 osiem plików waży razem
**91 KB zamiast 12,4 MB** — **136 razy mniej**.

Jakość sprawdzona dwiema drogami: porównaniem pikselowym (średnia różnica
**1 poziom jasności na 255**, maksymalna 26 i tylko na ostrych krawędziach — na
gładkim ciemnym tle nie ma pasowania) i obejrzeniem trzech ilustracji obok siebie
w pełnej skali. Prompty użyte do wygenerowania zostają w
`frontend/assets/threats/AI-ILLUSTRATIONS.md`, więc oryginały da się odtworzyć.

Ilustracje są wbudowane w aplikację, więc **APK chudnie o ~12 MB**.

## Mapa Ukrainy pobierana dopiero, gdy jest co rysować

`obwody-ua.geojson` to 328 KB po gzipie i **57 266 punktów** na 10 obwodów,
`rejony-ua-v1.geojson` kolejne 156 KB. Pobierały się przy **każdym** otwarciu,
choć warstwa obwodów ma przezroczystość 0, dopóki żaden obwód nie ma
punktowanego alarmu. Prawie pół megabajta za coś, czego zwykle nie widać.

Teraz każda warstwa ściąga się osobno i dopiero wtedy, gdy ma co pokazać:
pierwszy alarm rejonowy pobiera rejony, pierwszy punktowany obwód — obwody.

Odłożone jest **wyłącznie pobranie danych**. Warstwy i obsługa kliknięć powstają
przy starcie, puste, więc kolejność rysowania jest ustalona raz i nic nie może
wylądować nad Polską. Po pobraniu malujemy jeszcze raz z zapamiętanych danych,
bo alarm prawie zawsze przychodzi przed geometrią.

## Serwer przysyła tylko to, co się zmieniło

Pomiar na produkcji: przez trzy minuty backend wypuścił 11 nowych stanów.
W tym czasie dane o zagrożeniach zmieniły się 11 razy, pozycje samolotów
cywilnych **cztery**, a stan źródeł **ani razu**. Telefon dostawał całość przy
każdym odświeżeniu, czyli 2,4 KB na darmo w dwóch trzecich przypadków.

Stan jest teraz podawany w dwóch częściach: głównej i pomocniczej (samoloty
i stan źródeł). Część główna niesie odcisk części pomocniczej, więc telefon
dobiera ją tylko wtedy, gdy naprawdę się zmieniła.

Odpowiedź dla aplikacji, które nie znają podziału, **jest nietknięta co do bajtu** —
biorą ją starsze wydania i widżet na ekranie głównym.

## Rzadsze pytania przy pełnej ciszy

Dotąd aplikacja pytała serwer co 5 sekund niezależnie od sytuacji, a przy alarmie
co 2. Pomiar pokazał, że **pełna cisza w całym kraju trwa około 93,5% czasu**,
a serwer przelicza stan wtedy mniej więcej co 16 sekund — pytanie co 5 sekund nic
nie wnosiło.

Są teraz trzy tempa:

| sytuacja | co ile |
|---|---|
| alarm w Twoim województwie albo czerwony gdziekolwiek | 2 s (bez zmian) |
| podniesiony poziom gdziekolwiek w Polsce | 5 s (bez zmian) |
| pełna cisza w całym kraju | 15 s |

Zwolnienie dotyczy **wyłącznie** sytuacji, w której w całym kraju nic się nie
dzieje. Gdy cokolwiek jest podniesione, tempo zostaje takie jak dotąd.

Próg pokazywania „brak połączenia" jest teraz wielokrotnością odstępu, a nie stałą —
inaczej przy odstępie 15 sekund baner wyskakiwałby po jednym zgubionym pakiecie.

## Miniatura w zwiniętej karcie

Zgłoszenie użytkownika: zdjęcie maszyny w karcie było znaczkiem pocztowym
pływającym pośrodku pustego pasa na całą szerokość. Powód: wysokość obcięta do
44 px, przy której zdjęcie 3:2 kurczyło się do 66 px szerokości.

Rozdzielone na dwa przypadki, bo te obrazy mają inny kadr. **Zdjęcia modeli**
dostały 110 px i wypełniają szerokość karty — są kadrowane ciasno na maszynie,
więc nic istotnego nie ubywa. **Ilustracje AI** dostały 96 px i zostają
w całości, bo powstawały z zapasem marginesu i wypełnienie obcięłoby im skrzydła.

## Drobne

- Pliki mapy i biblioteka mapy leżą teraz w przeglądarce rok zamiast doby —
  razem ~890 KB, których powracający użytkownik nie pobiera ponownie.
- Kontur Polski miał współrzędne z pełną precyzją zmiennoprzecinkową.
  Po zaokrągleniu do 5 miejsc po przecinku (1,1 metra) waży 9,7 KB zamiast 24,9.
  Przeliczony kontur używany do liczenia odległości od granicy przesuwa się
  najwyżej o **13 metrów** przy 944 punktach — poniżej dokładności samych danych.
- Service worker zapisywał sobie kopie `app.js`, `style.css`, mapy i granic pod
  adresami **bez numeru wersji**, o które strona nigdy nie pyta. Te kopie nigdy
  nie zostały użyte, a instalacja pobierała przez nie drugie ~450 KB tych samych
  plików.

## Uwagi techniczne

Klucze cache `engine.js`, `pl-outline.js` i `style.css` podbite na `1.7.82`,
`app.js` na `1.7.82a` — jego treść zmieniła się jeszcze po ustawieniu klucza
(poprawka ścieżki wycofania), a klucz musi opisywać dokładnie jedną treść; znaczniki wersji dostały też biblioteka mapy i pliki granic, dzięki
czemu obejmuje je roczny cache.

`scripts/test_klucze_cache.cjs` sprawdza teraz także zasoby pobierane z `app.js`
i `engine.js`, nie tylko wpięte w `index.html`. Bez tego zapomniany klucz przy
pliku granic oznaczałby **starą mapę u użytkownika przez rok** — dwanaście razy
dotkliwiej niż przy pliku `.js`.

Nowe testy: `test_czesci_stanu.py` (15 sprawdzeń, m.in. że obie części składają
się dokładnie w pełny stan i że kolejność parametrów w adresie jest stała, bo
Cloudflare cache'uje po całym adresie) oraz `test_leniwe_warstwy_ua.cjs`.
`test_odpytywanie.cjs` sprawdza trzy tempa i scalanie części stanu.

`docs/WYCOFANIE_WYDANIA.md` opisuje punkt przywracania i procedurę wycofania.
Przy jego pisaniu wyszła usterka, której inaczej byśmy nie znaleźli: po cofnięciu
serwera do 1.7.81 aplikacja 1.7.82 nakładałaby na pełny stan zapamiętaną część
pomocniczą i **samoloty zamarłyby** na mapie, która wyglądałaby normalnie.
Naprawione i objęte testem.

Zmiany w backendzie wymagają `git pull` na VPS. Kolejność ma znaczenie:
**najpierw serwer, potem aplikacja** — serwer da się cofnąć, aplikacji nie.
