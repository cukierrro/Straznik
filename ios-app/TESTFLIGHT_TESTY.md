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

## 4. Grupa zewnętrzna — wymagania SPEŁNIONE (sprawdzone 29.10.2026)

Ta lista była z września i wprowadzała w błąd. Wszystkie trzy pozycje są
załatwione, więc grupę zewnętrzną da się założyć od ręki:

- [x] **Privacy Policy URL** — polityka istnieje od 21.10 i jest wpisana w karcie
      App Store (bez niej nie przeszłoby żadne zgłoszenie od 1.7.79).
- [x] **Blok `apns` na serwerze** — dawno wdrożony; prawdziwe alarmy były
      wielokrotnie mierzone na urządzeniu.
- [x] **Dane kontaktowe do przeglądu** — wypełnione w App Review Information
      (widoczne w panelu przy każdym zgłoszeniu). Nie są publiczne.

**Czego to NIE zmienia:** pierwszy build w grupie zewnętrznej i tak przechodzi
**Beta App Review** (zwykle 1–2 dni). To osobny przegląd niż ten do App Store —
wersja może być „Waiting for Review" w sklepie i jednocześnie nieprzepuszczona
do testów zewnętrznych, albo odwrotnie.

### Internal czy external — dla kogo co

- **Internal (`Testerzy`)**: tester musi zostać **użytkownikiem konta** z rolą
  Developer. Dla kogoś z zewnątrz, kogo nie znamy, to **za dużo** — dostaje
  dostęp do konta dewelopera, nie tylko do aplikacji.
- **External + Public Link**: link rozdaje się bez zbierania adresów. Dla osoby
  z internetu to jedyne sensowne wyjście — i przy okazji nie trzeba od nikogo
  wyciągać e-maila.

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

## 12. Syrena natywna — DZIAŁA (build 2609241504, 24.09.2026)

Potwierdzone na iPhonie przez testera, przy **wyciszonym dzwonku**:

| Co sprawdzone | Wynik |
|---|---|
| ⚙ → Dźwięk → „▶ Test: syrena” przy wyciszeniu | **słychać** — poprzednio cisza |
| Muzyka w innej aplikacji po syrenie | wraca sama, od razu |
| Przycisk „🌙 Alarm mimo Nie przeszkadzać” na iPhonie | nie pokazuje się (i dobrze) |
| Powiadomienie systemowe nad blokadą przy wyciszeniu | **nadal bez dźwięku** |

Ostatni wiersz nie jest usterką i nie da się go naprawić po naszej stronie:
dźwięk samego powiadomienia push przy wyciszonym telefonie wymaga uprawnienia
Critical Alerts. Wniosek `442YB6VV2L` ma w panelu Apple status **Submitted**
(developer.apple.com → Identifiers → Straznik → Capability Requests — to jedyne
miejsce, gdzie widać zmianę; maila o przyjęciu wniosku Apple nie wysyła).

Czyli dziś na wyciszonym iPhonie: alarm przy **otwartej aplikacji** zagra syreną,
alarm przy **zablokowanym ekranie** da baner i wibrację bez dźwięku. To warto
napisać wprost w instrukcji dla iPhone'a.

## 13. Alarm krytyczny: zapętlenie zgody (29.09.2026)

Apple przyznało Critical Alerts 28.09 (wniosek `442YB6VV2L`), możliwość włączona
przy identyfikatorze, uprawnienie w `App.entitlements`. Pierwszy build dla testera
(`2609282126`) **nie działał**: na telefonie `krytyczne: brak uprawnienia`, w
Ustawieniach iOS brak wiersza „Alerty krytyczne”, przycisk zgody niewidoczny.

**Co NIE było przyczyną** — sprawdzone, nie założone. Profil podpisu niesie
uprawnienie: bramka CI wypisuje teraz `Entitlements` z `embedded.mobileprovision`
rozpakowanej paczki i `com.apple.developer.usernotifications.critical-alerts`
tam jest. Uprawnienie w binarce to nie to samo co uprawnienie z profilu — system
patrzy na profil — ale tu oba są w porządku.

**Przyczyna: jedna wartość opisywała dwie sytuacje.** `criticalAlertSetting`
zwraca `.notSupported` zarówno gdy uprawnienia nie ma, jak i (prawdopodobnie)
dopóki aplikacja ANI RAZU nie poprosiła o zgodę. `app.js` chował przycisk właśnie
przy `criticalSupported === false`, więc nie było jak zapytać, a bez pytania
wartość się nie zmieniała.

**Rozstrzygnięcie:** build `2609291237` w wersji testowej pyta o zgodę sam, raz,
3 s po starcie, i zapisuje odpowiedź systemu w diagnostyce (`pytanie:` w wierszu
wersji iOS). Wersja ze sklepu nigdy sama nie pyta.

**Co z tego zostało na stałe:**

