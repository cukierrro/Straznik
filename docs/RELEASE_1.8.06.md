# Wydanie 1.8.06 — alarm spóźniony i ponowny mówią, co się dzieje, a opisy, co wiadomo

versionCode 136, versionName 1.8.06. 3 listopada 2026. Pierwsze wydanie od 1.8.04 ze wspólnym numerem dla Androida i iPhone'a; na iPhonie 1.8.05 pominięto.

<!-- zmiany -->
- Czerwony wraca po wyciszeniu tylko wtedy, gdy sytuacja realnie się pogarsza: nowy albo wyraźnie bliższy obiekt albo Alert RCB wyższego stopnia.
- Android: spóźniony alarm nie jest już cichy. Gra normalnie i mówi, z której godziny jest zagrożenie.
- Opisy dronów i fali mówią tylko to, co wiadomo: kurs domniemany albo nieznany nie brzmi już jak „kursem na Polskę”.
- iPhone: „Bez dźwięku” wycisza żółty także przy zamkniętej aplikacji, a powiadomienia przychodzą w języku aplikacji.
- GROTA ma wykaz PSP z 2 listopada: 88 138 punktów. Gdy zapisane schronienie się zmieniło, aplikacja o tym mówi.
<!-- /zmiany -->

## Ponowny czerwony

Po wyciszeniu czerwonego serwer ponawia alarm tylko wtedy, gdy obiekt z pozycją punktową, wysoką wiarygodnością i co najmniej 2 zgłoszeniami jest do 30 km od województwa i jest nowy (poprzednio nie był tak blisko, a jego punkt leży co najmniej 5 km od znanych) albo zbliżył się o co najmniej 10 km. Odstęp to co najmniej 15 minut, limit 2 ponowienia. Alert RCB 2. lub 3. stopnia ponawia alarm zawsze, raz na alert. Powiadomienie zaczyna się od „PONOWNY ALARM”.

Przeliczone na zapisanych sygnałach z 92 dni: 5 ponowień z obiektów i 2 z Alertów RCB. Noc 1 listopada nie dałaby ponowienia. Po restarcie serwera obiekty widoczne w tej chwili uznaje się za znane, więc restart nie wywoła alarmu. Reguła działa na serwerze od 2 listopada, więc dotyczy też starszych wersji aplikacji. Nie przeszła jeszcze przez prawdziwy alarm.

## Spóźniony alarm (Android)

Do 1.8.05 powiadomienie spóźnione ponad 10 minut przychodziło bez dźwięku i bez pełnego ekranu. Zapisane czerwone sprzed 10–15 minut były jednak aktualne w 49 przypadkach na 50, więc cisza mogła kosztować więcej niż niepotrzebny dźwięk.

Teraz alarm gra zawsze. Od 3 minut opóźnienia mówi, o ile się spóźnił i z której godziny jest zagrożenie; ponad 10 minut czerwony pokazuje „SPÓŹNIONY ALARM”. Tekst zależy od zegara telefonu, sam alarm nie. Wiadomości starszej niż 15 minut Firebase już nie dostarcza. W dzienniku alarmów widać, o ile minut się spóźnił. Sprawdzone na emulatorze Pixel z Androidem 14 przy 4–5 i 12 minutach; na Androidzie 9 i prawdziwym telefonie nie.

## Opisy kursu

Wieczorem 2 listopada panel pisał „Fala obiektów: 6 obiekty kursem na Polskę”, a wszystkie sześć miało kurs domniemany, czyli namiar źródła na miejscowość na Ukrainie („курсом на Луцьк”). Fala w ogóle nie sprawdza kursu.

- Fala: „6 obiektów w 15 min bliżej niż 150 km od woj. lubelskie (kurs domniemany: 6)”, także w EN i UK i dla starszych wpisów w historii.
- Dron z kursem domniemanym: „w odległości 110 km od granicy PL [kurs domniemany — na cel]”. Opis „kursem na granicę PL” zostaje tylko przy kursie znanym.
- Punktacja bez zmian. Przeliczone od 28 września: bez fali znika najwyżej 4 ze 196 żółtych i 2 z 40 czerwonych, a 13 Alertów RCB traci część wyprzedzenia, np. 80 → 19 minut. Fala głównie przyspiesza alarm.

Serwer i strona piszą tak od 2 listopada.

## iPhone

Powiadomienia alarmowe mają znacznik uruchamiający rozszerzenie powiadomień, obecne w App Store od 1.7.98. Rozszerzenie stosuje język aplikacji i ustawienie dźwięku żółtego także przy zamkniętej aplikacji. Czerwonego dźwięku nie dotyka, a gdy rozszerzenie padnie albo nie zdąży, iOS pokazuje wiadomość serwera bez zmian. Znacznik działa na serwerze od 2 listopada; przy prawdziwym alarmie jeszcze go nie sprawdzono.

Instrukcja dla iPhone'a mówiła, że powiadomienie spóźnione ponad 10 minut pokazuje się cicho. Kod iOS tego nie robi: taki push tylko nie przejmuje ekranu otwartej aplikacji. Opis poprawiony.

## GROTA

Wykaz PSP z 2 listopada 2026: 88 138 punktów zamiast 87 835 (867 dodanych, 564 usunięte, 672 zmienione). Siedem punktów przesunęło się o co najmniej 3 km, z czego cztery to poprawki źle postawionych. Kto zapisał punkt pod 1.8.01–1.8.05, zobaczy ostrzeżenie, jeśli jego schronienie się zmieniło.

Zrzuty `g13`, `g29` i `g31` pochodzą z budowy debugowej tego samego commitu, a stan do `g31` został wpisany do pamięci aplikacji; szczegóły w `docs/screens/README.md`.
