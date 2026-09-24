# TestFlight — teksty do wklejenia i instrukcja dla testera

Stan 18.09.2026, build **1.7.57 (2609181648)** — Ready to Submit.

---

## 1. Jak tester dostaje aplikację

**Wariant wewnętrzny (szybki, bez przeglądu Apple):**
1. App Store Connect → **Users and Access → People → +**: imię, nazwisko, e-mail
   **Apple ID** testera, rola **Developer**, zaznaczone **Access to TestFlight** → Invite.
2. Tester dostaje **mail z zaproszeniem do konta** i musi je przyjąć (kliknąć
   „Accept”, zalogować się swoim Apple ID).
3. App Store Connect → **TestFlight → INTERNAL TESTING → +** → grupa `Testerzy`
   → dodaj testera → **Builds → +** → build `2609181648`.
4. Tester dostaje **drugi mail: „You're invited to test Strażnik: alarm powietrzny”**,
   instaluje aplikację **TestFlight** z App Store i przez nią Strażnika.

Czyli: **żadnego linku nie wysyłasz ręcznie** — Apple wysyła zaproszenia na maila.
Jeśli tester ma iPhone'a zalogowanego na inny Apple ID niż podany mail,
zaproszenie nie zadziała.

**Wariant zewnętrzny (publiczny link, dla czytelników):** wymaga pól z punktu 2
i przechodzi **Beta App Review** (zwykle 1–2 dni). Po zatwierdzeniu w grupie
pojawia się **Public Link**, który można rozdawać bez zbierania maili.

---

## 2. Test Information — do wklejenia w App Store Connect

**Feedback Email:** `cukierrro@gmail.com`
**Marketing URL:** puste
**Privacy Policy URL:** `https://cukierrro.github.io/Straznik/#prywatnosc`
(docelowo osobna strona — `POTRZEBNE_ZMIANY_WSPOLNE.md`, B2b)
**Sign-in required:** **No** (aplikacja nie ma kont)

### Beta App Description (pole „What to Test” / opis wersji testowej)

```
Strażnik to nieoficjalna mapa zagrożeń powietrznych dla Polski. Zestawia alerty RCB i RSO, strefy ograniczeń w przestrzeni powietrznej (PAŻP), publiczny ruch lotnictwa wojskowego (ADS-B), zgłoszenia o dronach i rakietach nad Ukrainą oraz doniesienia mediów — i liczy z nich jeden wynik punktowy dla każdego województwa.

TO NIE JEST OFICJALNY SYSTEM OSTRZEGANIA. Aplikacja nie jest powiązana z RCB, RSO, PAŻP ani żadną instytucją i nie zastępuje syren ani Alertu RCB. Ma dać dodatkowy, wcześniejszy sygnał.

CO SPRAWDZIĆ W TEJ WERSJI
1. Pierwsze uruchomienie: ekran „O aplikacji”, potem wybór województwa (⚙ → Moje miejsca → dodaj miejsce, włącz „Obserwuj alerty”).
2. Ustawienia → Alarmy: czy pojawia się „Zapisany do alarmów dla… (potwierdzone przez Firebase)”. To dowód, że telefon odebrał token powiadomień.
3. Ustawienia → Dźwięk → „Test: czerwony natywny (za 5 s)”: zablokuj ekran w ciągu 5 sekund. Powinno przyjść powiadomienie z dźwiękiem syreny.
4. Powtórz test w trybie Skupienia (powinno przebić) i przy wyciszonym telefonie (może być bez dźwięku — to ograniczenie iOS).
5. Mapa: obracanie, przybliżanie, dotknięcie obiektu, przycisk „mój region”.
6. Zakładka Historia: suwak i przyciski „alarm”, „−10”, „+10”.
7. Zakładka Sygnały: rozbicie punktów na źródła.
8. Układ ekranu: czy nic nie jest zasłonięte wycięciem ani paskiem u dołu.

CZEGO JESZCZE NIE MA
Prawdziwy alarm przysłany przez serwer przy zamkniętej aplikacji jeszcze nie działa — brakuje odpowiedniego formatu wiadomości po stronie serwera. Testujemy go osobno, na temacie testowym. Wszystko inne działa normalnie.

OGRANICZENIA IPHONE'A (nie są błędem)
Brak alarmu na całym ekranie, brak syreny w pętli, brak podnoszenia głośności — iOS na to nie pozwala. Czerwony alarm jest oznaczony jako „czasowo zależny”, więc przebija tryb Skupienia, ale nie przebije wyciszonego dzwonka.

Zgłoszenia: zrzut ekranu + model iPhone'a + wersja iOS, na cukierrro@gmail.com albo przez „Wyślij opinię” w TestFlight.
```

