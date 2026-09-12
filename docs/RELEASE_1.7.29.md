# Strażnik 1.7.29 — widać, co przyleciało i skąd bierze się wynik

Wydanie z jednej sesji obserwacji panelu na żywych danych. Cztery rzeczy, wszystkie
o tym samym: dane były poprawne, ale nie dało się ich sprawdzić wzrokiem.

## Artykuł o dwóch województwach trafia do obu

Alert RCB rozesłany „do osób na terenie **województw lubelskiego i podkarpackiego**"
(radio.lublin.pl, tytuł „Lubelskie: RCB ostrzega mieszkańców…") wchodził **wyłącznie
do podkarpackiego**. Dopasowanie brało jedno województwo — to z najdłuższym trafionym
hasłem — a `podkarpack` (10 znaków) bije `lubelski` (8). Lubelskie, wymienione w
tytule i pierwsze w zdaniu, nie dostawało nic.

Reguła najdłuższego hasła powstała przeciwko kolizjom nazw („Chełmno" zawiera „chełm",
„Radomsko" zawiera „radom") i jest potrzebna — ale po cichu rozstrzygała też przypadki
kilku regionów naraz. Teraz zbieramy każde trafienie z pozycją w tekście i odrzucamy
tylko te schowane w **dłuższym trafieniu innego województwa w tym samym miejscu**.
„Biała Podlaska" nadal jest lubelskie, „Chełmno" kujawsko-pomorskie, a alert dla dwóch
regionów wchodzi do obu.

Limit klasy media (1,5 pkt na województwo) i próg żółty 2,0 bez zmian — same media
nadal nie alarmują. Klucz deduplikacji dostał województwo, inaczej drugi wpis znikał.

## Świeży sygnał na górze listy

Nowy obiekt wart 0,1 pkt lądował pod wpisami sprzed godziny: na mapie coś się
pojawiało, a na górze listy nic się nie zmieniało. Kolejność po wkładzie tłumaczyła
wynik i to zostaje — ale sygnał z **ostatnich pięciu minut** idzie teraz na górę
niezależnie od punktów, najnowszy pierwszy, z plakietką **NOWY**. Po pięciu minutach
wraca na swoje miejsce według wkładu, więc lista dalej wyjaśnia, skąd wziął się wynik.

Dotyczy obu list: kart województw i wspólnej sekcji „Sygnały" (ta sortowała po czasie
tylko pozornie — `sigList` i tak przestawiał wszystko po punktach).

## Karta województwa rozpisuje sumę

„Z czego bierze się 2,4 pkt, skoro w sygnałach tyle nie widzę?" Suma zawsze zgadzała
się co do dziesiątej, ale żeby to sprawdzić, trzeba było dodać w pamięci plakietki
rozrzucone po przewijanej liście — a wpisy z wkładem **0** (wygaszone wiekiem albo
ucięte limitem klasy) tylko mieszały rachunek. Karta pisze teraz wprost:

> składa się z: 1.2 RCB + 1.0 ALARM UA + 0.9 MEDIA · 2 sygnałów bez wkładu
> (wygaszone albo ponad limit klasy)

## Sygnał mówi, czy obiekt jeszcze istnieje

Sygnał NEPTUN, którego obiekt zniknął z bieżącej migawki, pokazuje **„nieśledzony na
mapie"**. Wcześniej podawał odległość sprzed nawet czterdziestu minut i nic nie
zdradzało, że obiektu już nie ma — a od 1.7.28 przy śledzonych dopisujemy „teraz X km",
więc brak dopisku dawał się wziąć za brak ruchu.

## Punktacja bez zmian

Poza przypisaniem artykułu do właściwych województw nic w liczeniu się nie zmieniło.
Obiekt lecący w bok nadal ma zero: pełna waga do ±50° od kierunku na granicę, liniowy
spadek do zera przy ±70°, nieznany kurs ×0,5 i tylko do 150 km.

## Zweryfikowane na żywym przylocie

Piętnaście minut obserwacji emulatora Pixel 7 z odpytywaniem produkcji co 90 sekund.
O 16:24:50 wszedł nowy sygnał (dron 135,5 km, +0,3 pkt):

- **+1 min** — na samej górze karty Lubelskiego, plakietka NOWY, nad alarmem UA +1,0
- **+4 min** — nadal na górze, nadal NOWY
- **+8,5 min** — bez plakietki, z powrotem pod alarmem UA, czyli według wkładu

Testy: 15 pythonowych i 10 node'owych, w tym nowy `test_voiv_match.cjs` i tabela
przypisań w `test_textmatch.py` — backend i silnik wbudowany muszą przypisywać
artykuły identycznie.