* `status()` zwraca `criticalAsked` — interfejs rozróżnia „jeszcze nie pytaliśmy”
  od „pytaliśmy i system nie potrafi”; przycisk chowany tylko w drugim przypadku;
* `zgodaKrytyczna` **nie zużywa pytania**, gdy powiadomienia są odrzucone (iOS
  raportuje wtedy wszystko jako `notSupported`) — zwraca
  `reason: "powiadomienia-odrzucone"`, a interfejs mówi, co włączyć najpierw;
* bramka CI sprawdza profil, nie tylko binarkę.

### Wynik: alarm krytyczny DZIAŁA (29.09.2026, build 2609291237)

Tester na iPhonie, dzwonek **wyciszony przełącznikiem**: syrena zagrała, baner
nad blokadą był, pełnego ekranu nie ma (i nie obiecujemy go). Push wysłany na
`test_voiv_lubelskie` + `test_voiv_lubelskie_krytyczne`, poziom `high`, 4,5 pkt;
liczniki serwera `sent: 1, failed: 0, crit_sent: 1, crit_failed: 0`.

Łańcuch potwierdzony na całej długości: serwer → osobny temat krytyczny → APNs
z `sound` jako słownikiem i `interruption-level: critical` → iPhone gra mimo
wyciszenia. Diagnoza zapętlenia zgody okazała się trafna — jednorazowe pytanie
w wersji testowej przełamało je od razu.

**Zostaje kontrtest:** po cofnięciu zgody w Ustawieniach iOS powiadomienie ma
**nadal dochodzić**, tylko bez przebijania wyciszenia. To jedyny punkt łańcucha
bez pokrycia w dokumentacji Apple. Gdyby wypadł inaczej, telefon wraca na temat
podstawowy przy najbliższym odczycie stanu (czyli przy wejściu aplikacji na
pierwszy plan), więc okno bez alarmu liczy się w minutach, nie na stałe.

### Kontrtest zdany: po cofnięciu zgody alarm nadal dochodzi (29.09.2026)

Tester cofnął zgodę w Ustawieniach iOS, serwer wysłał drugi push (4,6 pkt):
**baner przyszedł, nic nie zagrało** — i to jest zachowanie pożądane.
Więcej: powiadomienie było **nad blokadą i oznaczone „PILNE”**, czyli iOS
zdegradował je do time-sensitive, a nie wyrzucił. Po cofnięciu zgody alarm
**nadal przebija tryb Skupienia**, traci wyłącznie dźwięk.

| zgoda na alarm krytyczny | dźwięk | baner |
|---|---|---|
| udzielona | **syrena mimo wyciszenia** | tak, nad blokadą |
| cofnięta | cisza | tak, nad blokadą, dalej „PILNE” |

Łańcuch jest więc zamknięty w obie strony i decyzja o osobnym temacie FCM się
broni: najgorszy skutek cofnięcia zgody jest łagodny i nie wymaga niczego cofać.
Nie ma już punktu bez pokrycia w pomiarze.

### Trzeci test: żółty dociera na temat krytyczny (29.09.2026)

Najważniejszy z niesprawdzonych, bo wynika z samej konstrukcji: telefon ze zgodą
przepisuje się na `voiv_X_krytyczne` i **przestaje słuchać `voiv_X`**. Gdyby żółty
tam nie docierał, ci ludzie po cichu straciliby wszystkie ostrzeżenia o podwyższonej
uwadze — a brak alarmu nie wygląda jak usterka, więc nikt by tego nie zgłosił.

Warunki: **aplikacja całkiem zamknięta**, dzwonek włączony, telefon zablokowany.
Wynik: baner plus **krótki sygnał uwagi** (nie syrena) — tester potwierdził, że
dźwięk był „normalny dla żółtego”. Przy okazji zmierzona ścieżka z zamkniętą
aplikacją, której wcześniej nie sprawdzaliśmy.

Komplet trzech testów zamyka wszystko, co da się sprawdzić bez publikacji.

## 14. Test 5 s milczał u wszystkich przy wyciszeniu (11.10.2026)

**Zgłoszenie:** „nie przychodzi alert na iPhona", ustawienia zgodne z instrukcją.
Ze zrzutów wyszło co innego: oba testy **doszły** (żółty i czerwony z etykietą
PILNE), ale czerwony był bez dźwięku — a w pasku stanu widać przekreślony dzwonek,
czyli telefon wyciszony przełącznikiem.

**Co było nie tak u nas:** `testNativeAlarm` planował czerwony zawsze zwykłym
dźwiękiem i jako `.timeSensitive`. Prawdziwy czerwony push idzie inaczej —
`CriticalSound(volume 1.0)` i `interruption-level: critical`, na temat
`voiv_X_krytyczne` (`backend/app/notify.py`). Czyli test **nie sprawdzał tego, co
obiecywał**: na wyciszonym iPhonie milczał u KAŻDEGO, także u ludzi ze zgodą na
alarm krytyczny, u których prawdziwy alarm by zagrał.

