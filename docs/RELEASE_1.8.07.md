# Wydanie 1.8.07 — data potwierdzenia alarmów i mniejszy plik

versionCode 137, versionName 1.8.07. 7 listopada 2026. Wspólny numer dla Androida i iPhone'a.

<!-- zmiany -->
- Ustawienia pokazują, kiedy Firebase ostatnio potwierdził zapis telefonu do alarmów dla województw. Po aktualizacji systemu warto otworzyć Strażnika i sprawdzić, czy data jest dzisiejsza.
- Android: plik aplikacji jest o 14% mniejszy (15,1 zamiast 17,6 MB). Przy budowie usuwany jest nieużywany kod bibliotek.
<!-- /zmiany -->

## Data potwierdzenia zapisu

W <kbd>Menu</kbd> → <kbd>Ustawienia</kbd> → <kbd>Alarmy i zgody</kbd> wiersz stanu mówi teraz na przykład: „Zapisany do alarmów dla: podkarpackie (potwierdzone przez Firebase 7.11.2026, 10:05)”. Datę ma też wiersz „Telefon nie jest zapisany do żadnego województwa”.

Aplikacja zapisuje się do województw przy każdym otwarciu. Data zmienia się dopiero wtedy, gdy Firebase potwierdzi wszystkie tematy, więc stara data znaczy, że od tamtej chwili nie było udanego potwierdzenia. Powód zmiany: 3 listopada iPhone po aktualizacji iOS nie dostawał alarmów, a ekran pokazywał „potwierdzone przez Firebase” bez daty. Nie dało się z niego wyczytać, czy to potwierdzenie z tego dnia, czy sprzed tygodnia. Przyczyny tamtego zgłoszenia nie ustalono.

Android i iPhone zapisywały tę chwilę już wcześniej. Zmiana dotyczy tylko wyświetlania, więc starsza wersja bez tego pola pokazuje wiersz jak dotąd, bez daty.

Znane ograniczenie, starsze niż to wydanie: na Androidzie zaraz po zmianie miejsc wiersz potrafi pokazywać stan sprzed zmiany („nie jest zapisany” albo „Wypisywanie…”), dopóki aplikacja nie zostanie uruchomiona ponownie. Sam zapis w Firebase przebiega poprawnie. Poprawka w 1.8.08.

Uzupełnienie z 11.11.2026: naprawione w 1.8.08. Przy poprawce okazało się, że zdanie o zapisie było zbyt mocne — Firebase potrafi odłożyć operację do następnej synchronizacji; 1.8.08 wtedy ponawia zapis. Szczegóły w `docs/RELEASE_1.8.08.md`.

## Mniejszy plik na Androidzie

Wydanie przechodzi teraz przez R8, narzędzie Androida, które przy budowie usuwa nieużywany kod bibliotek i skraca nazwy. APK ma 15,1 MB zamiast 17,6 MB, a AAB dla Google Play 15,5 MB.

Kod Strażnika i mostek Capacitora zostają w całości. Sprawdzone na emulatorze Pixel 7 z Androidem 14, jako aktualizacja nad wydanym 1.8.06:

- dźwięki alarmu mają te same numery zasobów co w 1.8.06, więc kanał czerwonego nie traci syreny po aktualizacji;
- manifest, uprawnienia i podpis bez zmian;
- start, mapa, czerwony z pełnym ekranem po uśpieniu ekranu i syreną, „Wycisz”, żółty;
- wiadomość FCM przechodzi przez Firebase do alarmu, a Firebase wydaje token;
- aktualizator pobiera APK z GitHuba, sprawdza sumę SHA-256 i otwiera instalator.

Na prawdziwym telefonie tej wersji nie sprawdzano.

Do każdego wydania trzeba teraz zachować plik `mapping.txt` z tego samego buildu, bez niego stos błędu jest nieczytelny. Procedura odkłada go poza repozytorium.

## Narzędzia budowania

`rimraf` 6.1.4 ciągnie poprawione `glob` 14 i `minimatch` 11 (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249). Dotyczy tylko narzędzi budowania, nic z tego nie trafia do aplikacji.