### App Review Information (do Beta App Review, po angielsku)

```
No account, no login, no in-app purchases, no ads, no analytics.

HOW TO SEE THE APP WORKING
1. On first launch the app shows a disclaimer screen, then asks for a province.
2. Settings (gear, top right) → tab "Moje miejsca" → "Otwórz Moje miejsca" → add a place, pick any province (e.g. "lubelskie") and turn "Obserwuj alerty" on.
3. The map, the signal list and the 12-hour history slider work immediately and do not require notifications.
4. Settings → tab "Dźwięk" → "Test: czerwony natywny (za 5 s)" schedules a real local notification with our siren sound; lock the screen within 5 seconds to see it as a user would.

Push notifications are optional: with notifications denied, the map, signals, history and the offline scoring engine keep working. Remote alerts are only sent when several independent public sources indicate a real airborne threat over a Polish province, so no remote alert is likely to arrive during the review window.

The app states in the first dialog, in the settings and in every notification that it is UNOFFICIAL, is not affiliated with RCB, RSO, PAŻP or any government body, and does not replace sirens or official alerts. All data sources are public.

User guide: https://cukierrro.github.io/Straznik/
```

---

## 3. Wiadomość do testera (do skopiowania w mailu albo na czacie)

```
Cześć! Mam wersję testową Strażnika na iPhone'a — to nieoficjalna mapa zagrożeń powietrznych dla Polski z powiadomieniami dla wybranego województwa.

Jak zacząć:
1. Dostaniesz dwa maile od Apple. Pierwszy to zaproszenie do konta — kliknij „Accept” i zaloguj się swoim Apple ID (tym samym, na którym masz iPhone'a). Drugi to zaproszenie do testów.
2. Zainstaluj darmową aplikację TestFlight z App Store.
3. Otwórz zaproszenie z drugiego maila na iPhonie — TestFlight zainstaluje Strażnika.

Co najbardziej mi pomoże:
• Ustawienia (⚙) → Moje miejsca → dodaj miejsce i włącz „Obserwuj alerty”. Potem zakładka Alarmy: napisz mi, czy widzisz „Zapisany do alarmów dla… (potwierdzone przez Firebase)”.
• Ustawienia → Dźwięk → „Test: czerwony natywny (za 5 s)”, zablokuj ekran i powiedz, czy alarm przyszedł i czy było go słychać.
• Powtórz ten test w trybie Skupienia i z wyciszonym telefonem (przy wyciszonym może być cicho — tak działa iOS, to nie błąd).
• Rzuć okiem, czy coś się nie rozjeżdża na ekranie: mapa, zakładka Historia (suwak), zakładka Sygnały.

Czego jeszcze nie ma: prawdziwy alarm z serwera przy zamkniętej aplikacji — nad tym pracuję, testujemy go osobno.

Ważne: to źródło NIEOFICJALNE. Nie zastępuje syren, Alertu RCB ani RSO.

Zgłoszenia najlepiej zrzutem ekranu, z modelem telefonu i wersją iOS. Dzięki!
```

---

## 4. Czego jeszcze brakuje przed grupą zewnętrzną

- [ ] **Privacy Policy URL** — Apple wymaga przy testach zewnętrznych. Na razie
      anchor w instrukcji; lepsza osobna strona (`POTRZEBNE_ZMIANY_WSPOLNE.md`, B2b).
- [ ] **Blok `apns` na serwerze** (zmiana A) — bez niego nie da się przetestować
      prawdziwego alarmu; warto mieć przed rozdaniem publicznego linku.
