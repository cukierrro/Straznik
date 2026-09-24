# Strażnik 1.7.78 — cichszy żółty i alert RCB czytany z treści

**24 września 2026**, versionCode 107. Poprzednie wydanie:
[1.7.76](RELEASE_1.7.76.md) (Strażnik po ukraińsku). Numeru 1.7.77 nie ma
w obiegu.

## Głośność sygnału uwagi — nowa regulacja i naprawiona hierarchia

Czytelnicy zgłaszali, że **żółty sygnał uwagi budzi w nocy**. Pomiar pokazał, że
mieli rację bardziej, niż się spodziewaliśmy: przy otwartej aplikacji żółty gong
miał **−5,8 dBFS RMS**, a syrena czerwonego alarmu **−10,1 dBFS** — czyli sygnał
uwagi był o **4 dB głośniejszy od alarmu**, choć w otwartej aplikacji oba grają na
tym samym strumieniu multimediów. Wzięło się to z dawnej poprawki „czerwony jest
za cichy", która przestrzeliła w drugą stronę.

Teraz żółty stoi ok. **4,5 dB pod syreną**. Czerwonego alarmu nie ściszyliśmy
i nie zamierzamy — nowy test (`scripts/test_glosnosc_alarmow.cjs`) nie przepuści
zmiany, po której żółty znów byłby głośniejszy.

Doszło też ustawienie: <kbd>⚙</kbd> → <kbd>Dźwięk</kbd> → **Głośność sygnału uwagi
(żółty)** z trzema stopniami — <kbd>Normalny</kbd>, <kbd>Ciszej</kbd> (około
dziesięć razy ciszej) i <kbd>Bez dźwięku</kbd> (zostaje baner i wibracja).
Dotyczy **wyłącznie żółtego**.

