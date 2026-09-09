# Dwa potwierdzone błędy zdjęć — 8 września 2026

## Wynik

Użytkownik pokazał PADRE02 (PL, 019, PZ3T) oraz CAMEL41 (CZ, 0543, Z42).
Oba zdjęcia są błędne. Potwierdzono odpowiadające zrzutom fotografie i autorów
w publicznych odpowiedziach API, bez zmiany aplikacji ani produkcji.

| Karta | Pierwszy wynik wyszukania rejestracji | Właściwy model |
| --- | --- | --- |
| PADRE02 / 019 / PZ3T | iZhang, Shenyang J-6, photo 1596068 | PZL-130 Orlik; dokładny wariant TC niepotwierdzony |
| CAMEL41 / 0543 / Z42 | TangoYankee Aviation, MiG-15SB, photo 816136 | Dla czeskiego 0543 operator potwierdza Zlín Z-242L Zeus |

Źródła złych zdjęć i testowe dane: [regression-cases.json](regression-cases.json).
[Komunikat operatora LOM PRAHA](https://www.lompraha.cz/en/aktuality/zacina-nova-etapa-vycviku-ceskych-armadnich-pilotu-centrum-leteckeho-vycviku-prevzalo-moderni-letouny-zlin/)
z 22.10.2025 wymienia Z-242L o numerze 0543. Jest to dowód modelu w tej
flocie, nie globalne przypisanie każdej rejestracji 0543 do Zlína.

## Mechanizm błędu

`frontend/app.js`, funkcja `acPhoto`: dla podanego reg pobiera `/pub/photos/reg/…`
i przyjmuje `photos[0]`. Model, kraj ani zgodność z hex nie są sprawdzane.
Krótkie numery wojskowe powtarzają się między krajami i między epokami.
Klucz cache reg/hex nie jest kluczem modelu. W kodzie komentarz sugeruje
zapasowe wyszukanie po hex, ale przy obecnym reg takiej drugiej próby nie ma.

To wyjaśnia fotografie, nie dowodzi błędu pozycji, historii czy punktacji.
Nie jest potrzebne pobieranie zdjęć po reg, jeśli celem jest przykład modelu.

## Bezpieczny eksperyment offline

- `preview-catalog.json`: dwa przykłady z ręcznie sprawdzonym opisem i licencją.
- `model-photo-preview.js`: osobny selektor, NIE importowany przez aplikację.
- `scripts/test_aircraft_photo_preview.cjs`: **12/12 PASS**.
- `preview.html`: podgląd PL/EN; nie jest zrzutem APK.
- Żadnych wywołań API fotografii, VPS, FCM, GPS ani zmian powiadomień w podglądzie.

PZ3T pozwala użyć podpisu ogólnego „PZL-130 Orlik”, bez gwarancji podwariantu TC.
Z42 nie oznacza tylko Z-42: [ICAO Doc 8643](https://www.icao.int/operational-safety/doc-8643-aircraft-type-designators/search)
obejmuje również Z-142 i Z-242. Dlatego sam kod nie uruchamia zdjęcia Z-242L.
Wymagana jest osobno zweryfikowana identyfikacja modelu. Nie odgadywać jej
z samej rejestracji. Do integracji potrzebne są jawne mapowania typu/modelu,
a w wyjątkach pełny, datowany wpis identyfikacyjny (np. hex + kraj + reg + źródło).

Zdjęcie VH-NZL jest przykładem Z-242L, nie czeskiego 0543 ani identycznego
wyposażenia Zeus. Przykład PZL-130 ma źródłowe kadrowanie FOX 52; nie retuszowano
go. Autor i licencja są widoczne w podglądzie, nie tylko w pliku JSON.

## Dalszy katalog

W badaniu zebrano kandydatów dla 61 kodów, ale NIE zatwierdzono 61 zdjęć.
Odrzucono wstępne zgadywanie SUCO jako Superjet i SW4 jako Puszczyk:
w ICAO są to odpowiednio rodzina SuperCobra oraz Metro/Merlin IV.
SB39 nie znaleziono w pobranej tabeli — kandydat zablokowany do wyjaśnienia.

Do wymiany/weryfikacji pozostają m.in. A332, B350, B737, B739, B77W, B788,
E3CF (nie zamieniać CFM56 z TF33), M28 (wariant silnika i kadr), GLF5 i SW4
(licencje). Reszta również wymaga zatwierdzenia zgodności wariantu i podpisu,
nie tylko wizualnego podobieństwa. Bieżące materiały robocze są w
`test-out/aircraft-library-research`; nie pakować tego katalogu do APK.

Po pełnej bibliotece: projekt lokalizacji, wariant 2. Publikacja i zmiany
aktywnych powiadomień pozostają poza zakresem tego eksperymentu.
