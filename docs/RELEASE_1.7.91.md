# Wydanie 1.7.91 — podkarpackie słyszy drony, telefon ostrzega o uśpieniu

versionCode 120, versionName 1.7.91. 8 października 2026.

<!-- zmiany -->
- **Obiekt punktuje teraz każde województwo w zasięgu**, z wagą zależną od odległości do tego konkretnego województwa. Dotąd punkty dostawało wyłącznie województwo z najbliższym odcinkiem granicy, niezależnie od tego, dokąd obiekt leciał — przez co podkarpackie bywało głuche na drony lecące w jego stronę.
- Jeśli Twój telefon ogranicza Strażnikowi baterię, aplikacja teraz **o tym ostrzega** i prowadzi prosto do właściwego ustawienia. Na nakładkach Samsunga, Xiaomi i podobnych uśpienie potrafi wstrzymać powiadomienia zupełnie, mimo że wszystkie zgody są nadane.
- W ustawieniach widać **godzinę ostatniego sygnału odebranego z serwera**. Dzięki temu da się odróżnić „nic nie przyszło" od „przyszło, ale nie usłyszałem".
- **Strefy PAŻP znikają w podglądzie historii.** Nie zapisujemy ich w migawkach, więc suwak pokazywał dzisiejsze strefy nad przeszłą sytuacją — teraz warstwa jest ukryta, a baner mówi dlaczego.
- Karta obiektu nie twierdzi już, że przyjmujemy „wariant groźniejszy”. Zwykłego drona liczymy jak Shaheda (180 km/h), ale odrzutowego Shaheda rozpoznajemy tylko wtedy, gdy oznaczy go źródło — i teraz karta mówi to wprost.
- Naprawione: pamięć podręczna strony rosła bez końca, zbierając po jednej kopii każdego pliku z każdego wydania.
<!-- /zmiany -->

Progi alarmów i treść powiadomień bez zmian. Czerwony alarm nadal wymaga klucza.

## Podkarpackie przestaje być głuche

Zgłoszenie od użytkowniczki, Małgorzaty Urbańskiej: Lubelszczyzna dostaje
więcej punktów niż Podkarpacie, a drony lecące na podkarpackie nie punktują go
wcale. Sprawdziliśmy — miała rację.

Każdy obiekt dostawał przypisane **jedno** województwo: to, którego granica
była najbliżej. **Kurs nie miał na ten wybór żadnego wpływu.** Dron nad Lwowem
lecący prosto na Przemyśl punktował więc lubelskie, bo polska granica
wybrzusza się na wschód pod Hrebennem.

Najlepiej widać to na liczbach: **Lwów jest oddalony od lubelskiego o 57,2 km,
a od podkarpackiego o 57,3 km.** Praktycznie tyle samo — a mimo to całość szła
do jednego, drugie dostawało zero.

Ponieważ drony nadlatują zwykle z północy i wschodu, najbliższy punkt granicy
prawie zawsze wypadał w lubelskiem. Od 12 września do 8 października:
**lubelskie 574 sygnały o obiektach, podkarpackie 18.**

Miało to skutek poważniejszy, niż widać na mapie: punkty przeniesione od
sąsiada są pokazywane, ale **celowo nie wysyłają powiadomienia**. Podkarpackie
mogło więc nie dostać sygnału o dronach lecących właśnie w jego stronę.

Teraz obiekt punktuje każde województwo bliższe niż 250 km, z wagą od
odległości do tego województwa — tak jak od dawna działają u nas alarmy
obwodów ukraińskich.

### Co pokazało przeliczenie historii

Przed wprowadzeniem przeliczyliśmy **dwa miesiące prawdziwych danych**
(2 sierpnia – 8 października) tym samym kodem, który liczy punkty na żywo:

| | przed | po |
|---|---|---|
| podkarpackie — żółte sygnały | 17 | **27** |
| podkarpackie — minut powyżej progu | 610 | **1030** |
| lubelskie | — | **bez zmian** |
| czerwone alarmy, najwięcej naraz | 1 | **1 — bez zmian** |

