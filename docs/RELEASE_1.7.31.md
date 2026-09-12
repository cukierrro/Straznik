# Strażnik 1.7.31 — artykuł trafia tam, gdzie się zdarzył

Wydanie z jednego zgłoszenia: „komunikat DORSZ powinien dotyczyć tylko regionów,
które dostały alerty". Pociągnięcie tej nitki odsłoniło cztery niezależne błędy
w tym, jak media są przypisywane do województw — i wszystkie zaczęły mieć większe
znaczenie, odkąd w 1.7.30 północ punktuje strefy PAŻP.

## Nazwa miejscowości łapana w środku innego słowa

Ogólnopolski komunikat wojskowy „DORSZ: zakończono operowanie lotnictwa" dostał
**1,0 pkt w wielkopolskim**. Powód: dopasowanie szło podciągiem, a „**rozpoznania**"
zawiera „poznan" — w zdaniu „naziemne systemy obrony powietrznej i **rozpoznania**
radiolokacyjnego". Tą samą drogą „bełkot" trafiał w Ełk, a „topole" w Opole.

Trafienie musi się teraz zaczynać na granicy słowa. Hasła są rdzeniami odmian
(„podlask", „chełm"), więc obcinana jest tylko lewa strona — „Podlaskiego" nadal
się łapie.

## Artykuł o końcu zagrożenia punktował jak zagrożenie

Ten sam komunikat DORSZ mówił, że jest **po wszystkim** — i dostawał pełne punkty,
bo przechodził bramkę OBIEKT+ZDARZENIE („dron", „przestrzeni powietrznej"). Media
bałtyckie miały mechanizm odwołania od dawna, polskie nie miały go wcale.

Teraz tekst z hasłem odwołania („odwołano alarm", „zakończono operowanie",
„zagrożenie minęło", „wznowiono ruch lotniczy") **nie punktuje** i wygasza
wcześniejsze doniesienia medialne w tym województwie. Świadomie asymetryczne:
media i tak nigdy nie alarmują same, więc błąd w tę stronę daje ciszę zamiast
fałszywego alarmu. Odwołanie **nie** rusza oficjalnego alertu RCB.

## Nazwa redakcji decydowała o regionie

Google News dokleja do tytułu wydawcę. „Rumunia: rosyjski dron spadł na blok
mieszkalny — **Radio Szczecin**" i „Kolejne drony spadły w Rumunii i Bułgarii —
**Radio Szczecin**" trafiały do zachodniopomorskiego. Wydawca mówi, KTO napisał,
a nie GDZIE się stało — jego nazwa jest teraz usuwana przed dopasowaniem
(wyświetlany tytuł zostaje bez zmian).

Do tego domyślny region kanału jest domniemaniem, nie faktem, więc nie stosujemy
go, gdy tekst umiejscawia zdarzenie za granicą.

## Duży słownik nazw dla każdego województwa

Pomiar na żywych kanałach pokazał, skąd naprawdę brało się województwo:
**8 przypisań z haseł i 31 z domyślnego regionu kanału**. Słownik nie znał form,
których media używają najczęściej — „na Podlasiu", „na Lubelszczyźnie",
„na Podkarpaciu", „w Wielkopolsce" nie zawierają haseł „podlask", „lubelski",
„podkarpack", „wielkopolsk". Cała atrybucja wisiała na domniemaniu.

Słownik urósł z ~200 do **565 haseł**, od 23 do 49 na województwo: nazwy potoczne
krain, wszystkie większe miasta, przejścia graniczne i lotniska wojskowe. Nazwy
dwuczłonowe rozstrzygają kolizje — „Radzyń Podlaski" i „Biała Podlaska" to
lubelskie, „Wysokie Mazowieckie" to podlaskie, a „Sokołów Podlaski" mazowieckie.

Po zmianie, na tych samych kanałach: **17 przypisań z haseł i 0 z domniemania.**

Dwanaście nazw zostało **świadomie pominiętych**, bo są zarazem słowami
pospolitymi: Ryki (jak w „ryki syren"), Wołów (w „wołowinie"), Zator, Gniew,
Marki, Ząbki, Zielonka, Warka, Łapy, Jawor, Susz i Brzeziny. Wcześniej z tego
samego powodu odpadły Piła, Koło, Turek, Hel, Żary, Rumia, Reda i Łask.
Fałszywe przypisanie jest gorsze niż jego brak.

## Alarm bombowy i syreny na uroczystościach

„Alarm bombowy w dwóch placówkach. Ewakuowano szkołę" przechodził bramkę
OBIEKT+ZDARZENIE. Tak samo „Wybiła godzina »W«. Warszawa stanęła, w mieście
zawyły syreny". Obie klasy trafiły na listę wetującą — z pełnymi frazami, nie
rdzeniami, żeby „bombowy" nie wyciął „bombowca".

## Dlaczego to teraz ważniejsze

Na ścianie wschodniej media ważą 1,0–1,5 pkt przy progu 2,0 i limicie klasy 1,5,
więc same nigdy nie alarmują. Ale od 1.7.30 na północy strefa PAŻP waży 1,0 —
i **media 1,0 + strefa 1,0 = próg żółty**. Precyzja przypisania przestała być
kwestią porządku w panelu.

## Testy

- `scripts/test_slownik_regionow.py` (nowy) — 565 haseł kontrolowanych na sześć
  sposobów: kolizje ze słowami pospolitymi, jedno hasło = jedno województwo,
  zawieranie się nazw, minimalny rozmiar słownika, przypadki graniczne oraz
  zgodność backendu z silnikiem wbudowanym (odczytana z engine.js przez node).
- `scripts/test_media_clear.py` (nowy) — granica słowa, rozpoznanie odwołania
  i wygaszanie wcześniejszych mediów w fuzji.
- Cały zestaw: 28/28.