Łatwo to pomylić, bo etykieta **PILNE** (`time-sensitive`) znaczy „przebij tryb
Skupienia", a nie „zagraj mimo ciszy". Ciszę przebija wyłącznie alarm krytyczny.

**Poprawione:** czerwony test idzie jako krytyczny, gdy telefon ma zgodę; gdy jej
nie ma — powiadomienie samo pisze, dlaczego było cicho i który przełącznik to
zmienia. Żółty mówi wprost, że przy wyciszeniu jest cichy i tak ma być.
Wtyczka zwraca teraz `{scheduled, critical, silentRisk}`; toast przed testem
(wspólny `app.js`) opisany jako B9 w `POTRZEBNE_ZMIANY_WSPOLNE.md`.
Sprawdzenie kompilacji i uprawnień: `tryb=sprawdzenie`, run 38138387727 — zielone.

**Język (dociągnięte z `f178b8c`):** `app.js` przysyła `lang` („pl" / „en" / „uk"),
więc treść testu jest wreszcie w języku interfejsu — do 1.7.93 była wyłącznie po
polsku, także dla EN i UA. Nieznana wartość albo jej brak = polski.
Nazwa województwa zostaje po polsku w każdym języku, bo tak wysyła ją serwer.
Przy okazji tytuł testu zrównany z prawdziwym alarmem: bez „woj." i bez punktów
(iPhone uciął 19.09.2026 tytuł dokładnie na nazwie regionu), punkty otwierają treść.

**ROZSTRZYGNIĘTE 11.10.2026 (decyzja usera).** Prawdziwy push z serwera jest po
polsku dla wszystkich i na razie tak zostaje. Mówimy to wprost: zdanie „Real alerts
arrive in Polish, whatever the app language" w treści testu (EN/UA), w nocie przy
teście w aplikacji i w instrukcjach EN/UK/iPhone (`4bf2531` na main).
Tłumaczenie stałych części powiadomienia — osobne zadanie **po 1.7.94**.

**Pułapka na tamto zadanie: `loc-key` nie jest bezpieczny.** Ładunek APNs jest
wspólny dla wszystkich wersji aplikacji. Telefon z 1.7.93 i starszą nie ma kluczy
w pakiecie, a iOS pokazuje wtedy **surowy klucz zamiast treści alarmu** —
`title-loc-key` ma pierwszeństwo nad `title`, więc zwykły tytuł nie zadziała jako
zapas. Stare instalacje zostają na telefonach miesiącami. Drugi haczyk: `loc-key`
bierze język **telefonu**, nie przełącznik w aplikacji.
Bezpieczna droga to język w nazwie tematu (`voiv_<region>[_krytyczne][_en|_uk]`,
polski bez sufiksu = zgodność wstecz). Strona iOS była napisana i przeszła CI
(`ece2709`), po czym **świadomie cofnięta** (`ac7af31`) — w wydaniu aplikacji
alarmowej nie zostawiamy mechanizmu, którego nikt nie używa i nikt nie sprawdził
na telefonie. Wrócić po niego w zadaniu po 1.7.94; przy okazji wtedy
`status()` → `subscribedVoivodeships`, żeby app.js przestał składać nazwy tematów.

### Do sprawdzenia na urządzeniu (trzy przebiegi, jeden telefon)

| # | Stan telefonu | Zgoda krytyczna | Oczekiwane |
|---|---------------|-----------------|------------|
| 1 | wyciszony przełącznikiem | **nie** | cisza + w treści zdanie „iPhone ucina dźwięk…" z nazwą przełącznika |
| 2 | wyciszony przełącznikiem | **tak** | **syrena na pełnej głośności** i treść „poszedł jak prawdziwy czerwony alarm" |
| 3 | dzwonek włączony, test żółty | dowolna | krótki sygnał uwagi + zdanie, że żółty przy wyciszeniu jest cichy |
| 4 | **Dźwięki WYŁĄCZONE** w Ustawieniach iPhone'a → Strażnik → Powiadomienia | **tak** | **nie wiemy** — to jest pytanie do zmierzenia |

Przebieg 2 jest tym, czego nigdy nie sprawdziliśmy — i tym, który testerka
uznała za dowód, że alarm nie działa.

**Przebieg 4: otwarte pytanie z 13.10.2026.** Czy alarm krytyczny gra, gdy
człowiek wyłączy „Dźwięki" dla Strażnika w ustawieniach iPhone'a? Apple pisze
tylko, że alarm krytyczny ignoruje **wyciszenie i Nie przeszkadzać** — o tym
przełączniku nie pisze nic. W API `soundSetting` i `criticalAlertSetting` są
osobnymi polami, co sugeruje niezależność, ale to wnioskowanie, nie pomiar.
Nigdy tego nie zmierzyliśmy i bez telefonu nie zmierzymy.

Ma to znaczenie praktyczne: notka w ustawieniach (B11, `93667df`) radzi wyłączyć
„Dźwięki", jeśli ktoś nie chce dźwięku żółtego, i mówi, że to wycisza także
czerwony. Jeśli alarm krytyczny jednak gra, zdanie obiecuje ciszę, której nie ma.
Pomyłka jest w bezpieczną stronę (ktoś usłyszy alarm, którego się nie spodziewał,
a nie odwrotnie), ale zdanie trzeba doprecyzować po pomiarze.

Jak zmierzyć, 2 minuty na telefonie ze zgodą krytyczną: wyłączyć „Dźwięki"
w Ustawieniach iPhone'a → Strażnik → Powiadomienia, zostawić włączone „Alarmy
krytyczne", uruchomić test czerwony (od 1.7.94 idzie jako krytyczny) i posłuchać.

## 15. Build do pomiarów: 1.7.94 (2610130624), 13.10.2026

Wysłany do TestFlight z gałęzi `ios-grota` (`d05ab41`), run 38356416695.
Wersja **1.7.94** — 1.7.93 jest już w sklepie, więc build testowy musi mieć swoją.
W podpisanym pliku potwierdzone `aps-environment: production`, `critical-alerts`
i `time-sensitive`; GROTA w paczce.

Co w nim jest nowe: czerwony test idzie jako **alarm krytyczny**, gdy telefon ma
zgodę Apple; bez zgody powiadomienie samo pisze, dlaczego było cicho i co włączyć;
treść testu jest w języku interfejsu, a w EN/UA mówi wprost, że prawdziwy alarm
przychodzi po polsku; notka przy głośności żółtego nie obiecuje już na iPhonie
czegoś, czego nie dowozimy.

### Instrukcja dla testera (do przekazania w całości)

Najpierw sprawdź w aplikacji: **⚙ → Alarmy**. Jeśli widzisz przycisk „Włącz alarm
mimo wyciszenia", naciśnij go i zgódź się — iPhone pyta tylko raz. Jeśli pisze
„Alarm mimo wyciszenia: włączony", zgoda już jest. Bez niej pomiary 1 i 2 nie mają
sensu, bo to one sprawdzają właśnie ten mechanizm.

Potem trzy przebiegi, za każdym razem: **⚙ → Dźwięk → „Test: czerwony natywny (za 5 s)"**,
pięć sekund na zablokowanie ekranu, słuchasz i notujesz.

| # | Ustaw telefon tak | Pytanie, na które odpowiada |
|---|-------------------|------------------------------|
| 1 | dzwonek **wyciszony** przełącznikiem, Dźwięki Strażnika włączone | czy czerwony przebija wyciszenie — tego nigdy nie sprawdziliśmy |
| 2 | **Ustawienia iPhone'a → Strażnik → Powiadomienia → Dźwięki WYŁĄCZONE**, dzwonek dowolnie | czy ten przełącznik ucisza też alarm krytyczny — nie wiemy, Apple tego nie opisuje |
| 3 | dzwonek **włączony**, Dźwięki włączone, test **żółty** | czy żółty nadal brzmi jak dotąd (kontrola, że niczego nie zepsuliśmy) |

Po przebiegu 2 **włącz Dźwięki z powrotem** — inaczej zostaniesz bez dźwięku alarmów.

Dla każdego przebiegu potrzebujemy trzech rzeczy: czy **był dźwięk**, czy to była
**syrena czy krótki sygnał**, i czy powiadomienie pokazało się **nad blokadą**.
Zrzut ekranu blokady bardzo pomaga — w treści testu jest zdanie, które mówi, którą
drogą poszedł, więc ze zrzutu widać to bez zgadywania.

Jeśli w przebiegu 1 nic nie zagrało, to nie jest Twoja wina ani usterka telefonu —
to dokładnie ten wynik, którego szukamy. Napisz, co zobaczyłeś.

### Decyzja usera (13.10.2026): 1.7.94 wychodzi bez tych pomiarów

Tester nie zdąży przed wieczorną publikacją, więc wydanie idzie bez wyników,
a one wejdą do **następnego** wydania. To jest bezpieczne i warto wiedzieć dlaczego:

- Poprawka czerwonego testu już jest w kodzie i **gorzej niż dotąd być nie może** —
  do 1.7.93 ten test milczał przy wyciszeniu u każdego, także u ludzi ze zgodą.
- Wydanie **nie zawiera twierdzenia, które pomiar mógłby obalić**. Zdanie w teście
  dla telefonu ze zgodą jest warunkowe („Słychać go — usłyszysz i alarm"), a notka
  o alarmie krytycznym w ustawieniach opisuje udokumentowane zachowanie Apple
  (alarm krytyczny ignoruje wyciszenie i Nie przeszkadzać), nie nasz pomiar.
- Przebieg 4 wpływa wyłącznie na **jedno zdanie w notce** o głośności żółtego,
  a to zdanie zostało już 13.10 przeformułowane na fakt („ten przełącznik dotyczy
  wszystkich powiadomień Strażnika"), który jest prawdziwy niezależnie od wyniku.

Gdy wyniki przyjdą: dopisać je tutaj przy przebiegach 1–4 i — jeśli przebieg 4
pokaże, że alarm krytyczny jednak gra — doprecyzować notkę w ustawieniach.

### Czego ten build NIE sprawdza

Prawdziwego pusha z serwera. Test jest powiadomieniem lokalnym, planowanym na
telefonie — idzie tą samą drogą co alarm, ale nie dowodzi, że serwer wysyła
poprawnie. Alarmów testowych na prawdziwe tematy nie wysyłamy; build z TestFlight
dodatkowo słucha tematów `test_`.

## 16. Wyniki z urządzenia (14.10.2026, iPhone testera)

### Przebieg 1 — POTWIERDZONY: czerwony przebija wyciszenie

> „W pierwszym teście z czerwonym przebija strażnik wyciszenie, normalnie gra syrena."

Pierwszy raz zmierzone na prawdziwym telefonie. Do 13.10 wiedzieliśmy tylko, co
pisze Apple — teraz wiemy, że nasza droga przez `criticalSoundNamed` działa.

Zrzut ekranu blokady dowodzi tego niezależnie od ucha testera: iOS oznaczył
powiadomienie czerwoną etykietą **„⚠ KRYTYCZNE"** nad tytułem. Tej etykiety nie da
się ustawić z ładunku — dokłada ją system wyłącznie alarmowi krytycznemu.

Przy okazji zrzut potwierdza układ treści z 1.7.94: tytuł „TEST — WYSOKI PRIORYTET:
lubelskie" (bez „woj." i bez punktów), a pod nim „4.0 pkt", opis testu i „Co zrobić".
Kolejność linii jest ta dla wariantu krytycznego (porada przed zdaniem o ciszy),
czyli kod poszedł właściwą gałęzią.

### Przebieg 4 — DO POWTÓRZENIA: zmierzony nie tym przełącznikiem

> „przy drugim teście przy wyłączonych powiadomieniach nie dostaje powiadomienia
> ani banera"

Tester wyłączył **całe powiadomienia** („Włącz powiadomienia"), a pytanie dotyczy
samego przełącznika **„Dźwięki"** niżej na tym samym ekranie. Przy wyłączonych
powiadomieniach brak banera jest oczekiwany i nie mówi nic o alarmie krytycznym.
Pytanie zostaje otwarte.

Prośba na powtórkę, precyzyjnie: Ustawienia iPhone'a → Strażnik → Powiadomienia →
**„Włącz powiadomienia" zostawić WŁĄCZONE**, zjechać niżej do sekcji „Alerty"
i wyłączyć **tylko „Dźwięki"**. Potem test czerwony. Po pomiarze włączyć z powrotem.

### Przebieg 3 — zgłoszony jako sprawny

Tester napisał „żółty działa". Przyjmujemy jako kontrolę, że niczego nie zepsuliśmy;
nie jest to pomiar głośności ani porównanie z poprzednim wydaniem.

### Co z tego wynika dla tekstów

Zdanie „czerwony alarm zadzwoni nawet wtedy, gdy telefon jest wyciszony" przestało
być przepisane z dokumentacji Apple, a stało się **naszym pomiarem**. Można je
podawać bez zastrzeżeń — dla telefonu ze zgodą na alarm krytyczny.
Zdanie o wyłączonych „Dźwiękach" zostaje faktem o zakresie przełącznika,
dopóki przebieg 4 nie zostanie powtórzony.

## 17. Przebieg 4 POTWIERDZONY (14.10.2026): „Dźwięki" NIE uciszają alarmu krytycznego

Powtórka z właściwym przełącznikiem. Tester: „Alerty krytyczne" włączone, w sekcji
„Alerty" wyłączone **tylko „Dźwięki"**, do tego dzwonek wyciszony przełącznikiem.

> „Wszystko działa po wyłączeniu dźwięków, normalnie pojawia się syrena nawet przy
> wyciszeniu przełącznikiem z iP :) I normalnie słychać też"

**Wynik: alarm krytyczny gra mimo wyłączonych „Dźwięków".** Czyli `soundSetting`
i `criticalAlertSetting` są w iOS niezależne — tak, jak sugerował kształt API, ale
czego Apple nigdzie nie pisze. Pytanie otwarte od 13.10 jest zamknięte pomiarem.

### To obala zdanie, które weszło do aplikacji 13.10

Notka przy głośności żółtego radzi wyłączyć „Dźwięki", jeśli ktoś nie chce dźwięku
żółtego, i mówi, że **ten przełącznik dotyczy wszystkich powiadomień Strażnika,
także czerwonego alarmu**. Dla kogoś ze zgodą na alarm krytyczny to nieprawda
w najgorszą stronę: człowiek wyłącza „Dźwięki" licząc na ciszę, a czerwony zagra
mu syreną na pełnej głośności.

Prawda po pomiarze — **dwa niezależne przełączniki**:

| Co wyłączone | Żółty sygnał | Czerwony alarm |
|---|---|---|
| nic | gra | gra |
| „Dźwięki" (sekcja Alerty) | cichy | **gra dalej**, jeśli „Alerty krytyczne" włączone |
| „Dźwięki" + „Alerty krytyczne" | cichy | baner bez dźwięku (zmierzone 29.09) |

Czyli: kto chce ciszy także przy czerwonym, musi wyłączyć **„Alerty krytyczne"**,
a nie „Dźwięki". Zgłoszone sesji głównej do poprawki we wspólnym froncie i instrukcji.

Zastrzeżenie: „żółty cichy przy wyłączonych Dźwiękach" nie było mierzone osobno —
to zwykłe powiadomienie, więc `soundSetting == .disabled` zdejmuje mu dźwięk.
Zmierzony jest wyłącznie czerwony.

## 18. Co sprawdzić w buildzie 1.7.95 (lista gotowa 14.10.2026)

Wydanie jest duże i prawie w całości webowe: wygląd v4 „lekkie szkło", pływający
dolny pasek z GROTĄ, Menu zamiast „Więcej", ustawienia jako arkusz, licznik
obiektów w górnym pasku, godziny ciszy (Android), nowy eksport GROTY.
**Po stronie natywnej iOS nie zmienia się nic** — żadnych nowych wtyczek,
uprawnień, wpisów w `Info.plist` ani zgód, więc **App Privacy bez zmian**.

### Zanim zbuduję — SPRAWDZONE 15.10 na gałęzi wydania `godziny-ciszy` (`732932e`)

Przegląd UI jest już w niej scalony (`9b89483`), więc dało się to odhaczyć przed
wejściem na `main`:

- [x] `#quiet-hours` ma `class="android-only"`.
- [x] `godzinyCiszyTeraz()` zaczyna się od `if (!IS_APP || IS_IOS) return false;`
      — **cisza nie może wyciszyć niczego na iPhonie**. Oba miejsca użycia
      (poziom sygnału i tryb czerwonego) są przez to na iOS bezczynne. To warto
      było sprawdzić samemu: gdyby ten warunek wypadł, godziny ciszy zabierałyby
      dźwięk alarmu na telefonach, na których nie ma ich jak ustawić.
- [x] `#yv-ios-note` jest i ma `class="fineprint ios-only"` — poprawione zdanie
      o przełączniku „Dźwięki" po pomiarze z 14.10 (§17) dociera do iPhone'ów.
- [x] Prefiksy: **15 par** `-webkit-backdrop-filter` / `backdrop-filter`, każda
      wartość `blur(...)` albo `none`. Scalenie niczego nie zgubiło.

Zostaje jedno: **powtórzyć te same cztery sprawdzenia na `main`** po scaleniu
przez sesję główną — scalenie bywa miejscem, w którym poprawki giną.

### Na urządzeniu

| # | Co | Dlaczego akurat to |
|---|----|--------------------|
| 1 | **Ścieżka alarmu** (`ab43b01`, „Alarm na wierzchu" zamyka okna i kartę) | jedyna zmiana w tym wydaniu dotykająca tego, co musi zadziałać w najgorszym momencie; test czerwony przy otwartym arkuszu ustawień i przy otwartej karcie obiektu |
| 2 | Pływający dolny pasek z GROTĄ | nowy element nad mapą; sprawdzić też obszar bezpieczny na dole (pasek gestów) |
| 3 | Karta obiektu | czytelność nad mapą; na iOS 16/17 bez rozmycia (patrz niżej) |
| 4 | Panel sygnałów | jw. |
| 5 | Okno licznika dronów i rakiet (`b4fb0b5`) | nowe, nie było nigdy na iPhonie |
| 6 | Nagłówek i wykres 12 h w historii | nowe panele v4 |
| 7 | Tekst 200% | w v4 doszły nowe pojemniki; wcześniej „test 200% przeszedł, ale tekst się mielił" |

**Czytelność na starszym iPhonie:** sesja UI świadomie **nie dodała** zapasu
`@supports not (-webkit-backdrop-filter…)`, bo panele v4 mają tło `rgba` o kryciu
0,80–0,92 (np. `--panel` 0,80, dolny pasek 0,84–0,90), więc brak rozmycia na
iOS 16/17 nie zostawia tekstu na gołej mapie. Przyjęte. Jeśli na urządzeniu coś
jednak będzie nieczytelne, zgłaszać **z nazwą ekranu**, a nie ogólnie — podniosą
krycie w tym jednym miejscu.

### Czego w tym wydaniu NIE ma i nie obiecujemy

Ciszy żółtego na iPhonie i języka powiadomienia — to rozszerzenie powiadomień
(NSE), zatwierdzone jako **osobne wydanie po 1.7.95** (`PLAN_IOS.md` §9).
Do tego czasu w aplikacji zostaje notka „alarmy przychodzą po polsku", która po
wejściu D2 (język telefonu zamiast polskiego) dotyczy większej liczby osób.

## 19. Pierwsze pushe przez rozszerzenie (17.10.2026, build 2610171533)

Dwa pushe testowe z `mutable-content: 1`, wyłącznie na `test_voiv_lubelskie`
i `test_voiv_lubelskie_krytyczne`, wysłane przez sesję główną za zgodą usera.
Wspólny kontener był wtedy **pusty** (B13 jeszcze nie było), więc rozszerzenie
nie miało czym zadziałać — i to było wiadome przed wysyłką.

### Co ten pomiar rozstrzygnął

| Pytanie | Wynik |
|---|---|
| Czy alarm z `mutable-content` dochodzi **cały**? | **TAK** — tytuł, godzina, punkty, nagłówek i powód na miejscu |
| Czy przychodzi **jeden** baner mimo wysyłki na dwa tematy? | **TAK** — `apns-collapse-id` działa |
| Czy czerwony nadal jest **krytyczny**? | **TAK** — etykieta „⚠ KRYTYCZNE" i dźwięk |
| Czy żółty jest cichy przy „Bez dźwięku"? | **NIE** — i tak miało być, kontener pusty |
| Czy treść jest w języku aplikacji? | **NIE** — jw. |

**To jest wynik bezpieczeństwa i on jest dobry.** Najgorsze, co mogło się stać przy
tej zmianie, to okaleczenie albo zgubienie alarmu. Nie stało się: droga czerwonego
alarmu z dźwiękiem krytycznym przeszła nienaruszona.

### Czego ten pomiar NIE rozstrzygnął — i czego nie da się z niego wyczytać

**Nie wiemy, czy iOS w ogóle uruchomił rozszerzenie.** Przy pustym kontenerze
rozszerzenie, które się uruchomiło i nic nie zmieniło, wygląda identycznie jak
takie, które nigdy nie ruszyło. Rozstrzygnie to dopiero pomiar po B13.

### Przy okazji: tytuł ucina się na ekranie blokady

„TEST — PODWYŻSZONA UWAGA: lu…". Prawdziwy alarm nie ma przedrostka „TEST — ",
więc mieści się lepiej — ale to przypomnienie, dlaczego `notify.py` zdjął
z tytułu „woj." i punkty (19.09.2026). Przy dłuższych etykietach poziomu
w tłumaczeniach (np. „ВИСОКИЙ ПРІОРИТЕТ") warto to sprawdzić ponownie.

## 20. ROZSZERZENIE DZIAŁA — zmierzone 17.10.2026 (build 2610171752)

Telefon testera: język aplikacji **angielski**, żółty ustawiony na **„Bez
dźwięku"**, zgoda krytyczna włączona. Pushe na oba tematy testowe.

| Co | Wynik |
|---|---|
| żółty — dźwięk | **CISZA** przy ustawieniu „Bez dźwięku" |
| żółty — język | **„TEST — ELEVATED ATTENTION: lubel…"** |
| czerwony — dźwięk | **ZAGRAŁ** mimo wyciszenia żółtego |
| czerwony — poziom | etykieta **„⚠ KRYTYCZNE"** |
| czerwony — język | **„TEST — HIGH PRIORITY: lubelskie"** |
| nazwa województwa | **„lubelskie"** po polsku — tak miało być |

Cytat testera: *„do żółtego nie ma dźwięku i jest po ang."* oraz *„czerwony (…)
zawył alarm ale zawył"*.

**To zamyka pytanie z §19.** Rozszerzenie nie tylko nie szkodzi — ono realnie
działa: podmienia stałe zdania na język aplikacji i zdejmuje dźwięk żółtemu,
a **alarmu nie tyka**. Dokładnie ten podział, o który chodziło.

### Jedna obserwacja do sprawdzenia później

Tester: *„na początku telefon zaczął wibrować i dopiero po jakichś 2 sek zawył
alarm"*. Wcześniejsze pomiary alarmu krytycznego (29.09, 14.10) tego nie
odnotowały. **Nie blokuje niczego** — alarm zadźwięczał — ale warto kiedyś
zmierzyć, czy rozszerzenie dokłada opóźnienie między dostarczeniem a dźwiękiem.
Sposób: ten sam push raz z `mutable-content`, raz bez, i porównanie na wideo.
Przy ostrzeganiu o nalocie dwie sekundy są bez znaczenia wobec minut
wyprzedzenia, ale nie chcę, żeby to przeszło bez zapisu.

### Co zostaje do wydania

- **Etap D**: `"mutable-content": 1` w `notify.py` — bez tego rozszerzenie nie
  dostaje prawdziwych alarmów. Wspólny kod, **osobna zgoda usera**.
- Po D: zmienić `#yv-ios-note`, bo przestanie być prawdą, że na iPhonie
  ustawienie żółtego nie dotyczy powiadomień.
- Kolejność ma być: rozszerzenie w App Store → dopiero potem znacznik w serwerze.
  Odwrotnie oznaczałoby alarmy oznaczone dla modułu, którego u ludzi nie ma.

## 21. DO 1.7.97: przejrzeć układ przycisków na iPhonie (zgłoszenie usera, 17.10)

User po obejrzeniu zrzutów od testera: **wrażenie, że układ guzików nachodzi na
siebie**. Zapisane jako zadanie na 1.7.97, nie na teraz.

**Uczciwie: na zrzutach, które mam, nachodzenia nie widzę.** Na obu ujęciach
arkusza ustawień z 17.10 (19:03) ostatni wiersz kończy się wyraźnie nad
pływającym paskiem, a między nimi jest puste miejsce. To nie znaczy, że wrażenie
jest błędne — znaczy, że **te zrzuty tego nie pokazują** i trzeba sprawdzić
warunki, w których problem mógłby wyjść.

### Gdzie szukać w pierwszej kolejności

1. **Pływający dolny pasek nad treścią arkusza.** Pasek jest `position: fixed`,
   a arkusz przewijany — przy krótszym ekranie albo większej czcionce ostatni
   wiersz może pod niego wjechać. Sprawdzić na iPhonie SE i przy „Wielkość
   tekstu" ustawionej na maksimum.
2. **Obszar bezpieczny na dole** (pasek gestów). To samo miejsce, inny powód.
3. **Ekran „Alarmy przy zamkniętej aplikacji"** — ma najwięcej przycisków jeden
   pod drugim i najdłuższe etykiety, więc rośnie najszybciej przy dużym tekście.
4. **Ukraiński** — etykiety są tam dłuższe niż polskie („Увімкнути тривогу попри
   вимкнений звук"), więc łamią się na dwie linie i podnoszą wiersze.

### Jak to rozstrzygnąć bez zgadywania

Poprosić testera o zrzut **dokładnie tego ekranu, który wyglądał źle**, z podaną
wielkością tekstu i językiem. Jedno zdanie „tu nachodzi" plus zrzut wystarczy;
bez tego będziemy poprawiać po omacku rzecz, której nie widać u nas.

To wspólny front (`style.css`, arkusz ustawień v4) — **do sesji UI/UX albo
głównej**, nie do mnie. Zgłoszę im przy pracach nad 1.7.97.

## Grupa zewnętrzna „Testerzy zewnetrzni" — założona 29.10.2026

Powód: czytelnik z X (iPhone Duo) ma dostać build do testów. **Nie internal** —
tam tester musi dostać rolę na koncie dewelopera, a to za dużo dla kogoś z zewnątrz.

Stan: grupa istnieje, build **1.8.03 (2610282045)** podpięty i w **Beta App Review**
(„Waiting for Review"), 0 testerów. User sam wpisze adres, gdy go dostanie.

**Gdzie się wpisuje testera:** TestFlight → EXTERNAL TESTING → `Testerzy zewnetrzni`
→ zakładka **Testers** → **+** obok „Testers (0)". Public Link jest na tej samej
stronie, ale **świadomie go nie tworzymy** — decyzja usera z 29.10: zapraszamy
adresem, nie linkiem.

**Adresów testerów nie zapisujemy w repozytorium** — ani tutaj, ani w commitach.
Istnieją wyłącznie w panelu Apple.

### Czego nauczyło to zakładanie

1. **„Sign-in required" jest domyślnie ZAZNACZONE** w kroku Test Information,
   a Strażnik nie ma żadnego logowania. Trzeba to odznaczyć, inaczej recenzent
   czeka na dane, których nie ma. `form_input` tego **nie odznaczył** (zwrócił
   „Checkbox checked (previous: true)") — zadziałało dopiero zwykłe kliknięcie.
2. **Pole „What to Test" to `contenteditable`, nie `textarea`** — `form_input`
   odmawia („Element type DIV is not a supported form input"). Zostaje pisanie
   z klawiatury.
3. **Panel zamiera przy dłuższym pisaniu** w tym polu — dostałem dwa razy
   „CDP Input.dispatchKeyEvent timed out", ale **tekst za każdym razem i tak
   wszedł**. Nie powtarzać wpisywania po takim błędzie, tylko **odczytać pole**;
   inaczej łatwo o zdublowany fragment. Pisać kawałkami po 100–200 znaków,
   a po zamarciu kliknąć pole i `ctrl+End`, żeby nie wpisać w środek.
4. Wymagania Apple do testów zewnętrznych (polityka prywatności, adres zwrotny,
   dane kontaktowe, notatki dla recenzenta) były **już wypełnione** — patrz §4.
