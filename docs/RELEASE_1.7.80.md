# Strażnik 1.7.80 — alert RCB dla kilku województw już nie przepada

**26 września 2026**, versionCode 109. Poprzednie wydanie:
[1.7.79](RELEASE_1.7.79.md) (odwołanie alarmu nie punktuje jak alarm).
Wydanie cięte z tego samego commita co wersja na iPhone'a.

<!-- Blok poniżej to JEDYNE, co widzi użytkownik w oknie aktualizacji w telefonie.
     Krótkie, całe zdania, bez nagłówków i bez odsyłaczy — reszta notatek zostaje
     dla czytających na GitHubie. Parser: backend/app/app_updates.py, _change_items. -->
<!-- zmiany -->
- Alert RCB wysłany do kilku województw naraz nie przepada już bez śladu. Wcześniej nie dawał punktów żadnemu z nich.
- Gdy alert RCB wisi godzinami bez odwołania, Strażnik mówi to wprost, zamiast pokazywać spokojną mapę. Taki wpis nie dodaje punktów.
- Odwołanie o treści „brak zagrożenia na terenie Polski” gasi alert we wszystkich województwach, a nie tylko w tym jednym, które podało RSO.
- Pozycja policzona przez MLAT nie jest już podawana za ADS-B, a ikona nie przeskakuje kilkudziesięciu kilometrów i nie wraca.
- Schronienie: wykaz punktów PSP zaktualizowany do stanu z 21 września — 86 388 miejsc. Zasady mówią teraz, z kiedy są dane.
- Schronienie: doszły zasady z rządowej „Instrukcji reagowania” i lista tego, co sprawdzić, zanim schowasz się w piwnicy albo garażu.
<!-- /zmiany -->

**Najważniejsze: alert RCB dla kilku województw nie dawał punktów żadnemu z nich.**

## Alert RCB dla kilku województw przepadał po cichu

Strażnik wyciąga listę odbiorców alertu z treści komunikatu RSO — z bloku, który
mówi, dokąd poszedł SMS. Kotwicą było słowo „wysłany”. RCB pisze jednak także
„zostały wysłane” i „wysłano”, a liczby mnogiej używa właśnie wtedy, gdy alert
idzie do **kilku** województw. Wtedy nie znajdowaliśmy ani jednego województwa
i cały blok przepadał: alert bez punktów, bez wpisu, bez śladu w dzienniku.

Druga pułapka była w zakresie znaków. Szesnaście nazw województw w dopełniaczu
to około 290 znaków, a czytaliśmy 260 — ostatnie województwo z listy wypadało
nawet wtedy, gdy kotwica zadziałała.

Poprawka: rdzeń „wyslan” zamiast całego słowa, zapasowo „odbiorc” („do odbiorców
na terenie …”), zakres 600 znaków. Blok opisuje jedną wysyłkę i jest wcześniej
odcinany linią myślników, więc szerszy zakres nie wciąga cudzych odbiorców.

## „Alert RCB nie został jeszcze odwołany”

Alert RCB obowiązuje do odwołania, a odwołanie potrafi przyjść po wielu
godzinach — w nocy z 24 na 25 września alert poszedł o 22:01, a odwołanie około
05:00. Przez ten czas nasze własne sygnały dawno wygasały i mapa wyglądała
spokojnie, co myli: oficjalnie alert wciąż stał.

Teraz w takiej sytuacji pojawia się wpis „Alert RCB z godz. X nie został jeszcze
odwołany”. **Zero punktów** — Strażnik punktuje to, co widzi, a nie to, czego
nie widzi. Po dwunastu godzinach wpis znika, bo brak odwołania bywa po prostu
przeoczeniem po stronie RCB.

## Odwołanie ogólnokrajowe gasi wszystkie województwa

RSO przypisuje komunikat do jednego województwa, choć SMS o treści „brak
zagrożenia na terenie Polski” idzie do wszystkich, które miały alert.
Potwierdzone zrzutami z telefonu z Podkarpacia: 24/25 września alert o 21:45
i odwołanie o 05:35, a RSO w obu wpisach podało wyłącznie lubelskie. Bez tej
poprawki alert wisiałby w województwie, w którym RCB już ogłosiło koniec
zagrożenia. Każde odwołanie wojewódzkie jest teraz zapisywane razem z listą
województw, które zostają — żeby dało się to później sprawdzić.

## MLAT nie udaje ADS-B

