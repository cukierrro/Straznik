# Wydanie 1.7.95 — nowy wygląd, licznik dronów i rakiet, godziny ciszy

versionCode 124, versionName 1.7.95. 15 października 2026.

<!-- zmiany -->
- Nowy wygląd: pływający dolny pasek z GROTĄ, „Menu” zamiast „Więcej”, ustawienia w czterech sekcjach z kartą gotowości alarmu.
- Licznik dronów i rakiet w górnym pasku — dokładnie tyle, ile ikon na mapie. Dotknij, żeby zobaczyć, co liczymy i dlaczego liczba skacze.
- Historia: zwijany wykres dronów i rakiet z 12 godzin nad suwakiem.
- Godziny ciszy (Android): w wybranych godzinach żółty bez dźwięku, czerwony tylko wibracją.
- Aplikacja mówi w języku telefonu, dopóki nie wybierzesz innego.
- Większe pola dotyku, czytelniejszy drobny druk, lepsza obsługa czytnika ekranu i dużej czcionki systemowej.
<!-- /zmiany -->

## Nowy wygląd

Dolny pasek ma teraz pięć pozycji: **Mapa**, **Sygnały**, **GROTA** (tylko w aplikacji),
**Historia** i **Menu**. W Menu są ustawienia, powiadomienia, legenda, widok 3D, obce
maszyny, „O aplikacji i punktacja”, instrukcja i wsparcie autora. Ustawienia otwierają się
od karty gotowości — czy alarm do Ciebie dotrze — i mają cztery sekcje: **Alarmy i zgody**,
**Moje miejsca**, **Dźwięk i godziny ciszy** oraz **Język, tekst i wersja**. Okno
„O aplikacji” jest arkuszem z rozwijanymi rozdziałami, a przy pierwszym uruchomieniu
przycisk „Rozumiem, zaczynajmy” jest od razu widoczny, bez przewijania. Atrybucja mapy
otwiera się z przycisku (i). Karta obiektu jest ciemna jak reszta aplikacji.

## Licznik dronów i rakiet

Obok diod źródeł jest licznik: drony (w tym Shahedy i drony rozpoznawcze) oraz rakiety
(manewrujące, balistyczne i bomby KAB — w oknie osobno „w tym N KAB”). Bez FPV, MiG-31K
i obiektów nieokreślonych. Liczy dokładnie to, co jest na mapie. Liczba potrafi spaść
nagle o połowę: źródło usuwa obiekty po kilku minutach bez potwierdzenia, całymi paczkami
— spadek nie musi oznaczać końca ataku. Licznik nie jest ostrzeżeniem dla województwa;
o tym mówi punktacja i powiadomienia. W historii ten sam licznik pokazuje chwilę z suwaka.

## Historia: wykres 12 godzin

Nad suwakiem jest wykres liczby dronów (średnia z 30 minut na tle surowych słupków)
i kropki rakiet. Domyślnie zwinięty do jednego wiersza; dotknięcie wykresu przewija suwak.
Nagłówek historii jest prostszy: „NA ŻYWO” i „×1” w jednej linii.

## Godziny ciszy (Android)

Prośba czytelnika po nocnej pobudce: w dzień słyszeć, w nocy wystarczy wibracja — bez
przełączania co wieczór. W Menu → Ustawienia → Dźwięk i godziny ciszy wybierasz godziny
(domyślnie 22:00–7:00). W tym czasie żółty przychodzi bez dźwięku (baner i wibracja),
a czerwony — do wyboru — tylko wibracją (pełny ekran i mocna wibracja zostają) albo bez
zmian. Godziny ciszy nigdy nie robią alarmu głośniejszym. Działa przy otwartej i zamkniętej
aplikacji. Na iPhonie godzin ciszy nie ma — dźwięk powiadomienia ustala tam serwer.

## Język

Aplikacja bez wybranego języka mówi w języku telefonu: polski → polski, ukraiński →
ukraiński, każdy inny → angielski. Tak samo wybiera GROTA, więc nie zdarzy się już
polski Strażnik z angielską GROTĄ. Strona WWW zostaje domyślnie po polsku. Prawdziwe
alarmy nadal przychodzą po polsku.

## GROTA

- W poziomie i na tablecie dolne zakładki są widoczne (z TERAZ nie dało się wyjść).
- Gdy punkty się nie wczytają, jest komunikat i „Spróbuj ponownie” zamiast
  „Wczytuję punkty…” bez końca.
- Pytania i komunikaty są kartami w panelu, a nie oknami systemowymi — okno systemowe
  blokowało całą aplikację, także ekran alarmu.
- Czytnik ekranu nie czyta całego panelu po każdym filtrze; fokus wchodzi do modułu
  i wraca po zamknięciu; obrys fokusu działa.
- Pasek filtrów nie pokazuje już „0 pkt” przy zapisanym filtrze.

## Dostępność i czytelność

Pola dotyku co najmniej 44 px (krzyżyki, diody, przyciski historii), najmniejszy druk
większy, kontrasty poprawione. Okna mają nazwy dla czytnika, krzyżyki mówią „Zamknij”.
Przy dużej czcionce systemowej (200%) podpisy dolnego paska i wiersze ustawień się
mieszczą. Przy alarmie otwarte okna i karta obiektu się zamykają, żeby ekran alarmu
był na wierzchu.

## iPhone

- Notka przy głośności żółtego mówiła, że wyłączenie „Dźwięków” w ustawieniach iPhone'a
  wycisza też czerwony alarm. Pomiar na telefonie testera pokazał, że nie: czerwony
  z alarmem krytycznym gra dalej. Teraz notka mówi, że ciszę także przy czerwonym daje
  dopiero wyłączenie „Alertów krytycznych”.
- Rozmyte tło pasków działa także na iOS 16 i 17.

## Czego nie sprawdziliśmy

Godzin ciszy nocą na prawdziwym alarmie i na fizycznym telefonie (sprawdzone kanałami
powiadomień na emulatorze Pixel 7), TalkBacka na alarmie pełnoekranowym, nowego wyglądu
na iPhonie z iOS 16–17 (sprawdzi sesja iOS przed zgłoszeniem do App Store).
