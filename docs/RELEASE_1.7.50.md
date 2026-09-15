# Strażnik 1.7.50 — suwak „Alarmy na tym telefonie” z potwierdzeniem

- **Naprawiony błąd:** wyłączenie alarmów ginęło, gdy Android zamknął aplikację (zamknięcie z listy ostatnich, aktualizacja, brak pamięci) — po ponownym uruchomieniu telefon zapisywał się z powrotem do województwa. Ustawienie jest teraz trwale zapisane w telefonie.
- Zamiast pola „Nie chcę alarmów na tym telefonie” jest suwak **„Alarmy na tym telefonie”** (⚙ → Alarmy), jak w ustawieniach Androida.
- Po wyłączeniu telefon wypisuje się ze **wszystkich** województw (także z tematów zapisanych przez starsze wersje). Status nad suwakiem pokazuje, do których województw telefon jest zapisany, z potwierdzeniem z Firebase — widać, że wyłączenie naprawdę zadziałało.
- Nawet jeśli alarm dotrze, zanim wypisanie zostanie potwierdzone, telefon go nie pokaże.
- Przy wyłączonych alarmach przyciski testu dźwięku i alarmu nie odtwarzają już alarmu, tylko informują, jak włączyć alarmy.
- Zgody na powiadomienia w ustawieniach Androida zostają bez zmian — aplikacja nie może ich zmienić.
- Suwakiem jest też opcja „Czerwony alarm zawsze na pełnej głośności”.
