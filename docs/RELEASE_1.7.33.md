# Strażnik 1.7.33 — karta strefy czytelna, karencja naprawdę działa

- Nazwa strefy w karcie chowała się pod przyciskami zwiń/zamknij — teraz zawija się w całości.
- Kolor nagłówka karty był nieczytelny: karta ma białe tło, a barwa z mapy dawała kontrast 1,83:1. Teraz 5,7:1.
- Karencja zniknięcia strefy, opisana w notatkach 1.7.30, nie była zaimplementowana. Jest.
- Instrukcja PL i EN pokazuje warstwę stref na zrzutach z aplikacji.
- Punktacja bez zmian.

## Karencja, którą opisałem i której nie było

Notatki wydania 1.7.30 i wiadomość commita obiecywały karencję przy zniknięciu
strefy z odczytu, żeby przełączenie planu dobowego PAŻP o 06:00 UTC nie wyglądało
jak zniesienie strefy i jej nowa aktywacja. Zostało to opisane i **nigdy nie
napisane** — pętla zgłaszała zniknięcie natychmiast.

Skutek byłby widoczny dziś rano: strefa, której zabrakło w jednym odczycie,
traciła swój wiek i wracała jako „nowa aktywacja”, czyli z żółtą bryłą 3D zamiast
spokojnego konturu. Trzydzieści stref naraz o ósmej rano wyglądałoby jak reakcja
na zagrożenie.

Teraz strefa nieobecna w odczycie zostaje na mapie i bez zdarzenia, dopóki nie
minie 20 minut, czyli cztery kolejne odczyty. Nieudane pobranie było bezpieczne
już wcześniej — kolektor wraca wtedy przed pętlą zdarzeń.

## Karta strefy: kontrast i ucięty nagłówek

Karta obiektu ma **białe tło**, a kolory warstwy stref są dobrane pod ciemną mapę.
Surowy amber `#ffb020` na bieli daje kontrast **1,83:1** — poniżej każdego progu
czytelności. Karty obiektów rozwiązują to od dawna przyciemnieniem koloru; karta
strefy tego nie robiła. Nagłówek używa teraz barw tekstowych (`#8a5a00`,
`#6f5b9e`) o kontraście ~5,7:1, a warunek jest ten sam co na mapie, więc kolor
karty zgadza się z kolorem konturu.

Druga rzecz: przyciski zwiń i zamknij leżą absolutnie w prawym górnym rogu, a
nazwa typu strefy wchodziła pod nie i się urywała („strefa czasowo wydzielona
(T…”). Nagłówek jest teraz blokiem z marginesem na przyciski i zawija się nad nimi.

Obie rzeczy złapane przy robieniu zrzutów do instrukcji na emulatorze — kolor
zmierzony na pikselu, nie oceniony okiem.

## Instrukcja

Rozdział o strefach dostał cztery zrzuty z aplikacji (mapa z warstwą i karta
strefy, po polsku i po angielsku) z podpisami tłumaczącymi, dlaczego „Rezerwacja
do” to koniec dobowej rezerwacji, a nie strefy.
