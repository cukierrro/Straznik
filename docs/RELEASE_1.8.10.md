# Wydanie 1.8.10 — alarmy i mapa powiatów, rozpisany czas dolotu, pełna lista zapisanych miejsc

versionCode 140, versionName 1.8.10. Listopad 2026. Wspólny numer dla Androida i iPhone'a.

<!-- zmiany -->
- Alarmy przychodzą dla powiatu zapisanego miejsca zamiast dla całego województwa. Powiat miejsca z dokładną lokalizacją telefon ustala sam; dla pozostałych miejsc wybierz go w „Moich miejscach” w nowym polu „Powiat”. Bez tego telefon zostaje przy alarmach dla województw.
- Mapa pokazuje powiaty: kolor i wysokość to poziom powiatu, dotknięcie otwiera kartę powiatu. Ustawienia → Mapa → „Podział mapy” przełącza na województwa.
- Ustawienia → Moje miejsca wymieniają wszystkie zapisane miejsca z nazwami, także te bez alarmów.
- Karta drona lub rakiety rozpisuje, skąd wziął się czas dolotu: odległość, prędkość, niepewność meldunku i opóźnienie danych.
- Kurs z ruchu liczy się dopiero wtedy, gdy obiekt przesunie się dalej niż wynosi niepewność meldunku. Obiekt, który od kilkunastu minut nie zbliża się do granicy, ma dopisek „kurs niepewny”.
<!-- /zmiany -->

## Alarmy dla powiatów

Do tej pory telefon zapisywał się do alarmów dla całych województw. Alert z powiatu przy granicy budził więc także mieszkańców drugiego końca województwa. Od wydania 1.8.10 alarmy przychodzą dla powiatu zapisanego miejsca.

Serwer wysyła alarmy dla powiatów od 21 listopada 2026. Alarmy dla województw wysyła jak dotąd — dostają je starsze wersje aplikacji, strona internetowa i telefon z 1.8.10, któremu brakuje powiatu. Po aktualizacji telefon sam przepisuje się na powiaty, a wiersz stanu w <kbd>Alarmy i zgody</kbd> mówi wtedy „Zapisany do alarmów dla powiatów: …”.

Jak to działa:

- Powiat miejsca z dokładną lokalizacją liczy sam telefon, z granic powiatów zapisanych w aplikacji. Miejsce przy granicy powiatów obserwuje oba sąsiednie.
- Miejsce bez dokładnej lokalizacji (zakres „Województwo”, także przeniesione ze starszej wersji) albo z pozycją przybliżoną gorzej niż do 2 km dostaje powiat **wybrany ręcznie** w nowym polu <kbd>Powiat</kbd> w <kbd>Moich miejscach</kbd>. Lista obejmuje powiaty województwa miejsca; miasto na prawach powiatu jest oznaczone, np. „Lublin (miasto)” obok „powiat lubelski”. Dokładna lokalizacja ustala powiat sama i ma pierwszeństwo.
- Powiatu nie zgadujemy. Dopóki choć jedno miejsce z alarmami nie ma powiatu, cały telefon zostaje przy alarmach dla województw, a <kbd>Alarmy i zgody</kbd> mają przycisk <kbd>Wybierz powiat</kbd>.
- Telefon najpierw zapisuje się do powiatów, a z województw wypisuje dopiero po potwierdzeniu przez Firebase. W chwili przejścia nie ma przerwy ani podwójnych alarmów.
- Kilka miejsc w różnych powiatach to kilka wiadomości o tym samym zdarzeniu. Pierwsza dzwoni, kolejne tego samego poziomu w ciągu 10 minut dopisują się bez dźwięku. Wyższy poziom i ponowiony czerwony alarm dzwonią zawsze.
- Opis „Jak to działa” w <kbd>Moich miejscach</kbd> mówi o alercie dla powiatu tego miejsca. Gdy telefon słucha województw (brak powiatu, alarmy wyłączone), zostaje dotychczasowy tekst.
- Gdyby z alarmami dla powiatów coś poszło nie tak, serwer może jednym przełącznikiem wrócić do województw. Otwarta aplikacja sama przepisze się z powrotem, a telefon, który jeszcze tego nie zrobił (np. aplikacja zamknięta), dostaje w tym czasie alarm województwa na tematach swoich powiatów.

Lokalizacja nie wychodzi z telefonu. Do Firebase trafiają tylko numery powiatów (TERYT), tak jak dotąd nazwy województw. Powiat wybrany ręcznie zostaje na urządzeniu. Polityka prywatności opisuje to od tego wydania.

Zanim alarmy dla powiatów poszły do ludzi, model liczył się w tle od 18 listopada 2026, bez wysyłania powiadomień, a od 21 listopada przed wydaniem sprawdzaliśmy go na telefonie autora na prawdziwych alarmach. Odtworzenie nalotu z rana 20 listopada 2026 dało czerwony we wszystkich 42 powiatach, do których RCB wysłało tego ranka „znajdź bezpieczne miejsce”, bez opóźnienia względem województw.

## Mapa powiatów

Skoro alarm przychodzi dla powiatu, mapa województw przestała mówić to samo co telefon: całe województwo potrafiło świecić na czerwono, a alarm dotyczył jednego powiatu albo żadnego z Twoich. Od 1.8.10 mapa domyślnie pokazuje **powiaty**, w aplikacji i na stronie:

