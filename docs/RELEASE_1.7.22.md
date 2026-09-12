# Strażnik 1.7.22 — alarm ma powstać i dotrzeć

Wydanie porządkuje trzy rzeczy: liczenie punktów w dłuższym zdarzeniu, niezawodność
powiadomień oraz czytelność okien informacyjnych. Powstało po audycie z 11 września
2026, a każdą zmianę sprawdzono na danych albo na urządzeniu.

## Punktacja

Limit klasy źródła jest teraz przydzielany po wygaszeniu wiekiem i od najmocniejszego
sygnału. Wcześniej w ataku trwającym dłużej niż pół godziny stare, wygaszone wpisy
wypełniały limit, a świeży obiekt tuż przy granicy nie wnosił już nic. Cztery tory
sprzed 55 minut razem z nowym alarmem czasu dolotu dawały 1,33 pkt zamiast 5,33, a
nowy Alert RCB obok starego — 0,67 zamiast 2,00.

Poziom zagrożenia jest przeliczany co 45 sekund także wtedy, gdy nie przyszedł żaden
nowy sygnał, i przeżywa restart serwera. Wcześniej po cichej godzinie aplikacja wciąż
„pamiętała" poprzedni poziom, więc kolejny wzrost mógł nie wysłać powiadomienia.

Alarmy powietrzne z Ukrainy są wreszcie odczytywane: dane o zachodnich obwodach
przychodzą jako rejony, a czytaliśmy tylko pole zawierające obwody okupowane, więc ten
sygnał nie zadziałał ani razu. Cała ta klasa ma teraz własny limit 1 pkt, żeby kilka
obwodów naraz nie zapaliło żółtego poziomu bez ani jednego obiektu na mapie. Doszedł
obwód żytomierski.

## Powiadomienia

**Samo przeniesienie od sąsiada nie budzi już telefonu.** Województwo bez własnego
sygnału widzi podniesiony poziom na mapie i w panelu, ale powiadomienie rusza dopiero,
gdy pojawi się w nim własny sygnał. Jedno zdarzenie potrafiło wcześniej obudzić cztery
regiony naraz.

Push do aplikacji ma termin ważności 15 minut, znacznik czasu zdarzenia i trzy próby
wysyłki. Telefon, który był offline, nie dostanie już pełnoekranowej syreny o zdarzeniu
sprzed kilku godzin, a jeden chwilowy błąd po stronie Google nie gubi alarmu. Blokada
powtórzeń zapisuje się dopiero po udanej wysyłce, a stan wysyłki widać w `/api/health`.

Alert RCB wydany w czasie przerwy w działaniu serwera jest punktowany normalnie po
starcie, jeśli wydano go w ostatniej godzinie — wcześniej przepadał bezpowrotnie.
Poprawiono też rozpoznawanie końca alertu: zwrot „obowiązuje do odwołania" opisuje
alert wciąż obowiązujący i nie może go wyciszać, a „Alert RCB zakończony" jest
rozpoznawany jako odwołanie.

## Wygląd okien

Wszystkie okna informacyjne mają teraz ograniczoną wysokość i przewijanie — wcześniej
dłuższa treść, na przykład w Ustawieniach czy Źródłach, była ucinana bez możliwości
przewinięcia. Okno aktualizacji jest kartą z przewijaną listą zmian i osobnym rzędem
przycisków, więc opis nie ściska już przycisków, a komunikat o postępie jest zawsze
widoczny.

## Tryb awaryjny

Silnik wbudowany liczy tak samo jak serwer, respektuje wyciszenie dzwonkiem i
powiadamia o wszystkich obserwowanych „Moich miejscach", nie tylko o pierwszym.
Adresy z kanałów RSS są przyjmowane wyłącznie w protokole http i https.

## Czego to wydanie nie zmienia

Progresja zagrożeń 2,5 / 3,0 / 3,5 nadal działa wyłącznie w trybie cienia i niczego nie
wysyła. Nie zmieniono progów żółtego ani czerwonego alarmu.
