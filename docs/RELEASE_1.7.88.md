# Wydanie 1.7.88 — sześciu nowych sąsiadów na mapie, kamery bez podglądu

versionCode 117, versionName 1.7.88. 3 października 2026.

<!-- zmiany -->
- Strażnik czyta media także w Mołdawii, Rumunii, na Słowacji, w Czechach,
  Szwecji i na Węgrzech. Te sześć krajów podświetla się na mapie i ma własną
  kartę, ale **nie dodaje ani jednego punktu** — przez kilka tygodni tylko
  obserwujemy, czy filtr nie myli cudzej przestrzeni powietrznej z ich własną.
- Karta kraju sąsiedniego w ogóle się nie otwierała od 22 września. Naprawione.
- Alarmy w rejonach Ukrainy są tłumaczone, a nie pokazywane po ukraińsku
  w polskim i angielskim interfejsie.
- Na mapie przybyła Szwecja.
- Kamery w regionie: okno przestało być puste. Podglądu nie pokazujemy u siebie,
  bo regulamin worldcam.pl na to nie zezwala — zostaje lista z odnośnikami.
<!-- /zmiany -->

Punktacja, progi i treść alarmów bez zmian.

## Sześciu nowych sąsiadów — i dlaczego na zero punktów

Prośba użytkownika z 2 października, po tym jak okazało się, że karta kraju
działa (a raczej nie działa) wyłącznie dla Litwy, Łotwy i Estonii.

Po dwa kanały RSS na kraj, wszystkie sprawdzone 3 października: kod 200, wpisy
z datą, najświeższy z tego samego dnia. Rumunia — Digi24 i HotNews. Mołdawia —
Moldova 1 (TRM) i Ziarul de Gardă. Słowacja — TASR i Aktuality. Czechy — ČT24
i Český rozhlas. Szwecja — SVT i Sveriges Radio (Ekot). Węgry — Telex i HVG.
Odpadły: Agerpres (522), hirado.hu (500) oraz ipn.md, które oddaje 200 bez
żadnych wpisów — dokładnie tak wyglądał delfi.lt, przez który Litwa świeciła
na zielono, będąc ślepa.

**Zero punktów jest decyzją, nie niedoróbką.** Filtr bałtycki dochodził do
dzisiejszego stanu przez dwa tygodnie poprawek na żywym ogniu: alarm w Rijadzie
policzony jako alarm nad Litwą (19.09), tekst o przygotowaniach szkół w Tartu
palący Litwę na czerwono (22.09), komentarze po nocnym alarmie w Wilnie dające
1,0 pkt przez cały dzień (14–15.09). Teraz doszło sześć języków naraz, których
nie czytamy codziennie. Wchodzą więc tak samo jak strefy rumuńskie i mapa.ua:
sygnał tak, karta tak, dziennik obserwacji tak, punkty nie. Wagi są policzone
i czekają w konfiguracji (SK 0,8 · MD/RO/HU 0,5 · CZ/SE 0,3).

### Najważniejsza różnica wobec Bałtyku

Czeskie i słowackie media piszą o **cudzej** przestrzeni powietrznej częściej
niż o własnej. Cztery pierwsze wyniki wyszukiwania z 3 października to kolejno:
„Drony opět narušily dánský vzdušný prostor", „V Litvě krátce platil vzdušný
poplach", „Ruské drony narušili poľský vzdušný priestor", „Rumunsko oznámilo
narušenie vzdušného priestoru" — czyli Dania, Litwa, Polska i Rumunia, opisane
dokładnie tym słownictwem, którego sami szukamy.

Przy LRT wystarczała zasada „brak zagranicy w tytule ⇒ zdarzenie u siebie".
Tutaj jest odwrócona: **tytuł musi nazwać miejsce w tym kraju**, inaczej wpis
nie jest sygnałem. Bez tego Czechy świeciłyby przy każdym dronie nad Aalborgiem.
Każde odrzucenie trafia do dziennika obserwacji z powodem — i to ten dziennik,
a nie upływ czasu, rozstrzygnie o włączeniu wag.

Cele są osobne dla każdego kraju. Słowacja i Węgry graniczą z Ukrainą, więc
zdarzenie nad nimi znaczy, że coś przeszło tę samą ścianę co nad nami —
świecą na południe. Czechy na zachód, Szwecja na wybrzeże. Wspólna czwórka
województw północnych pasowała tylko do Bałtyku.

### Dwa błędy, które przy okazji wyszły i dotyczyły także Bałtyku