- [ ] Dane kontaktowe do przeglądu (imię, nazwisko, telefon, e-mail) — Apple
      używa ich tylko do kontaktu, **nie są publiczne**.

---

## 5. Wyniki pierwszego testu na iPhonie (18.09.2026)

Testerka: Karolina (grupa „Testerzy”, build 2609181725).

| Co | Wynik |
|---|---|
| Instalacja z TestFlight, wybór województwa | **działa** |
| Test czerwonego alarmu, ekran zablokowany, dzwonek włączony | **działa, z dźwiękiem syreny** |
| To samo przy wyciszonym telefonie | wibracja + baner, **bez dźwięku** (ograniczenie iOS) |
| To samo w trybie **Sen** | **nic nie dotarło** do odblokowania telefonu |
| Przełącznik „pełna głośność czerwonego alarmu” | wraca na wyłączony (iOS nie pozwala) |
| Tryby Skupienia po dopuszczeniu Strażnika w Ustawieniach | alarm **dochodzi we wszystkich trybach** |
| Test alarmu przy aplikacji **wyrzuconej z listy ostatnich** | **działa** — powiadomienie przychodzi mimo zamkniętej aplikacji |

**Wniosek 1 — do instrukcji i do aplikacji:** żeby alarm przebił tryb Skupienia,
użytkownik musi mieć włączone „Powiadomienia czasowo zależne” dla Strażnika
(Ustawienia → Powiadomienia → Strażnik) oraz dopuścić aplikację w danym trybie
Skupienia (Ustawienia → Skupienie → Sen → Aplikacje). Bez tego iOS wstrzymuje
powiadomienie do odblokowania telefonu. Aplikacja umie to wykryć — zmiana B4
w `POTRZEBNE_ZMIANY_WSPOLNE.md`.

**Wniosek 1a — do instrukcji użytkownika (docs) i ekranu „O aplikacji”:** dopuszczenie
Strażnika w trybach Skupienia trzeba wykonać **ręcznie raz**; testerka musiała to
zrobić sama, zanim alarm zaczął przechodzić. Bez tego iOS wstrzymuje powiadomienie
do odblokowania telefonu. Do opisania prostym językiem, ze ścieżką klikania.

**Wniosek 2 — mocniejszy argument do wniosku o Critical Alerts:** bez tego
uprawnienia nocny alarm przy wyciszonym telefonie jest bezgłośny. Warto dopisać
ten wynik do wniosku (`WNIOSEK_CRITICAL_ALERTS.md`).

**Stan Test Information (18.09.2026):** wypełnione i zapisane — opis wersji
testowej (polski), e-mail do opinii, adres polityki prywatności, dane kontaktowe
do przeglądu (imię, nazwisko, telefon, e-mail) i notatki dla recenzenta po
angielsku. Marketing URL i umowa licencyjna celowo puste. „Sign-in required”
odznaczone. Pułapka: dopóki numer telefonu był pusty, App Store Connect nie
zapisywał notatek dla recenzenta („another field is invalid”).

---

## 6. Push z serwera nie dotarł — co się okazało (18.09.2026, wieczór)

**Co wysłaliśmy:** o 21:23:30 sesja główna wysłała prawdziwy push na temat
testowy `test_voiv_lubelskie` (poziom wysoki, 4,5 pkt, syrena, „czasowo
zależne”, priorytet 10). Firebase przyjął wiadomość i zwrócił jej numer.
**Na iPhonie nie pojawiło się nic.**

**Co sprawdziliśmy po kolei:**

| Ogniwo | Wynik |
|---|---|
| Zgoda na powiadomienia, dźwięk, ekran blokady | działa — test lokalny gra |
| Token APNs, klucz w Firebase | działa — bez tego nie byłoby potwierdzenia subskrypcji |
| Blok `apns` w wiadomości | **poprawny** — odtworzony na serwerze: 911 B przy limicie 4096, komplet nagłówków |
| Wiadomość „cicha” (bez bloku iOS) | wykluczone — klucze wiadomości: `android`, `apns`, `data`, `topic` |
| Subskrypcja tematu **testowego** | **jedyne ogniwo bez dowodu** |

