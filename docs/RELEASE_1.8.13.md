# Wydanie 1.8.13 — wypukłe powiaty, uczciwsze punkty z mediów, nowy wykaz GROTY

versionCode 144, versionName 1.8.13. 23 listopada 2026. Wspólny numer dla Androida i iPhone'a.

<!-- zmiany -->
- Mapa powiatów: bryła powiatu rośnie z punktami także poniżej progu, jak u województw, i jest wyższa niż dotąd. Poniżej progu kolor lekko jaśnieje z punktami, więc sąsiednie powiaty łatwiej odróżnić.
- Media: zapowiedź audycji albo rozmowy w studiu i artykuł o zdarzeniu z innego dnia nie dają już punktów.
- GROTA: wykaz punktów schronienia PSP z 23 listopada 2026 — 88 913 punktów.
- Panel Sygnały: przerwane przesunięcie palcem od razu wraca na swoją stronę.
<!-- /zmiany -->

## Mapa powiatów: wysokość także poniżej progu

Zgłoszenie z 23 listopada: powiat włodawski z 1,2 pkt leżał na mapie płasko jak sąsiedzi. Mapa brała wysokość tylko z powiatów, które mają poziom alarmu, a punkty poniżej progu serwer podaje od 1.8.11 osobno — korzystała z nich pigułka „mój region” i karta powiatu, ale nie bryły. Województwa rosną z punktami od zawsze.

Od 1.8.13:

- bryła powiatu rośnie z jego punktami także bez alarmu; kolor zostaje neutralny do progu 2,5 pkt, a poniżej niego lekko jaśnieje z punktami (od dotychczasowego granatu przy 0 pkt);
- wysokość to 8 km na punkt (było 3,5 km — przy 1,2 pkt powiat miał ok. 4 km i różnicę widać było dopiero po mocnym przybliżeniu). To nadal połowa skali województw (16 km na punkt);
- bryła rośnie najwyżej do 5 pkt (40 km). Przy dawnym przycięciu do 8 pkt powiat stawał się smukłą wieżą; próg czerwonego (4 pkt, 32 km) nadal wyraźnie odstaje od żółtego (2,5 pkt, 20 km).

Historia bez zmian: zapisane chwile nie przechowują punktów poniżej progu, więc w historii rosną tylko powiaty z alarmem. Aplikacja ustawia na mapie tylko zmienione wartości — słownik punktów ma do 380 powiatów i przychodzi z każdym stanem.

Sprawdzona i odrzucona: jasna obwódka górnej krawędzi każdego powiatu. Biblioteka map (MapLibre 4) nie rysuje linii na wysokości bryły, a jaśniejsza warstwa na szczycie rozjaśniała całe dachy i zasłaniała nazwy miejscowości.

## Media: zapowiedzi i relacje z innego dnia bez punktów

Zgłoszenie z 23 listopada: artykuł „Gość Radia Lublin: pułkownik dr Dariusz Dachowicz” dał lubelskiemu 0,5 pkt. To zapowiedź rozmowy w studiu („porozmawia na temat wojny, wybuchów rosyjskich dronów i rakiet”, „Zapraszamy po godz. 8:15”), bez daty i bez godziny zdarzenia, więc serwer uznał go za świeży. W historii od 3 sierpnia trzy wcześniejsze wywiady z tego cyklu dostały 0,5–1,5 pkt, a artykuł „Prezydent podsumowuje czwartkowy alarm” opublikowany w piątek — 1,0 pkt.

Serwer czyta treść artykułu przed przyznaniem punktów (od 13 września). Teraz bez punktów zostaje także artykuł, którego treść:

- zapowiada audycję albo rozmowę („porozmawia”, „gościem radia”, „zapraszamy po godz.”);
- podaje datę sprzed dnia publikacji („21 listopada”, „21.11.2026”) — liczą się daty z ostatnich 14 dni, starsza to tło („od 24 lutego 2022”);
- mówi o innym dniu przymiotnikiem („piątkowy atak”, „po sobotnim alarmie”, „niedzielnym wieczorem”);
- mówi o minionym czasie: „ubiegły / zeszły / miniony / ostatni / poprzedni” przy dniu, tygodniu, weekendzie albo dobie, „przedwczoraj”, „trzy dni temu”, „poprzedniej nocy”; „ubiegłej / zeszłej / ostatniej nocy” — jak dotychczasowe „w nocy”: bez punktów, gdy artykuł wyszedł po 8:00.

W panelu taki artykuł zostaje z linkiem i etykietą „Relacja z wcześniejszego zdarzenia” — także zapowiedź, bo panel nie ma dla niej osobnej etykiety. Zwroty zapowiedzi trafiły też na listę wykluczeń nagłówków (serwer i tryb wbudowany aplikacji). Ograniczenie: bieżąca relacja, która zaczyna się od nawiązania („po piątkowym ataku… dziś znów drony”), też straci punkty; takie artykuły są w większości podsumowaniami.

## GROTA: wykaz PSP z 23 listopada 2026

Paczka z wykazu punktów schronienia PSP z 23 listopada 2026: 88 913 punktów (było 88 256) i 113 przeniesień (było 84), w tym 31 nowych. Wobec paczki z 10 listopada doszło 1569 punktów, ubyło 912, zmieniło się 523 (310 przesunięć, 263 adresy, 134 dostępności, 21 gmin, 1 powiat). W warmińsko-mazurskim ubyły 304 punkty przy 25 nowych — wszystkie usunięte były w wykazie od 14 września, to korekta PSP, nie błąd pobrania. Punkt z Nowogrodu Bobrzańskiego ze szpilką 161 km od adresu (opisany przy 1.8.08) zniknął z wykazu. Kto ma zapisany punkt, którego dotyczy jedno z 31 nowych przeniesień, zobaczy ostrzeżenie „Zmienił się wykaz PSP”.

## Panel Sygnały

Przerwane przesunięcie palcem między stronami Powiaty i Województwa (system przejmuje dotyk, np. gestem systemowym) zostawiało panel przesunięty w pół drogi, aż do następnego stanu — teraz wraca od razu. Zgłoszone przy przeglądzie wersji na iPhone'a; dotyczyło obu platform.
