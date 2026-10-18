# Wydanie 1.7.97 — układ na małych ekranach, mapa nad panelem, dron przy granicy

versionCode 126, versionName 1.7.97. 18 października 2026.

<!-- zmiany -->
- Okna, karty i tekst mieszczą się na małych ekranach i przy dużej czcionce.
- Mapa przesuwa się nad otwarty dolny panel, a karta obiektu nie wychodzi za ekran.
- Historia: karty województw zwijają się jak na żywo, przyciski mają podpisy.
- Ustawienia mają przycisk „‹ Menu”.
- Dron do 30 km od granicy województwa daje co najmniej żółty.
- Tryb bez serwera liczy każde województwo w zasięgu, jak serwer.
<!-- /zmiany -->

## Układ na małych ekranach i przy dużej czcionce

Zgłoszenia wracały pojedynczo: karta obiektu nad ekranem bez przycisku zamknięcia,
tytuł wykresu łamany w słupek, godzina historii za krawędzią, okno zgody ściśnięte
do wąskiej kolumny. Przejrzeliśmy aplikację na emulatorze Pixel 7 przy szerokości
320, 360 i 411 dp, czcionce systemowej 100–200 % i w trzech językach i poprawiliśmy
wszystko, co wychodziło poza ekran albo ramkę:

- karta obiektu ma wysokość liczoną od dolnego panelu i zawsze widoczny „✕”;
- nagłówek wykresu 12 godzin, pasek historii i podpisy zakładek zwężają się
  na wąskim ekranie zamiast wychodzić za krawędź;
- okna zgody i „O aplikacji” układają się w pełnej szerokości;
- przyciski mapy przy dużej czcionce przechodzą w wersję kompaktową.

Ten sam przegląd jest teraz stałym testem (`scripts/test_responsywnosc.cjs`):
16 widoków, 7 zestawów szerokości, języków i wielkości tekstu.

## Mapa nad dolnym panelem

Gdy otwierasz sygnały albo historię, mapa przesuwa środek nad odsłoniętą część
ekranu — obiekt nie chowa się pod panelem. Działa też przy widocznym pasku
„NIEOFICJALNE źródło” na wyższych ekranach (poprawione przy robieniu zrzutów). Po zamknięciu panelu
mapa wraca na swoje miejsce. Propozycja czytelnika.

## Historia

- Karty województw w sygnałach historii zwijają się i rozwijają dotknięciem,
  tak jak na żywo.
- Przyciski paska historii mają podpisy.
- Okrąg niepewności obiektu w historii rośnie z wiekiem meldunku, tak jak na żywo.

## Ustawienia

Ustawienia otwarte z Menu mają przycisk „‹ Menu”, który wraca do Menu.

## Karta obiektu: kurs

Gdy źródło wyznaczyło pozycję z celu i kursu, karta pisze „kurs na cel: …
— przedłużenie trasy prowadzi w stronę Polski” zamiast „kurs na Polskę”. Kurs na Polskę,
który mija najbliższy odcinek granicy o ponad 50°, karta opisuje jako „w stronę dalszego
odcinka granicy”.

## Punktacja (serwer od 18.10, tryb bez serwera w tej wersji)

- **Dron przy granicy.** Dron albo Shahed do 30 km od granicy województwa, z co najmniej
  2 zgłoszeniami, z dokładną pozycją, daje temu województwu co najmniej
  2,0 pkt (żółty) — także bez kursu. Odległość liczona osobno do każdego województwa.
  Ta podłoga nie przelewa się na sąsiednie województwa.
- **Czerwony.** Meldunek z przybliżoną pozycją i domniemanym kursem („na cel”) nie
  otwiera czerwonego.
- **RCB z gov.pl.** Spóźniony artykuł o alercie, który RSO już odwołało, nie daje punktów.
- **Media Litwy i Łotwy.** Alarm opublikowany przed odwołaniem nie liczy się po nim;
  wiadomość wymieniająca kilka innych krajów jest pomijana; tytuł, który nadal
  zapowiada alarm, nie jest odwołaniem.
- **Tryb bez serwera** punktuje każde województwo w zasięgu obiektu, od odległości
  do niego — wcześniej tylko województwo przy najbliższej granicy.

Opisy w „O aplikacji” i w instrukcji odpowiadają tym regułom.

## Czego nie sprawdziliśmy

Układu na fizycznych telefonach z bardzo małym ekranem (sprawdzony na emulatorze
i w przeglądarce), przesuwania mapy nad panelem na iPhonie.
