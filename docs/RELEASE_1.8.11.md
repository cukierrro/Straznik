# Wydanie 1.8.11 — pigułka „mój region” z punktami i przewijaniem, mapa od razu z powiatami, historia w widoku powiatów

versionCode 141, versionName 1.8.11. 22 listopada 2026. Wspólny numer dla Androida i iPhone'a.

<!-- zmiany -->
- Pigułka nad dolnym paskiem zawsze pokazuje punkty powiatu, także poniżej progu, jak wcześniej punkty województwa. Przy kilku powiatach Twoich miejsc strzałki po bokach albo przesunięcie palcem pokazują kolejny powiat.
- Po uruchomieniu mapa od razu pokazuje powiaty, bez chwilowego widoku województw.
- Historia w widoku powiatów: wiersz pod suwakiem zaczyna się od powiatu z najwyższym poziomem, a karta powiatu podaje punkty województwa z tamtej chwili.
<!-- /zmiany -->

## Pigułka „mój region”: punkty powiatu i wszystkie Twoje powiaty

W 1.8.10 pigułka nad dolnym paskiem przeszła z województwa na powiat. Pokazywała jednak tylko poziom i jeden powiat — ten z najwyższym poziomem, a w spokoju powiat pierwszego miejsca. Punkty były widoczne dopiero przy alarmie, bo serwer podawał wyłącznie powiaty z poziomem.

Od 1.8.11:

- Pigułka zawsze podaje punkty powiatu, także poniżej progu, np. „Lublin — poniżej progu 0,5 pkt · 1/8”. Liczba po kropce to pozycja na liście powiatów Twoich miejsc.
- Przy kilku powiatach po obu stronach pigułki są delikatne strzałki. Dotknięcie strzałki albo przesunięcie palcem w bok pokazuje kolejny powiat, w kolejności Twoich miejsc i w pętli. Dotknięcie środka otwiera kartę powiatu, jak dotąd.
- Ręcznie wybrany powiat zostaje na pigułce, dopóki w którymś z Twoich powiatów nie wzrośnie poziom. Wtedy pigułka sama wraca do powiatu z najwyższym poziomem, żeby alarm nie schował się za spokojnym powiatem. W trakcie alarmu można przeglądać pozostałe.
- Karta powiatu także podaje punkty poniżej progu.

Serwer wysyła punkty powiatów poniżej progu od 22 listopada 2026 w osobnym polu stanu. Starsze wersje aplikacji go nie czytają, więc nic się u nich nie zmienia. Pole dokłada do każdego odświeżenia ok. 0,4 KB po kompresji.

## Mapa od razu z powiatami

Po uruchomieniu aplikacji mapa przez chwilę pokazywała województwa, z obrysem województwa i pigułką województwa, a dopiero po chwili przełączała się na powiaty. Teraz plik granic powiatów pobiera się razem ze startem aplikacji, a warstwa powiatów jest dokładana od razu po liniach województw. Mapa, obrys i pigułka od pierwszej chwili pokazują powiaty.

## Historia w widoku powiatów

- Wiersz pod suwakiem pokazywał dotąd najwyżej ocenione województwo także w widoku powiatów. Teraz, gdy w wybranej chwili któryś powiat miał żółty albo czerwony, wiersz zaczyna się od powiatu z najwyższym poziomem (np. „WYSOKI PRIORYTET · Lublin (+2 pow.)”). Bez alarmu w powiatach zostaje województwo, jak dotąd.
- Karta powiatu w historii podawała samą nazwę województwa. Teraz podaje też jego punkty i poziom z wybranej chwili.
- Dotknięcie powiatu otwiera jego kartę i nie zmienia wiersza pod suwakiem. Wiersz opisuje całą chwilę.

Powiaty są w historii od 21 listopada 2026. Dla wcześniejszych chwil karta powiatu mówi, że zapisu nie ma.
