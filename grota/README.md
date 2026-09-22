# GROTA — moduł schronienia (tylko w aplikacji)

Ten katalog trafia do aplikacji jako `www/grota/` **wyłącznie przy budowaniu Androida i iOS**.
Nie ma go w `frontend/`, bo serwer `straznik.eu` podaje właśnie `frontend/` — 11 MB punktów
i kod modułu byłyby do pobrania ze strony, a user zdecydował, że **GROTY nie ma w WWW**
(„żeby groty w www nie było, bo nam wszystko siądzie”, 19.09.2026).

## Kontrakt ze Strażnikiem (uzgodniony 21.09.2026)

- **Jedyny punkt wejścia:** `grota/widok.js`. Strażnik wstawia `<script src="grota/widok.js">`
  dopiero przy pierwszym wejściu; resztę swoich plików moduł dociąga sam, ścieżkami
  względnymi (`grota/…`).
- **Interfejs:** globalny `window.Grota` z `otworz()`, `ukryj()` i getterem `widoczny`.
  Zwykłe skrypty, bez modułów ES (Strażnik nie ma bundlera).
- **Pojemnik:** `<section id="grota-widok">` w `index.html`.
- **Stan alarmu:** `window.straznikAlert` + zdarzenie `straznik:alert` (pole `hard` —
  tylko RCB i NEPTUN; szczegóły w `frontend/app.js`, test `scripts/test_kontrakt_grota.cjs`).
- **MapLibre:** Strażnik ładuje 4.7.1 synchronicznie (`window.maplibregl`, style też).
  Moduł NIE ładuje drugiej kopii. Protokół `grota://` rejestrowany raz, przy pierwszym
  `otworz()`, i nie zdejmowany w `ukryj()`.

## Decyzje usera, których nie wolno „poprawić” przy okazji

- Alarm **nigdy sam nie otwiera** Groty. Po potwierdzeniu alarmu człowiek wybiera:
  „Gdzie się schronić” / „Obserwuj mapę” / „Jestem bezpieczny”.
- Ikona Groty w Strażniku to **shield-alert** — ta sama co zakładka TERAZ w module.

Test pilnujący tych decyzji: `scripts/test_grota_wpiecie.cjs`.
