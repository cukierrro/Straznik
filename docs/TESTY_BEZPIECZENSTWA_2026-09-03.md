# Weryfikacja zabezpieczeń — 2026-09-03

Wydano 1.7.12/42. Starsze APK 1.7.11 nie zawiera poprawki.
Poniżej wyniki przed publikacją; informacje o wcześniejszych próbach mają
charakter historyczny, a nie listy nadal otwartych zadań.

## Potwierdzenie publikacji

- GitHub Release v1.7.12, APK i kopia w repozytorium opublikowane.
- Pobrany z publicznego wydania APK ma SHA-256
  `e9ab6c24a836a47605eb7178b47495aac4a4c6ca9ddb5f49a0f4c8b419a13884`.
- VPS: wdrożony commit 36982b3, usługi straznik i straznik-tunnel active;
  /api/health HTTP 200. Frontend podaje zasoby 1.7.12.
- /api/app-version: 1.7.12, critical=false, zgodna suma SHA-256.
- GitHub Pages: publikacja zakończona sukcesem, aktualna instrukcja dostępna.
- Pixel publishedUpdate: PASS (8,622 s), zachowane podlaskie; rzeczywiste
  metadane produkcyjne wyświetlono w banerze z symulowaną starszą wersją.
  „Później” ukrywa baner i zapisuje odłożenie w pamięci sesji, bez instalacji.
- Testowanie po publikacji nie wysyłało żadnych pushy.

## Weryfikacja finalnego APK 1.7.12

- assembleRelease i assembleReleaseAndroidTest: BUILD SUCCESSFUL.
- Aktualizacja na Pixelu przez install -r: Success, bez kasowania danych.
- Zgodny podpis autora; versionCode=42, versionName=1.7.12, brak debuggable.
- Sprawdzono zawartość APK: aktualny frontend i bezpieczna konfiguracja Capacitor.
- Na finalnym APK networkPolicy, recoveryOnDevice, nativeNotifications:
  OK (3 tests), 85,036 s. Region zachowany w teście odzyskiwania połączenia.
- Regresje Node (3 skrypty) i Python (6 skryptów, w tym 39 przypadków tekstowych): PASS.
- Wydanie zwykłe, bez markera critical-update. Brak nowych testów na telefonie fizycznym.

## Wyniki końcowej sesji instrumentalnej (aktualniejsze niż poniższe notatki)

Osobny APK androidTest (nie dołączany do aplikacji) testuje rzeczywiste wydanie
release; włączenie kompilacji: `-PsecurityTests assembleReleaseAndroidTest`.

- `networkPolicy`: PASS na Pixelu. Android odrzuca HTTP dla example.org,
  straznik.eu i sub.localhost, dopuszcza dokładnie localhost; HTTPS /api/health
  zwraca 200. Potwierdzone ponownie po przywróceniu buildu zabezpieczonego.
- `deviceToken`: PASS, pobrano token FCM emulatora bez publikowania go w raporcie.
- `recoveryOnDevice`: PASS. Rzeczywiste wyłączenie Wi-Fi/danych, uruchomienie
  connect(), potwierdzone standalone=true, przywrócenie sieci, następnie
  standalone=false i WebSocket OPEN; region zachowany. Trzy testy: 81,421 s.
- `nativeNotifications`: PASS. Żółty/czerwony mają poprawne kanały i treść TEST,
  czerwony ma fullScreenIntent, żółty go nie ma. Powiadomienia usunięte po teście.
  To test natywnych helperów, NIE transportu FCM ani faktycznego wybudzenia ekranu.
- `prepareUpdater`: bez zgody instalacji poprawna odmowa (pierwszy test oczekujący
  sukcesu wykazał tę odmowę); po tymczasowym nadaniu zgody PASS. Pobranie publicznego
  APK, kontrola SHA-256, ekran systemowego instalatora, skan Play Protect i jego
  zgoda, instalacja zakończona komunikatem „App installed.”, lastUpdateTime
  2026-09-03 17:02:06. Następnie przywrócono lokalny zabezpieczony APK przez adb -r
  oraz REQUEST_INSTALL_PACKAGES=default. Publiczne wydanie nie zostało zmienione.

Aktualizacja FCM: po uwierzytelnieniu SSH wysłano jeden czerwony push WYŁĄCZNIE
na token Pixela. FCM zwróciło identyfikator wiadomości, Android zarejestrował
powiadomienie 2002 na straznik-high-v3, a ekran pokazał baner TEST TYLKO PIXEL.
Przy USE_FULL_SCREEN_INTENT=deny nie pojawił się pełny ekran — poprawny fallback.
Powtórzony test natywny miał początkowo zbyt mocne założenie o zachowaniu
fullScreenIntent przy odmowie zgody i nie przeszedł; poprawiono tę asercję.
Po nadaniu zgody test natywny przeszedł. Oczekująca sesja SSH wygasła;
nowe połączenie pozwoliło zakończyć oba testy transportu FCM:
- czerwony: przed wysłaniem Pixel miał mWakefulness=Asleep; otrzymano ID FCM,
  rzeczywisty pełnoekranowy AlarmActivity i treść TEST TYLKO PIXEL, 4.5 pkt.
  Potwierdzenie zamknęło alarm. Dowód: test-out/fcm-high.png.
