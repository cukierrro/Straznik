# Strażnik 1.7.40 — koniec i czas trwania alarmów w obwodach UA

- Koniec alarmu w obwodzie Ukrainy od razu zeruje jego punkty i gasi podświetlenie obwodu.
- Długi alarm liczy się dalej: pełna waga przez pierwsze 30 minut od prawdziwego początku, potem połowa, dopóki trwa.
- Panel pokazuje godzinę końca alarmu albo „trwa od …, połowa wagi”; karta obwodu — od kiedy trwa alarm.
- Okno Źródła w aplikacji pokazuje kanały Litwy, Łotwy i Estonii oraz ostatni alarm.

## Dlaczego

NEPTUN przy każdej zmianie wysyła pełną listę rejonów z trwającym alarmem i godziną
jego początku, ale Strażnik liczył tylko początek. 10-minutowy alarm we Lwowie dawał
lubelskiemu pełny punkt przez 30 minut i gasł dopiero po godzinie, a nocny alarm
trwający trzy godziny znikał z punktów i z mapy po godzinie, choć wciąż trwał.

Punkty liczy serwer, więc nowe zasady działają od razu u wszystkich; ta wersja
aplikacji pokazuje je w panelu i na mapie.
