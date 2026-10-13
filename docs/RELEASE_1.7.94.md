# Wydanie 1.7.94 — nowy wykaz schronień PSP, „Poczuj” jak prawdziwy alarm

versionCode 123, versionName 1.7.94. 13 października 2026.

<!-- zmiany -->
- Nowy wykaz miejsc schronienia PSP z 12 października. Część punktów zmieniła dostępność — sprawdź swoje schronienie w GROCIE.
- Przyciski „Poczuj” wibrują teraz tak jak prawdziwy sygnał i mówią, gdy telefon jest w trybie cichym albo wibracja kanału jest wyłączona.
- W historii punkty drona, który zniknął z danych, gasną po około 30 minutach — tak jak na mapie na żywo.
- Komunikaty pokazywane przy otwartych ustawieniach są już widoczne nad oknem.
<!-- /zmiany -->

## Strażnik w Google Play

Od 13 października Strażnik jest publicznie w Google Play (Polska i pozostałe kraje Europy,
bez Białorusi i Rosji). Przycisk „Pobierz na Androida” na stronie, instrukcja PL/EN/UK,
strony GROTY i historia zmian prowadzą teraz do sklepu; plik APK z GitHuba jest dalej
dostępny jako druga możliwość. Wersja ze sklepu i APK są podpisane tym samym kluczem,
więc wersję ze sklepu można zainstalować na istniejącą — ustawienia zostają. Wersję ze
sklepu aktualizuje sklep.

## GROTA — nowy wykaz PSP (12.10)

Paczka GROTY jest zbudowana z wykazu punktów schronienia Państwowej Straży Pożarnej
opublikowanego 12 października 2026 — 86 712 punktów. W aplikacji był dotąd wykaz
z 28 września (86 533 punkty). Pole daty w samym zbiorze nadal pokazuje 5 października;
liczy się data publikacji pliku. Między 5 a 12 października: 2 punkty doszły,
39 skreślono (Zielona Góra 20, Czerwieńsk 9, Lublin 7), żadnych przesunięć współrzędnych,
22 zmiany dostępności.

Nowy wykaz PSP zmienił dostępność 136 punktom i prawie wyłącznie w jedną stronę:
z „Całodobowo” na „Na żądanie”. Najmocniej w podkarpackiem — w Ustrzykach Dolnych
punktów „Całodobowo” jest teraz 9 zamiast 52, w Leżajsku 2 zamiast 33. Punkty nie
zniknęły: zostają na mapie z etykietą „Na żądanie”, czyli obiekt jest zamknięty,
a zarządca lub mieszkańcy powinni go otworzyć w razie zagrożenia. Jeśli masz tam
zapisane schronienie, otwórz jego kartę i sprawdź dostępność, a zarządcę zapytaj
wcześniej, kto ma klucz. Dostępność w wykazie jest parametrem pomocniczym z etapu
rozpoznania i zmienia się razem ze sposobem użytkowania budynku; powodu wykaz nie podaje.

## „Poczuj” — wibracja jak prawdziwy sygnał

Przyciski „Poczuj: żółty / czerwony” w ⚙ → Dźwięk wyglądały na wybór jednej z dwóch
opcji, a w aplikacji często nic nie robiły: wibracja ze strony to dla Androida
„dotyk” i w trybie cichym milczy, choć prawdziwy alarm wtedy wibruje. Teraz w aplikacji
na Androidzie żółty wibruje jak powiadomienie, a czerwony jak alarm — także w trybie
cichym. Gdy żółty nie może zawibrować (tryb cichy albo wyłączona wibracja kanału),
aplikacja to mówi, bo prawdziwy sygnał też by nie zawibrował. Pod przyciskami jest
zdanie, że wzorów się nie wybiera, a po stuknięciu przycisk nie zostaje podświetlony.

Przy okazji: komunikaty pokazywane przy otwartych ustawieniach były pod oknem
niewidoczne — teraz są nad nim.

## Historia: zgubione drony gasną szybciej

Od 11 października serwer gasi punkty drona, który zniknął z danych NEPTUN-a, po około
30 minutach zamiast 60 — chyba że zniknął bliżej niż 50 km od granicy, bo wtedy mógł
wlecieć nad Polskę. Historia w aplikacji liczy teraz tak samo jak mapa na żywo.
Powiadomienia i wyprzedzenie względem alertów RCB bez zmian.

## iPhone

- Test czerwonego alarmu idzie jako alarm krytyczny, gdy jest zgoda Apple; bez niej
  aplikacja uprzedza przed testem, że przy wyciszonym telefonie będzie cichy.
- Treść testu jest w języku aplikacji.
- „Głośność sygnału uwagi (żółty)” na iPhonie zmienia tylko sygnał przy otwartej
  aplikacji — aplikacja mówi to wprost.

## Język alarmów

Prawdziwe alarmy przychodzą po polsku, niezależnie od języka aplikacji — mówi to teraz
nota przy teście (EN/UK) i instrukcja.

## Czego nie sprawdziliśmy

Nowych przycisków „Poczuj” na fizycznym telefonie (sprawdzone na emulatorze Pixel 7
w dzienniku wibracji: tryb normalny i cichy), prawdziwego zegarka i opaski, TalkBacka.
