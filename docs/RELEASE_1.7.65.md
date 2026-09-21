# Strażnik 1.7.65 — pasek u góry nie wchodzi pod zegar

- Na części nowych telefonów z Androidem (np. POCO F9 Ultra) górny pasek Strażnika wchodził pod zegar i ikony powiadomień. Naprawione — na pozostałych telefonach nic się nie zmienia.
- Jeśli telefon nie pozwala rysować map, zamiast pustego ekranu zobaczysz wyjaśnienie i co zrobić. Alarmy, sygnały i historia działają także bez mapy.
- Strażnik jest też w App Store — tekst „O aplikacji” mówi o obu aplikacjach.

## Co było nie tak

Android 15 i nowsze rysują aplikację pod paskiem stanu, a aplikacja sama ma zostawić na niego miejsce. Na części telefonów przeglądarka wbudowana w system podawała wysokość tego paska jako zero, więc pasek Strażnika z ikonami wchodził pod zegar. Teraz aplikacja bierze tę wysokość także z własnego pomiaru i wybiera większą wartość.

## Pusta mapa

Mapa rysuje się przez WebGL. Gdy system go blokuje (na iPhonie zwykle Tryb blokady, na Androidzie wyłączone przyspieszenie sprzętowe), mapa była po prostu pusta, choć wszystko inne działało. Teraz w jej miejscu jest wyjaśnienie z instrukcją.
