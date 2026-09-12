# Strażnik 1.7.23 — nawigacja, która nie zasłania mapy

Wydanie w całości o interfejsie. Punktacja, źródła i powiadomienia działają tak samo
jak w 1.7.22; zmienia się to, gdzie są rzeczy i czy da się je przeczytać na telefonie
z trzema przyciskami nawigacji.

## Nowa nawigacja

Górny pasek miał osiem ikon, a najgłośniejszą z nich — pomarańczową — było „Postaw
kawę". Element wsparcia autora był wizualnie ważniejszy niż alarm. Teraz:

- **Dolne zakładki: Mapa / Sygnały / Historia / Więcej.** Cztery cele dotyku z
  podpisami, w zasięgu kciuka. Podpisy, a nie same ikony, bo bez nich każdy pasek
  zakładek trzeba zgadywać.
- **Górny pasek: legenda, 2D/3D, obce lotnictwo, powiadomienia, ustawienia.** Pięć
  ikon SVG zamiast emoji. Wsparcie autora zeszło do menu „Więcej" i do strony WWW.
- **Menu „Więcej":** O aplikacji i punktacja, instrukcja użytkownika, wsparcie autora.
- **Przyciski kadrowania mapy** mają czytelne ikony z podpisami („mój region",
  „cała PL") zamiast ⏱ ◎ ⤢, a każdy z nich ma teraz stały, przewidywalny widok
  docelowy — wcześniej oba dawały ten sam kadr i wyglądały jak martwe.

## Jeden dolny stos zamiast pięciu pływających ramek

Pasek historii, baner regionu, okno aktualizacji, atrybucja i pasek zastrzeżenia były
pozycjonowane osobno i potrafiły na siebie wejść. Teraz są jedną kolumną
(`#bottom-stack`): kolejność jest stała, odstępy równe, a zamknięcie jednego elementu
przesuwa resztę w dół. Panel sygnałów, karta obiektu, przyciski mapy, legenda i toast
odsuwają się o rzeczywistą wysokość tego stosu.

Atrybucja NEPTUN dostała ✕, które ją **zwija do plakietki**, a nie usuwa — widoczna
atrybucja jest warunkiem korzystania z API źródła.

## Nic nie wchodzi na przyciski Androida

Dolny pasek zakładek trzyma odstęp od systemowego paska nawigacji, żeby zakładek nie
mylić z przyciskami Androida. Okna dialogowe („O aplikacji", ustawienia, „Moje
miejsca") centrują się nad paskiem zakładek i nie mogą go dotknąć: wcześniej „O
aplikacji" kończyło się w połowie wiersza pod zakładkami, a „Moje miejsca" zajmowały
ekran od krawędzi do krawędzi.

## Karta obiektu: miniatura zamiast pół ekranu

Dotknięcie drona albo samolotu otwierało kartę na całą szerokość ekranu i zasłaniało
to, co się właśnie ogląda. Teraz karta ma **dwa rozmiary**:

- **Miniatura w rogu** (domyślnie) — mały kafelek nad dolnymi komunikatami, ze
  zmniejszonym zdjęciem. Mapa zostaje widoczna.
- **Karta rozwinięta** — strzałka rozwija ją do niemal całego ekranu, dokładnie tak
  jak wyglądała wcześniej. Druga strzałka zwija, ✕ zamyka. Wybór zostaje na urządzeniu.

**Zaznaczony obiekt ma na mapie biały pierścień.** Przy kilku dronach obok siebie nie
było wcześniej wiadomo, którego dotyczy otwarta karta.

## Tryb historii mówi, w jakim jesteś trybie

Sam napis „NA ŻYWO" nie mówił nic o tym, co się dzieje. Pasek nazywa teraz tryb wprost
(**⏱ TRYB HISTORII**), a przycisk mówi, co zrobi po dotknięciu (**▶ Wróć do podglądu na
żywo**). Suwak jest wyraźnie większy: 44 px pola dotyku i 28 px uchwytu, czyli
przewijalny kciukiem, nie paznokciem.

## Ustawienia w czterech zakładkach

Alarmy · Moje miejsca · Dźwięk · Aplikacja. Jedna długa lista zmieniła się w cztery
krótkie ekrany, a okno przewija się do końca zamiast ucinać treść.

## Sprawdzanie aktualizacji przy każdym uruchomieniu

Aplikacja nie pochodzi ze sklepu, więc sama musi powiedzieć, że wyszła nowsza wersja.
Do 1.7.22 sprawdzała raz na dobę — poprawka w narzędziu ostrzegawczym mogła więc czekać
na użytkownika prawie dobę. Teraz sprawdza **przy każdym uruchomieniu** i przy powrocie
aplikacji na wierzch (nie częściej niż co 30 minut, żeby przełączanie okien nie
odpytywało GitHuba bez końca).

## Drobne, ale widoczne

- Atrybucja źródeł to jeden wiersz z wielokropkiem, a nie trzy przycinane w połowie
  linii; dotknięcie otwiera „O aplikacji" z pełną listą źródeł. ✕ nadal ją zwija do
  plakietki, bo widoczna atrybucja NEPTUN jest warunkiem korzystania z API.
- Przyciski kadrowania mapy mają wysokość z treści — podpisy „mój region" i „cała PL"
  nie są już ucinane przez sztywny kafelek 42 × 42 px.
- Toast i karta obiektu odsuwają się o rzeczywistą wysokość dolnego paska zakładek.

## Języki i nazwy

- Nazwy ukraińskich obwodów w alertach są tłumaczone: „Alarm powietrzny w obwodzie
  rówieńskim" po polsku, „Air alert in Rivne oblast" po angielsku. Wcześniej tytuł
  pisany przez aplikację zostawał po ukraińsku niezależnie od języka interfejsu.
- Alerty UA mają w panelu własną etykietę **📢 ALARM UA**.
- Linki na dole ustawień („Instrukcja użytkownika", „Wesprzyj autora") tłumaczą się
  razem z resztą interfejsu i wyglądają jak reszta aplikacji, a nie jak surowy HTML.

## Zweryfikowane na urządzeniu

Wszystko powyżej sprawdzone na emulatorze Pixel 7 (Android 14) z **trzyprzyciskową**
nawigacją systemową — czyli w wariancie, w którym nakładanie się elementów boli
najbardziej. Zrzuty w instrukcji pochodzą z tego samego przebiegu.
