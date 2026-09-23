# Strażnik 1.7.76 — Strażnik po ukraińsku

**24 września 2026**, versionCode 106. Poprzednie wydanie: [1.7.74](RELEASE_1.7.74.md)
(czerwony alarm wymaga potwierdzenia). Numery 1.7.75 nie ma w obiegu — to
przygotowany wcześniej APK wycofania GROTY, trzymany poza wydaniami.

## Co się zmienia dla użytkownika

Cała aplikacja mówi po ukraińsku. Wybór jest w <kbd>⚙</kbd> → <kbd>Aplikacja</kbd> →
<kbd>Język interfejsu</kbd> → „Українська”; okno ustawień pokazuje wybrany język od razu,
a <kbd>Zapisz</kbd> przeładowuje aplikację.

Tłumaczenie obejmuje wszystko, co użytkownik czyta: ekrany i przyciski, okno „O aplikacji
i punktacja”, legendę, karty obiektów i maszyn, panel sygnałów, historię, ekran alarmu,
Moje miejsca, aktualizator, opisy źródeł, rodzaje i znaczenia stref PAŻP oraz ścieżki do
uprawnień w przeglądarkach. Brakujące tłumaczenie spada na angielski, nie na pusty napis.

Szczegóły, które mają znaczenie dla czytelności:

* **Nazwy ukraińskie zostają w oryginale.** Przy ukraińskim interfejsie nie transliterujemy
  nazw miejscowości ani obwodów — „Волинська область”, a nie „obw. wołyński”.
* **Mapa przechodzi na etykiety `name:uk`.**
* **Liczby zapisujemy z przecinkiem**, tak jak po polsku; jednostki wieku meldunku to „хв” i „год”.
* **GROTA** idzie teraz za językiem Strażnika także dla ukraińskiego (wcześniej znała tylko
  polski i angielski). Własny wybór w zakładce Zasady nadal ma pierwszeństwo.

## Poprawki znalezione przy okazji

Podczas przeglądania ekranów wyszły braki w **wersji angielskiej** — te teksty pokazywały się
po polsku mimo wybranego angielskiego:

* ekran alarmu: „Co zrobić: przejdź do schronu…” oraz trzy przyciski wyboru
  („Gdzie się schronić”, „Obserwuj mapę”, „Jestem bezpieczny”),
* tytuł okna kamer i notka o kamerach z Ukrainy,
* nagłówek „Alarmy push” na ekranie powitalnym,
* opis pola „Zaawansowane: wspólny backend”,
* „Moje miejsca” i przycisk „📍 Otwórz Moje miejsca” w ustawieniach.

Dodatkowo w GROCIE podbity został klucz pamięci podręcznej modułu (`WERSJA` w
`grota/widok.js`). Bez tego po aktualizacji WebView mógł podać z pamięci poprzedni
`jezyk.js` i pokazać GROTĘ po angielsku komuś, kto ustawił Strażnika po ukraińsku.

## Dokumentacja

* Nowa instrukcja po ukraińsku: <https://cukierrro.github.io/Straznik/uk.html>,
  z przełącznikiem PL/EN/UA w nagłówku wszystkich trzech wersji.
* W instrukcji polskiej i angielskiej poprawione nieaktualne zdanie o GROCIE
  („tylko Android i tylko po polsku”).

## Jak to jest zrobione

* `frontend/i18n.js` — słownik `UK` (klucz = tekst polski) dla tekstów słownikowych oraz
  `ukrainize()`, które po angielskim przebiegu podmienia węzły tekstowe według `EN2UK`
  (klucz = tekst angielski) i osobno ustawia bloki łamane pogrubieniami.
* `frontend/app.js` — 357 miejsc przeszło z `UI.isEn ? en : pl` na `UI.t(pl, en, uk)`.
  Podgląd języka w ustawieniach działa dalej: `refreshBgStatus`, `refreshWebPushStatus`,
  `renderNativeSound` i `browserNotifPath` dostają kod języka, nie flagę „angielski”.
* `scripts/test_guide.py` sprawdza teraz trzy języki instrukcji (zgodność rozdziałów,
  odnośniki, teksty alternatywne).

## Sprawdzone przed wydaniem

* Wszystkie testy `node scripts/test_*.cjs` przechodzą; `scripts/test_guide.py`,
  `scripts/test_spojnosc.py`, `scripts/test_ios_wspolne.cjs` — bez zastrzeżeń.
* Frontend serwowany lokalnie w trybie ukraińskim: z interfejsu zostają tylko nazwy własne
  (Strażnik, NEPTUN, Mikrus) i nazwy języków w wyborze.
* APK podpisany tym samym certyfikatem co wcześniejsze wydania (SHA-256 `1876b540…c902`).
