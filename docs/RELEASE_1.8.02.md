# Wydanie 1.8.02 — poprawna data w ostrzeżeniu GROTY, samoloty w limicie adsb.lol

versionCode 131, versionName 1.8.02. 26 października 2026.

<!-- zmiany -->
- GROTA: ostrzeżenie o zmienionym schronieniu podaje właściwy wykaz, w którym pod numerem stał stary obiekt — w 1.8.01 obie daty w zdaniu były takie same.
- Samoloty w trybie bez serwera: telefon pyta adsb.lol co niecałe 3 minuty, w granicach dobowego limitu serwisu.
<!-- /zmiany -->

## GROTA: właściwa data w ostrzeżeniu

1.8.01 ostrzega, gdy zapisane schronienie w nowym wykazie PSP jest innym obiektem. Przy
schronieniach zapisanych przed 1.8.01 komunikat jest warunkowy, bo aplikacja nie wie, z którego
wykazu pochodzi zapis. W tym wariancie zdanie podawało dwa razy tę samą datę: „W wykazie PSP
z 2026-10-26 pod tym numerem był: 51a, Kromolice… W wykazie z 2026-10-26 jest tu: …Gostyń”.
Do części „był” szła data zmiany zamiast wykazu, w którym stał jeszcze stary adres.

Teraz zdanie mówi: „W wykazie PSP z 2026-09-14 pod tym numerem był: …”. Gdy tej daty nie ma,
pada zdanie bez daty: „Pod tym numerem był wcześniej: …”. Reszta ostrzeżenia działała w 1.8.01
poprawnie: nowy adres, odległość, zamknięcie („Na żądanie”) i informacja, że wybór nowego
miejsca schronienia jest konieczny. Aktualizacja z 1.8.00 zachowuje miejsca, schronienia
i trasy — sprawdzone na emulatorze przy prawdziwej aktualizacji.

## Samoloty: w granicach limitu adsb.lol

adsb.lol pozwala na 500 zapytań na dobę z jednego adresu. Serwer pytał około 4300 razy na dobę
i od co najmniej 20 października większość zapytań była odrzucana; brakujące minuty uzupełniał
zapas adsb.fi, usunięty w 1.8.01. Po usunięciu warstwa samolotów na mapie znikała, a wskaźnik
ADS-B w źródłach świecił na czerwono.

Od 26 października wieczorem serwer pyta dokładnie w limicie: jedno zapytanie co 173 sekundy,
na zmianę dwa razy o listę maszyn wojskowych i raz o jedno koło nad krajami bałtyckimi (zamiast
dwóch kół). Lista odświeża się średnio co 4,3 minuty. Ta zmiana działa na serwerze od razu,
bez aktualizacji aplikacji.

W aplikacji zmienia się tylko tryb bez serwera: telefon pyta adsb.lol co 173 sekundy zamiast
co minutę, więc też mieści się w limicie, nawet gdy tryb awaryjny trwa całą dobę. Warstwa
samolotów nie daje punktów.
