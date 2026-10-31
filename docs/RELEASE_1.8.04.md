# Wydanie 1.8.04 — aktualizacja przez Google Play i mocniejsza ochrona aplikacji

versionCode 134, versionName 1.8.04. 31 października 2026.

<!-- zmiany -->
- Na telefonie z Google Play aktualizacja wersji z pliku APK prowadzi do sklepu, gdy nowa wersja jest już w Google Play — bez ostrzeżeń Play Protect.
- Przed pobraniem aktualizacji aplikacja sprawdza wolne miejsce i mówi, ile trzeba zwolnić.
- Okno aktualizacji nie zasłania już innych okien.
- W poziomie treść i okna nie wchodzą pod wycięcie aparatu ani pod krawędź ekranu.
- Aplikacja uruchamia wyłącznie własne skrypty (polityka bezpieczeństwa treści).
<!-- /zmiany -->

## Aktualizacja przez Google Play

Strażnik z GitHuba (plik APK) aktualizował się do tej pory sam: pobierał nowy plik
i przekazywał go Androidowi. Na telefonach z Google Play taka instalacja bywa
zatrzymywana przez Play Protect — 26 października plik 1.8.01 dostał czerwone
ostrzeżenie „szkodliwa aplikacja”, choć był podpisany tym samym kluczem co wcześniej.

Wersja z Google Play i wersja z GitHuba są podpisane tym samym kluczem (sprawdzone
w konsoli Google Play 31 października), więc sklep może zaktualizować aplikację
zainstalowaną z pliku, bez odinstalowania i bez utraty ustawień.

Od tej wersji, na telefonie ze Sklepem Google Play:

- gdy nowe wydanie jest już zatwierdzone w Google Play, okno aktualizacji ma przycisk
  **Otwórz Google Play**; w sklepie wystarczy dotknąć „Aktualizuj”. Pod spodem zostaje
  **Zainstaluj z pliku zamiast tego**;
- dopóki nowe wydanie nie jest zatwierdzone w Google Play, okno się nie pokazuje (sklep
  i tak nie miałby czego zaktualizować). Przycisk **⬆ Sprawdź aktualizacje** w ustawieniach
  mówi wtedy, że wersja wkrótce będzie w sklepie, i pozwala zainstalować ją z pliku;
- wydanie oznaczone jako pilne pokazuje się od razu, z instalacją z pliku.

Gdy okno proponuje instalację z pliku na telefonie z Google Play, uprzedza, że Play
Protect może pokazać ostrzeżenie, i że pewniejsza jest aktualizacja w sklepie.

Telefony bez Sklepu Google Play (np. Huawei) aktualizują się z pliku jak dotąd.
Wersja zainstalowana z Google Play nadal nie ma aktualizatora — aktualizuje ją sklep.

Przejście z 1.8.03 na 1.8.04 idzie jeszcze starym sposobem (z pliku): nowe zachowanie
działa od następnej aktualizacji po 1.8.04.

## Miejsce na telefonie

Gdy pamięć telefonu była prawie pełna, Android potrafił usunąć pobierany plik
w trakcie, a instalator zgłaszał „to nie jest poprawny plik APK”. Teraz:

- aplikacja przed pobraniem sprawdza wolne miejsce i, gdy go brakuje, pisze
  „Za mało miejsca na telefonie. Zwolnij około … MB”;
- plik aktualizacji leży w pamięci aplikacji, a nie w pamięci podręcznej, którą Android
  czyści przy braku miejsca.

## Okno aktualizacji pod innymi oknami

Okno „Dostępna wersja” wychodziło ponad otwarte okna — powitanie czy ustawienia.
Teraz chowa się, gdy jest otwarte inne okno, i wraca po jego zamknięciu.

## Boczne marginesy

W poziomie na telefonach z wycięciem aparatu (i na iPhonie z wyspą) pasek tytułu,
przyciski mapy, karty, dolny pasek oraz okna z przyciskiem „Zamknij ✕” odsuwają się
od wycięcia. W pionie wygląd się nie zmienia. Strona straznik.eu działa tak od
31 października.

## Polityka bezpieczeństwa treści (CSP)

Strona straznik.eu od września wysyła przeglądarce politykę bezpieczeństwa treści
(Content Security Policy): listę, skąd wolno wczytywać skrypty. Aplikacja wczytuje
stronę z pliku w telefonie i tej polityki nie dostawała. Od 1.8.04 ma ją także:

- uruchamia wyłącznie skrypty z własnych plików — skrypt wstrzyknięty w treść
  (np. przez spreparowany wpis ze źródła danych) nie wykona się;
- nie wykonuje kodu z tekstu (`eval`); sprawdzenie, czy przeglądarka w telefonie jest
  dość nowa, działa teraz bez tego.

Sprawdzone na emulatorze Pixel 7 (Android 14) i na symulatorze iPhone'a: start, mapa,
GROTA i połączenie z częścią natywną aplikacji (stan powiadomień) działają bez naruszeń
polityki.

## Drobne

- Na stronie: gdy zdjęcie typu obiektu w karcie się nie wczyta, ramka znika zamiast
  zostawiać pusty prostokąt (od września polityka strony blokowała dotychczasowy sposób).
