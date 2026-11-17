# Wydanie 1.8.09 — czas dolotu do zapisanych miejsc, zapas przy awarii NEPTUN-a

versionCode 139, versionName 1.8.09. 17 listopada 2026. Wspólny numer dla Androida i iPhone'a.

<!-- zmiany -->
- Czas dolotu do zapisanych dokładnych lokalizacji jest liczony tą samą prędkością co czas do granicy i województwa. Wcześniej potrafił pokazać kilka godzin dla drona, który był niecałą godzinę od granicy.
- Gdy karta obiektu pisze „kurs nieznany — czasu dolotu nie szacujemy”, czas do zapisanych miejsc też się nie pojawia. Odległość zostaje.
- Gdy NEPTUN przestaje nadawać na żywo, mapa i alarmy obwodów na Ukrainie odświeżają się co 10 sekund z zapasowego odczytu.
<!-- /zmiany -->

## Czas dolotu do zapisanych miejsc

17 listopada 2026 rano, przy zmasowanym nalocie na zachodnią Ukrainę, karta drona nad Mikulińcami pokazywała „do woj. lubelskie: 47–51 min”, a niżej „Dom: 299 km · ~572 min”. Dla drona nad Bursztynem: 31–40 min do granicy i ~529 min do domu w Lublinie, 265 km dalej.

Czas do granicy i do województwa liczy się prędkością, na której opiera się powiadomienie: podaną przez serwer, a bez niej większą z dwóch — zmierzonej z ruchu i typowej dla obiektu (dla drona 180 km/h). Czas do zapisanego miejsca brał natomiast samą prędkość z dwóch ostatnich punktów śladu. Przy meldunkach, które przeskakują między miejscowościami, wychodziło z tego 30–80 km/h, więc zapas czasu był zawyżony kilka razy.

Teraz wszystkie czasy na karcie liczą się jedną prędkością. Czas do zapisanego miejsca nie jest więc nigdy dłuższy, niż wynika z prędkości typowej. Dla przykładów powyżej wychodzi ok. 97 i 85 minut.

Druga niespójność z tego samego poranka: karta drona nad Lwowem pisała „kurs nieznany — czasu dolotu nie szacujemy”, a niżej podawała „Dom: 188 km · ~144 min”. Teraz w takiej sytuacji przy zapisanym miejscu jest odległość i „brak ETA”.

Czas do zapisanych miejsc nadal liczy się tylko na urządzeniu; lokalizacje nie trafiają na serwer.

## Zapas przy awarii NEPTUN-a

Tego samego ranka, ok. 7:30, kanał na żywo NEPTUN-a przestał przyjmować połączenia od wszystkich odbiorców, a jego strona działała dalej. Strażnik miał zapasowy odczyt, ale korzystał z niego rzadko (raz na próbę ponownego połączenia, czyli przy dłuższej awarii raz na minutę) i nie pobierał nim alarmów obwodów. Wskaźniki „NEPTUN” i „Alarmy UA” były czerwone, a alarmy obwodów stały w miejscu.

Teraz, dopóki kanał na żywo nie wróci, serwer co 10 sekund pobiera zapasowo zarówno obiekty, jak i alarmy obwodów. Pusta albo nietypowa odpowiedź nie kończy alarmów. Wskaźniki są zielone, gdy zapasowe dane są świeże. Ta zmiana działa na serwerze od 17 listopada 2026, 7:50, także dla starszych wersji aplikacji i strony.

## Media sąsiadów

Na serwerze, od 13–14 listopada 2026, także dla starszych wersji:

- Estonia: nazwa aplikacji lub systemu ostrzegania („air alert app”, „ohuteavitusrakendus”) nie jest już traktowana jak ogłoszenie alarmu.
- Litwa: wypowiedź w formie „ktoś o temacie: cytat” to nie ogłoszenie.
- Mołdawia i Rumunia: komentarze, opinie i podsumowania nie trafiają do okna źródeł jako zdarzenia. Rumunia na stałe zostaje bez punktów, tylko do podglądu.
