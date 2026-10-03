# Strażnik 1.7.87 — okrąg pokazuje, gdzie obiekt naprawdę może być

**30 września 2026**, versionCode 116. Poprzednie wydanie:
[1.7.86](RELEASE_1.7.86.md) (czerwony alarm może budzić samą wibracją).

<!-- Blok poniżej to JEDYNE, co widzi użytkownik w oknie aktualizacji w telefonie.
     Krótkie, całe zdania, bez nagłówków i bez odsyłaczy — reszta notatek zostaje
     dla czytających na GitHubie. Parser: backend/app/app_updates.py, _change_items. -->
<!-- zmiany -->
- Okrąg wokół obiektu rośnie teraz z wiekiem meldunku. Pokazuje, gdzie obiekt może być, a nie tylko gdzie go zgłoszono — bo od ostatniego meldunku zdążył polecieć dalej.
- Karta obiektu rozbija tę liczbę: ile z niej to niepewność zgłoszenia, a ile droga przebyta od meldunku.
- Przy meldunku „kursem na X” karta mówi wprost, że to rejon na linii dolotu, a nie zmierzone położenie obiektu.
- Legenda i instrukcja opisują okrąg zgodnie z tym, co robi.
<!-- /zmiany -->

## Skąd to wydanie

Czytelnik zapytał o drona, który stał na mapie **14 km w głębi Mołdawii**, i czy
to nie błąd rysowania. Nie był. Ale sprawdzenie pokazało coś gorszego niż błąd
rysowania: **okrąg niepewności miał ±12 km i granicy nie dotykał**, więc mapa
twierdziła, że obiekt na pewno jest po tamtej stronie.

Meldunek miał wtedy 4 minuty. Dron przy 180 km/h przelatuje w tym czasie 12 km —
mógł być równie dobrze nad Ukrainą. Mapa obiecywała pewność, której nie miała.

## Co się zmieniło

Okrąg to teraz **niepewność zgłoszenia plus droga, jaką obiekt mógł przelecieć
od ostatniego meldunku**. Rysujemy ostatnią *znaną* pozycję, więc okrąg musi
rosnąć razem z wiekiem tej wiedzy. W przypadku z Mołdawii daje to 24 km zamiast
12 i granica znajduje się w środku — czyli dokładnie tyle pewności, ile mamy.

Karta obiektu pokazuje rozbicie, bo sama suma zmienia się w czasie i bez niego
wyglądałaby na chwiejną daną ze źródła:

> gdzie może być: **±30 km** (12 km zgłoszenia + 18 km lotu od meldunku)

**Dwa ograniczniki.** Dorzut jest ucinany na 15 minutach — tyle samo przyjmuje
reszta aplikacji za granicę, po której z meldunku nie da się już nic wnioskować,
a rosnący bez końca okrąg zalałby mapę. Po tym czasie karta mówi: *rejon
przestał już rosnąć, obiekt może być dalej*.

**Rakiety, KAB i balistyka bez zmian**, stały rejon 25 km. NEPTUN podaje im
rejon, nie namiar, i nigdy kursu — doliczanie im drogi udawałoby wiedzę o locie,
której nie mamy. To ta sama zasada, którą ustalił audyt G8.

## To nie łamie zasady „nie wyliczamy pozycji”

W 1.7.83 usunęliśmy dead reckoning, bo wynosił ikonę nawet 18 km przed meldunek
i pod Dorohuskiem wjeżdżał nad Polskę. Zasada brzmiała: **rysujemy tam, gdzie
zgłoszono**.

Ta zmiana jej nie narusza i to jest sprawdzone, nie założone: nigdzie nie
nadpisujemy współrzędnych — ani w kolektorze NEPTUN-a, ani w scalaniu, ani
w warstwie mapy. Ikona stoi tam, gdzie wskazało źródło. Rośnie wyłącznie okrąg,
czyli to, co komunikuje **niepewność**, a nie pozycję.

Sam rachunek nie jest zresztą nowy: czas dolotu liczył się tak samo
(niepewność + droga od potwierdzenia) od dawna. Brakowało go dokładnie tam,
gdzie użytkownik patrzy.

## „Kursem na X” to nie jest zmierzone położenie

Przy okazji wyszło, skąd biorą się takie punkty. Dla tego drona namiar
z podanej pozycji na Jampil wynosił **315,9°**, a NEPTUN podawał kurs **316°** —
zgodność do jednej dziesiątej stopnia przy odległości 39,5 km. Punkt leży więc
na linii dolotu do celu; nie jest miejscem, w którym kogoś widziano.

Karta mówi to teraz wprost: *rejon zgłoszenia na kursie do celu, nie zmierzone
położenie*.

Warto znać skalę zjawiska: w ciągu 12 godzin na 1269 obiektów **738 miało jedną
stałą pozycję przybliżoną** i nigdy się nie poruszyło. Realnie przemieszczało
się 242. Stojący punkt to w danych NEPTUN norma, nie wyjątek.

## Co zostało zmienione

- `frontend/app.js`: `ageSlackKm()` i `uncertaintyParts()`, rozbicie na karcie,
  nowa treść przy pozycji z celu, jedno źródło prawdy dla chwili odniesienia
  (`nowRefMs`).
- `frontend/index.html`, `frontend/i18n.js`: legenda w trzech językach.
- `scripts/test_niepewnosc_wiek.cjs`: nowy test, dziewięć przypadków —
  **uruchamia** produkcyjne funkcje, nie porównuje tekstu.
- `scripts/test_kontrakt_grota.cjs`: uodporniony po rozbiciu funkcji; przy
  okazji zacieśniona granica wycięcia, która łapała 3,8 kB przypadkowego kodu.
- Instrukcja PL/EN/UK: akapit o okręgu napisany od nowa; odświeżone zrzuty
  legendy i karty obiektu.

## Czego to NIE zmienia

Punktacja, progi, treść alarmów i powiadomienia — bez zmian. Zmienia się to,
ile pewności obiecuje rysunek, a nie to, kiedy aplikacja alarmuje.
