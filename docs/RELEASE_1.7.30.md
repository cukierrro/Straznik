# Strażnik 1.7.30 — widać strefy PAŻP, a północ przestaje być ślepa

Dwa tematy z jednej sesji: pokazanie stref przestrzeni powietrznej, których do tej
pory nie było w aplikacji widać w ogóle, i naprawa realnej dziury w pokryciu Pomorza.

## Strefy PAŻP na mapie — informacyjnie, bez punktów

Gdy wojsko zamyka kawałek nieba, aplikacja o tym wiedziała (kolektor PAŻP działa od
dawna), ale użytkownik nie widział nic: strefa mogła co najwyżej dołożyć 0,5 pkt
w sygnałach. Najbardziej namacalny ślad reakcji na zagrożenie był niewidoczny.

Nowy przycisk **„strefy"** na mapie włącza warstwę aktywnych stref. Dotknięcie strefy
otwiera opis pisany dla laika: co to za strefa (D — niebezpieczna, R — ograniczona,
NPZ — zakaz lotów, ADHOC — doraźna, TSA/TRA — wydzielona na ćwiczenia), od kiedy
Strażnik widzi ją włączoną, planowany koniec, pułap w kilometrach i województwo.
Na końcu, wprost: **to informacja, nie alarm — strefy nie dodają punktów**, bo
zamknięcie nieba jest decyzją wojska, a nie niezależnym pomiarem zagrożenia.

Co jest pokazywane: D, R, NPZ, ADHOC, TSA oraz TRA powołana NOTAM-em lub suplementem.
Co odpada: ATZ, skoki spadochronowe (PJE), szybowce (GLD) i rezerwacje pod loty
bezzałogowe (BSP/UAV) — pomiar 12.09.2026: 50 stref przed filtrem, 31 po nim.

Rysowanie rozdziela stan od zdarzenia. Strefa, której **włączenia nie widzieliśmy** —
stoi od dawna albo była już aktywna przy starcie usługi — dostaje sam spokojny,
lawendowy kontur z ledwo widoczną plamą. Bryłę 3D dostaje tylko strefa realnie
włączona na naszych oczach. Bez tego 31 wypełnionych stref zalewało całą mapę i
wyglądało jak alarm w każdym województwie.

Trzy szczegóły, które wyszły dopiero na żywych danych:

- **Wiek strefy przeżywa restart.** Plan dobowy PAŻP przepisuje `startDate` codziennie
  o 06:00 UTC, więc to pole nic nie mówi o świeżości. Liczymy od chwili, w której
  Strażnik zobaczył strefę po raz pierwszy, i zapisujemy to na dysk
  (`data/zones_since.json`). Bez tego każdy restart usługi wpisywał do dziennika
  30+ fałszywych aktywacji naraz.
- **Strefa zastana przy starcie mówi o tym wprost:** „była już aktywna, gdy Strażnik
  zaczął obserwację — mogła zostać włączona wcześniej". Nie udajemy, że wiemy więcej
  niż wiemy.
- **Zniknięcie strefy ma karencję.** Przełączenie planu o 06:00 UTC albo jeden
  nieudany odczyt nie może wyglądać jak zniesienie strefy i jej ponowna aktywacja
  minutę później (żółta bryła na mapie).

Województwo w całości przykryte dużą strefą przestawało być klikalne — warstwa dotyku
strefy leży nad bryłą województwa. Przy okazji wyszło, że to nie tylko wina stref:
`openCard()` szukał karty w panelu, a panel pokazuje tylko województwa z punktami,
ze ściany wschodniej albo Twoje, więc spokojne wielkopolskie było nieklikalne także
wcześniej. Teraz karta powstaje na żądanie, karta strefy ma przycisk prowadzący do
województwa, a karta województwa wylicza swoje strefy jako klikalne plakietki.

## Północ przestaje być ślepa

NEPTUN pokrywa Ukrainę. Dla Pomorza i sąsiedztwa Kaliningradu warstwa, która na
wschodzie daje 0–8 pkt, daje **dokładnie zero**. Do tego media bałtyckie i zamknięcia
przestrzeni na Litwie i w Estonii trafiały wyłącznie do podlaskiego i
warmińsko-mazurskiego, a strefy PAŻP punktowały tylko ścianę wschodnią. Pomorskie
i zachodniopomorskie nie dostawały nic z żadnego z tych źródeł.

| sygnał | wschód | północ |
| --- | --- | --- |
| strefa PAŻP (rzadka, ADHOC/R/NPZ/D od ziemi w górę) | 0,5 | **1,0** |
| incydent bałtycki (media LT/LV/EE) | podlaskie, warm.-maz. | **+ pomorskie 1,0, zachodniopomorskie 0,5** |
| zamknięcie nieba u sąsiada (LT/EE) | podlaskie, warm.-maz. | **+ pomorskie, zachodniopomorskie** |

Waga 1,0 nie jest przypadkowa. **Żaden pojedynczy sygnał północny nie podnosi
poziomu** — próg żółty to 2,0. Ale dwa niezależne już tak: strefa 1,0 + ruch ADS-B
1,0 = 2,0, strefa 1,0 + incydent bałtycki 1,0 = 2,0. Limit klasy `pansa` (1,0)
pilnuje, żeby kilka stref naraz nie sumowało się do alarmu.

Kryteria punktowania stref są bez zmian: liczą się wyłącznie ADHOC/R/NPZ/D od ziemi
w górę, a designator widziany w ciągu ostatnich 7 dni jest rozpoznawany jako rutyna
i nie punktuje wcale. Sprawdzone na feedzie z 12.09.2026: EPD24, EPD37 i EPR306 nad
zachodniopomorskim oraz EPD29 nad warmińsko-mazurskim to codzienne strefy
niebezpieczne — pamięć 7-dniowa je wycisza. Punkt poleci dopiero za czymś nowym.

Zachodniopomorskie dostaje z Bałtyku połowę wagi, bo Estonia leży od niego około
900 km; podlaskie, warmińsko-mazurskie i pomorskie liczą się w pełni.

## Drobiazgi

- Wiersz legendy o śmigłowcu wojskowym nie tłumaczył się na angielski (był jednym
  węzłem tekstu łamanym w źródle na dwie linie).
- Ekran „O aplikacji" opisuje przycisk stref i osobno tłumaczy, dlaczego północ liczy
  się inaczej.

## Nowe i zmienione API

`GET /api/zones` — aktywne strefy o charakterze wojskowym wraz z geometrią oraz
dziennik włączeń i wyłączeń z okna 12 godzin. Osobny endpoint, a nie część
`/api/state`, bo geometria waży setki kilobajtów, a stan leci WebSocketem co kilka
sekund; aplikacja pobiera strefy raz na cztery minuty.

## Testy

- `scripts/test_polnoc.py` (nowy) — waga strefy na północy, brak alarmu z pojedynczego
  sygnału, osiągnięcie progu przez dwa sygnały, limit klasy, wagi celów bałtyckich.
- `scripts/test_spojnosc.py` — backend i silnik wbudowany nadal zgodne (punkty, progi,
  limity, cele bałtyckie).
