# Wydanie 1.7.99 — uczciwsza punktacja, polskie opisy dronów, nowy wykaz PSP

versionCode 128, versionName 1.7.99. 19 października 2026.

<!-- zmiany -->
- Drony nie podbijają już sąsiednich województw drugi raz: każdy dron ma własną odległość do każdego województwa.
- Artykuł, który tylko powtarza Alert RCB, nie daje drugich punktów.
- Opisy dronów w panelu po polsku: „wiarygodność”, przecinek, „3 potwierdzenia”, „X km od woj. …”.
- GROTA: nowy wykaz punktów schronienia PSP z 19 października.
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

## GROTA: wykaz PSP z 19 października

GROTA_WYKAZ

## iPhone: opis w Głośności alarmu

Na iPhonie rozwijacz „Zanim zmienisz: co to zmienia” otwierał pusty prostokąt — oba
jego akapity dotyczą Androida. Teraz jest tam opis: syreną czerwonego steruje iOS,
a zagra mimo wyciszenia, jeśli w Ustawieniach iPhone'a → Strażnik → Powiadomienia
włączone są Alerty krytyczne. Zgłoszenie użytkownika iPhone'a.

## Czego nie sprawdziliśmy

Nowych reguł przy prawdziwym alercie RCB po wdrożeniu (sprawdzone na historii 11–19.10
i testami). Opisu w Głośności alarmu na fizycznym iPhonie.