* Na **Androidzie** działa i przy otwartej aplikacji, i przy zgaszonym ekranie.
  Android nie pozwala ustawić głośności pojedynczego powiadomienia, więc wybór
  sprowadza się do kanału: doszły dwa nowe kanały („Podwyższona uwaga — ciszej"
  i „…— bez dźwięku"), widoczne w systemowych ustawieniach powiadomień.
* Na **iPhonie** zmienia tylko dźwięk w otwartej aplikacji. Głośność
  powiadomienia push wybiera system i aplikacja nie ma na nią wpływu.

## Nie przeszkadzać — co naprawdę się dzieje

Sprawdziliśmy to pomiarem na Pixelu 7 z Androidem 14, a nie z dokumentacji.
Wyniki trafiły do instrukcji, bo dotąd nikt tego nie opisywał:

* **Zwykłe Nie przeszkadzać wycisza żółty, a czerwony przez nie przechodzi** —
  syrena gra, ekran się zapala, alarm pełnoekranowy pokazuje się nad blokadą.
  Dla kogoś, komu przeszkadza nocny żółty, to gotowe rozwiązanie bez czekania na
  jakąkolwiek aktualizację.
* Działa tak dlatego, że Nie przeszkadzać **domyślnie przepuszcza alarmy**.
  Jeśli wyłączysz w jego wyjątkach pozycję „Alarmy", czerwony przestanie się
  pokazywać. Instrukcja mówi teraz wprost, żeby zostawić ten wyjątek włączony.
* **„Całkowita cisza" wycisza także czerwony alarm** i nie da się tego obejść
  z poziomu aplikacji — Android nie robi w tym trybie wyjątku nawet dla alarmów.
  To ostrzeżenie jest teraz w instrukcji w ramce.
* Na **iPhonie** to samo, co Nie przeszkadzać, robi Tryb skupienia: czerwony jest
  oznaczony jako powiadomienie czasowe i przebija skupienie, żółty nie.

Dla osób, które świadomie wyłączyły wyjątek dla alarmów, doszedł **opcjonalny**
przycisk <kbd>🌙 Alarm mimo Nie przeszkadzać</kbd> w <kbd>⚙</kbd> →
<kbd>Alarmy</kbd>. Po przyznaniu systemowej zgody czerwony alarm pokaże się
wtedy na pełnym ekranie i zapali ekran. **Dźwięku to nie przywróci** — system
trzyma wtedy głośność alarmów wyciszoną — a „Całkowita cisza" blokuje alarm
niezależnie od tej zgody. Przycisk widać tylko wtedy, gdy zgody nie ma, nikt
o nią nie jest proszony przy starcie, i można ją w każdej chwili cofnąć.

## Alert RCB czytany z treści komunikatu

Punkty za Alert RCB brały się dotąd wyłącznie z kanału RSO/TVP, a ten niesie
czasem tylko **część odbiorców**. 24.09 i 17.09.2026 komunikat poszedł „do
odbiorców na terenie woj. podkarpackiego i lubelskiego", a punktowało się samo
lubelskie — 17.09 dotyczyło to nawet alertu 3. poziomu („znajdź bezpieczne
miejsce", 4,5 pkt).

Teraz kolektor otwiera artykuł z gov.pl z bieżącego dnia, bierze z niego treść
komunikatu (stąd poziom 1/2/3) i pełną listę województw, i punktuje tylko te,
których nie niesie żywy alert RSO. Odtworzenie 31 artykułów z 1–24.09.2026 nie
dało ani jednego fałszywego dodania.

**Tryb awaryjny robi teraz to samo.** Wcześniej miał dokładnie tę samą dziurę —
a działa właśnie wtedy, gdy serwer jest nieosiągalny. Parser przeniesiony 1:1
i sprawdzony na czterech prawdziwych artykułach: wynik co do znaku identyczny
z serwerem. Koszt to ~7 kB po kompresji, tylko w dni z powietrznym komunikatem.

## Pasek historii pokazywał czerwony alarm tam, gdzie był żółty

Zgłoszenie czytelnika. Pasek pod mapą liczył poziom z samej sumy punktów, a od
1.7.74 czerwony wymaga **klucza**: alertu RCB „znajdź bezpieczne miejsce" albo
realnego obiektu uderzeniowego blisko granicy. Bez klucza 4+ pkt to na mapie
**żółty** — a pasek malował wtedy czerwień i sugerował alarm, którego nigdy nie
było. Poranek 23 września wyglądał na nim jak czerwony alarm.

Poziom bierze się teraz z tej samej oceny, która maluje mapę. Dotyczy obu
ścieżek — pasek liczy się w aplikacji także dla danych z serwera.

## Naprawione po drodze

* **Tryb awaryjny w ogóle nie sygnalizował żółtego poziomu.** Od 13.09 kanał
  żółtego nazywa się inaczej, a wbudowany silnik wysyłał powiadomienie na stary
  identyfikator, kasowany przy każdym starcie — Android odrzucał je bez śladu.
  Czerwony był nietknięty.
* **Karta maszyny pokazuje prędkość w km/h i w węzłach**: „525 km/h (284 kt)".
  Czytelnik zgłosił podejrzenie, że wartość opisana jako km/h jest w węzłach;
  dane z produkcji potwierdziły, że przeliczenie jest poprawne — teraz widać oba
  odczyty i nie trzeba wierzyć na słowo.
* **Przyciski „zwiń" i „zamknij" na karcie obiektu** nie odjeżdżają już przy
  przewijaniu treści.
* **Krzyżyk zamykający panel sygnałów** dostał tę samą ikonę i odstęp co karta
  obiektu — jeden styl zamykania w całej aplikacji.
* **Podpowiedzi przycisków** 2D/3D, obcych maszyn i powiadomień zostawały po
  polsku w wersji angielskiej (zgłoszenie #1 z GitHuba). Dodane tłumaczenia
  angielskie i ukraińskie.
* **Syrena na iPhonie** prosi teraz o sesję audio odblokowującą wyciszenie
  dzwonkiem. Żółty sygnał celowo tego nie robi, żeby nie przebijał wyciszenia.
* **Skrót do strony na ekranie głównym** nazywa się „Strażnik (strona)"
  i mówi, skąd wziąć aplikację — wcześniej był nie do odróżnienia od APK.
* **Instrukcja iPhone'a** ostrzega o przekazywaniu alarmu na Apple Watch.

## Uwagi

Wydanie nie zmienia progów alarmu ani punktacji poza opisanym wyżej
uzupełnieniem województw z treści komunikatu RCB. Nie wysłano żadnych alarmów
testowych do użytkowników; wszystkie pomiary i testy wykonano lokalnie na
emulatorze Pixel 7 z Androidem 14 oraz na publicznych stronach gov.pl.
