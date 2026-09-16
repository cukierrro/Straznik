# Strażnik 1.7.53 — drony znów się ruszają, kolory alarmów nie migają

## Dlaczego ikony dronów stały w miejscu

Do wersji 1.7.47 aplikacja przesuwała ikonę „na zapas” między meldunkami: typową prędkością dla rodzaju obiektu (np. Shahed ~180 km/h) i kursem domniemanym, gdy NEPTUN nie podawał kierunku. W audycie przed 1.7.48 wyszło, że dla obiektów z przybliżoną pozycją albo bez zmierzonej prędkości ikona odlatywała tam, gdzie drona nie było — kilkanaście kilometrów od ostatniej pozycji, czasem w złą stronę — i wracała przy kolejnym meldunku. Tę prognozę wyłączyliśmy (zostawiliśmy ją tylko dla obiektów ze zmierzoną prędkością i kursem). Skutek uboczny, zgłoszony 16.09: dron stał do następnego meldunku i przeskakiwał, więc wyglądało to tak, jakby się nie ruszał.

## Co robimy teraz

- Po każdym nowym meldunku NEPTUN-a ikona **płynnie przejeżdża ze starej pozycji do nowej przez 45 sekund**. Linia trasy kończy się na ikonie, a nie na meldunku przed nią.

## Czym to się różni od dawnego ruchu

- Ikona jedzie **tylko po odcinku między dwiema prawdziwymi pozycjami**. Nigdy nie wyprzedza źródła i nie zgaduje dalszego lotu.
- W trakcie przejazdu jest **do 45 s za meldunkiem**; po nim stoi dokładnie w miejscu meldunku.
- **Skoki ponad 80 km** (np. inny obiekt pod tym samym numerem) i meldunki odebrane **po powrocie do aplikacji** z tła lub z historii pokazujemy od razu, bez przejazdu przez pół mapy.
- Obiekty **ze zmierzoną prędkością i kursem** przesuwają się jak dotąd (najwyżej 18 km i 7 min od meldunku).
- **Punkty i alarmy** liczymy jak wcześniej z meldunków, nie z pozycji ikony.

## Kolory alarmów nie migają

- Poziom województwa (żółty, czerwony) — kolor mapy i powiadomienia — **trzyma się 10 minut** od ostatniego przekroczenia progu. 16.09 podkarpackie zmieniło poziom 7 razy w pół godziny, gdy wynik wahał się przy 2,0 i 4,0; z tą zmianą byłyby 2 zmiany.
- Wzrost poziomu jest natychmiastowy, a odwołanie alertu RCB zdejmuje podtrzymanie od razu. Historia pokazuje wyniki bez podtrzymania.

## Drobne

- W historii czas wstecz wygląda jak „−5 h 57 min”; na niskich ekranach panel historii ma więcej miejsca.
- Artykuły o tym, że lotnictwo zakończyło działania, nie dają punktów.
