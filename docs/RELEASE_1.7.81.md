# Strażnik 1.7.81 — alarm da się odczytać czytnikiem ekranu

**26 września 2026**, versionCode 110. Poprzednie wydanie:
[1.7.80](RELEASE_1.7.80.md) (alert RCB dla kilku województw już nie przepada).

<!-- Blok poniżej to JEDYNE, co widzi użytkownik w oknie aktualizacji w telefonie.
     Krótkie, całe zdania, bez nagłówków i bez odsyłaczy — reszta notatek zostaje
     dla czytających na GitHubie. Parser: backend/app/app_updates.py, _change_items. -->
<!-- zmiany -->
- Czytnik ekranu czyta ekran alarmu od razu po jego pojawieniu się, zamiast zostawać na mapie pod spodem.
- Gdy poziom rośnie do żółtego, czytnik ekranu mówi, w którym województwie. Dotąd osoba niewidoma słyszała tylko krótki sygnał, bez informacji, co się stało.
- Gdy poziom wraca do zwykłego, czytnik też to mówi — z zastrzeżeniem, że to nie jest oficjalne odwołanie alarmu.
- Przy włączonym w telefonie „ogranicz ruch” nic w aplikacji nie pulsuje ani nie miga, także ekran alarmu.
- Aplikację da się obsłużyć klawiaturą i przełącznikiem: karty województw rozwijają się Enterem, a widać, gdzie jest kursor.
- Okno aktualizacji nie wchodzi już pod górny pasek, a dłuższa lista zmian przewija się w oknie.
- Wiersz ze źródłami danych na dole mapy przewija się palcem w bok zamiast urywać się w połowie.
<!-- /zmiany -->

**To pierwszy z kilku kroków w stronę dostępności, a nie ogłoszenie, że
aplikacja jest dostępna.** Zmienia się sama warstwa techniczna — role,
kolejność czytania, ogłoszenia. Funkcje, które naprawdę zmienią sytuację osoby
niewidomej albo głuchej (opis sytuacji jednym zdaniem zamiast mapy, rozróżnialne
wzory wibracji, regulacja wielkości tekstu), są dopiero przed nami.

## Ekran alarmu

Dotąd pełnoekranowy alarm był zwykłą warstwą na wierzchu. Czytnik ekranu
zostawał tam, gdzie był przed alarmem — najczęściej na mapie, której w tym
momencie i tak nie widać — i żeby dowiedzieć się czegokolwiek, trzeba było
samemu poszukać nowego tekstu.

Teraz alarm jest oknem `alertdialog` z `aria-modal`. Czytnik przerywa to, co
czyta, podaje poziom i województwo, a fokus wchodzi do środka okna. Tabulator
krąży po jego przyciskach i **nie schodzi** na zasłoniętą mapę: człowiek
obsługujący telefon klawiaturą albo przełącznikiem nie wypadnie z alarmu w nic.
Po zamknięciu fokus wraca tam, gdzie był.

Okno dostaje fokus wyłącznie po to, żeby czytnik zaczął czytać od jego treści —
obwódki tam nie rysujemy, bo niebieska ramka wokół czerwonego alarmu myliłaby
co do tego, co jest do naciśnięcia.

## Co jest mówione na głos

Doszły dwa niewidoczne pola, których treść czytnik ogłasza sam:

- **podniesienie poziomu na żółty** — ten poziom nie otwiera ekranu alarmu.
  Widać go na karcie, banerze i w powiadomieniu, ale czytnik ekranu nie ogłaszał
  zmiany: osoba niewidoma słyszała tylko krótki sygnał, bez informacji, co i gdzie.
  (Wcześniejsza wersja tej notatki twierdziła, że osoba głucha „nie dostawała nic” —
  to nieprawda: widziała wszystkie te sygnały, a komunikat czytnika i tak jej nie
  dotyczy.);
- **powrót poziomu do zwykłego** — z wyraźnym zastrzeżeniem, że **to nie jest
  oficjalne odwołanie alarmu**, tylko wygaśnięcie naszych sygnałów. Nikt nie
  powinien wyjść ze schronienia na podstawie naszego wyliczenia;
