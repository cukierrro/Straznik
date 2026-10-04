# Wydanie 1.7.90 — wielkość tekstu, świeży wykaz schronień, jedna prędkość

versionCode 119, versionName 1.7.90. 4 października 2026.

<!-- zmiany -->
- Możesz powiększyć tekst w całej aplikacji: ⚙ → Aplikacja → „Wielkość tekstu" → Normalna, Większa albo Największa. Działa od razu, bez zapisywania i bez restartu, a na Androidzie mnoży się z systemowym rozmiarem czcionki.
- GROTA ma wykaz miejsc schronienia Państwowej Straży Pożarnej z 28 września: 86 533 miejsca zamiast 86 388. Pierwszy raz żaden punkt nie wypadł z prowadzenia — osiem wróciło.
- GROTA: na ekranie Mapa doszedł przycisk „Lista". Te same miejsca co na mapie, z adresem, odległością i czasem dojścia, jako lista do przejścia klawiaturą i czytnikiem ekranu.
- Czas dolotu liczy się jedną regułą na serwerze i w aplikacji. Karta obiektu pokazuje dokładnie tę prędkość, na której oparty jest alarm — wcześniej potrafiła podać dłuższy czas niż powiadomienie.
- Karta mówi teraz wprost, że źródło nie rozróżnia zwykłych dronów od Shahedów i że przyjmujemy wariant groźniejszy. Legenda wyjaśnia to samo przy liście ikon.
- Naprawione: rozwinięty pasek źródeł wchodził pod pasek tytułu i jego tekst prześwitywał między ikonami przez pierwsze pięć sekund.
- Naprawione: dron rozpoznawczy nie dostawał czasu dolotu na karcie ani zapasu na wiek meldunku na mapie.
<!-- /zmiany -->

Punktacja, progi i treść alarmów bez zmian. Żaden sygnał nie zmienia wagi.

## Wielkość tekstu

To pierwszy z czterech punktów dostępności, które obiecaliśmy w notatkach
wydania 1.7.81, i odpowiedź na zgłoszenie #4 otwarte od 22 września.

Wybór jest w ⚙ → Aplikacja i ma trzy stopnie: Normalna, Większa (×1,15)
i Największa (×1,3). Powiększa **wszystkie napisy naraz** — w panelu, na
kartach, w legendzie, na ekranie alarmu i w module GROTA. Odstępy, wysokości
i pola dotykowe zostają celowo bez zmian: gdyby rosło wszystko, rósłby też
pasek zakładek i okna przestałyby się mieścić.

Przy ustawieniu „Normalna" nie zmienia się ani jeden piksel wobec 1.7.89.

Na Androidzie ten mnożnik **składa się** z systemowym rozmiarem czcionki, więc
przy dużej czcionce w ustawieniach telefonu zwykle wystarcza „Normalna".
Napisy na samej mapie pochodzą z serwera map i tym ustawieniem się nie
zmieniają.

Pod spodem cała typografia przeszła z pikseli na jednostkę względną — 123
deklaracje w arkuszu stylów, 13 w skrócie `font:`, 14 w kodzie aplikacji
i 31 w module GROTA. Pola formularzy mają podłogę 16 px: niżej iPhone
przybliża cały ekran przy wejściu w pole i nie da się tego cofnąć.

Zostają trzy punkty z tamtej obietnicy: opis sytuacji jednym zdaniem zamiast
mapy, rozróżnialne wzory wibracji i sprawdzenie pełnoekranowego alarmu
z TalkBackiem na prawdziwym telefonie. Dopóki tego ostatniego nikt nie
sprawdził, **nie twierdzimy, że Strażnik jest dostępny dla osób niewidomych.**

## Wykaz schronień z 28 września

86 388 → 86 533 miejsca: 708 nowych, 563 wykreślone. Z nowych punktów 91,5%
trafia w obrys budynku, 56 stoi w odległości do 30 metrów, a jeden nie ma
żadnego budynku w promieniu 150 metrów. Punktów oznaczonych jako „położenie
wątpliwe" jest 1275 zamiast 1282 — i po raz pierwszy od kiedy to liczymy,
**żaden punkt nie wypadł z prowadzenia**, osiem wróciło.

Zasięg poprawił się mierzalnie: mieszkańców dalej niż 5 km od najbliższego
punktu jest 2 071 986 zamiast 2 153 946, a gmin bez żadnego punktu 205
zamiast 225.

Dwie rzeczy, o których warto wiedzieć, bo zobaczycie je na mapie:

**W powiecie bartoszyckim ubyło 405 punktów.** Bartoszyce 491 → 229, Górowo
Iławeckie 105 → 28, Bisztynek 50 → 24, Sępopol 50 → 26. Sprawdziliśmy po
współrzędnych, czy to nie przenumerowanie: żaden z wykreślonych nie wrócił pod
nowym identyfikatorem w tym samym miejscu, więc to realne wykreślenia po
stronie PSP, a nie błąd przetwarzania.

**PSP poprawiło też własne błędy położenia.** Punkt z ulicy Łuckiej
w Warszawie stał do tej pory 144 km dalej, gdzieś pod Łodzią; inny w
Bielsku-Białej przesunął się o 1,6 km.

## Dostępna lista schronień

