# Stałe zasady projektu Strażnik

## Aktualne przekazanie — 2026-09-08 wieczór

Najświeższy punkt wznowienia po zakończeniu dnia:
`docs/WZNOWIENIE_2026-09-09.md`. Przeczytaj go przed dalszą pracą;
nie zaczynaj biblioteki zdjęć ani prototypu miejsc od nowa.

Stan prac i ograniczenia: `docs/STAN_PRAC_2026-09-08.md`.
Oddzielna sesja dotycząca schronienia ma wyłącznie zbadać wykonalność:
`docs/PROMPT_ANALIZA_SCHRONIENIA.md`. Nie wdrażać jej propozycji ani alarmów.
Projektować lokalizacje użytkownika lokalnie na urządzeniu; bez przekazywania
wybranych miejsc, adresów i GPS na VPS. Przepływy do dostawców zewnętrznych
także wymagają jawnej analizy, nie obiecywać prywatności bez sprawdzenia.

## Plan odłożonej pracy — 2026-09-08

Przed wznowieniem prac nad eskalacją alarmów przeczytaj
`docs/PLAN_POWROTU_2026-09-08.md`. Testy tylko offline na Pixelu;
zatwierdzenie progów 2,5 / 3,0 / 3,5 nie stanowi zgody na produkcję.
Nie wysyłaj alarmów testowych do użytkowników. Wdrożenie wymaga osobnej zgody.

## Instrukcja jest częścią wydania

Ustalenie z użytkownikiem: każde wydanie z istotną zmianą funkcji, zachowania
lub wyglądu aplikacji wymaga aktualizacji instrukcji. Nie uznawaj takiego
release za zakończony, jeśli dokumentacja nadal opisuje poprzedni interfejs.

Przy takim wydaniu:

1. Porównaj zmiany z instrukcją polską (`docs/index.html`) i angielską
   (`docs/en.html`). Aktualizuj obie wersje równolegle: działanie funkcji,
   nazwy przycisków, ograniczenia, progi i wymagane zgody zgodnie z kodem.
2. Odśwież zrzuty wszystkich ekranów dotkniętych zmianą. Wykonuj prawdziwe
   zrzuty aktualnego APK na emulatorze Pixel 7; dla zachowań zależnych od
   urządzenia, np. alarmów, użyj odpowiednio zweryfikowanego urządzenia.
   Nie retuszuj interfejsu ani nie przedstawiaj makiety jako działającej apki.
3. Zachowaj przyjęty projekt instrukcji: ciemny responsywny układ, przełącznik
   PL/EN, lekko odchylone trójwymiarowe ramki telefonów z `docs/guide.css`.
   W ramce umieszczaj niezmieniony zrzut; kliknięcie ma otwierać oryginał
   w pełnej rozdzielczości. Nie zastępuj tego stylu bez uzgodnienia.
4. Aktualizuj podpisy, teksty alternatywne, numer wersji oraz rzeczywiste daty
   wykonania zrzutów. Instrukcja angielska powinna używać angielskiego UI;
   zachowane etykiety źródłowe lub nieprzetłumaczone opisz uczciwie.
5. Uzgodnij README i opis wydania z dokumentacją. Zachowaj działające linki
   i kotwice; pobieranie APK powinno prowadzić do najnowszego wydania.
6. Uruchom `scripts/test_guide.py` (Python + Pillow), dostosowując test do
   świadomych zmian zestawu ekranów. Sprawdź wizualnie PL/EN na komputerze
   i w wąskim widoku mobilnym: czytelność, ramki, brak poziomego przepełnienia,
   przełączanie języków i otwieranie zdjęć.
7. W ramach zatwierdzonej publikacji dołącz dokumentację do wydania i sprawdź
   jej publikację na GitHub Pages. W podsumowaniu podaj linki PL i EN.
   Jeśli czegoś nie udało się zweryfikować, wyraźnie zaznacz brak.

