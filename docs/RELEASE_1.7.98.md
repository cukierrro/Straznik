# Wydanie 1.7.98 — przyciski powrotu na górze każdego okna

versionCode 127, versionName 1.7.98. 18 października 2026.

<!-- zmiany -->
- Każde okno otwarte z Menu ma na górze przycisk „‹ Menu”: Ustawienia, O aplikacji, Obce maszyny i Legenda.
- Sekcje Ustawień i Moje miejsca mają na górze „‹ Ustawienia”.
- Po Powiadomieniach i Moich miejscach da się wrócić aż do Menu.
- Na wąskim ekranie strony WWW licznik dronów nie zasłania już legendy.
<!-- /zmiany -->

## Przyciski powrotu

Zgłoszenie użytkownika po 1.7.97: przycisk powrotu był tylko w części okien,
a na starcie Ustawień stał na dole, pod listą sekcji. Przeklikaliśmy wszystkie okna
otwierane z Menu w trzech językach. Teraz:

- **Ustawienia** otwarte z Menu: „‹ Menu” na górze, w rzędzie z „Zamknij” — tam,
  gdzie w sekcjach stoi „‹ Ustawienia”.
- **O aplikacji, Obce maszyny, Legenda** otwarte z Menu: „‹ Menu” na górze. Otwarte
  z innego miejsca (powitanie, skrót) — bez tego przycisku.
- **Powiadomienia** z Menu otwierają sekcję „Alarmy i zgody”; „‹ Ustawienia” prowadzi
  do startu Ustawień, a stamtąd „‹ Menu” do Menu (wcześniej ta droga się urywała).
- **Moje miejsca**: na górze „‹ Ustawienia”, który wraca do sekcji Moje miejsca.
  Ustawienia zachowują wtedy „‹ Menu”.
- Przy dużym tekście, gdy przycisk nie mieści się obok „Zamknij”, stoi tuż pod nim.

Stały test responsywności przechodzi te ścieżki w PL/EN/UK, na ekranach 320–411 px
i przy dużym tekście: sprawdza, że przycisk jest na górze, ma etykietę w języku
interfejsu i naprawdę wraca.

## Legenda na stronie WWW

Na wąskim ekranie strony licznik dronów stoi obok (i), na wysokości góry legendy,
i zasłaniał jej nagłówek. Legenda zaczyna się teraz pod licznikiem. W aplikacji
tego problemu nie było.

## Czego nie sprawdziliśmy

Przycisków na iPhonie (ten sam kod strony; sprawdzone na Androidzie i w przeglądarce).