**Przyczyna (błąd po naszej stronie):** aplikacja rozpoznawała wersję testową
po nazwie pliku paragonu (`sandboxReceipt`). To warunek pozytywny — jeśli iOS
nie poda adresu paragonu (a ta właściwość jest w nowych wersjach wycofywana),
aplikacja uznaje, że nie jest testem, i **po cichu nie zapisuje się na tematy
testowe**. Z ekranu tego nie widać, bo Ustawienia pokazują nazwy województw,
a nie surowe tematy — potwierdzone „lubelskie” dotyczy tematu produkcyjnego
`voiv_lubelskie`, na który celowo nic nie wysyłamy.

**Poprawka (build 1.7.61 / 2609182012):**
1. Odwrócony warunek — testem jest wszystko poza paragonem z App Store.
2. Diagnostyka w Ustawienia → Alarmy: wiersz z wersją iOS pokazuje teraz
   w wersjach testowych, na jakie tematy testowe telefon jest zapisany.

### Co ma zrobić tester po aktualizacji

1. Zaktualizować Strażnika w TestFlight do builda **2609182012**.
2. **Otworzyć aplikację i chwilę poczekać** przy włączonym internecie —
   zapis na tematy dzieje się przy starcie.
3. Ustawienia (⚙) → zakładka **Alarmy** → zrzut ekranu całego wiersza
   z wersją iOS (szary tekst pod informacją o subskrypcji).

**Jak czytać wynik:**

| Co widać | Co to znaczy |
|---|---|
| `iOS 18.x · test: test_voiv_lubelskie · sandboxReceipt` | wszystko gra — prosimy o powtórkę wysyłki |
| `iOS 18.x · test: brak tematów · …` | telefon nie zapisał się na temat testowy; nazwa na końcu mówi dlaczego |
| sam `iOS 18.x`, bez dopisku | aplikacja nie uznaje się za wersję testową — poprawka nie zadziałała |

Dopisek pojawia się **tylko w wersjach testowych**. Wersja z App Store go nie ma.

---

## 7. Schemat testów (od 19.09.2026, dwoje testerów)

Testerzy: **Karolina** (iPhone 15 Pro Max, iOS 26.6.1, lubelskie, aktualizuje
z poprzednich wersji) i **Adrian** (świeża instalacja od razu z poprawką).
Ta różnica jest celowa: jeśli wynik będzie inny u każdego z nich, problem leży
w aktualizacji, a nie w kodzie.

Kolejność jest ważna — każdy etap zakłada, że poprzedni wyszedł. Nie robimy
wszystkiego naraz, bo przy błędzie nie wiadomo, który element zawiódł.

### Etap 0 — diagnostyka tematu testowego (blokuje resztę)

| Krok | Oczekiwany wynik |
|---|---|
| Zaktualizować/zainstalować build **2609182012** | wersja widoczna w TestFlight |
| Dodać miejsce z włączonym „Obserwuj alerty” | województwo wybrane |
| Otworzyć aplikację i odczekać ~15 s z internetem | zapis na tematy się wykonuje przy starcie |
| Ustawienia → Alarmy → **zrzut ekranu** | w szarym wierszu widać `test: test_voiv_<województwo>` |

Bez tego zrzutu nie wysyłamy pusha — inaczej znów nie będziemy wiedzieć,
czy milczy telefon, czy serwer.

### Etap 1 — prawdziwy push z serwera (wymaga zgody użytkownika)

Wysyła sesja główna, na temat **testowy**, nigdy na `voiv_*`. Warunki: tester
nie śpi, ma zasięg, dzwonek włączony. Ważność wiadomości to 10 minut.

| Stan telefonu | Oczekiwany wynik |
|---|---|
| Aplikacja otwarta na wierzchu | alarm przejmuje ekran w aplikacji |
| Aplikacja w tle (inna apka na wierzchu) | baner + syrena |
| Aplikacja **wyrzucona** z listy ostatnich, ekran zablokowany | baner na ekranie blokady + syrena |

Do przysłania: zrzut ekranu blokady i godzina z dokładnością do minuty
(porównujemy z czasem wysyłki).

### Etap 2 — warunki, w których iOS wycisza

