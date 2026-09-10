# Strażnik 1.7.20 — uczciwe pozycje przybliżone

- Punkt oznaczony przez NEPTUN jako przybliżony jest opisany jako rejon
  zgłoszenia, a nie potwierdzona pozycja śledzonego obiektu.
- Dla takiego punktu aplikacja nie wykonuje sztucznego przesuwania znacznika,
  nie rysuje pozornej trasy i nie pokazuje czasu dolotu do granicy, województwa
  ani zapisanych miejsc.
- Przybliżona pozycja nie może uruchomić progowego alarmu ETA. Zwykła regionalna
  punktacja obserwacji pozostaje bez zmian.
- Zniknięcie znacznika nadal oznacza wyłącznie usunięcie wpisu przez źródło lub
  zastąpienie listy aktywnych obiektów; nie jest dowodem zestrzelenia lub rozbicia.
- Instrukcje polska i angielska opisują ograniczenie oraz znaczenie nowego
  identyfikatora w tym samym przybliżonym punkcie.

Nie wysłano alarmów testowych. Progresja 2,5 / 3,0 / 3,5 pozostaje wyłączona
produkcyjnie i nadal jest obserwowana offline.

Weryfikacja 10.09.2026: testy reguł pozycji przybliżonych, spójności silników
i instrukcji przeszły. Podpisany release (code 50) zbudowano poprawnie, podpis
v2/v3 potwierdzono i APK zainstalowano na Pixelu 7 / Android 14. Pierwsze
połączenie emulatora zgłosiło przejściowy błąd zaufania certyfikatu; zabezpieczeń
nie omijano. Po czystym restarcie mapa i sześć źródeł załadowały się prawidłowo.
Kartę sprawdzono dodatkowo odizolowanym replayem rzeczywistego wpisu
archiwalnego `trk_00178131`: test na wariancie release przeszedł w PL i EN,
potwierdzając brak trasy, ETA i czasu do zapisanych miejsc. Replay nie zapisywał
danych na VPS ani nie wysyłał powiadomień.

SHA-256 `Straznik.apk`:
`FB9127FE36F73FC18F11FC09CA7402F5C5237AD3E58F2CC57EB8904C05356A19`.
