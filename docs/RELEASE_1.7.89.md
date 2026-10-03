# Wydanie 1.7.89 — porządek w oknach: rozwijane sekcje i jeden kształt

versionCode 118, versionName 1.7.89. 3 października 2026.

<!-- zmiany -->
- Ustawienia, legenda i okno „O aplikacji" nie wysypują już całej treści naraz. Wyjaśnienia schowane są pod nazwanymi sekcjami przy swojej opcji, a sterowania zostają widoczne zawsze. Zakładka „Alarmy" mieści się na jednym ekranie zamiast trzech.
- Legenda ma wreszcie przycisk zamykania. Sześć grup można rozwijać pojedynczo, a samolot i śmigłowiec rysowane są tą samą kreską co na mapie — do tej pory legenda pokazywała co innego, niż widać nad Polską.
- Legenda wymienia wszystkie dziewięć krajów, które kolorujemy, a nie trzy. Okno punktacji opisuje wreszcie sześciu sąsiadów w trybie cienia.
- Jeden kształt w całym interfejsie: zaokrąglony kwadrat, bez półokrągłych pigułek. Przyciski „Anuluj" i „Zapisz" mają pole dotykowe 44 px.
- Krzyżyk u góry okna wystarcza, więc zdublowany przycisk „Zamknij" na dole zniknął z pięciu okien.
- Emoji na przyciskach ustąpiły ikonom rysowanym tak samo jak reszta aplikacji.
- Naprawione tłumaczenia: legenda i część ustawień zostawały po polsku w wersji angielskiej i ukraińskiej.
- GROTA: każda pozycja listy „Przygotuj" ma teraz swoją ikonę, nie tylko lista piwniczna.
<!-- /zmiany -->

Punktacja, progi i treść alarmów bez zmian. Żaden sygnał nie zmienia wagi.

## Dlaczego rozwijane sekcje

Ustawienia miały cztery zakładki, a w każdej całą treść naraz. W „Alarmach"
pod czterema wierszami zgód stało pięć akapitów drobnego druku, w „Dźwięku"
sześć — razem dwa ekrany przewijania, zanim doszło się do przełącznika, po
który się weszło. Okno „O aplikacji" miało sześć rozdziałów, dwie tabele i trzy
ramki w jednym zwoju; żeby przeczytać „Czego ta aplikacja NIE robi", trzeba było
przewinąć całą punktację.

Zasada jest jedna: **chowamy wyjaśnienia, nie sterowania.** Przełączniki,
wiersze zgód i segmenty zostają widoczne zawsze. Pod rozwijaną sekcję idzie
proza, a podpis mówi wprost, co w niej jest („Zanim włączysz: co to zmienia",
„Jak przebiega test", „Skąd biorą się aktualizacje").

Jeden wyjątek działa w drugą stronę: sekcja „Zanim włączysz: co to zmienia"
przy przełączniku „Czerwony alarm: tylko wibracja" **rozwija się sama**, gdy
ktoś po ten przełącznik sięga. Ostrzeżenie o nocy ma być na ekranie, a nie za
podpisem, którego nikt nie dotknął.

## Legenda

Była jedynym panelem bez przycisku zamykania — zamykało ją ponowne dotknięcie
ikony na pasku albo dotknięcie mapy, i nic tego nie mówiło. Teraz ma nagłówek
z „✕ Zamknij", tak jak panel sygnałów.

Sześć grup to sekcje rozwijane. Wcześniej było 27 wierszy w słupku szerokim na
250 px, z którego mieściły się niecałe dwie grupy; reszta czekała za
przewijaniem, którego na mapie nie widać. Teraz wszystkie nazwy grup widać
naraz jak spis treści i otwiera się tę jedną, której się szuka. Na telefonie
legenda ma 300 px zamiast 210, więc podpisy przestały się łamać po dwa słowa.

Samolot i śmigłowiec rysujemy **tymi samymi pikselami co warstwa mapy**.
Dotąd samolot był kwadracikiem CSS, a śmigłowiec emoji — ani jedno, ani drugie
nie wyglądało jak to, co widać nad Polską.

## Co się przy okazji znalazło

Legenda nie jest tłumaczona po identyfikatorach, tylko przez słownik całych
napisów. Brak wpisu nie daje błędu — zostawia polski tekst. Przy przegrupowaniu
legendy 2 października zmieniliśmy brzmienie nagłówków, nie ruszając słownika,
i **49 napisów, czyli prawie cała legenda, było po polsku także w wersji
angielskiej i ukraińskiej**. Nikt tego nie zgłosił, bo nic tego nie sygnalizuje.

To samo w ustawieniach, innym mechanizmem: akapity były tłumaczone **po
kolejności**. Schowanie pierwszego z nich pod sekcję rozwijaną sprawiło, że
przestał być bezpośrednim dzieckiem sekcji i cała lista przesunęła się o jeden —
po angielsku „Zapisz do 8 miejsc" dostawało tekst o alarmie pełnoekranowym.
Ta sama pułapka zadziałała wcześniej 24 września przy dołożeniu jednego akapitu.

W oknie „O aplikacji" stały nawet trzy komentarze w kodzie ostrzegające, żeby
nie dokładać akapitu, bo rozjedzie wersję angielską — dokumentacja pułapki
zamiast jej usunięcia.

Wszystkie trzy miejsca przepięte na identyfikatory. Dwa nowe testy
(`test_legenda_tlumaczenia.cjs`, `test_o_aplikacji.cjs`) pilnują, że żaden
selektor pozycyjny nie wróci i że każdy napis ma wersję angielską i ukraińską.
Ten warunek od razu wykrył cztery starsze luki, niezwiązane z tą zmianą:
akapit o wersji strony, podpis „Zaawansowane", napisy przełącznika „Alarmy na
tym telefonie" i „Czerwony alarm zawsze na pełnej głośności" zostawały po
polsku przy jednym z dwóch przejść językowych, a akapit o własnym backendzie
nie był tłumaczony w ogóle.

## Jeden kształt

Zakładki ustawień były ostatnim miejscem z półokrągłymi bokami, obok
kwadratowego krzyżyka. Promień przycisków wynosił 9 px, kart 11–12 px.
Teraz jest jeden: 11 px dla przycisków, 8 px dla drobnych plakietek.

Przyciski „Anuluj" i „Zapisz" — główna decyzja całego okna — miały pole
dotykowe mniejsze niż dowolna plakietka w treści. Mają 44 px.

## Czego to wydanie NIE zmienia

- Punktacja, progi, treść i głośność alarmów: bez zmian.
- Mapa, obiekty, trasy i okrąg niepewności: bez zmian.
- Sześć nowych krajów sąsiednich dalej nie daje punktów (patrz 1.7.88).
- Kamery dalej bez podglądu u nas — czekamy na odpowiedź worldcam.pl.