| Warunek | Oczekiwany wynik |
|---|---|
| Tryb **Sen**, Strażnik dopuszczony w Ustawienia → Skupienie → Sen → Aplikacje | alarm dochodzi |
| Tryb Sen **bez** dopuszczenia aplikacji | wstrzymane do odblokowania — **to nie błąd** |
| „Powiadomienia czasowo zależne” wyłączone dla Strażnika | aplikacja pokazuje ostrzeżenie w Alarmach |
| Dzwonek wyciszony przełącznikiem | wibracja i baner, **bez dźwięku** — ograniczenie iOS |

### Etap 3 — trwałość (najważniejsze dla prawdziwego alarmu)

| Krok | Oczekiwany wynik |
|---|---|
| Przeżyć noc bez otwierania aplikacji, rano zajrzeć w Alarmy | subskrypcja nadal potwierdzona |
| Zrestartować telefon, nie otwierać aplikacji, poprosić o push | alarm dochodzi |
| Dwa województwa naraz | oba w wierszu „Zapisany do alarmów dla…” |
| Suwak „Alarmy na tym telefonie” → wyłącz | „Telefon nie jest zapisany…” (potwierdzone przez Firebase) |
| Suwak z powrotem → włącz | subskrypcja wraca |

### Etap 4 — układ ekranu i zwykłe używanie

| Co | Na co patrzeć |
|---|---|
| Moje miejsca: dodać 4–5 miejsc, zmieniać je | zakładki zawijają się, nic nie ucieka poza ekran |
| Wpisywanie nazwy miejsca | ekran **nie powiększa się** (naprawione w 1.7.61) |
| Historia: suwak, „alarm”, „−10”, „+10” | wiek wpisów zgodny z zegarem, mapa płynna |
| Sygnały | rozbicie punktów, polskie nazwy źródeł |
| Mapa | obrót, przybliżanie, dotknięcie obiektu, „mój region” |
| Wycięcie i pasek u dołu | nic nie jest zasłonięte |
| Ustawienia iOS → Ekran → większy tekst | nic się nie rozjeżdża |

### Etap 5 — po dobie

Bateria (Ustawienia → Bateria → Strażnik), transfer danych, TestFlight → Crashes.
Aplikacja nie ma usługi w tle, więc zużycie powinno być znikome — jeśli nie jest,
to znalezisko.

### Czego testerzy NIE muszą robić

Nie ma potrzeby czekać na prawdziwy alarm — czerwony poziom zdarza się kilka razy
w roku. Od tego jest temat testowy. Nie testujemy też przycisku „pełna głośność”
(ukryty na iOS) ani alarmu pełnoekranowego (iOS na to nie pozwala).

---

## 8. Pułapka: tester w grupie, a TestFlight prosi o kod (19.09.2026)

**Objaw:** drugi tester (Adrian) przyjął zaproszenie do konta, miał poprawną
rolę i był w grupie „Testerzy”, a aplikacja TestFlight na jego iPhonie
pokazywała ekran „Wszystko gotowe — deweloper musi zaprosić Cię do testowania…
stuknij w łącze w e-mailu lub podaj kod”. Żadnego kodu dla testerów
wewnętrznych nie ma i nie da się go wygenerować.

**Co nie było przyczyną** (sprawdzone po kolei): Apple ID na telefonie zgadzało
się co do znaku z adresem w App Store Connect; rola Marketing została podniesiona
do Developer bez skutku; usunięcie z grupy i dodanie ponownie (dwa razy) też nic
nie dało.

**Prawdziwa przyczyna:** Apple nigdy nie wystawiło mu zaproszenia do buildów
w tej grupie. Widać to w dwóch miejscach:

| Gdzie | Co pokazuje |
|---|---|
| Lista testerów w grupie | `No Builds Available` zamiast `Invited` |
| Wiersz builda w „iOS Builds” | **INVITES = 1**, choć w grupie były dwie osoby |

**Rozwiązanie:** założyć **nową grupę wewnętrzną** (z zaznaczoną automatyczną
dystrybucją) i dodać do niej testera. Status od razu zmienił się na **„Invited”**,
a aplikacja pojawiła się w TestFlight na telefonie.