Zgłoszenie użytkownika z 25 września: algierski C-130 dostał dwie kolejne
pozycje 82 i 71 km od faktycznej trasy — skoki 87 i 67 km w minutę, czyli 5232
i 4016 km/h. Ikona przeskakiwała w podlaskie i wracała, a odcinki trafiały do
trasy jako prawdziwy przelot.

Pozycje MLAT liczą odbiorniki naziemne z różnic czasu dotarcia sygnału; maszyna
nie podaje wtedy swojego położenia i przy słabej geometrii błąd sięga
dziesiątek kilometrów. Dwie zmiany:

- **Karta maszyny mówi prawdę o źródle** — MLAT, TIS-B albo ADS-B. Wcześniej
  w trybie serwerowym pisała „ADS-B” także nad Białorusią, gdzie odbiorników nie ma.
- **Skok niemożliwy dla maszyny wstrzymuje pozycję.** Próg 1800 km/h; kotwica
  nie odświeża się w trakcie trzymania, więc dopuszczalny dystans rośnie z czasem
  i każdy realny przelot po chwili przechodzi. Twardy bezpiecznik po pięciu
  minutach, żeby maszyna nie zamarzła, gdy to nasza kotwica jest nieaktualna.
  Podmiana następuje przed klasyfikacją, więc ikona, województwo, trasa
  i migawka historii mówią to samo.

Ta sama reguła działa w trybie bez serwera.

## Schronienie: nowy wykaz i zasady z instrukcji MSWiA

Wykaz punktów schronienia przebudowany z wersji z **21 września**: 85 837 →
**86 388** punktów (1229 nowych, 678 wycofanych przez PSP).

Każdy nowy punkt sprawdzono względem obrysów budynków: **1121 (91,2%) stoi na
budynku**, 108 obok (101 z nich bliżej niż 30 m), a żaden nie wypadł w miejscu,
gdzie w promieniu 150 m nie ma w ogóle budynku. Do 32 nowych punktów Grota nie
prowadzi — położenie wątpliwe. Współrzędnych nie poprawiamy za PSP: punkt
dosunięty „na oko” wygląda potem wiarygodnie i prowadzi pod zły adres.

Przejrzeliśmy też obiekty wykluczone przy poprzedniej przebudowie. **Wraca 20**,
wszystkie dlatego, że PSP poprawiło współrzędne — w tym cztery grube pomyłki:
punkt w Pilźnie był wpisany 421 km od swojego adresu, Lipniki dwa razy po
360 km, Suwałki 329 km. W drugą stronę wypadają 4 punkty, którym aktualizacja
**pogorszyła** współrzędne: były na budynku, teraz stoją 21–48 m obok.

Zakładka Zasady mówi teraz wprost, z kiedy są dane (stan wykazu i liczba punktów
brane z paczki, więc nie rozjadą się przy następnej przebudowie) i że wykaz nie
dociąga się w tle — nowszy przychodzi z aktualizacją aplikacji. Doszły też
zasady z rządowej „Instrukcji reagowania” MSWiA jako drugie źródło obok
Poradnika oraz lista tego, co sprawdzić, zanim schowasz się w piwnicy lub
garażu — nie każde podziemie nadaje się na schron.

## Drobne

- Podgląd zmiany języka w ustawieniach obejmuje wreszcie sekcję „Mapa: trasy
  obiektów”. Dotąd zostawała w poprzednim języku aż do naciśnięcia Zapisz.
- Wariant sklepowy dla Google Play: bez samoaktualizacji i bez odnośników do
  zbiórki, czego wymaga regulamin sklepu. Rozdzielony na poziomie budowania,
  a nie ręcznej edycji przed wysyłką — pomyłka tutaj kończy się zdjęciem
  aplikacji ze sklepu.
- Lista wydań w README skrócona do piętnastu ostatnich; pełne notatki wszystkich
  wersji zostają w `docs/`.

## Uwagi techniczne

Klucze cache `app.js`, `engine.js`, `i18n.js` i `style.css` podbite na `1.7.80`.
Dwie scalane gałęzie niezależnie ustawiły `?v=1.7.79a` na różną treść tych samych
plików, więc stary klucz opisywałby co innego niż to, co mają u siebie
Cloudflare i przeglądarki. `scripts/test_klucze_cache.cjs` pilnuje teraz także
tego przypadku: zasób o treści innej niż w `origin/main` nie może mieć klucza
identycznego z tamtym.

Serwerowa część zmian MLAT wymaga `git pull` na VPS — bez tego pole źródła
pozycji i wstrzymywanie skoków działają wyłącznie w trybie bez serwera.
