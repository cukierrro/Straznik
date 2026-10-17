# Wydanie 1.7.96 — sekcja „Mapa”, pasek awarii źródła, „miejsce schronienia” w alarmach

versionCode 125, versionName 1.7.96. 17 października 2026.

<!-- zmiany -->
- Ustawienia: nowa sekcja „Mapa” z trasami i kierunkiem lotu obiektów.
- Gdy NEPTUN nie odpowiada, nad mapą pojawia się pasek „NEPTUN nie odpowiada od…”. Obiekty zostają na mapie.
- Alarm mówi „przejdź do miejsca schronienia” — w powiadomieniu i na ekranie alarmu.
- Płynniejsza mapa przy wielu obiektach i czytelniejszy wykres 12 godzin.
- Tryb bez serwera liczy alarmy tak jak serwer.
<!-- /zmiany -->

## Ustawienia: sekcja „Mapa”

Wybór tras obiektów (przebyta trasa, trasa i kierunek lotu albo bez tras) dla dronów
i rakiet NEPTUN oraz dla samolotów ADS-B był schowany w sekcji „Język, tekst i wersja”.
Teraz ma własną, piątą sekcję **Mapa**, z opisem „Jak czytać kierunek”.

Na iPhonie wiersz dźwięku nazywa się teraz „Dźwięk”, a nie „Dźwięk i godziny ciszy” —
godziny ciszy działają tylko na Androidzie.

## Pasek „NEPTUN nie odpowiada od…”

17.10 NEPTUN nie odpowiadał przez 16 minut, a mapa dalej pokazywała obiekty sprzed
awarii; sygnałem była tylko czerwona dioda. Teraz, gdy źródło milczy dłużej niż
2 minuty, nad mapą pojawia się pasek z godziną ostatniej wiadomości. Dotknięcie
otwiera okno „Źródła”. Obiektów nie ukrywamy — pusta mapa przy awarii źródła
wyglądałaby jak spokój.

## „Miejsce schronienia” w alarmach

Ekran alarmu od 1.7.95 mówił „przejdź do miejsca schronienia”, ale powiadomienie
(Android i iPhone) oraz pełnoekranowy alarm Androida nadal mówiły „przejdź do schronu”.
Teraz wszędzie jest „przejdź do miejsca schronienia lub pomieszczenia bez okien”.

## Mapa i historia

- Mapa przy wielu obiektach nie przerysowuje się bez potrzeby i nie przycina przy
  przesuwaniu i przybliżaniu.
- Wykres 12 godzin: nagłówek „najwięcej naraz”, dymek z liczbą w danej minucie
  i średnią z ostatnich 30 minut (wcześniej średnia sięgała w przyszłość), kropki
  rakiet okrągłe także na szerokim ekranie.

## Tryb bez serwera liczy tak jak serwer

Gdy serwer nie odpowiada, aplikacja liczy alarmy sama. Teraz robi to tak samo jak serwer
od 15–17.10:
- czerwony nie zapala się od meldunku z samą pozycją obwodu i niepewnością ponad 30 km;
- zmiana stopnia alertu RCB w tym samym wpisie RSO (w górę i w dół) jest wychwytywana,
  a stopień liczy się z pełnej treści;
- odwołanie alertu gasi tylko alerty wydane przed nim (czas wydania liczony poprawnie);
- zapowiedź szkolenia nie daje punktów z mediów; ćwiczenia, testy i informacje
  wyborcze z mediów Litwy, Łotwy i Estonii są pomijane;
- zapasowe źródło ADS-B dla Litwy, Łotwy i Estonii działa.

## iPhone

Aplikacja zawiera rozszerzenie powiadomień: alarm w języku aplikacji i cichy żółty przy
ustawieniu „Bez dźwięku”. W tym wydaniu jest **wyłączone** — włączymy je po
publikacji, osobną zmianą na serwerze. Zmierzone 17.10 na iPhonie testera: żółty cichy
i po angielsku, czerwony z syreną i jako alarm krytyczny mimo wyciszenia żółtego.

## Czego nie sprawdziliśmy

Pasek „NEPTUN nie odpowiada” w prawdziwej awarii (sprawdzony testem i na stronie
testowej), płynności mapy w liczbach klatek na prawdziwym komputerze.
