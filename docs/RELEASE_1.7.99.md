# Wydanie 1.7.99 — uczciwsza punktacja, pewne i niepewne drony na mapie, nowy wykaz PSP

versionCode 128, versionName 1.7.99. 19 października 2026.

<!-- zmiany -->
- Drony nie podbijają już sąsiednich województw drugi raz: każdy dron ma własną odległość do każdego województwa.
- Artykuł, który tylko powtarza Alert RCB, nie daje drugich punktów.
- Opisy dronów w panelu po polsku: „wiarygodność”, przecinek, „3 potwierdzenia”, „X km od woj. …”.
- Dron z pozycją niepewną (meldunek „w kierunku …”) ma na mapie przygaszoną ikonę z przerywanym konturem.
- Karta obiektu pokazuje, ile punktów daje on teraz każdemu województwu, a przy zerze — dlaczego.
- Po dotknięciu drona jego okrąg niepewności jest wyraźny, a pozostałe bledną.
- GROTA: nowy wykaz PSP z 19 października — 87 316 punktów, 183 zmieniły dostępność.
- iPhone: w Głośności alarmu jest opis Alertów krytycznych.
<!-- /zmiany -->

## Przeniesienie: drony już nie liczą się dwa razy

Od 1.7.91 każdy dron daje punkty każdemu województwu w promieniu 250 km, liczone od
odległości do tego województwa. Przeniesienie dokładało do tego 40% wyniku sąsiada,
który składał się głównie z tych samych dronów. Mechanizm „bez zdarzeń wspólnych”
rozpoznawał artykuł czy alarm obwodu, ale nie drona — więc ten sam dron liczył się
u sąsiada drugi raz, a z dwóch sąsiadów dwa razy.

19.10.2026 o 7:10 świętokrzyskie z 1,1 pkt własnych miało 9,5 pkt łącznie, a podlaskie
z 0,1 pkt — 6,0. Oba świeciły na czerwono, choć nic nad nimi nie leciało.

Od 1.7.99 obiekty NEPTUN nie przechodzą do sąsiadów. Przechodzą alarmy obwodów Ukrainy,
media, lotnictwo i strefy. Przeliczone na historii 11–19.10:

| | przed | po |
|---|---|---|
| mapa czerwona tylko od sąsiadów | 1510 min | 0 |
| mapa żółta tylko od sąsiadów | 3742 min | 96 min |
| telefon wyżej, niż wynika z punktów własnych | 874 min | 60 min |

Żaden z 18 czerwonych alarmów w tym czasie nie znika; jeden przychodzi 4 minuty później.
Serwer liczy tak od wdrożenia tego wydania, więc zmiana działa od razu we wszystkich wersjach aplikacji; tryb bez serwera i historia w aplikacji — od 1.7.99.

## Media: artykuł o alercie RCB bez drugich punktów

Sugestia czytelnika. Artykuł, który tylko mówi o Alercie RCB — nazywa RCB, pisze „alert
dla…” albo cytuje alert — dostaje 0 pkt, jeśli alert RCB albo RSO dla dowolnego
województwa przyszedł do 4 godzin wcześniej (albo do 30 minut później, bo artykuł bywa
szybszy niż nasz odczyt RSO). Alert jest już policzony, media tylko go powtarzają.

Punkty zostają artykułom z informacją ponad alert: dron nad Polską, naruszenie
przestrzeni, eksplozja, szczątki, syreny, poszukiwania, niezidentyfikowany obiekt.
Artykuł o końcu zagrożenia („brak zagrożenia”, „zakończono poszukiwania”) też jest bez punktów.

Wcześniej przechodziły m.in. „RCB: alert dla województwa lubelskiego i podkarpackiego”
(19.10, po 1,0 pkt w obu), „„Atak powietrzny na terenie Ukrainy”. Alert dla Lubelskiego”
i relacje przypisane do innych województw niż alert. Na historii 11–19.10 przy trwającym
alercie punktowały po zmianie już tylko 3 artykuły — wszystkie z nową informacją.

## Opisy dronów w panelu po polsku

