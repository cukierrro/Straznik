# Strażnik 1.7.41 — pewniejsze alarmy, głośność syreny i trasy obiektów

- Otwarta aplikacja alarmuje dla każdego obserwowanego województwa, nie tylko pierwszego miejsca; push przy otwartej aplikacji już nie przepada.
- Czerwona syrena gra w pętli do wyciszenia (przycisk na ekranie alarmu albo „Wycisz alarm” w powiadomieniu) i podnosi głośność „Alarmy” co najmniej do połowy.
- Opcja „Czerwony alarm zawsze na pełnej głośności” — domyślnie wyłączona, włączana świadomie w ⚙ → Dźwięk; poprzednia głośność wraca po wyciszeniu.
- Żółty sygnał uwagi szanuje tryb cichy i Nie przeszkadzać; powiadomienie opóźnione o ponad 10 minut przychodzi cicho z dopiskiem.
- Alarmy docierają po restarcie telefonu przed pierwszym odblokowaniem; subskrypcje województw są odnawiane i potwierdzane przy każdym starcie.
- Trasy obiektów na mapie (⚙ → Aplikacja): osobno dla dronów i rakiet oraz samolotów — wyłączone, przebyta trasa albo trasa i kierunek lotu.
- Natywne testy czerwonego i żółtego alarmu w ⚙ → Dźwięk; dzwonek w aplikacji otwiera stan powiadomień.
- Czytelniejszy alarm: „co zrobić”, najbliższy obiekt, a w powiadomieniu najpierw co i gdzie, osobno „Oficjalnie” i „Wskaźniki”.
- Wyraźniejsze granice państw na mapie i dioda RCB/RSO pokazująca stan Regionalnego Systemu Ostrzegania.

## Dlaczego

Przegląd drogi alarmu od serwera do telefonu pokazał kilka miejsc, w których alarm
mógł po cichu nie dotrzeć: push przy otwartej aplikacji był porzucany, subskrypcje
województw nie były potwierdzane, a po nocnym restarcie telefonu nic nie przychodziło
do odblokowania. Czytelnicy zgłosili też, że syrena bywa za cicha i że przydałyby się
trasy obiektów — oba pomysły są opcjami, domyślnie bez zmian w nocy.
