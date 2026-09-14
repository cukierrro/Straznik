# Strażnik 1.7.48 — dokładniejsza granica, uczciwy czas dolotu i tryb awaryjny

- **Granica Polski:** odległość obiektu liczona do rzeczywistego konturu kraju, razem z wybrzeżem. Obiekt nad Polską ma „nad Polską”, rakieta z Kaliningradu w stronę Gdańska jest wreszcie liczona. Kurs porównujemy z całym krajem, a nie z najbliższym punktem granicy.
- **Kurs domniemany:** gdy NEPTUN podaje kurs „kursem na X” jako domniemany, obiekt dostaje punkty jak dotąd, ale nie uruchamia alarmu czasu dolotu, dopóki jego ruch tego nie potwierdzi.
- **Drony odrzutowe (Geran-3):** czas dolotu przy 450 km/h albo przy zmierzonej prędkości, jeśli jest większa; w karcie przedział 350–600 km/h.
- **Czas dolotu:** w karcie przedział uwzględniający niepewność pozycji i wiek danych; na liście sygnałów czas maleje z wiekiem sygnału i znika po 15 minutach.
- **Mapa:** znaczniki przesuwają się tylko przy zmierzonym ruchu; pozycje przybliżone mają okrąg co najmniej 12 km (rakiety 25 km); trasa nie urywa się, gdy NEPTUN zmieni identyfikator obiektu.
- **Historia:** uwzględnia przeniesienia od sąsiednich województw, tak jak widok na żywo.
- **Tryb awaryjny:** stały znacznik, że bez serwera alarmy nie przyjdą przy zamkniętej aplikacji; ustawienia mówią o tym wprost.
- **O aplikacji:** lista tego, czego system nie widzi — rakiety balistyczne, kierunek białoruski, Kaliningrad i Bałtyk, nisko lecące pociski.
