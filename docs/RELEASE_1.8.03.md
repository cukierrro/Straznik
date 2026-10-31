# Wydanie 1.8.03 — uczciwy opis drona „kursem na…” i mniej fałszywych ostrzeżeń

versionCode 132, versionName 1.8.03. 28 października 2026.

<!-- zmiany -->
- Dron zgłoszony tylko z celem („leci w stronę: …”) ma na mapie ikonę bez kierunku, a karta mówi wprost: co zgłoszono, że położenie jest umowne i że kierunek lotu nie jest znany.
- Taki dron daje punkty tylko wtedy, gdy jest bliżej niż 150 km od granicy — mniej żółtych ostrzeżeń bez późniejszego alertu RCB.
- Okno źródeł podaje zapasowe źródło samolotów: FlyItalyADSB (licencja CC BY-SA 4.0).
<!-- /zmiany -->

## Dron „kursem na…”: co naprawdę wiadomo

Kanały monitoringu często piszą tylko „dron leci w stronę miejscowości X”. Takie zgłoszenie
jest prawdziwe, ale nie mówi, gdzie dron był w chwili zgłoszenia ani skąd nadlatuje. NEPTUN
stawia wtedy ikonę w umownym punkcie przed celem i wylicza kąt z tego punktu na cel. Ten kąt
nie pochodzi ze zgłoszenia.

Do tej pory Strażnik obracał ikonę według tego kąta, a karta pisała „kurs na cel —
przedłużenie trasy prowadzi w stronę Polski”. Sprawdziliśmy 30 dni danych: w zachodniej
Ukrainie taki kąt wskazywał Polskę w 99% przypadków, a od lotu zaobserwowanego później różnił
się zwykle o ponad 90°. Trzy różne drony „na” ten sam punkt dostały kurs 248° (w stronę
Polski), a faktycznie poleciały na wschód.

Teraz:

- **Ikona bez kierunku** — jak przy kursie nieznanym: bez obrotu, z przerywaną obwódką
  i znakiem zapytania.
- **Karta** ma plakietkę „położenie umowne” i jeden blok: *Co zgłoszono*, *Położenie*,
  *Kierunek*, *Polska* (czy obiekt liczy się do punktacji) i *Czas dolotu* (nie liczymy, bo
  położenie i kierunek nie są znane). Opis obiektu mówi „leci w stronę: …”.
- Dron z położeniem z meldunku, ale z kątem wyliczonym przez NEPTUN, ma krótszą wersję:
  „Położenie: z meldunku. Kierunek: nieznany”.

## Punkty: tylko do 150 km od granicy

Dron „kursem na…” liczy się do punktacji tylko wtedy, gdy jest bliżej niż 150 km od granicy
Polski; bliżej — jak dotąd. Przeliczyliśmy na zapisanych sygnałach 30 dni (67 alertów RCB):
20 żółtych ostrzeżeń bez późniejszego alertu RCB mniej, wyprzedzenie żółtym przed alertem RCB
utracone raz (16 minut, 8 października), czerwonym — ani razu. Wcześniej rozważany wariant
„jak kurs nieznany” (połowa punktów) gubił pięć żółtych i cztery czerwone wyprzedzenia, więc
go odrzuciliśmy.

Serwer liczy tak od 28 października. W tej wersji tak samo liczy aplikacja, gdy serwer nie
odpowiada.

## Kurs z ruchu bez umownych punktów

Gdy po zgłoszeniu „kursem na X” przyszło potwierdzenie „w X”, przeskok z umownego punktu do
miejscowości był liczony jako ruch drona — i dawał „kurs zmierzony” równy kątowi z umownego
punktu. Umowny punkt nie jest już traktowany jako obserwacja, ani na serwerze, ani w trybie
bez serwera.

## Samoloty: zapas FlyItalyADSB

Gdy adsb.lol nie odpowiada, serwer bierze samoloty z FlyItalyADSB (pisemna zgoda serwisu,
licencja CC BY-SA 4.0). Okno źródeł i informacja o licencjach podają to źródło.

## Drobne

- Powiadomienie o alarmie w obwodzie Ukrainy podaje nazwę obwodu po polsku („w obwodzie
  żytomierskim”) — poprawka na serwerze, działa we wszystkich wersjach od 28 października.
