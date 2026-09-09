# Strażnik 1.7.19 — Moje miejsca i pełniejsze zdjęcia

- „Moje miejsca” przechowują lokalnie do 8 profili; stare województwo jest
  bezpiecznie przenoszone do profilu „Dom”.
- Każde miejsce może obserwować alerty swojego województwa. Powtarzające się
  województwa tworzą jedną subskrypcję powiadomień.
- Opcjonalny GPS jest odczytywany wyłącznie na żądanie i zapisywany na
  urządzeniu. Nazwy miejsc ani współrzędne nie są wysyłane na VPS lub do FCM.
- Powiadomienie przy zamkniętej aplikacji pozostaje wojewódzkie. Po otwarciu
  aplikacji na pierwszym planie dokładny punkt pokazuje lokalną odległość, a
  orientacyjne ETA tylko przy znanym kursie i rzeczywiście wyznaczonej prędkości.
- Karty samolotów bez opisu dostawcy mogą użyć zweryfikowanego przykładu dla
  znanego kodu modelu. Sprzeczny opis nadal blokuje fotografię. Dodano B738.

Weryfikacja 09.09.2026: 18 testów JavaScript PASS, pełny podpisany release
(code 49) zbudowany poprawnie, podpis v2/v3 potwierdzony. APK zainstalowano na
Pixelu 7 / Android 14; migracja profilu, PL/EN, jednorazowy GPS i automatyczny
wybór województwa przeszły test. Zrzuty PL/EN 1080 × 2400 wykonano z finalnego
APK. Nie wysłano alarmów testowych i niczego nie opublikowano.

SHA-256 `Straznik.apk`:
`9D2525F8D06D0F5966EFAC51F3678287CA69380A5F71FA2F278634C27BB3BEEB`.
