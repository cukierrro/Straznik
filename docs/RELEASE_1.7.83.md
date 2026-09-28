# Strażnik 1.7.83 — ikona stoi tam, gdzie zgłoszono obiekt

**28 września 2026**, versionCode 112. Poprzednie wydanie:
[1.7.82](RELEASE_1.7.82.md) (mniej danych: lżejsza aplikacja i mniej pobierania).

<!-- Blok poniżej to JEDYNE, co widzi użytkownik w oknie aktualizacji w telefonie.
     Krótkie, całe zdania, bez nagłówków i bez odsyłaczy — reszta notatek zostaje
     dla czytających na GitHubie. Parser: backend/app/app_updates.py, _change_items. -->
<!-- zmiany -->
- Ikona obiektu stoi dokładnie tam, gdzie go zgłoszono. Do tej pory mapa przesuwała ją kursem naprzód między meldunkami i obiekt tuż za granicą potrafił wyglądać, jakby był już nad Polską.
- Okrąg niepewności i ślad przesunęły się razem z ikoną, więc mapa i karta obiektu mówią wreszcie to samo.
- Punkty, progi i alarmy zostają bez żadnych zmian. Zawsze liczyły się ze zgłoszonej pozycji, nie z rysunku.
<!-- /zmiany -->

**To wydanie naprawia jedną rzecz i nic poza nią nie zmienia. Mapa pokazywała
obiekt w miejscu, którego nikt nie zgłosił.**

## Co się działo

28 września dron śledzony pod Dorohuskiem został **0,22 km za granicą, po stronie
ukraińskiej** — tak mówiły wszystkie meldunki i tak liczył backend. Karta obiektu
w aplikacji pisała „odległość od granicy PL: 0,2”.

A ikona z okręgiem niepewności ±4 km stała **3 km w głębi Polski**, nad Turką
i Łysobykami. Ludzie nagrali to z ekranu i nagranie rozeszło się jako „dron
wleciał nad Polskę”.

## Dlaczego

Mapa nie rysowała ostatniego meldunku. Rysowała **pozycję przewidywaną**: znacznik
jechał zmierzonym kursem i prędkością nawet 18 km przed ostatni meldunek, przez
7 minut, żeby nie stać w miejscu między rzadkimi zgłoszeniami.

Ten dron leciał kursem 183°, czyli prosto na południe. Granica pod Dorohuskiem
odbija na wschód. Prosta na południe wchodzi więc nad Polskę, choć obiekt został
za Bugiem.

Zmierzone na archiwum całego dnia, na tym samym konturze kraju, który rysuje mapa:

| od ostatniego meldunku | gdzie stała ikona |
|---|---|
| 0 s (meldunek) | 0,22 km **poza** Polską |
| 60 s | 0,65 km w głębi Polski |
| 7 min | 2,4 km w głębi Polski |
| najgłębiej tego dnia | **4,46 km** w głębi Polski, o 15:04:48 |

W 720 migawkach z całej doby dotyczyło to **jednego obiektu — dokładnie tego**.
Żaden meldunek żadnego obiektu nie wypadł nad Polską.

## Skąd się to wzięło w kodzie

Przewidywanie pozycji jest w projekcie od pierwszego dnia: NEPTUN melduje rzadko,
więc znacznik jechał dalej sam. W **1.7.48** (14 września, audyt G5) zostało już raz
przycięte, bo ikony jechały prędkością typową dla klasy wzdłuż domniemanego kursu
nawet 30 km i — jak brzmiało uzasadnienie — „leciały tam, gdzie żadnego drona nie
było”. Wtedy ograniczyliśmy je do zmierzonego kursu i prędkości, najwyżej 18 km
i 7 minut. **Ten sam błąd, rozpoznany dwa tygodnie wcześniej i naprawiony
w połowie.**

Skutkiem ubocznym tamtego przycięcia było to, że obiekty bez zmierzonej prędkości
stały i przeskakiwały. Dlatego w **1.7.53** (16 września) doszedł płynny przejazd:
ikona przejeżdża 45 sekund między dwiema **prawdziwymi** pozycjami. To rozwiązanie
w zupełności wystarcza i zostaje.

Nie zostało usunięte to, co przejazd zastąpił. Obie rzeczy działały naraz, a w kodzie
jedna karmiła drugą: przejazd dojeżdżał nie do meldunku, tylko do pozycji wymyślonej
przez przewidywanie.

Najboleśniejsze jest to, że **mieliśmy test, który pilnował dokładnie tej
gwarancji**. `scripts/test_plynny_ruch.py` kończy się zdaniem „ikony nie wyprzedzają
źródła”. Tylko że sprawdzał sam przejazd, z celami wpisanymi ręcznie — nigdy przez
funkcję rysującą. Testował połowę drogi i świecił na zielono nad zepsutym
mechanizmem przez dwanaście dni.

## Co zostało zmienione

- `frontend/app.js`: `predict()` i stałe zasięgu usunięte w całości. Celem przejazdu
  jest sam meldunek — `glidePosition(t, { lat: t.lat, lon: t.lon }, now)`. Okrąg
  niepewności i ślad wiszą na tej samej pozycji co ikona, więc przesunęły się razem
  z nią.
- Klucz cache `app.js` podbity na `1.7.83`, bo Cloudflare trzyma ten plik 4 godziny.

Ruch ikon nie stracił nic: przewidywanie dotyczyło wyłącznie obiektów ze zmierzoną
prędkością, czyli tych, które przejazd obsługuje najlepiej.

## Czego to NIE dotyczy

Punktacja, progi, treść alarmów, powiadomienia i wszystko w panelu sygnałów biorą
pozycję ze zgłoszenia. `predict()` nie był używany nigdzie poza rysowaniem znacznika
na mapie. Żaden alarm nie został przez to wywołany ani pominięty — skłamał wyłącznie
obrazek. Tyle że ludzie fotografują właśnie obrazek.

## Sprawdzenie

- Nowy `scripts/test_rysowana_pozycja.cjs`: puszcza **produkcyjny** `glidePosition`
  po prawdziwym torze tego drona z 28 września, na `frontend/assets/polska.geojson` —
  tym samym konturze, który rysuje mapa. 5700 klatek przejazdu, **ani jedna nad
  Polską**; przejazd nie zbacza z odcinka między meldunkami (maks. 0,0 m). Test
  sprawdza też, co funkcja rysująca **przekazuje** jako cel, a nie tylko co przejazd
  z tym celem robi — czyli tę połowę drogi, której zabrakło poprzednio.
- Odtworzone w samej aplikacji przed poprawką i po niej: przed — ikona 3,16 km od
  meldunku przy karcie mówiącej „0,2 km”; po — przesunięcie 0,000 km.
- Wszystkie 28 testów node przechodzi.
- Przy okazji naprawiony `scripts/test_threat_photos.cjs`: padał już przed tą
  zmianą, bo w 1.7.82 ilustracje poszły na WebP, a test nadal wymagał PNG.

## Zrzutów w instrukcji nie wymieniam

Świadomie. Instrukcja nigdzie nie opisuje przewidywania pozycji ani ruchu ikon —
sprawdzone w trzech wersjach językowych. Zmienia się miejsce rysowania znacznika
w trakcie zdarzenia, a nie wygląd żadnego opisanego ekranu. Daty wykonania zrzutów
w stopce zostają prawdziwe.