Zmiana tylko **dokłada** punkty, nigdy nie odbiera, więc lubelskie nie traci
nic. Czerwonych alarmów nie przybywa, bo czerwony wymaga klucza — oficjalnego
wezwania do schronienia albo obiektu uderzeniowego blisko **tego** regionu.

Rośnie natomiast liczba województw stojących tuż pod progiem czerwonego: w
najgorszym momencie całej historii trzy zamiast jednego, i tylko 28 września,
w dniu syren w Lublinie, gdy obiekty faktycznie były blisko Mazowsza i Podlasia.

### Co przy okazji sprawdziliśmy i było poprawne

Alarmy w obwodach ukraińskich działają **symetrycznie**: obwód lwowski ma
w naszej tabeli odległość zero do obu województw, czyli pełną wagę dla
każdego. Wszystkie dziesięć obwodów jest zaczytywanych, żaden nie jest
pomijany.

## Ostrzeżenie o uśpieniu aplikacji

Dwa zgłoszenia tego samego dnia, Galaxy S24 Ultra i S25+: wszystkie
uprawnienia nadane, internet działa, a sygnały ruszają dopiero po ręcznym
otwarciu aplikacji.

Serwer okazał się niewinny — powiadomienia wychodzą z wysokim priorytetem
i docierają nawet przed pierwszym odblokowaniem telefonu po restarcie. Winna
jest nakładka producenta, która usypia aplikację tak głęboko, że push nie
dociera wcale. **Ale myśmy o tym milczeli**, choć warstwa natywna od zawsze
wiedziała, czy telefon ogranicza nam baterię.

Gorzej: do 1.7.90 pisaliśmy w ustawieniach, że ta zgoda „nie jest wymagana,
bo push i tak dociera". Na nakładce Samsunga to nieprawda.

Teraz aplikacja ostrzega i prowadzi prosto do właściwego ustawienia — ale
tylko na telefonach, które naprawdę tak robią. Na czystym Androidzie
oszczędzanie baterii jest domyślnie włączone dla wszystkich i push przez nie
przechodzi, więc ostrzeganie każdego byłoby szumem.

## Godzina ostatniego sygnału

W ⚙ → Alarmy widać teraz, kiedy telefon ostatni raz dostał cokolwiek
z serwera. Bez tego przy zgłoszeniu „nic nie przychodzi" nie dało się
odróżnić uśpionej aplikacji od cichego powiadomienia — a to są dwie zupełnie
różne naprawy.

Zapisujemy **każdą** odebraną wiadomość, zanim cokolwiek ją odrzuci.
Jeśli przez cały czas nic nie przyszło, aplikacja mówi to wprost: to normalne,
dopóki nie było alarmu dla Twojego regionu.

## Strefy PAŻP w historii

Migawki mapy zapisują obiekty i ruch lotniczy, ale **nie strefy**. Mimo to
suwak historii rysował strefy pobrane przed chwilą — czyli dzisiejsze nad
sytuacją sprzed godzin.

PAŻP wymienia cały zestaw raz na dobę o 6:00, a strefa zdjęta znika
z bieżącego wykazu zupełnie. Strefy doraźne, otwierane w trakcie zdarzenia —
w historii najciekawsze — były więc niewidoczne, a odtwarzany incydent
wyglądał na odbyty przy otwartym niebie.

Warstwa jest teraz w historii ukryta, przycisk stref znika, a baner mówi
wprost, że stref nie zapisujemy. To uczciwsze niż pokazywanie cudzej chwili.

## Pod maską

Pamięć podręczna strony rosła bez ograniczeń: każde wydanie zmienia adres
pliku, a stara kopia zostawała obok nowej. Przez historię projektu uzbierało
się w ten sposób 165 różnych wersji jednego skryptu. Teraz zostaje po jednej
kopii na plik. Aplikacji to nie dotyczyło.

Doszły cztery testy: przypisanie obiektu do województw (z kontrolą, że czas
dolotu też jest przeliczany — inaczej region dziedziczy cudzą bliskość
i dostaje klucz czerwonego), ostrzeżenie o baterii, strefy w historii
i sprzątanie pamięci podręcznej.