- żółty: aplikacja w tle, ekran włączony; otrzymano ID FCM i baner
  PODWYŻSZONA UWAGA / TEST TYLKO PIXEL. Kanał straznik-info-v3, importance=4,
  fullscreenIntent=null. Dowód: test-out/fcm-yellow.png.
- sprzątanie: nativeNotifications PASS (1,677 s), usuwa powiadomienie 2002;
  przywrócono UID USE_FULL_SCREEN_INTENT=deny i REQUEST_INSTALL_PACKAGES=default.
  Zamknięto SSH. Nie zmieniono backendu ani danych produkcyjnych.
Nie potwierdzono odsłuchem głośności syreny, żółtego przy wygaszonym ekranie ani
zachowania fizycznego telefonu. Poprawiona asercja dla odmowy pełnego ekranu
pozostaje w źródle testu; końcowy test przy zgodzie wykonano poprzednim test APK.
Nie wysłano żadnego alarmu na temat województwa.

## Potwierdzone

- Build assembleRelease zakończony sukcesem; podpis CN=cukierrro, SHA-256
  certyfikatu 1876b5403a0c263891145cce745a732d353b4096b3e9598821c96884b494c902.
- Skompilowane APK: wyłącznie systemowe CA, HTTP domyślnie zabroniony,
  wyjątek dokładnie localhost (bez subdomen), brak flagi debuggable.
- Pixel 7 / Android 14: instalacja -r na 1.7.10 bez kasowania danych;
  zachowane podlaskie w interfejsie i warstwie natywnej.
- Z Avast przechwytującym TLS: niezaufany łańcuch certyfikatu jest odrzucany.
  Z komputera certyfikat straznik.eu wystawia wówczas Avast Web/Mail Shield Root.
- Bez przechwytywania: wystawca Google Trust Services WE1; aplikacja pobiera
  dane, sześć wskaźników zielonych, historia działa, przeciągnięcie zmienia
  czas i obiekty, powrót na żywo działa. Brak pasujących błędów TLS/Uncaught/FATAL
  w sprawdzonych logach procesu. To test podstawowy, nie pomiar płynności.
- Testy lokalne: test_network_policy.cjs, test_backend_recovery.cjs,
  test_threat_photos.cjs, test_app_updates.py, test_neptun_track_dedup.py,
  test_filters_eta.py, test_baltic_sources.py, test_spojnosc.py,
  test_textmatch.py (39 przypadków) — zaliczone.
- Test recovery wykonuje funkcje frontendowe w izolowanym środowisku:
  cztery próby, start standalone, brak przełączenia podczas alarmu,
  zatrzymanie silnika przed wznowieniem połączenia. Nie jest to test sieciowy.

## Archiwalne notatki z wcześniejszych prób

### Dodatkowa sesja Pixela (16:17–16:23 UTC)

- Wyłączono Wi-Fi i dane wyłącznie emulatora, uruchomiono aplikację bez sieci:
  interfejs działa, czerwone wskaźniki. Po przywróceniu obu interfejsów wskaźniki
  wróciły do zielonych bez restartu aplikacji. Nie odróżniono jednoznacznie
  odzysku kolektorów standalone od powrotu na backend — pełny cykl nadal wymaga
  potwierdzenia diagnostycznego.
- Przycisk sprawdzania aktualizacji pobrał informację „Masz najnowszą wersję
  (1.7.11)”. Nie instalowano publicznego APK, bo cofnęłoby lokalną poprawkę.
- Wpisanie http://example.org i próba zapisu wywołały systemowy komunikat
  wymagający HTTPS (potwierdzone drzewem UI Automatora). Zmiany nie zapisano.
- Lokalny test pełnego alarmu wyświetlił czerwony ekran; potwierdzenie zamknęło
  ekran. Nie oceniano odsłuchu i nie był to push FCM. Znaleziono wadę danych
  podglądu: test używa aktualnego stanu, więc pokazał 0.0 pkt, bez oznaczenia TEST.
- SSH BatchMode do VPS odmówił uwierzytelnienia; release nie udostępnia tokenu
  FCM, a emulator nie pozwala na adb root. Nie wysłano żadnej wiadomości FCM.

### Ówczesna lista kryteriów (aktualne wyniki powyżej)

- Pełny cykl standalone → serwer na podpisanym APK, bez przechwytywania TLS.
- FCM end-to-end: push wyłącznie do tokenu urządzenia testowego, nigdy na
  produkcyjny temat województwa. Czerwony/żółty, blokada ekranu, zgody.
- Instalacja przez aktualizator aplikacji (test metadanych nie zastępuje jej).
- Próba zewnętrznego HTTP i walidacji własnego serwera w interfejsie urządzenia
  (obecnie potwierdzone kodem, testem JS i konfiguracją APK).
- Test fizycznego telefonu, w tym brak utraty ustawień.

Stary src/debug/.../TestReceiver.java odwołuje się do usuniętych MonitorService
i Sources. Nie użyto go; nie potwierdza odbioru FCM i wymaga aktualizacji przed
ponownym wykorzystaniem. Nie osłabiono zabezpieczeń ani nie wysłano alarmów.