Na ekranie Mapa, obok „Filtry i widok", jest przycisk „Lista". Pokazuje te
same miejsca co mapa — te same filtry, ta sama kolejność od najbliższego —
ale jako prawdziwą listę przycisków. Każda pozycja czyta adres, odległość,
szacowany czas dojścia, rodzaj obiektu i pewność położenia. Wybranie otwiera
tę samą kartę, co dotknięcie szpilki.

Odległości liczone są od Twojej pozycji, a gdy jej nie ma — od środka mapy,
i jest to na liście napisane wprost.

Przy okazji naprawiony został niewidoczny fokus klawiatury: do tej pory
w całym module widać go było tylko na uchwycie przeciągania.

Sprawdzone klawiaturą sprzętową na urządzeniu. **TalkBacka nie sprawdziliśmy**
i dopóki tego nie zrobimy, nie twierdzimy, że ten ekran jest gotowy dla osób
niewidomych.

## Jedna prędkość w czasie dolotu

Czas dolotu liczyły u nas trzy miejsca trzema wzorami: serwer (powiadomienia
i progi alarmu ETA), karta obiektu i tryb awaryjny w aplikacji. Dla dronów
odrzutowych rozjeżdżały się — i rozjeżdżały w złą stronę. Serwer zakładał
450 km/h, a karta pokazywała czas policzony po 350 km/h, czyli **obiecywała
więcej zapasu, niż sami zakładaliśmy**.

Obowiązuje teraz jedna zasada: **prędkość typowa jest podłogą, a prędkość
wyliczona z ruchu może ją tylko podnieść.** Nigdy obniżyć.

Powód jest pomiarowy. NEPTUN prędkości praktycznie nie podaje — w próbce
z produkcji żaden z 15 obiektów jej nie miał. Prędkość „z ruchu" wyliczamy
więc z kolejnych pozycji, a te bywają tak niedokładne, że dają wyniki rzędu
kilkudziesięciu km/h dla obiektu, który na pewno leci szybciej. Taki pomiar
to szum pozycji, nie prędkość — i przy dawnej regule mógł **opóźnić alarm**,
obniżając założoną prędkość. Teraz nie ma takiej drogi.

Zmieniła się jedna liczba widoczna dla człowieka: czas na karcie drona
odrzutowego jest o około jedną piątą krótszy. To zmiana w stronę ostrożną —
usunęliśmy obietnicę zapasu czasu, której sami nie popieraliśmy.

Serwer podaje teraz użytą prędkość razem z obiektem, a karta ją pokazuje
zamiast liczyć po swojemu. Dzięki temu czas z powiadomienia i czas z karty
nie mogą się już różnić. Tryb awaryjny dostał własny pomiar ruchu, którego
wcześniej w ogóle nie miał — pamiętał tylko ostatnią pozycję, bez czasu.

## Uczciwość wobec tego, czego nie wiemy

Nasza legenda rozdziela drony na zwykłe, Shahedy, FPV i rozpoznawcze. Źródło
**w praktyce tego nie rozróżnia**: Shahed przychodzi jako „Dron / BpSP".
Przejrzeliśmy trzy tygodnie archiwum — 34 552 obiekty — i klasa „Shahed" nie
pojawiła się ani razu.

Dlatego karta obiektu mówi teraz wprost, że źródło nie rozróżnia tych maszyn
i że przyjmujemy wariant groźniejszy, a legenda wyjaśnia, że rozdzielenie na
osobne ikony pochodzi od nas, a nie z meldunku. Ikony zostają — są gotowe,
gdyby źródło zaczęło rozróżniać.

## Naprawione

**Pasek źródeł wchodził pod pasek tytułu.** Po przebudowie interfejsu
w 1.7.89 pasek tytułu urósł do 90 px, a rozwinięty pasek z licencjami
zaczynał się na 60 px — jego tekst prześwitywał między ikonami przez pierwsze
pięć sekund, zanim zwinął się do znaku (i). Wyglądało to jak nakładka jednego
elementu na drugi, a było jednym elementem w złym miejscu. Teraz wysokość
paska tytułu jest mierzona, a nie wpisana na sztywno — bo zależy też od
wybranej wielkości tekstu.

**Dron rozpoznawczy nie miał czasu dolotu.** W aplikacji brakowało dla tej
klasy prędkości typowej, choć na serwerze była od zawsze. Karta nie podawała
dla niego czasu, a znacznik na mapie nie dostawał zapasu na wiek meldunku.
Punktacja i alarmy były poprawne — błędne było tylko to, co widział człowiek.

**Plakietka połączenia zasłaniała listę źródeł** — obie stały na tej samej
wysokości.

## Pod maską

Nazwę klasy obiektu sprowadzamy do małych liter raz, przy wejściu danych,
zamiast w kilkunastu miejscach z osobna. Jedno z tych miejsc decydowało
o promieniu okręgu niepewności, więc zmiana zapisu w źródle mogłaby po cichu
zaniżyć pokazywaną niepewność.

Doszły dwa testy: jeden pilnuje, że cała typografia zostaje w jednostce
względnej i że nic pokazywanego człowiekowi nie jest bardziej optymistyczne
niż podstawa alarmu; drugi, że trzy tablice prędkości są identyczne i że
każda pokazywana klasa obiektu ma prędkość. Oba sprawdzone kontrolą dodatnią.