- Kolor i wysokość bryły to poziom i punkty powiatu — ten sam, z którego aplikacja wysyła alarmy. Cienkie linie to granice powiatów, grubsze — województw.
- Dotknięcie powiatu otwiera jego kartę: poziom i punkty, Twoje miejsca w tym powiecie, punktacja województwa i przycisk <kbd>Sygnały województwa</kbd>.
- W aplikacji z alarmami dla powiatów wiersz nad dolnym paskiem pokazuje powiat Twoich miejsc z najwyższym poziomem, a mapa obrysowuje Twoje powiaty.
- <kbd>Menu</kbd> → <kbd>Ustawienia</kbd> → <kbd>Mapa</kbd> → <kbd>Podział mapy</kbd> przełącza na <b>Województwa</b> — widok punktacji województw jak do wersji 1.8.09. Punkty województw są zawsze w panelu Sygnały.
- Historia koloruje powiaty z wybranej chwili: serwer zapisuje je w każdej migawce od 21 listopada 2026. Dla wcześniejszych chwil karta powiatu mówi, że zapisu nie ma.
- Bez połączenia z serwerem (tryb wbudowany) mapa pokazuje województwa — poziomy powiatów liczy tylko serwer.

Granice: Państwowy Rejestr Granic (GUGiK), stan z 10 listopada 2026, uproszczone do rysowania tak, żeby sąsiednie powiaty nie rozchodziły się na mapie (średnio ok. 0,8 km od prawdziwej granicy). Do ustalania powiatu miejsca telefon używa osobnych, dokładniejszych granic.

## Ustawienia → Moje miejsca: pełna lista

Zgłoszenie z Google Play z 17 listopada 2026: osiem zapisanych miejsc, a ustawienia „pokazują tylko region i 4 miejsca”. Wszystkie miejsca były zapisane. Wiersz „8/8 miejsc. Obserwowane województwa: …” wymieniał jednak województwa bez powtórzeń i tylko te z alarmami, więc wyglądał jak ucięta lista miejsc.

Teraz wiersz brzmi na przykład: „Zapisane miejsca: 8 z 8, w 5 województwach. Alarmy dla: lubelskie (Dom, Praca); … Bez alarmów: Działka.”

## Czas dolotu rozpisany na karcie

20 listopada 2026 rano karta rakiety 57,7 km od granicy, z okręgiem ±4 km i meldunkiem sprzed minuty, pisała „0–1 min”, a 57,7 km przy 800 km/h to 4,3 minuty. Wynik był poprawny, tylko nie dało się go sprawdzić. Teraz karta rozpisuje oba końce przedziału tymi samymi liczbami, z których powstał:

- **jeśli jest w miejscu meldunku**: odległość ÷ prędkość − opóźnienie danych (2,5 min);
- **najgorszy przypadek**: odległość pomniejszona o niepewność meldunku i o drogę przebytą od ostatniego potwierdzenia, ÷ prędkość − opóźnienie danych.

Przy rakietach, KAB i pociskach balistycznych karta dopisuje, że droga od potwierdzenia jest doliczona do czasu, a nie do okręgu na mapie. Czas do zapisanego miejsca ma rachunek w nawiasie. Same wyniki się nie zmieniły.

## Kurs z ruchu

Ta sama rakieta przez 50 minut nie zbliżała się do granicy (57,2 → 60,3 km), a co kilka minut dostawała „kurs z ruchu na Polskę”. Pozycja skakała o 2,6–3,4 km przy niepewności ±4 km i z tego szumu wychodził kurs.

- Kurs z ruchu liczy się dopiero po przesunięciu o więcej niż niepewność meldunku (najmniej 2 km, jak dotąd). Na serwerze działa to od 20 listopada 2026, teraz także w aplikacji: na karcie i w trybie bez serwera.
- Gdy ślad z ostatnich co najmniej 10 minut pokazuje zbliżenie o mniej niż 2 km, kurs z ruchu ma dopisek „niepewny”, a zamiast czerwonego „kurs na Polskę” jest bursztynowe „kurs niepewny — obiekt nie zbliża się do granicy”.
- Kurs podany przez źródło zostaje bez zmian.

Przeliczenie 21 października – 20 listopada 2026 na zapisanych migawkach: żadne powiadomienie nie zmieniłoby się z tego powodu.

## Na serwerze od 20 listopada 2026, także dla starszych wersji

- **Alert RCB z gov.pl.** 20 listopada 2026 o 6:30 i 6:34 RCB wysłało do powiatów lubelskiego i podkarpackiego Alert „Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce”. Oficjalny wykaz, z którego korzysta Strażnik, nie miał tych komunikatów, a artykułu na gov.pl serwer nie rozpoznał: miał nowy tytuł i był chwilowo niedostępny. Czerwony alarm i tak był, z meldunków o rakietach, ale informacja „znajdź bezpieczne miejsce” przepadła. Teraz serwer rozpoznaje też tytuł „zagrożenie atakiem z powietrza” i ponawia odczyt niedostępnego artykułu.
- **Rakiety daleko od województwa.** Tego samego ranka małopolskie i świętokrzyskie dostały wysoki priorytet od rakiet manewrujących nad obwodem lwowskim, ok. 190 km od tych województw, bez znanego kursu i bez Alertu RCB. Rakieta poza Polską, której kurs nie prowadzi na województwo, otwiera teraz czerwony tylko w województwach pierwszej linii: tych, do których ma najwyżej 60 km dalej niż do granicy Polski. Rakieta nad Polską albo z kursem na województwo — jak dotąd. Przeliczenie 2 sierpnia – 20 listopada 2026: zniknęły dwa czerwone alarmy, żaden nie przyszedł później.
- **Nadzorca serwera** nie restartuje usługi w pierwszych 5 minutach po starcie. W nocy 20 listopada, przy wolnym dysku po pracach u dostawcy serwera, restartował ją w trakcie uruchamiania.