- **komunikaty z paska na dole** — znikają po kilku sekundach, więc czytnik nigdy
  nie zdążył na nie trafić.

Komunikaty idą w języku interfejsu, tak jak reszta aplikacji.

## Klawiatura i przełącznik

Nagłówek karty województwa jest teraz przyciskiem z `aria-expanded`: da się do
niego dojść tabulatorem, nacisnąć Enter lub spację, a czytnik mówi, czy karta
jest rozwinięta. **Dotknięcie palcem działa dokładnie jak dotąd** — klik dalej
łapiemy na całej karcie.

Doszła też widoczna obwódka fokusu. Pokazuje się wyłącznie przy nawigacji
klawiaturą (`:focus-visible`) — po dotknięciu palcem nie ma jej wcale.

## Ograniczenie ruchu

Systemowe ustawienie „ogranicz ruch" obsługiwaliśmy dotąd w **jednym** miejscu
z sześciu: wyłączało jedną kropkę w dzienniku, a alarm dalej pulsował. Teraz
obejmuje wszystkie elementy z animacją bez końca — kropkę w logo, baner regionu,
tło alarmu, ikonę alarmu, kartę województwa w stanie wysokim i kropkę dziennika.

Poziom zagrożenia zostaje czytelny bez ruchu: kolor ramki, tekst i ikona nigdzie
nie zależały od animacji. Krótkie przejścia przy pojawieniu się elementu
(0,14–0,18 s) zostają — one nie migoczą.

Dla porządku: tło alarmu zmieniało się co 1,1 s, czyli poniżej jednego cyklu na
sekundę. Próg, przy którym mówi się o ryzyku dla osób z padaczką fotogenną, to
**powyżej trzech błysków na sekundę** — nigdy go nie przekraczaliśmy. Poprawka
jest z szacunku dla ustawienia, które ktoś świadomie włączył, a nie dlatego, że
aplikacja komuś zagrażała.

## Dwie poprawki interfejsu przy okazji

**Okno aktualizacji wchodziło pod górny pasek.** Jego wysokość liczyliśmy ze zmiennej,
której aplikacja nigdy nie ustawiała, więc zawsze zakładaliśmy pasek o wysokości
52 px. Na wąskim telefonie pasek ma dwa rzędy przycisków, więc okno z dłuższą
listą zmian wchodziło pod niego: tytuł znikał za ikonami, a przewinąć dało się
tylko to, co wystawało z samego okna. Teraz wysokość liczy się z rzeczywistego
położenia paska i przelicza się, gdy on albo dolny stos się zmieni. Zmierzone na
ekranie 360 × 640: okno zaczyna się 11 px pod paskiem, lista się przewija,
przyciski zostają widoczne, a krótka lista nie rozciąga okna.

**Wiersz ze źródłami danych urywał się wielokropkiem.** Teraz przewija się palcem
w bok. Wygaszenie prawej krawędzi mówi, że tekst ciągnie się dalej, i znika po
dojechaniu do końca. Krótkie dotknięcie dalej otwiera „O aplikacji”.

## Czego to wydanie NIE zawiera

- opisu sytuacji jednym zdaniem zamiast mapy,
- rozróżnialnych wzorów wibracji dla poziomów,
- regulacji wielkości tekstu w aplikacji,
- dostępnej listy schronień w GROCIE.

Wszystko to jest zaplanowane na kolejne wydania.

## Czego nie udało się sprawdzić

**Pełnoekranowego alarmu nad ekranem blokady z włączonym TalkBackiem.**
Android 14 blokuje uruchamianie tego ekranu z tła na emulatorze, więc tej jednej
ścieżki — najważniejszej dla osoby niewidomej — nie da się u nas przetestować
deterministycznie. Wymaga prawdziwego telefonu i prawdziwego powiadomienia.
Do czasu takiego testu nie twierdzimy nigdzie, że Strażnik jest dostępny dla
osób niewidomych.