Kraj przypisywaliśmy **po** sprawdzeniu miejsca, więc rumuński artykuł
o Mołdawii („O dronă a intrat în spațiul aerian al Republicii Moldova",
digi24) wypadałby na braku markerów rumuńskich. Teraz kraj z tytułu liczymy
najpierw. Druga rzecz: gałąź incydentu używała kraju **kanału**, nie kraju
z tytułu — litewska relacja o zdarzeniu na Łotwie była zapisywana jako „LT".
Alarm miał to naprawione od 22.09, incydent nie.

### Ruch i uprzejmość wobec wydawców

Pełny kanał digi24 waży 454 kB, a kanał słowackiego nadawcy publicznego
**2,1 MB na jedno pobranie**. Przy odpytywaniu co minutę byłoby z tego 4 GB
na dobę i 29 pobrań na minutę u cudzych redakcji. Dlatego Rumunia wchodzi przez
dział „actualitate" (55 kB), STVR odpada na rzecz TASR i Aktuality, a cała
szóstka chodzi co trzeci cykl (180 s). Razem około 440 kB na cykl.

## Karta sąsiada nie otwierała się ani razu

Od 22 września, czyli od dnia, w którym powstała. Funkcja używała zmiennej
zadeklarowanej dopiero w innej karcie, więc kliknięcie w podświetloną Litwę
kończyło się błędem i niczym więcej. Potwierdzone na produkcji przy żywym
alarmie na Litwie — wywołaniem funkcji prawdziwymi danymi, nie z lektury kodu.

## Rejony Ukrainy po polsku i angielsku

Karta rejonu pokazywała surowy tekst z NEPTUN-a także w pozostałych językach:

```
było:  Бахмутський район · Донецька область · Ракетна загроза (червоний рівень)
jest:  rejon Bachmutskyj · obw. doniecki · zagrożenie rakietowe
```

Nazwa rejonu idzie przez nasz słownik nazw, powód przez słownik czterech
rodzajów zagrożenia. Powodu, którego nie rozpoznajemy, nie zmyślamy —
zostaje w cudzysłowie w oryginale.

## Szwecja na mapie

Plik z granicami państw miał dwanaście krajów i Szwecji wśród nich nie było,
więc nie dało się jej podświetlić. Nie wydajemy z tego powodu całego pliku pod
nową nazwą (307 kB, a Cloudflare przy `.geojson` rozstrzyga po nazwie, nie po
`?v=`) — dokładamy 9 kB jej konturu w osobnym `assets/kraje-se-v1.geojson`,
scalanym przy wczytaniu mapy. Są w nim trzy wieloboki: ląd, Gotlandia i Olandia.
Nieudane pobranie oznacza mapę bez Szwecji i nic więcej.

## Kamery: okno przestało być puste

Zgłoszenie użytkownika iPhone'a z 3 października, odtworzone na Androidzie.
Lista kamer zbudowana 30 lipca miała w sobie **gotowe adresy miniatur**
z wpisaną na sztywno datą i rozmiarem. Tego dnia wszystkie zwracały 404, a kod
ukrywał martwy kafelek — więc okno kamer pokazywało same nazwy miast i pustkę.
Zepsuły się dwie rzeczy naraz: rozmiar (serwis wymienił `400x225` na `400x226`)
i data. Adres jest teraz składany przy wyświetleniu, z zegara urządzenia.

Niezależnie od tego **podglądu nie pokazujemy u siebie w ogóle**. Regulamin
worldcam.pl opisuje wyłącznie własne użycie miniatur przez ten serwis, zgody na
pokazywanie ich w cudzej aplikacji tam nie ma, a stopka to „All Rights
Reserved". Linkowanie do wpisów jest natomiast wprost w celu regulaminu, więc
lista z odnośnikami zostaje — znika sam obraz. Wysłaliśmy do nich prośbę
o zgodę; jeśli odpowiedzą twierdząco, podgląd wróci razem z wpisem w polityce
prywatności, bo telefon łączy się z ich serwerem bezpośrednio.

Zweryfikowane na stronie we wszystkich 16 województwach: 641 kafelków, zero
elementów `<img>`, zero zapytań do worldcam, wszystkie kafelki widoczne.

## Testy

Nowy `scripts/test_sasiedzi_media.py` sprawdza na **prawdziwych nagłówkach
z 3 października**, że cztery artykuły o cudzej przestrzeni powietrznej nie
dają sygnału, że RO-Alert o burzy nie jest alarmem powietrznym, a o celach
powietrznych jest, że rumuński kanał piszący o Mołdawii przypisuje zdarzenie
Mołdawii — oraz że Bałtyk nadal punktuje i nadal idzie na cztery województwa
północne.

Przed wydaniem przeszedł cały zestaw, nie tylko testy dotyczące zmiany.

## Wdrożenie

Zmiany w backendzie wymagają `git pull` na VPS. Kolejność ma znaczenie:
**najpierw serwer, potem aplikacja** — serwer da się cofnąć, aplikacji nie.
