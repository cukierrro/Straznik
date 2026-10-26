# Wydanie 1.8.01 — GROTA z wykazem PSP z 26.10 i ostrzeżeniem o zmienionym schronieniu

versionCode 130, versionName 1.8.01. 26 października 2026.

<!-- zmiany -->
- GROTA: wykaz punktów schronienia PSP z 26 października — 87 835 punktów.
- GROTA ostrzega, gdy zapisane schronienie w nowym wykazie jest innym obiektem, ma poprawione położenie albo zniknęło z wykazu.
- GROTA znajduje Gdańsk, Gdynię, Hel, Jastarnię i Puck, a przy miejscowościach o tej samej nazwie pokazuje województwo.
- Pobrana mapa offline mówi, że jest nowsza wersja, i daje się podmienić.
- Tryb bez serwera rozumie nowe formaty Alertów RCB i pełne nazwy miejscowości w artykułach.
- Mniej cudzych serwisów: bez zapasowej mapy CARTO i bez zapasowych źródeł ADS-B.
<!-- /zmiany -->

## GROTA: wykaz PSP z 26 października

GROTA ma wykaz „Punkty schronienia w Polsce” Komendy Głównej PSP w stanie na 26.10.2026:
87 835 punktów (wcześniej 87 316 z 19.10). Wykaz jest wpisany w aplikację i działa bez internetu.

## Ostrzeżenie, gdy zapisane schronienie stało się czymś innym

W wykazie z 26.10 ten sam identyfikator punktu w 25 przypadkach wskazał inny obiekt —
z innym adresem i w innej gminie, od 2,9 do 23,3 km od poprzedniego położenia. 20 z nich
zmieniło się przy okazji na „Na żądanie”, czyli zwykle zamknięte. Przykład: punkt
„51a, Kromolice, gm. Pogorzela” wskazuje teraz „os. Gawrony 2, Gostyń”, 23 km dalej.

GROTA zapamiętuje wybrane schronienia po identyfikatorze, więc bez ostrzeżenia zapisane
miejsce po cichu wskazałoby inny budynek. Teraz przy miejscu, którego to dotyczy, pojawia się
ostrzeżenie, a zwinięta karta miejsca pokazuje „zapisane schronienie wymaga sprawdzenia”.
Ostrzeżenie rozróżnia trzy przypadki:

- **pod tym numerem jest inny obiekt** — widać stary i nowy adres oraz odległość;
- **PSP poprawiło położenie punktu** — adres ten sam, zmieniły się współrzędne
  (np. punkt z Mokotowa leżał wcześniej 222 km dalej, na Kujawach);
- **punktu nie ma już w wykazie.**

Od tej wersji GROTA zapisuje przy każdym wybranym schronieniu, z którego wykazu pochodzi.
Kto wybrał punkt już po zmianie, nie dostaje ostrzeżenia. Przy schronieniach zapisanych
wcześniej nie da się tego rozstrzygnąć, dlatego tekst jest warunkowy: „Jeśli zapisano tu …,
wybór nowego miejsca schronienia jest konieczny”.

Niczego nie usuwamy. Ostrzeżenie zostaje, dopóki nie zostanie wybrane nowe schronienie albo
nie padnie „Zostawiam jak jest” — i wraca, jeśli PSP zmieni ten punkt jeszcze raz. Nagrana
trasa do przesuniętego punktu jest oznaczona jako nieaktualna; trasa nagrana już po zmianie
działa dalej.

## GROTA: wyszukiwarka i mapy offline

- Spis miejscowości zgodny z rejestrem TERYT. Wcześniej wyszukiwarka nie znała Gdańska,
  Gdyni, Helu, Jastarni i Pucka — ich granice gmin sięgają w morze.
- Przy miejscowościach o tej samej nazwie i gminie wynik pokazuje województwo
  (np. Olsztyn w warmińsko-mazurskim i Olsztyn w śląskim).
- Pobrana mapa offline sprawdza, czy na serwerze jest nowsza wersja. Jeśli tak, mówi o tym
  i pozwala ją zaktualizować; stara działa do chwili podmiany.

## Tryb bez serwera

Gdy serwer Strażnika nie odpowiada, aplikacja liczy sama. W tej wersji jej silnik dostał to,
co serwer ma od kilku dni:

- nowy format tytułów Alertów RCB (SPO-13) i aktualizacje komunikatów na gov.pl;
- słownik województw z pełnymi odmianami nazw miejscowości zamiast samych rdzeni;
- małą premię za kurs drona na województwo i napis „w odległości … od woj.”, gdy kurs
  omija województwo z najbliższą granicą. Premia nie podnosi sumy punktów.

## Mniej cudzych serwisów

Sprawdziliśmy warunki korzystania ze wszystkich źródeł. Trzy z nich nie pozwalają na takie
użycie, więc zostały usunięte:

- zapasowa mapa **CARTO** — gdy kafelki OpenFreeMap nie odpowiadają, mapa pokazuje same
  kontury i obiekty, bez podkładu;
- zapasowe źródła ADS-B **adsb.fi** i **airplanes.live** — samoloty pokazuje tylko adsb.lol,
  z podpisem „© adsb.lol, ODbL”. Warstwa samolotów nie daje punktów.

Polityka prywatności opisuje teraz tryb awaryjny: gdy serwer nie odpowiada, telefon łączy się
bezpośrednio z serwisami źródłowymi, które wymienia z nazwy.

## Drobne

- Karta samolotu: „na ziemi” przy pozycji z MLAT ma dopisek, że bez lotniska w tym miejscu
  to najpewniej błąd wyliczenia pozycji.
- Teksty GROTY w formie bezosobowej („Nic nie znaleziono”, „Sprawdzone na miejscu”).