**Zasada na przyszłość (doprecyzowana po trzecim testerze):** po dodaniu nowego
testera sprawdzić jego status w grupie. `Invited` = wszystko gra.
`No Builds Available` = zaproszenie nie wyszło.

Przepis, który zadziałał dwa razy na dwa:
1. rola **Developer** w Users and Access (Marketing nie wystarcza — trzeci tester
   z Marketingiem dostawał `No Builds Available` nawet w świeżej grupie),
2. **dopiero potem** założyć **nową** grupę wewnętrzną i dodać do niej testera.

Kolejność ma znaczenie. Grupa założona, gdy tester miał jeszcze Marketing, zostaje
w zepsutym stanie — zmiana roli i ponowne dodanie do **tej samej** grupy niczego nie
naprawiły. Stąd u nas grupy „Testerzy 2” (Adrian) i „Testerzy 4” (Raingold);
„Testerzy 3” to pusty relikt tej pomyłki.

---

## 9. Dlaczego push nie działał — i pierwszy udany alarm (19.09.2026)

**Przyczyna, po dobie szukania:** podpisana aplikacja nie miała uprawnienia
`aps-environment`. iPhone nie dostawał więc tokenu APNs, Firebase nie miał czego
zapisać na tematy, a alarmy z serwera leciały w próżnię. **Każdy build od 18.09
był pod tym względem martwy** — i nic tego nie zdradzało: mapa, historia, sygnały
i lokalny test syreny działały normalnie.

Komunikat, który to rozstrzygnął (z telefonu testerki, po dodaniu diagnostyki):

```
błąd: iOS nie zarejestrował powiadomień push: nie znaleziono ważnego ciągu
uprawnienia „aps-environment” dla aplikacji
```

**Skąd się wzięło:** uprawnienia wchodzą do aplikacji wyłącznie przy podpisywaniu,
a archiwum budowaliśmy **bez podpisu** — to było obejście problemu z 18.09, gdy
podpis automatyczny żądał profilu deweloperskiego, a ten wymaga zarejestrowanego
urządzenia. Obejście rozwiązało budowanie i po cichu odebrało aplikacji jej
główną funkcję.

### Co po kolei odpadło (każde jednym przebiegiem CI)

| Próba | Dlaczego nie |
|---|---|
| Dopisanie `archived-expanded-entitlements.xcent` do archiwum | eksport go zignorował |
| Wpisanie uprawnień do `Info.plist` archiwum | to samo |
| Wskazanie profilu wprost przy eksporcie | „0 valid identities”, katalog profili pusty — podpis dzieje się po stronie Apple |
| Podpis archiwum trybem automatycznym | żąda profilu deweloperskiego → „Your team has no devices” |
| Podpis archiwum ze wskazanym certyfikatem | „conflicting provisioning settings” |
| Podpis zastępczy (ad hoc) | „Ad Hoc code signing is not allowed with SDK iOS 26.5” |

### Rozwiązanie

Build bierze z App Store Connect **własny certyfikat dystrybucyjny i profil**
(`skrypty/podpis_apple.py`), podpisuje nimi archiwum i oddaje jedno i drugie
w ostatnim kroku — także gdy build padnie. Ustawienia podpisu siedzą w pbxproj,
bo przekazane z wiersza poleceń rozlewają się na pakiety Firebase.

**Bramka, która zostaje na stałe:** krok „Sprawdzenie uprawnień push w podpisanym
pliku” rozpakowuje gotowy plik i zatrzymuje build, jeśli nie ma w nim
`aps-environment`. Ostrzega też przy braku `time-sensitive`. Ta usterka jest zbyt
cicha, żeby polegać na pamięci.

### Pierwszy udany alarm z serwera

Build **1.7.61 (2609191307)**. Wysyłka **15:35:09** na `test_voiv_lubelskie`,
identyfikator `…5570727948032231207`.