Przy poprawkach niewidocznych dla użytkownika oceń wpływ na opisy; nie wymieniaj
bez potrzeby niezmienionych zrzutów. Procedura zrzutów: `docs/screens/README.md`.
Ta zasada nie upoważnia do wysyłania testowych alarmów do użytkowników ani do
zmniejszania zabezpieczeń aplikacji lub systemu.

## Dostęp do stron internetowych — Firecrawl CLI

Do wyszukiwania, otwierania i odczytywania bieżących stron internetowych używaj
w pierwszej kolejności lokalnie skonfigurowanego `firecrawl-cli`. Nie korzystaj
z wbudowanego konektora Firecrawl obciążającego oddzielny miesięczny limit,
jeżeli lokalny CLI może wykonać zadanie. Innego narzędzia sieciowego użyj dopiero,
gdy CLI jest niedostępny albo nie obsługuje wymaganej operacji; zaznacz wtedy
użytkownikowi przyczynę zmiany narzędzia.

Klucz API ma pozostać wyłącznie w ignorowanej konfiguracji lokalnej. Nigdy nie
wpisuj go do `AGENTS.md`, dokumentacji, kodu, commita, logu ani odpowiedzi.

## Przegląd bezpieczeństwa — co tydzień szybki, co miesiąc gruntowny

Ustalenie z użytkownikiem z 26.09.2026, po audycie, który znalazł m.in. sekrety
zostawione na starym serwerze i logowanie roota hasłem na nowym. Oba problemy
istniały od tygodni i nikt ich nie zauważył, bo nikt nie patrzył.

**Co tydzień — szybki przebieg** (kilkanaście minut, wyłącznie odczyt):

1. Zależności: baza OSV dla `backend/requirements.lock` i
   `android-app/package-lock.json`, otwarte alerty Dependabota i skanowania
   sekretów na GitHubie.
2. VPS: zaległe poprawki bezpieczeństwa, czy nocna instalacja poprawek
   działa (jej log), czy któraś usługa czeka na restart po aktualizacji
   bibliotek, stan zapory i fail2ban.
3. SSH: udane i nieudane logowania z ostatniego tygodnia i skąd; czy nadal
   wpuszcza wyłącznie kluczem.
4. Usługi: ocena `systemd-analyze security` nie gorsza niż przy audycie;
   proces publiczny nadal NIE czyta kluczy FCM i VAPID (sprawdzać jako
   użytkownik `straznik`, nie jako root).
5. Strona: nagłówki bezpieczeństwa i CSP obecne, `/api/health/critical`
   zwraca 200.

**Co miesiąc — gruntowny audyt** w zakresie jak 26.09.2026: wszystko z listy
tygodniowej oraz historia gita pod kątem sekretów, ustawienia repozytorium
(ochrona `main`, klucze wdrożeniowe, sekrety i workflowy Actions), przegląd
kodu dodanego od poprzedniego audytu (punkty wejścia API, pobieranie
adresów z zewnątrz, wstawianie HTML, manifest Androida i eksportowane
komponenty, aktualizator), każda inna maszyna, na której mogły zostać dane
Strażnika, oraz decyzja, czy któryś klucz trzeba zrotować.

Zasady przeglądu:

- Tylko odczyt. Każdą zmianę najpierw pokazać użytkownikowi.
- Raportu nie zapisywać w repozytorium ani nie publikować — repo jest publiczne,
  a raport to mapa słabych punktów. Wyniki idą do pamięci projektu.
- Użytkownikowi krótko: co w porządku, co wymaga jego decyzji.
- Decyzje w skryptach opierać na kodzie wyjścia, nie na szukaniu słowa w tekście.
  Sprawdzać WARTOŚĆ, nie samo istnienie zmiennej. Przy zmianach widocznych na
  stronie — zrzut ekranu. (Wszystkie trzy błędy popełniłem 26.09.2026.)
- Najbliższe terminy: tygodniowy 03.10.2026, miesięczny 26.10.2026.
