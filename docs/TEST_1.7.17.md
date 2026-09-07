# Weryfikacja 1.7.17 — 7 września 2026

## Odtworzenie błędu

Regresja przed poprawką zakończyła się błędem: zapis `152c29` (RA-76841,
SUM9125 w części obserwacji) z 17:54:18 pojawiał się w migawce 17:52:01.
Przyczyną było porównanie bezwzględnej różnicy czasu zamiast wymagania
wcześniejszej obserwacji. Panel 🛰 korzystał jednocześnie z danych na żywo.

## Sprawdzone zachowania

- Sekwencja 17:52 → 17:54 → 17:56 → 17:54 → 17:52: brak zdarzeń
  późniejszych niż wybrana chwila; przy 17:56 widoczna wcześniejsza ostatnia pozycja.
- Wygaśnięcie śladu po 150 sekundach, brak duplikatu maszyny obecnej w migawce,
  odrzucanie błędnych dat, scalanie dziennika serwera i lokalnego, tryb lokalny.
- Historia nie wybiera przyszłej migawki nawet przy nieuporządkowanej liście.
- Rzeczywisty podpisany APK: Pixel 7 / Android 14, osobny test
  `HistoryReleaseTest.historicalAircraftReplay`. Szczegóły nie pokazują podstawionych
  danych `LIVE-ONLY`; brak śledzenia bieżącej trasy w historii; anulowanie oczekującej
  klatki suwaka po powrocie na żywo; PL i EN. Test nie trafia do APK aplikacji.
- WWW: lokalny frontend podłączony do rzeczywistego backendu, 355 dostępnych
  migawek; przewijanie od najstarszej do najnowszej, zgodny czas panelu 🛰,
  powrót na żywo. Przy niewdrożonym nowym endpointcie prawidłowy komunikat
  niedostępnego dziennika i zachowane wpisy z pobranego pakietu historii.
- `test_adsb_history_ui.cjs`, `test_adsb_history_events.py`, `test_spojnosc.py`
  oraz 39 przypadków `test_textmatch.py` — pomyślne. Endpoint dziennika sprawdzony
  na tymczasowej bazie; nie zapisuje zdarzeń podczas odczytu.
- Podpis APK zgodny z poprzednim wydaniem (CN=cukierrro), versionCode 47,
  brak flagi debuggable. Nie zmieniano polityki TLS ani zgód alarmowych.

## Zakres i ograniczenia

Bez publicznych testów push, zmian punktacji i wpisywania testowych sygnałów
do bazy produkcyjnej. W czasie testów VPS nadal miał poprzednią wersję;
wdrożenie nowego `/api/adsb/watch` wymaga pull i restartu usługi.
Zrzuty instrukcji pochodzą z rzeczywistych danych po przeładowaniu APK,
nie z lokalnego scenariusza regresyjnego.