| Co | Wynik |
|---|---|
| Karolina (iPhone 15 Pro Max, iOS 26.6.1) | **alarm dotarł** przy zamkniętej aplikacji; wibracja bez dźwięku — miała wyciszony dzwonek |
| Adrian (iPhone 14 Pro Max, iOS 26.6.2) | **alarm dotarł** — ta sama wysyłka, inny telefon i inna wersja iOS |
| Diagnostyka przed wysyłką (oboje) | `APNs: tak · FCM: tak · zapis: gotowe`, tematy testowe potwierdzone |

### Druga wysyłka, 15:39:26 — pomiar i potwierdzenia

| Co | Wynik |
|---|---|
| **Czas dostarczenia** | **3 sekundy** (wysyłka 15:39:26, telefon 15:39:29) — pierwszy pomiar drogi serwer → Firebase → APNs → iPhone |
| Oznaczenie „PILNE” na powiadomieniu | jest — `interruption-level: time-sensitive` działa, alarm ma prawo przebić tryb Skupienia |
| Widoczność na zablokowanym ekranie | pełna: nagłówek + pierwsza linia powodów |
| Dźwięk | **nasza syrena** — potwierdzone przez Adriana (miał włączony dzwonek) |

**Usterka wyłapana ze zrzutu:** tytuł ucinał się na nazwie województwa („TEST —
WYSOKI PRIORYTET: woj. lubelski…”). iOS mieści tytuł w jednej linii, więc alarm
tracił jedyne słowo, dla którego istnieje. Poprawione przez sesję główną
(`999faa6`): tytuł na iOS to „WYSOKI PRIORYTET: lubelskie”, punkty przeniesione
na początek treści. Android bez zmian — buduje tytuł sam i nie ma tego limitu.

### Łańcuch potwierdzony w całości

Serwer → Firebase → APNs → zablokowany iPhone przy **zamkniętej** aplikacji:
powiadomienie dociera w 3 sekundy, jest oznaczone jako pilne, widać je na ekranie
blokady i **gra naszą syreną**. Nic w tej drodze nie zostało już nieprzetestowane.

**Do instrukcji dla użytkowników (ograniczenia iOS, nie usterki):** przy wyciszonym
dzwonku alarm jest bezgłośny (wibracja i baner), a syrena gra **raz**, nie w pętli
jak na Androidzie.

---

## 10. Odpytywanie zamiast stałego połączenia — sprawdzone na iPhonie (20.09.2026)

Od 1.7.63 aplikacja nie trzyma gniazda WebSocket, tylko pyta serwer o stan
(2 s przy alarmie, 5 s przy spokoju) i przy braku zmian dostaje krótkie
„nic nowego”. Powód: przy stałym połączeniu obciążenie serwera rosło liniowo
z liczbą użytkowników, najgorzej w czasie alarmu.

**Czego się baliśmy:** na Androidzie warstwa natywna Capacitora gubiła odpowiedź
„nic się nie zmieniło” i migał pasek „brak połączenia z serwerem” mimo płynących
danych. To ta sama warstwa na obu platformach, więc iOS był realnie zagrożony.

**Wynik na urządzeniu** (iPhone 14 Pro Max, iOS 26.6.2, build 1.7.63 / 2609200633):

| Co | Wynik |
|---|---|
| Pasek „brak połączenia” przy otwartej aplikacji (2 min) | **nie pojawił się ani razu** |
| Aktualność danych po powrocie z tła | natychmiastowa |
| Płynność odświeżania mapy | bez zarzutu |
| Przewijanie historii | działa |
| Zapis miejsca i województwa **po nocy** | zachowany (sprawdzone przed aktualizacją) |

Zadziałało, bo sesja główna przeniosła wersję stanu do adresu zapytania zamiast
zostawiać ją w nagłówku. Gdyby została w nagłówku, iOS najpewniej zachowałby się
jak Android.

**Drugi tester na tej samej wersji (20.09, 12:34)** — iPhone 15 Pro Max, iOS 26.6.1,
build 1.7.63 / 2609200633, czyli dokładnie ten zgłoszony do App Store:

| Co | Wynik |
|---|---|
| Diagnostyka | `APNs: tak · FCM: tak · zapis: gotowe` |
| Subskrypcje | lubelskie, mazowieckie, podkarpackie + trzy tematy testowe |
| Zapis po nocy, aktualizacji i przebudowie serwera | odtworzony poprawnie |
| Nowe teksty iOS na ekranie | mieszczą się w całości, bez ucinania |
| Ślady po Androidzie w tekstach | brak |

