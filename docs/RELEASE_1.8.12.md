# Wydanie 1.8.12 — panel Sygnały z powiatami

versionCode 143, versionName 1.8.12. 22 listopada 2026. Wspólny numer dla Androida i iPhone'a.

<!-- zmiany -->
- Panel Sygnały ma dwie strony: Powiaty i Województwa. Przełączasz je zakładką, strzałką albo przesunięciem palca w bok.
- Strona Powiaty: Twoje powiaty z poziomem i punktami, pod nimi pozostałe powiaty z alarmem zgrupowane po województwach. Dotknięcie powiatu pokazuje, które sygnały dają mu punkty.
- Na szerokim ekranie obie strony stoją obok siebie.
<!-- /zmiany -->

## Panel Sygnały: powiaty i województwa

Od 1.8.10 alarmy przychodzą dla powiatu, a mapa pokazuje powiaty, ale panel Sygnały pokazywał tylko karty województw. Przy nalocie trzeba było przewijać długą listę, a punktów własnego powiatu nie dało się nigdzie zobaczyć razem z tym, skąd się wzięły.

Od 1.8.12 panel ma dwie strony:

- **Powiaty** — na górze Twoje powiaty (powiaty zapisanych miejsc z alarmami, w kolejności miejsc) z poziomem i punktami powiatu. Pod nimi pozostałe powiaty z alarmem, zgrupowane po województwach, z liczbą czerwonych i żółtych; grupę rozwija się dotknięciem.
- **Województwa** — karty województw jak dotąd.

Stronę zmienia się zakładką u góry, strzałką obok niej albo przesunięciem palca w bok. Panel otwiera się na stronie zgodnej z podziałem mapy (Ustawienia → Mapa → Podział mapy) i zapamiętuje ostatni wybór. Na szerokim ekranie (od ok. 1100 px) obie strony stoją obok siebie, a przyciski mapy odsuwają się, żeby nie wchodzić pod panel.

Dotknięcie powiatu pokazuje, które sygnały dają mu punkty, od najmocniejszego — np. „6× Dron / BpSP ok. 82 km od powiatu, dolot ok. 24 min +1,8” — i przycisk do sygnałów jego województwa. Serwer liczy to rozbicie razem z poziomami powiatów i podaje je osobno: telefon pobiera je dopiero po rozwinięciu powiatu. W stałej paczce stanu rozbicie podwoiłoby ją przy nalocie (odtworzenie 20 listopada, godz. 05:35: z 9,8 do 19,5 KB po kompresji), a pobierają ją wszyscy co kilka sekund.

Rozbicie jest tylko na żywo. W historii strona Powiaty pokazuje powiaty z wybranej chwili (zapisywane od 21 listopada 2026), a sygnały — strona województw. Na stronie internetowej, gdzie nie ma zapisanych miejsc, strona zaczyna się od powiatów z alarmem. Bez połączenia z serwerem (tryb wbudowany) panel pokazuje same województwa, bo poziomy powiatów liczy tylko serwer.

Przesunięcie palcem obsługuje aplikacja, a nie przeglądarka: w testach na emulatorze natywne przewijanie w bok łapało tylko wolny ruch. Ruch w pionie przewija listę i strony nie zmienia. Zakładki mają pole dotyku 44 px i obsługę strzałkami klawiatury, a niewidoczna strona nie przeszkadza czytnikowi ekranu.

## Serwer

Część stanu z rozbiciem punktów powiatów działa na serwerze od 22 listopada 2026 (18:51). Starsze wersje aplikacji jej nie pobierają, a pełna paczka stanu, z której korzystają, się nie zmieniła.
