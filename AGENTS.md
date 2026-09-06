# Stałe zasady projektu Strażnik

## Instrukcja jest częścią wydania

Ustalenie z użytkownikiem: każde wydanie z istotną zmianą funkcji, zachowania
lub wyglądu aplikacji wymaga aktualizacji instrukcji. Nie uznawaj takiego
release za zakończony, jeśli dokumentacja nadal opisuje poprzedni interfejs.

Przy takim wydaniu:

1. Porównaj zmiany z instrukcją polską (`docs/index.html`) i angielską
   (`docs/en.html`). Aktualizuj obie wersje równolegle: działanie funkcji,
   nazwy przycisków, ograniczenia, progi i wymagane zgody zgodnie z kodem.
2. Odśwież zrzuty wszystkich ekranów dotkniętych zmianą. Wykonuj prawdziwe
   zrzuty aktualnego APK na emulatorze Pixel 7; dla zachowań zależnych od
   urządzenia, np. alarmów, użyj odpowiednio zweryfikowanego urządzenia.
   Nie retuszuj interfejsu ani nie przedstawiaj makiety jako działającej apki.
3. Zachowaj przyjęty projekt instrukcji: ciemny responsywny układ, przełącznik
   PL/EN, lekko odchylone trójwymiarowe ramki telefonów z `docs/guide.css`.
   W ramce umieszczaj niezmieniony zrzut; kliknięcie ma otwierać oryginał
   w pełnej rozdzielczości. Nie zastępuj tego stylu bez uzgodnienia.
4. Aktualizuj podpisy, teksty alternatywne, numer wersji oraz rzeczywiste daty
   wykonania zrzutów. Instrukcja angielska powinna używać angielskiego UI;
   zachowane etykiety źródłowe lub nieprzetłumaczone opisz uczciwie.
5. Uzgodnij README i opis wydania z dokumentacją. Zachowaj działające linki
   i kotwice; pobieranie APK powinno prowadzić do najnowszego wydania.
6. Uruchom `scripts/test_guide.py` (Python + Pillow), dostosowując test do
   świadomych zmian zestawu ekranów. Sprawdź wizualnie PL/EN na komputerze
   i w wąskim widoku mobilnym: czytelność, ramki, brak poziomego przepełnienia,
   przełączanie języków i otwieranie zdjęć.
7. W ramach zatwierdzonej publikacji dołącz dokumentację do wydania i sprawdź
   jej publikację na GitHub Pages. W podsumowaniu podaj linki PL i EN.
   Jeśli czegoś nie udało się zweryfikować, wyraźnie zaznacz brak.

Przy poprawkach niewidocznych dla użytkownika oceń wpływ na opisy; nie wymieniaj
bez potrzeby niezmienionych zrzutów. Procedura zrzutów: `docs/screens/README.md`.
Ta zasada nie upoważnia do wysyłania testowych alarmów do użytkowników ani do
zmniejszania zabezpieczeń aplikacji lub systemu.