Ten ostatni wiersz jest ważny dla przeglądu: to ten sam ekran, który zobaczy
recenzent Apple, a największym ryzykiem jest u nas zarzut 4.2.2.

## 11. Co sprawdzić w buildzie 1.7.78 (24.09.2026)

Build **2609241349** (1.7.78), wysłany 24.09.2026 o 15:53 czasu polskiego.
Uprawnienia w podpisanym pliku potwierdzone przez bramkę CI:
`aps-environment: production` i `time-sensitive`. Zawiera: przejęcie odnośników
zewnętrznych, sesję audio syreny, kolory w trybie historii, nową atrybucję ADS-B
i głośność żółtego sygnału.

Trzy rzeczy naraz, wszystkie wymagają telefonu — z Windowsa nie da się ich
zmierzyć. Jeśli któraś nie wyjdzie, wynik jest wart tyle samo co sukces:
proszę zapisać dokładnie, co się stało.

| Co dotknąć | Czego oczekujemy | Jeśli inaczej |
|---|---|---|
| ⚙ → O aplikacji → odnośnik **NEPTUN** | otwiera się Safari na neptun.in.ua | zrzut wiersza „Wersja iOS” z ⚙ → Aplikacja: dopisek `link:` mówi, czy dotknięcie w ogóle doszło do części natywnej |
| Tamże: licencja, NOTICE, „hostowane na Mikrusie” | j.w., każdy w Safari | j.w. |
| **Wyciszony dzwonek** (przełącznik na boku) → ⚙ → Dźwięk → „▶ Test: syrena” | syrena słychać mimo wyciszenia | zapisać, czy cisza całkowita, czy sama wibracja |
| Muzyka w innej aplikacji → test syreny → koniec syreny | muzyka wraca sama, bez dotykania telefonu | zapisać, czy trzeba było wznowić ręcznie |
| Żółty sygnał uwagi przy wyciszonym dzwonku | **celowo cichy** — tak ma być | — |
| Powiadomienie push z serwera (przy okazji prawdziwego alarmu) | godzina na początku treści („10:54 · …”) mieści się na banerze | zrzut banera |

Czego ten build **nie** naprawia: dźwięku samego powiadomienia push przy
wyciszonym telefonie. To wymaga zgody Apple na Critical Alerts (wniosek
`442YB6VV2L`, bez odpowiedzi). Wyciszony iPhone pokaże baner i zawibruje.

### Wynik testu na iPhonie (Adrian, 24.09.2026 ok. 16:20)

**Odnośniki zewnętrzne — DZIAŁAJĄ.** Dotknięcie „NEPTUN” w oknie „O aplikacji”
otwiera stronę. Przejęcie odnośników przez `shouldOverrideLoad` załatwia sprawę;
diagnostyka `link:` nie była potrzebna.

**Syrena przy wyciszonym dzwonku — NADAL CISZA.** Sesja audio ustawiana przez
plugin nie dociera do dźwięku odtwarzanego przez stronę. Dowód nie z teorii,
tylko z obserwacji testera: muzyka w innej aplikacji ścisza się na czas sygnału
i wraca **przy obu poziomach** — również przy żółtym, który o zmianę sesji
w ogóle nie prosi. Skoro oba zachowują się identycznie, sesją steruje WebKit,
a nie my. Wniosek: `AVAudioSession` ustawiana z pluginu jest dla Web Audio
w WKWebView bezskuteczna i tą drogą się tego nie zrobi.

Droga, która zostaje: syrenę na iOS odtwarza część natywna (`alarm_syrena.wav`
w pętli, `AVAudioPlayer` + kategoria `playback` — tak robią aplikacje alarmowe
i to udokumentowanie ignoruje przełącznik wyciszenia). Wymaga zmiany we wspólnym
`frontend/`: na iOS strona nie odtwarza własnej syreny, żeby przy niewyciszonym
telefonie nie grały dwie naraz. Czeka na decyzję użytkownika.