Tytuł sygnału z NEPTUN-a w polskim panelu miał „confidence: high”, kropkę dziesiętną
i „3 potwierdzeń”. Teraz: „wiarygodność: wysoka”, „180,9 km”, „3 potwierdzenia”.
Stare wpisy z historii aplikacja poprawia przy wyświetlaniu.

Wpis drona doliczonego do dalszego województwa (od 1.7.91) mówi teraz prawdę:
„X km od woj. …” i „⏱ … do woj. …” zamiast „od granicy” i „kursem na granicę PL”.
W trzech językach.

## Pewne i niepewne drony na mapie, punkty w karcie

19.10 wieczorem wokół Lwowa było na mapie do 9 ikon dronów naraz. Z 16 tropów NEPTUN-a
11 to były meldunki ukraińskich kanałów „dron w kierunku Rawy Ruskiej / Jaworowa / Żółkwi”,
które źródło stawia przy wymienionej miejscowości. Dokładne pozycje były cztery. Na mapie
wszystkie wyglądały tak samo.

- **Ikona.** Obiekt z pozycją niepewną (meldunek o kierunku lotu albo środek miejscowości)
  ma ten sam kolor typu, ale przygaszone wypełnienie i przerywany kontur. Kolor dalej oznacza
  typ — inny odcień pomyliłby się z FPV, dronem rozpoznawczym albo obiektem nieznanym.
  Nowy wpis w legendzie.
- **Karta obiektu.** Plakietka „pozycja potwierdzona” albo „pozycja niepewna” i wiersz
  „Punkty teraz” — ile obiekt w tej chwili daje każdemu województwu. Gdy daje zero, karta
  mówi dlaczego: limit NEPTUN-a w województwie (8 pkt) jest już pełny albo ten sam punkt
  liczy się z innego meldunku. Pozycja niepewna waży 60% pewnej (środek miejscowości 50%).
  W podglądzie historii karta pokazuje punkty z tamtej chwili.
- **Okręgi niepewności.** Przy kilku dronach obok siebie okręgi zlewały się w jedną plamę.
  Po dotknięciu obiektu jego okrąg jest wyraźny i grubszy, a pozostałe bledną.

Punktacja się nie zmienia. Przeliczyliśmy na historii 11–19.10 warianty, w których meldunki
do 40 lub 60 km od siebie liczą się jak jeden obiekt albo ważą połowę: mapa czerwona skracała
się o 10–25%, ale prawdziwe czerwone alarmy przychodziły 6–12 minut później. Zostajemy
przy pokazaniu, które obiekty są pewne i ile ważą.

## GROTA: wykaz PSP z 19 października

Nowy wykaz punktów schronienia Komendy Głównej PSP z 19 października 2026: **87 316 punktów**
(było 86 712). Doszło 872, zniknęło 268, a **183 zmieniły dostępność** — 84 z „Całodobowo”
na „Na żądanie”, 79 z „Całodobowo” na „W określonych godzinach”; najwięcej w Raciborzu,
Grudziądzu i Mogilnie. PSP poprawiło współrzędne 10 punktom; do prowadzenia wracają
2 wcześniej wykluczone za położenie, wypadają 2.

Filtry: całodobowo 19 658 · w godzinach 7504 · na żądanie 60 154; sprawdzone 85 146 ·
do sprawdzenia 895 · wątpliwe 1275. Jeśli masz zapisane schronienie, otwórz jego kartę
i sprawdź dostępność. Zrzuty instrukcji GROTY odświeżone na tej paczce.

## iPhone: opis w Głośności alarmu

Na iPhonie rozwijacz „Zanim zmienisz: co to zmienia” otwierał pusty prostokąt — oba
jego akapity dotyczą Androida. Teraz jest tam opis: syreną czerwonego steruje iOS,
a zagra mimo wyciszenia, jeśli w Ustawieniach iPhone'a → Strażnik → Powiadomienia
włączone są Alerty krytyczne. Zgłoszenie użytkownika iPhone'a.

## Czego nie sprawdziliśmy

Nowych reguł przy prawdziwym alercie RCB po wdrożeniu (sprawdzone na historii 11–19.10
i testami). Opisu w Głośności alarmu na fizycznym iPhonie. Nowej ikony i karty na fizycznym
telefonie i iPhonie — sprawdzone na emulatorze Pixel 7 i w przeglądarce.
