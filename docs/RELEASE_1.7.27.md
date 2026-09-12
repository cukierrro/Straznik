# Strażnik 1.7.27 — obiekt na mapie musi być widoczny na liście

Zgłoszenie z 12.09.2026: dron pojawił się blisko granicy, było go widać na mapie,
a w „Sygnałach" nie było go wcale i wynik się nie zmienił. Wyglądało to, jakby
aplikacja go przeoczyła.

## Co się naprawdę działo

Obiekt **nie zbliżał się do Polski**. Leciał 155 km od granicy kursem 355° (na
północ), podczas gdy kierunek na najbliższy punkt granicy to 269° (na zachód) —
**86° w bok**. Punktacja liczy pełną wagę do ±50° od kierunku na Polskę, potem
liniowo spada do zera przy ±70°. Powyżej tego obiekt nie wnosi punktów i — do
1.7.26 — nie tworzył żadnego wpisu.

Zero było policzone dobrze. Złe było to, że **nie dało się go zobaczyć**: znacznik
na mapie, pustka na liście i żadnego wyjaśnienia. Aplikacja, której cała obietnica
brzmi „zawsze widzisz pełne rozbicie", milczała akurat wtedy, gdy użytkownik pytał
„dlaczego nic się nie stało".

## Co jest teraz

Sekcja „Sygnały" kończy się listą **„Na mapie, ale bez punktów"** — obiekty do
250 km od granicy, które nie wnoszą nic do wyniku, z podaniem powodu:

- `kurs 86° od kierunku na Polskę` — leci w bok albo od nas,
- `kurs nieznany — nie liczymy jako zbliżający się`.

Wiersze są wygaszone i mają jawną plakietkę **0 pkt**, żeby nie udawały wkładu do
sumy. Dotknięcie przenosi mapę na obiekt, tak jak w pozostałych listach.

**Punktacja nie zmieniła się ani o punkt.** Obiekt lecący na północ 150 km od
granicy nadal wnosi zero — zmieniło się tylko to, że widać, iż aplikacja go widzi
i dlaczego go nie liczy.

## Okno „Źródła danych" po angielsku

Ostatni ekran bez wersji angielskiej: opisy sześciu źródeł, powody czerwonej diody,
stan („działa" / „nie odpowiada"), licznik kanałów RSS i podsumowanie zostawały po
polsku niezależnie od języka interfejsu, mimo że nagłówek i wstęp były tłumaczone.
Dioda „Alarmy UA" wyświetla się teraz jako **UA alerts**.

Opis alarmów UA mówi też wreszcie to, co robi kod po 1.7.26 — że waga zależy od
odległości obwodu od województwa. Wcześniej wymieniał rówieński jako przygraniczny.

## Zweryfikowane

Emulator Pixel 7 (Android 14), na żywych danych: dron 155,4 km od granicy, kurs 86°
w bok, pokazany jako „0 pkt" z powodem. Oba języki. Testy: 15 pythonowych i 9
node'owych.
