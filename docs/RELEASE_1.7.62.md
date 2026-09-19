# Strażnik 1.7.62 — historia bez dziur po tle

## Historia nie gubi godzin spędzonych w tle

Zgłoszone z telefonu: przewijanie historii przeskakiwało około 19:25, a potem nie było nic aż do 20:25 — dokładnie tyle, ile aplikacja spędziła w tle.

Historia 12 godzin to bufor w pamięci aplikacji: raz pobierana paczka z serwera plus dopisywanie z żywego połączenia. Zminimalizowana aplikacja **nic nie nagrywa** (system zamraża jej silnik), a po powrocie dopisuje migawkę z bieżącą godziną — bufor wygląda więc na świeży i dotychczasowe zabezpieczenie („najnowsza migawka starsza niż 5 minut") nigdy się nie uruchamiało.

- aplikacja pamięta teraz, że nagrywanie było przerwane, i przy wejściu w historię **dociąga brakujący okres** z serwera (270 kB po kompresji),
- powrót do aplikacji z otwartym paskiem historii uzupełnia oś i przerysowuje ją od razu.

Dane na serwerze były przez cały czas kompletne — 716 migawek bez przerwy dłuższej niż 2,5 minuty.

## Fałszywy alarm sąsiada

Litewski portal napisał 19 września o alarmie powietrznym **w stolicy Arabii Saudyjskiej**. Sprawdzanie zagranicznego miejsca obejmowało tylko incydenty, więc alarm zaliczył się jako litewski: Litwa zapaliła się na czerwono i dołożyła po 0,3 pkt trzem województwom.

Tytuł, który wymienia zagranicę i żadnego miejsca w danym kraju, nie liczy się już jako alarm tego kraju. Tytuł wymieniający jedno i drugie („Oro pavojus Vilniuje dėl smūgių Ukrainoje") liczy się dalej. Przy okazji doszły estońskie sformułowania, których brakowało — realny alarm opisany słowem „õhuhäire" mógł nam wcześniej umknąć.

## Dla wersji na iPhone'a

Teksty o zgodzie na alarm pełnoekranowy i ustawieniach Androida mają teraz wariant dla iOS, opisujący to, co zmierzono na urządzeniach. Na Androidzie nic się nie zmienia — te akapity są tam niewidoczne.
