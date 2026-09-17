# Strażnik 1.7.55 — przypomnienie o alarmie pełnoekranowym i stabilniejsze połączenie

## Alarm pełnoekranowy po aktualizacji

- Po każdej aktualizacji na **Androidzie 14 i nowszym** aplikacja raz pokazuje okno **„Alarm pełnoekranowy — sprawdź zgodę po aktualizacji”**.
- Android potrafi wyłączyć tę zgodę przy aktualizacji aplikacji spoza Sklepu Play. Bez niej **czerwony alarm nie zapali wygaszonego ekranu** — przyjdzie tylko zwykłe powiadomienie.
- Przycisk **„Sprawdź zgodę”** otwiera właściwy przełącznik w ustawieniach Androida.
- Dlaczego dopiero teraz: Android bywa optymistyczny i zgłasza zgodę jako włączoną, choć jest wyłączona, a pasek z ostrzeżeniem, raz zamknięty, już nie wracał. Po aktualizacji pasek znów się pokazuje.
- Okno działa od tej wersji, więc pierwszy raz zobaczysz je przy **następnej** aktualizacji. Po instalacji 1.7.55 sprawdź zgodę sam: ⚙ → Alarmy → „Sprawdź zgodę na alarm pełnoekranowy”.

## Stabilniejsze połączenie w sieciach, które je zrywają

- Niektóre sieci (np. firmowe) zrywają połączenie na żywo zaraz po jego nawiązaniu. Aplikacja i strona łączyły się wtedy od nowa co sekundę i za każdym razem pobierały stan mapy.
- Teraz po trzech krótkich połączeniach przechodzą na **pobieranie stanu co kilka sekund** i próbują połączenia na żywo co około 5 minut. Mapa dalej się odświeża, a serwer nie jest zasypywany zapytaniami.
