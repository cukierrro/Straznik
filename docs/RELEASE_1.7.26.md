# Strażnik 1.7.26 — alarmy UA punktowane po odległości

Zgłoszenie z 12.09.2026: w panelu sygnałów obwód **rówieński** i **żytomierski**
ogłaszały się jako „graniczy z woj. lubelskie" i dostawały tyle samo punktów co
obwód wołyński. Ani jeden, ani drugi z Polską wspólnej granicy nie ma.

## Co było źle

`UA_BORDER_OBLASTS` była płaską listą pięciu obwodów, w której każdy wpis znaczył
to samo: 1 pkt i tytuł „graniczy z woj. …". Rówieński leży **70 km** od Lubelskiego,
żytomierski **220 km** — a punktowane były jak obwód po drugiej stronie rzeki.
Nieprawdziwy tytuł jest gorszy niż brak tytułu: sugeruje, że zagrożenie jest tuż-tuż.

## Co jest teraz

Tabela obwodów trzyma **najkrótszą odległość między wielokątem obwodu a wielokątem
województwa**, a punkty maleją pasami:

| pas | odległość | mnożnik |
|-----|-----------|---------|
| 1 | wspólna granica | ×1,0 |
| 2 | do 120 km | ×0,6 |
| 3 | do 220 km | ×0,35 |
| 4 | do 320 km | ×0,2 |
| — | dalej | nie punktujemy |

Polska graniczy z Ukrainą **tylko** obwodem wołyńskim, lwowskim i krótkim odcinkiem
zakarpackiego w Bieszczadach. Reszta zachodniej Ukrainy jest liczona jako
wskaźnik wyprzedzający, z wagą według dystansu:

| obwód | lubelskie | podkarpackie |
|-------|----------:|-------------:|
| lwowski | 0 km ×1,0 | 0 km ×1,0 |
| wołyński | 0 km ×1,0 | 55 km ×0,6 |
| zakarpacki | 135 km ×0,35 | 0 km ×1,0 |
| iwanofrankowski | 100 km ×0,6 | 50 km ×0,6 |
| rówieński | 70 km ×0,6 | 110 km ×0,6 |
| tarnopolski | 100 km ×0,6 | 115 km ×0,6 |
| chmielnicki | 160 km ×0,35 | 190 km ×0,35 |
| czerniowiecki | 225 km ×0,2 | 180 km ×0,35 |
| żytomierski | 220 km ×0,35 | 265 km ×0,2 |
| winnicki | 280 km ×0,2 | 305 km ×0,2 |

Doszło pięć obwodów, których wcześniej w ogóle nie było (tarnopolski,
iwanofrankowski, chmielnicki, czerniowiecki, winnicki) — z małą wagą, ale są.
Ten sam obwód potrafi ważyć różnie dla dwóch województw: zakarpacki jest przy
granicy Podkarpacia i 135 km od Lubelskiego, wołyński odwrotnie.

Limit klasy `ua_alert` zostaje **1,0 pkt**, czyli poniżej progu żółtego 2,0. Nawet
alarm we wszystkich dziesięciu obwodach naraz nie zastąpi obiektu na mapie —
zmienia się tylko to, **który** alarm wypełnia ten limit jako pierwszy: teraz
najbliższy, a nie przypadkowy.

## Tytuł mówi prawdę

- przy wspólnej granicy: „Alarm powietrzny w obwodzie wołyńskim (woj. lubelskie — przy granicy)"
- dalej: „Alarm powietrzny w obwodzie rówieńskim (woj. lubelskie — 70 km)"

Po angielsku tak samo: „Air-raid alert in Rivne oblast (Lublin — 70 km)". Sygnały
zapisane przed aktualizacją nie mają zapisanej odległości i pokazują sam obwód, bez
dopisku — nie zgadujemy wstecz.

## Skąd te liczby

Z geometrii ADM1 [geoBoundaries](https://www.geoboundaries.org) (gbOpen), policzonej
skryptem `scripts/ua_oblast_rings.py`. `py scripts/ua_oblast_rings.py --check` pobiera
dane i porównuje je z `config.py` — jeśli tabela się rozjedzie, skrypt to zgłosi.
`scripts/test_spojnosc.py` pilnuje, żeby backend i wbudowany silnik aplikacji miały tę
samą tabelę, a `scripts/test_ua_alerts.py` — żeby wagi malały z odległością i żeby
żaden obwód bez wspólnej granicy nie mógł się ogłosić jako graniczący.

## Poza tym

- Okna dialogowe otwierają się od góry. Lista źródeł potrafiła otworzyć się
  przewinięta do połowy (przeglądarka ustawiała fokus na pierwszym przycisku, który
  leżał niżej) i wyglądała na uciętą u góry.
- Górna krawędź okien uwzględnia pasek stanu Androida.
- Legenda ma zapas na dole i cień „jest więcej poniżej", który znika po przewinięciu
  do końca — wcześniej ostatni wiersz kończył się dokładnie na krawędzi i wyglądał
  na ucięty.

## Zweryfikowane

Emulator Pixel 7 (Android 14). Testy: 15 pythonowych i 9 node'owych.
