# Strażnik 1.7.51 — starsze telefony, duża czcionka i komunikat MiG-31K jak w NEPTUN-ie

- **MiG-31K:** komunikat brzmi jak w NEPTUN-ie — „Start MiG-31K — monitoring, nie alarm”, gdy Ukraina nie ogłosiła alarmu dla całego kraju. Wcześniej aplikacja zawsze pisała „alarm w całej Ukrainie”.
- **Starsze telefony (np. Galaxy S10 bez aktualizacji WebView):** okno „Moje miejsca” i inne okna znów się przewijają, a przyciski Zapisz i Anuluj są widoczne.
- **Duża czcionka i małe ekrany:** zakładki ustawień nie są ucinane, przyciski mapy nie wchodzą na górny pasek (w razie potrzeby zostają same ikony), panel sygnałów zaczyna się pod paskiem.
- **Starsze Androidy:** strefy PAŻP i dziennik obcych maszyn ładują się poprawnie. Gdy silnik przeglądarki jest zbyt stary, zamiast pustego ekranu pojawia się instrukcja, co zaktualizować (Android System WebView / Chrome).
- **Przeglądarka:** obiekty nie przeskakują już między starym a aktualnym położeniem — stan z serwera nie jest brany z pamięci przeglądarki.
- **Ustawienia:** gdy nie wybrano jeszcze województwa do alarmów, aplikacja mówi to wprost. Mapa dopasowuje się do zmiany rozmiaru ekranu w trakcie uruchamiania (tablety, podzielony ekran).

Sprawdzone na emulatorach: Android 14 (telefon, tablet, czcionka 130%), Android 12 z fabrycznym WebView 91 (360×640, czcionka 130%), Android 9 z WebView 69.
