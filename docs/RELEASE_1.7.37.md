# Strażnik 1.7.37 — media po przeczytaniu treści, bez marginesu alarmów, nowa instrukcja

- Serwer czyta cały artykuł, zanim przyzna punkty. Relacja z wcześniejszego zdarzenia albo artykuł, którego nie da się przeczytać, zostaje w panelu z linkiem, ale ma 0 pkt. Media dają 0,5 lub 1 pkt, limit klasy 1 pkt.
- Poziom powiadomień zawsze odpowiada bieżącym punktom; powtórka tego samego poziomu w ciągu 60 minut nie dzwoni bez nowego Alertu RCB.
- Alarmy dalszych obwodów Ukrainy ważą mniej — waga maleje płynnie z odległością.
- Strefy nałożone na siebie: dotyk otwiera najmniejszą, pozostałe są w karcie jako przyciski.
- Historia: czas sygnałów liczy się od wybranej chwili, zniknęło „NaN h NaN min temu”.
- Legenda opisuje przygaszony kolor od sąsiadów; baner regionu pisze „poniżej progu”.
- Śmigłowiec ma na mapie własną ikonę z tarczą wirnika; karta drona po angielsku podaje nazwy po angielsku („Shevchenkove, Kharkiv oblast”).
- Instrukcja napisana od nowa dla bieżącej wersji, z nowymi zrzutami PL i EN.

## Dlaczego

13 września rano artykuły o porannych syrenach wychodziły godzinami po zdarzeniu
i dostawały punkty, jakby działo się to teraz. Tytuł „Na Lubelszczyźnie znów zawyły
syreny” domknął razem z alarmami obwodów fałszywy żółty o 10:01, choć drugiego
włączenia syren nie było. Pierwszy akapit takich artykułów mówi wprost „przed
godziną 4 rano” — dlatego serwer czyta teraz treść, a nie tylko nagłówek.

Margines 0,5 pkt przy zejściu trzymał lubelskie na żółtym przy 1,7 pkt. Powtórki
zatrzymuje teraz sama cisza 60 minut, przełamywana wyłącznie nowym Alertem RCB.
Na historii od 2 sierpnia: 36 powiadomień zamiast 37, każdy alert RCB/RSO nadal
z powiadomieniem.
