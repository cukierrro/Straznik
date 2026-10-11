# Wydanie 1.7.93 — alarm na zegarku, wibracje Morse'em, trzy tryby czerwonego

versionCode 122, versionName 1.7.93. 11 października 2026.

<!-- zmiany -->
- Czerwony alarm dociera teraz także na sparowany zegarek z Wear OS — dotąd Android go tam nie przekazywał.
- Wibracja alfabetem Morse'a: żółty to „U” (· · —), czerwony to „A” (· —). Nie pomylisz ich ze zwykłym SMS-em; w ustawieniach są przyciski „Poczuj”.
- Czerwony alarm ma trzy tryby: Syrena, Tylko wibracja albo Zwykłe powiadomienie — bez pełnego ekranu i syreny.
- Gdy wynik spadnie poniżej progu, karta województwa mówi, do kiedy trzyma się poziom („podtrzymany do …”), a historia pokazuje to samo co mapa na żywo.
- Ustawienia pokazują, ile szedł ostatni alarm i czy Google obniżył mu priorytet.
<!-- /zmiany -->

## Zegarek i opaska

Czerwony alarm był oznaczony jako powiadomienie „stałe”, żeby nie dało się go
przypadkiem zsunąć. Dokumentacja Androida mówi wprost, że takich powiadomień
Wear OS **nie przekazuje** na zegarek — więc osoba, która polega na wibracji
na ręce, czerwonego nie czuła. Znacznik zdjęliśmy (na Androidzie 14 i tak
nie chronił przed zsunięciem). Zsunięcie nadal działa jak „Wycisz alarm”,
a pełny ekran zostaje.

Opaski i zegarki z własną aplikacją (Mi Fitness, Zepp, Garmin Connect, Galaxy
Wearable) pokazują alarm, jeśli w ich ustawieniach zezwolisz na Strażnika.
Zegarek wibruje po swojemu — rytmu „U” / „A” na ręce zwykle nie poczujesz.
Nie sprawdziliśmy każdego modelu; zrób próbę przyciskiem „Test: czerwony
natywny”.

## Wibracje

Żółty wibrował dotąd dwoma krótkimi impulsami — prawie tak samo jak domyślne
powiadomienie Androida. Teraz wibracja mówi alfabetem Morse'a: żółty „U”
(Uwaga / Увага / Urgent), czerwony „A” (Alarm / Атака). Kto nie zna Morse'a,
rozpozna je po rytmie. Ten sam wzór ma powiadomienie, otwarta aplikacja
i strona w Chrome na Androidzie. iPhone nie pozwala na własne wzory wibracji.

Nowy wzór wymagał nowych kanałów powiadomień. Jeśli wcześniej wyłączyłeś
w ustawieniach Androida któryś kanał Strażnika albo jego wibrację, to
ustawienie przeszło na nowy kanał — sprawdzone na aktualizacji z 1.7.91.

## Trzy tryby czerwonego alarmu

Prośba czytelnika: coś pośredniego między syreną a wyłączeniem alarmów.
W ⚙ → Dźwięk → Czerwony alarm są teraz trzy możliwości:

- **Syrena** (domyślnie) — jak dotąd;
- **Tylko wibracja** — dawny przełącznik ciszy;
- **Zwykłe powiadomienie** — czerwony przychodzi jak żółty: baner, krótki
  dźwięk i wibracja, bez pełnego ekranu. Szanuje tryb cichy i Nie
  przeszkadzać, więc w nocy może nie dotrzeć — aplikacja o tym uprzedza.

## Podtrzymanie poziomu — wyjaśnione i spójne

Od 16.09 poziom trzyma się 10 minut po ostatnim przekroczeniu progu, żeby
nie migał przy wyniku krążącym wokół 2 pkt. Karta pisała wtedy „PODWYŻSZONA
UWAGA” przy 1,7 pkt bez słowa wyjaśnienia, a historia gasiła kolor od razu
— więc pokazywała co innego, niż widziałeś na żywo. Teraz karta i baner
mówią „podtrzymany do …”, a historia i pasek suwaka liczą to samo
podtrzymanie. Odwołanie RCB zdejmuje je od razu, jak dotąd.

## Droga alarmu do telefonu

11.10 serwer wysłał alarm w 2 sekundy, ale telefon odebrał go po 80. Google
obniża priorytet pilnym wiadomościom, które nie kończą się widocznym
powiadomieniem — a alarm pokazany w otwartej aplikacji nie zostawiał nic
w systemie. Teraz zostaje wtedy ciche powiadomienie w szufladzie. W ⚙ →
Alarmy obok godziny ostatniego sygnału widać, ile szedł i czy Google obniżył
mu priorytet — przy kolejnym alarmie będziemy to wiedzieć na pewno.

## Pozostałe

- Opis sytuacji jednym zdaniem dla czytnika ekranu, przed mapą.
- Obiekt, którego pozycję źródło wyznaczyło z celu i kursu, ma okrąg co
  najmniej 40 km, a karta mówi, że może być w dowolnym miejscu trasy.
- Legenda kończy się nad pigułką stanu województwa.
- Historia pokazuje strefy PAŻP z tamtej chwili (na stronie od 10.10).
- „−1 min” w historii cofa o minutę także przy pierwszym kliknięciu.
- Na serwerze (wdrożone przed wydaniem): szybsza wysyłka powiadomień do
  przeglądarek — 2110 osób w 13 s zamiast ponad 2 minut — i lokalna pamięć
  DNS.

## Czego nie sprawdziliśmy

Prawdziwego zegarka i opaski, trybu „Tylko wibracja” na fizycznym telefonie
oraz czytnika ekranu TalkBack. Wszystko inne — kanały, przeniesienie ustawień,
flagi powiadomień, tryby czerwonego — sprawdzone na emulatorze Pixel 7.

Nowa baza punktów schronienia PSP wejdzie w osobnym wydaniu 1.7.94.
