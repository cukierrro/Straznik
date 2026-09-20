# Zgłoszenie do App Store — gotowe teksty i odpowiedzi

Stan 17.09.2026. Wymagania sprawdzone tego dnia na stronach Apple (linki niżej).
Wszystko poniżej jest do wklejenia w App Store Connect; **nic z tego nie zmienia kodu**.

Kolejność pracy: konto i App ID (`INSTRUKCJA_KONTA_APPLE.md`) → build w TestFlight
→ zrzuty ekranu → metadane z tego pliku → zgłoszenie → (osobno) wniosek
o Critical Alerts (`WNIOSEK_CRITICAL_ALERTS.md`).

---

## 1. Nazwa, podtytuł, słowa kluczowe

| Pole | Limit | Propozycja | Długość |
|---|---|---|---|
| Nazwa | 30 znaków | **Strażnik: alarm powietrzny** ← użyta 18.09 (samo „Strażnik” było zajęte w App Store) | 26 |
| Podtytuł | 30 znaków | **Nieoficjalna mapa zagrożeń** | 26 |
| Podtytuł zapasowy | 30 | Nieoficjalne wczesne alarmy | 27 |
| Słowa kluczowe | **100 bajtów** (nie znaków!) | `alarm powietrzny,dron,rakieta,RCB,RSO,syrena,ostrzeganie,zagrozenia,alerty,mapa,obrona` | 86 B |

Uwagi:
- Polskie znaki zajmują **2 bajty**, dlatego w słowach kluczowych piszemy
  „zagrozenia” bez ogonków (wyszukiwanie Apple zwykle ignoruje diakrytyki —
  **niepotwierdzone**, ale oszczędność bajtów jest pewna).
- W słowach kluczowych **nie powtarzamy** nazwy aplikacji ani nazw innych
  aplikacji i firm (zakaz Apple).
- Bez przecinków ze spacjami — spacja po przecinku marnuje bajt.

**Tekst promocyjny** (170 znaków, można zmieniać bez nowego builda):

> Alarmy dla wybranych województw docierają przy zamkniętej aplikacji. Nieoficjalne źródło dodatkowe — nie zastępuje syren, RCB ani RSO.

---

## 2. Opis (pole „Description”, limit 4000 znaków, zwykły tekst)

```
Strażnik pokazuje, co dzieje się w powietrzu nad Polską i okolicą, i ostrzega, gdy kilka niezależnych sygnałów zaczyna wskazywać na zagrożenie.

TO NIE JEST OFICJALNY SYSTEM OSTRZEGANIA
Strażnik nie jest aplikacją rządową ani służb. Nie jest powiązany z RCB, RSO, PAŻP ani żadną instytucją. Nie zastępuje syren, Alertu RCB ani komunikatów służb. W razie zagrożenia kieruj się oficjalnymi kanałami — Strażnik ma dać Ci dodatkowy, wcześniejszy sygnał, nic więcej.

JAK LICZY ZAGROŻENIE
Żaden pojedynczy sygnał nie przesądza o alarmie. Aplikacja zbiera kilka niezależnych wskaźników, przydziela im punkty i sumuje osobno dla każdego województwa w oknie 60 minut. Świeży sygnał liczy się w pełni, starszy waży coraz mniej. Dopiero suma decyduje o poziomie, a Ty zawsze widzisz jej pełne rozbicie: co dało punkty, ile i kiedy.

Poziomy:
• żółty (od 2 punktów) — podwyższona uwaga,
• czerwony (od 4 punktów) — wysoki priorytet.

SKĄD DANE
• oficjalne Alerty RCB i komunikaty Regionalnego Systemu Ostrzegania,
• strefy ograniczeń w polskiej przestrzeni powietrznej (PAŻP),
• publiczny ruch lotnictwa wojskowego (ADS-B),
• zgłoszenia o dronach i rakietach nad Ukrainą (NEPTUN, źródło OSINT),
• doniesienia mediów regionalnych i bałtyckich,
• alarmy i strefy w krajach sąsiednich.
Każdy sygnał na liście ma podpisane źródło i czas.

MAPA I HISTORIA
• mapa na żywo z obiektami, kursem, odległością od granicy i szacowanym czasem dolotu,
• suwak historii z ostatnich godzin — można wrócić do przebiegu zdarzenia,
• kolory województw według aktualnej punktacji,
• strefy PAŻP i ruch lotniczy jako warstwy informacyjne.

POWIADOMIENIA
• wybierasz do 8 miejsc i województwa, dla których chcesz alarmy,
• powiadomienie o zmianie poziomu przychodzi także przy zamkniętej aplikacji i wygaszonym ekranie,
• czerwony alarm ma własny dźwięk syreny i jest oznaczony jako czasowo zależny, więc przebija tryb Skupienia,
• przycisk testu pokazuje prawdziwe powiadomienie, żebyś wiedział, jak wygląda i jak brzmi,
• wszystko można wyłączyć jednym suwakiem; aplikacja działa też z wyłączonymi powiadomieniami.

CZEGO APLIKACJA NIE ZROBI NA IPHONIE
Nie pokaże alarmu na całym ekranie zamiast ekranu blokady, nie powtórzy syreny w pętli i nie podniesie głośności — system iOS na to nie pozwala. Przy telefonie przełączonym na ciche alarm może być bezgłośny.

PRYWATNOŚĆ
Bez konta, bez reklam, bez analityki, bez opłat. Twoje miejsca i jednorazowo pobrana pozycja zostają w telefonie. Do usługi powiadomień trafiają tylko nazwy obserwowanych województw i identyfikator subskrypcji urządzenia — nigdy dokładna lokalizacja.

Instrukcja użytkownika z opisem punktacji: cukierrro.github.io/Straznik
```

**Wersja angielska** (dla lokalizacji „English (U.K.)” — opcjonalna): do
przygotowania z `frontend/i18n.js`, który ma już tłumaczenia opisów.

---

## 3. Adresy (URL)

| Pole | Wartość | Uwaga |
|---|---|---|
| Support URL | **`https://cukierrro.pl/#kontakt`** | Decyzja użytkownika 17.09. Spełnia wymóg Apple („musi prowadzić do realnego kontaktu”): formularz, e-mail, miasto. |
| Privacy Policy URL | nowa strona przy instrukcji, np. `https://cukierrro.github.io/Straznik/prywatnosc.html` | **Wymagane dla każdej aplikacji.** Strona osobista autora nie ma polityki prywatności. Treść do przygotowania: `POTRZEBNE_ZMIANY_WSPOLNE.md`, B2b. |
| Marketing URL | **puste** | Strona główna straznik.eu ma przycisk kawy — nie podajemy jej w metadanych. |
| Copyright | `2026 cukierrro` | |

**Przycisk „Postaw kawę” na stronie pomocy — ocena ryzyka.** Strona
`cukierrro.pl` ma link do buycoffee, ale:
- zakaz Apple (3.1.1(a)) dotyczy **przycisków i linków w aplikacji**, a adres
  pomocy jest metadaną na stronie produktu w App Store, nie elementem aplikacji;
- to ogólna strona autora (kilka projektów, książki, publikacje), a wsparcie
  dotyczy autora, nie funkcji Strażnika;
- adres pomocy musi prowadzić do realnego kontaktu — ta strona to spełnia,
  strona instrukcji nie.

Ryzyko oceniam jako **małe, ale nie zerowe** (recenzent może zajrzeć). Gdyby
Apple to zakwestionowało, plan B: dopisać sekcję kontaktu do instrukcji Strażnika
(bez kawy) i podmienić adres pomocy — zmiana metadanej, bez nowego builda.

Na stronie `cukierrro.pl` widoczne są imię, nazwisko i miasto autora — te dane
są już publiczne niezależnie od App Store, który i tak pokaże imię i nazwisko
jako sprzedawcę (konto osoby prywatnej).

---

## 4. Informacja o prywatności (etykiety „App Privacy”)

**Ważne: nie można zaznaczyć „Data Not Collected”.** Firebase Cloud Messaging
zapisuje identyfikator instalacji (token FCM) i przy subskrypcji tematów
przekazuje model urządzenia, język, strefę czasową i wersję systemu — tak pisze
sama dokumentacja Firebase („Apple privacy details”, aktualizacja 16.09.2026).
Fałszywa etykieta to naruszenie 5.1.2 i powód odrzucenia.

Do zaznaczenia:

| Kategoria | Typ danych | Cel | Powiązane z tożsamością? | Śledzenie? |
|---|---|---|---|---|
| Identifiers | **Device ID** (token FCM / identyfikator instalacji) | App Functionality | **Nie** | Nie |
| Diagnostics | **Other Diagnostic Data** (model, wersja iOS, język, strefa czasowa) | App Functionality | Nie | Nie |
| Location | **Coarse Location** — wybrane województwo idzie do usługi powiadomień razem z identyfikatorem | App Functionality | Nie | Nie |

Ostatni wiersz jest wyborem ostrożnym: województwo to obszar większy niż miasto,
ale ponieważ jedzie razem z identyfikatorem urządzenia, uczciwiej to zadeklarować.

**Czego NIE deklarujemy:** dokładnej lokalizacji (jednorazowy odczyt GPS zostaje
w telefonie i nigdy nie jest wysyłany), kontaktów, zdjęć, danych o użyciu,
reklam. **Nie dodawać Google Analytics do aplikacji** — pociągnęłoby za sobą
kolejne kategorie.

---

## 5. Ocena wieku (kwestionariusz z nowymi progami 13+/16+/18+)

| Pytanie | Odpowiedź | Dlaczego |
|---|---|---|
| Mature or Suggestive Themes (w tym „war or political strife”) | **Infrequent/Mild** | Aplikacja pokazuje realne zagrożenia i nagłówki o atakach; to trzeba przyznać. „Frequent” dałoby 16+. |
| Realistic Violence | **None** | Nie pokazujemy przemocy, tylko punkty, strefy i tytuły. |
| Horror/Fear Themes | **None** | Brak fabuły i strasznych treści; to komunikaty faktograficzne. |
| Medical or Treatment Information | **None** | Nie dajemy porad medycznych. |
| Unrestricted Web Access | **No** | Linki otwierają się w Safari, w aplikacji nie ma przeglądarki (sprawdzone w kodzie Capacitora). |
| Gambling, Contests, User-Generated Content | **None/No** | Nie występują. |

Spodziewany wynik: **13+** (przy „Infrequent”). Jeśli Apple zakwestionuje,
można samemu podnieść ocenę („Override to Higher Age Rating”) — to nie zaszkodzi
aplikacji ostrzegawczej. Odpowiedzi muszą być prawdziwe (2.3.6).

---

## 6. Notatki dla recenzenta („App Review Information → Notes”, po angielsku)

```
No account and no login: nothing to sign in to, no in-app purchases, no ads, no analytics.

HOW TO SEE THE APP WORKING
1. On first launch the app shows the disclaimer screen ("O aplikacji"), then asks for a province.
2. Open Settings (gear icon, top right) → tab "Moje miejsca" → "Otwórz Moje miejsca" → add a place, choose any province (e.g. "lubelskie") and turn "Obserwuj alerty" on.
3. The map, the signal list ("Sygnały") and the 12-hour history slider ("Historia") work immediately and do not require notifications.
4. Settings → tab "Dźwięk" → "Test: czerwony natywny (za 5 s)" schedules a real local notification with our siren sound. Lock the screen within 5 seconds to see it as a user would.

ABOUT PUSH NOTIFICATIONS
Alerts are sent by our server only when several independent sources indicate a real airborne threat in a given Polish province. We cannot manufacture such an event, so most likely no remote alert will arrive during your review. The test button in step 4 goes through the real iOS notification path (sound, Time Sensitive level, lock screen), so the feature can be verified without waiting for an incident.

Push notifications are optional. With notifications denied, the map, signals, history, places and the offline fallback engine all keep working (guideline 4.5.4).

WHAT THE APP IS
Strażnik merges public sources into one threat score per province: official RCB alerts and the Polish RSO warning system, airspace restriction zones published by PAŻP (Polish Air Navigation Services Agency), public ADS-B military air traffic, OSINT reports of drones and missiles over Ukraine (NEPTUN), regional media reports, and alerts in neighbouring countries. Every signal is shown with its source, its points and its age.

The app states in the first dialog, in the settings and in every notification that it is UNOFFICIAL, is not affiliated with RCB, RSO, PAŻP or any government body, and does not replace sirens or official alerts.

NATIVE FUNCTIONALITY (not a repackaged website)
- Push alerts per province, delivered while the app is closed; subscription is managed natively.
- Native notifications with a custom siren sound, Time Sensitive interruption level and a native test notification.
- A built-in scoring engine that keeps working when our server is unreachable, so the app is useful offline-ish.
- Saved places (up to 8) and an optional one-time location reading; both stay on the device.
- The web UI and all map assets are bundled in the app, so nothing is downloaded on first launch.

PRIVACY
No accounts, no ads, no analytics, no tracking. The one-time GPS reading never leaves the device. Only the names of the watched provinces and the device subscription identifier reach the notification service (Firebase Cloud Messaging).

SOURCES
All data sources are public: RCB and RSO publish alerts publicly, PAŻP publishes airspace zones publicly, ADS-B feeds are public community services, NEPTUN is a public OSINT aggregator, media items come from public RSS feeds and are shown as title plus link to the publisher. Documentation of the terms can be provided on request.

User guide with the full scoring rules: https://cukierrro.github.io/Straznik/
Source code: https://github.com/cukierrro/Straznik
```

Do pól kontaktowych: imię, nazwisko, telefon i e-mail — **nie są publiczne**,
Apple używa ich tylko do kontaktu w sprawie przeglądu.

---

## 7. Zrzuty ekranu

Wymagania (strona „Screenshot specifications”, sprawdzona 17.09.2026):
- wystarczy **jeden zestaw**: 6,9″ **1320×2868** (albo 1290×2796 / 1260×2736);
  pozostałe rozmiary Apple przeskaluje sam,
- od 1 do 10 zrzutów, PNG lub JPEG, **bez kanału alfa**,
- iPada nie trzeba (aplikacja jest tylko na iPhone'a),
- filmik („app preview”) jest opcjonalny,
- można dodać podpisy i ramki, ale zrzut musi pokazywać **działającą aplikację**,
  nie ekran startowy (2.3.3), a treść musi być odpowiednia dla 4+ (2.3.8).

Plan 6 zrzutów z podpisami:

| # | Ekran | Podpis (PL) |
|---|---|---|
| 1 | Mapa z alarmem w województwie | „Jedna mapa: co leci, skąd i jak blisko” |
| 2 | Panel sygnałów z rozbiciem punktów | „Widzisz każde źródło i jego wagę” |
| 3 | Powiadomienie / ekran alarmu | „Alarm dotrze przy zamkniętej aplikacji” |
| 4 | Suwak historii | „Wróć do przebiegu zdarzenia” |
| 5 | Moje miejsca | „Alarmy tylko dla wybranych województw” |
| 6 | Ustawienia → Alarmy | „Wszystko możesz wyłączyć jednym suwakiem” |

Jak je zrobić bez iPhone'a i Maca:
1. **Najlepiej:** tester zrobi zrzuty na swoim iPhonie — musi to być model
   z ekranem 6,9″ lub 6,5″ (np. 16/17 Pro Max daje 1290×2796). Zrzuty z iPhone'a
   13 czy 15 zwykłego mają inny rozmiar i **nie nadają się** jako zestaw główny.
2. **Zapasowo:** złożę obrazy 1320×2868 z widoku aplikacji uruchomionej
   w przeglądarce w proporcjach iPhone'a, z podpisem i ciemnym tłem. Apple to
   dopuszcza (nie ma wymogu zrzutu z prawdziwego urządzenia), a UI będzie
   prawdziwy. Minus: obraz będzie nieco mniej ostry niż z telefonu.
3. Na zrzutach musi być widoczny disclaimer albo neutralny stan — nie robimy
   wrażenia, że to oficjalny alarm państwowy.

---

## 8. Najbardziej prawdopodobne zarzuty przeglądu i odpowiedzi

### 8.1 Zasada 4.2 / 4.2.2 — „opakowana strona”, „agregator treści”
Treść zasady 4.2.2: aplikacje nie mogą być „przede wszystkim materiałami
marketingowymi, reklamami, wycinkami stron, **agregatorami treści** albo zbiorem
linków”. To nasze największe ryzyko, bo Strażnik dosłownie agreguje sygnały.

Argumenty do notatek i do odwołania:
1. **Push per województwo przy zamkniętej aplikacji** — funkcja niemożliwa na
   stronie; subskrypcjami zarządza kod natywny.
2. **Natywne powiadomienia z własnym dźwiękiem syreny** i poziomem Time
   Sensitive, plus natywny test alarmu.
3. **Własny silnik punktacji w aplikacji** (`engine.js`), który działa, gdy
   serwer jest nieosiągalny — aplikacja nie jest tylko okienkiem na stronę.
4. **Interfejs, kontury Polski i dźwięki są w paczce aplikacji** — przy pierwszym
   uruchomieniu nie trzeba nic doinstalowywać ani pobierać zasobów aplikacji
   (4.2.3(ii) spełnione). Z sieci idą tylko dane na żywo i kafle mapy.
5. **Miejsca i lokalizacja zostają w telefonie** — aplikacja przechowuje własny
   stan, nie jest przeglądarką.
6. **Przetworzenie, nie przepisanie:** aplikacja nie wyświetla cudzych treści
   jeden do jednego, tylko liczy z nich jedną wartość dla regionu według reguł
   opisanych publicznie.

Co można dołożyć, gdyby Apple nie ustąpiło (etap 2): Live Activity z poziomem
zagrożenia, widżet na ekran blokady, AlarmKit. Każda z tych rzeczy jest
wyłącznie natywna i zamyka temat 4.2 na dobre.

### 8.2 „Aplikacja o bezpieczeństwie od osoby prywatnej, nie od instytucji”
Apple nie ma dziś takiej zasady w regulaminie, ale w czasie pandemii stosowało
ją do aplikacji o COVID-19 (odmowy z powołaniem na 5.2.1: brak „rozpoznawalnej
instytucji”). Istnieje też 5.1.1(ix) o dziedzinach regulowanych, gdzie Apple
oczekuje zgłoszenia przez podmiot prawny — bezpieczeństwo publiczne nie jest tam
wymienione.

Argumenty:
- W App Store działają dziś **aplikacje alarmowe wydane przez osoby prywatne**,
  z wyraźnym oświadczeniem o nieoficjalnym charakterze: „RedAlert – Alerts in
  Israel” (wydawca: osoba prywatna), „Tzofar – Red Alert”, „eAlert” dla Ukrainy,
  a dla Polski **„AlertyPL: Alarm Powietrzny”** (wydawca: osoba prywatna,
  wydana 6.02.2026). To najlepszy dowód, że taka aplikacja ma prawo istnieć.
- Strażnik **nie podszywa się** pod instytucję: nazwa, ikona, opis, pierwszy
  ekran i każde powiadomienie mówią, że to źródło nieoficjalne i dodatkowe.
- Aplikacja nie twierdzi, że zastępuje syreny czy RCB, i kieruje do oficjalnych
  kanałów.

### 8.3 Zasada 5.2.2 — zgoda na korzystanie z cudzych serwisów
Apple może zażądać wykazania, że mamy prawo używać źródeł. Przygotować krótką
notatkę: RCB i RSO publikują komunikaty publicznie, PAŻP publikuje strefy
publicznie, ADS-B to publiczne serwisy społecznościowe, NEPTUN to publiczny
agregator OSINT, media pokazujemy jako tytuł plus link do wydawcy (bez kopiowania
treści). Jeśli któreś źródło ma regulamin ograniczający użycie — lepiej wiedzieć
to przed zgłoszeniem niż po odrzuceniu.

### 8.4 Zasada 5.2.1 / nazwa
„Strażnik” to słowo pospolite, nie nazwa instytucji — ryzyko małe. Gdyby Apple
uznało nazwę za sugerującą oficjalność, mamy wariant „Strażnik: alarm powietrzny”
z podtytułem „Nieoficjalna mapa zagrożeń”.

---

## 9. Checklista przed wysłaniem zgłoszenia

- [ ] Status handlowca ustawiony: **Business → Agreements → sekcja Compliance →
      Digital Services Act → „This is not a trader account”**. Bez tego Apple
      zapyta przy zgłoszeniu (a niezadeklarowane aplikacje wypadają ze sklepów UE).
- [ ] Przycisk „Postaw kawę” niewidoczny w buildzie iOS (zmiana B2) i usunięty
      ze strony instrukcji (zmiana B2b).
- [ ] Blok `apns` wdrożony na serwerze (zmiana A) i push sprawdzony na iPhonie
      na temacie testowym.
- [ ] Teksty Androidowe w ustawieniach zamienione na wariant iOS (zmiany B3–B7).
- [ ] Polityka prywatności pod stałym adresem.
- [ ] Support URL z realnym sposobem kontaktu.
- [ ] Zrzuty 1320×2868 bez kanału alfa, pokazujące działającą aplikację.
- [ ] Etykiety prywatności: Device ID + Diagnostics + Coarse Location.
- [ ] Ocena wieku wypełniona zgodnie z sekcją 5.
- [ ] Notatki dla recenzenta z sekcji 6 wklejone.
- [ ] Wersja i numer builda z TestFlight wybrane w zgłoszeniu.


---

## 10. Co jest już wypełnione w App Store Connect (18.09.2026)

| Miejsce | Stan |
|---|---|
| Nazwa | **Strażnik: alarm powietrzny** |
| Podtytuł | **Nieoficjalna mapa zagrożeń** |
| Kategoria | **Utilities** (bez dodatkowej; do zmiany, jeśli wolisz Weather) |
| Tekst promocyjny, opis, słowa kluczowe | wpisane (opis po polsku, 1335 znaków; słowa kluczowe 90 B) |
| Zrzuty ekranu | **6 szt., 1284×2778** (6,5″ — Apple przeskaluje na pozostałe rozmiary) |
| Support URL | `https://cukierrro.pl/#kontakt` |
| Marketing URL | puste (celowo — kawa na stronie głównej) |
| Wersja / Copyright | 1.7.57 / `2026 cukierrro` |
| Ocena wieku | ankieta wypełniona → **9+** globalnie (12+ Wietnam, 10 Brazylia) |
| Informacja o prywatności | **opublikowana**: Device ID + Other Diagnostic Data + Coarse Location, wszystkie „App Functionality”, **niepowiązane z tożsamością, bez śledzenia** |
| Polityka prywatności | `https://cukierrro.github.io/Straznik/#prywatnosc` (docelowo osobna strona) |
| Cena | **darmowa**, 175 krajów |
| Dane dla recenzenta | imię, nazwisko, telefon, e-mail + notatki po angielsku (z argumentami przeciw 4.2.2) |
| „Sign-in required” | odznaczone (aplikacja nie ma kont) |
| Publikacja po zatwierdzeniu | **ręczna** — aplikacja nie pojawi się w sklepie bez Twojego kliknięcia |
| Test Information (TestFlight) | wypełnione, patrz `TESTFLIGHT_TESTY.md` |
| Status handlowca (DSA) | zadeklarowany przez użytkownika: **nie handlowiec** |

### Zostało do zrobienia przed wysłaniem do przeglądu
1. **Content Rights** (App Information → Content Rights): Apple pyta, czy
   aplikacja pokazuje treści osób trzecich. Strażnik pokazuje tytuły mediów
   i dane publiczne — to oświadczenie prawne, **decyzja użytkownika**, nie moja.
2. **Zmiany w kodzie wspólnym** (sesja główna): B2 (kawa ukryta na iOS),
   B4 (ostrzeżenie o „Powiadomieniach czasowo zależnych” — test u testerki
   pokazał, że bez nich tryb Sen wstrzymuje alarm), B5 (ukryć przełącznik
   głośności i przyciski Androidowe), B2b (kawa ze strony instrukcji),
   A (blok `apns` na serwerze).
3. **Nowy build** po tych zmianach i wybranie go w sekcji „Build”.
4. Opcjonalnie: podnieść ocenę wieku do 13+ („Override to Higher Age Rating”),
   jeśli 9+ wydaje się za niskie dla treści o zagrożeniach.

---

## 11. Prawa do treści osób trzecich — sprawdzone 18.09.2026

W App Store Connect zadeklarowano: **„Yes, it contains, shows, or accesses
third-party content, and I have the necessary rights”**. Podstawy:

| Źródło | Stan |
|---|---|
| RCB, RSO | komunikaty urzędowe — polskie prawo autorskie nie obejmuje materiałów urzędowych |
| PAŻP, ADS-B | fakty (strefy, pozycje), nie utwory |
| Media | pokazujemy tytuł + link do wydawcy, bez treści artykułu |
| OpenFreeMap / OpenStreetMap | wymagana atrybucja — jest w stopce mapy |
| **NEPTUN** | **`https://neptun.in.ua/api-terms` (akt. 9.07.2026): API bezpłatne, bez klucza, użycie komercyjne dozwolone**, pod trzema warunkami (niżej) |
| Zdjęcia maszyn | 61 zdjęć z Wikimedia Commons: CC BY-SA 2.0/3.0/4.0, CC BY, CC0, domena publiczna, OGL v1.0; aplikacja pokazuje autora, licencję i link do źródła (`app.js` ~1827) |

### Warunki NEPTUN-a i jak je spełniamy
1. **Widoczny link do NEPTUN-a** przy mapie/danych — jest: pasek „Dane: NEPTUN”
   z odnośnikiem do `neptun.in.ua` (widać go na zrzutach do sklepu). ✔
2. **Nie częściej niż raz na 5 s po REST**, a najlepiej WebSocket — backend trzyma
   WebSocket, REST tylko awaryjnie co 10 s (`config.NEPTUN_REST_INTERVAL`);
   tryb awaryjny w aplikacji też łączy się po WebSocket. ✔
3. **Jasna informacja, że to nie oficjalny system, i odesłanie do oficjalnych
   syren** — disclaimer w aplikacji, w opisie i w każdym powiadomieniu. ✔

Pozostałe zapisy NEPTUN-a: tylko odczyt (GET/WS) — tak działamy; brak gwarancji;
nazwa i logo NEPTUN nie są przekazywane razem z danymi — używamy wyłącznie nazwy
jako atrybucji, bez logo. Kontakt do projektu: bot pomocy na Telegramie
(strona `neptun.in.ua/contact`); brak adresu e-mail i podmiotu prawnego.

**Ocena wieku po zmianie 18.09:** 13+ (172 kraje), 12+ Wietnam i Korea,
A14 Brazylia — podniesione ręcznie z wyliczonego 9+.
## Źródła wymagań (sprawdzone 17.09.2026)
- Screenshot specifications — developer.apple.com/help/app-store-connect/reference/screenshot-specifications
- App information / Platform version information (limity pól) — developer.apple.com/help/app-store-connect
- App privacy (wymóg polityki prywatności) — developer.apple.com/help/app-store-connect/reference/app-information/app-privacy
- Firebase „Apple privacy details” (co zbiera FCM), aktualizacja 16.09.2026 — firebase.google.com/docs/ios/app-store-data-collection
- Age ratings values and definitions — developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- App Review Guidelines (4.2, 4.2.2, 4.2.3, 2.3.x, 4.5.4, 5.2.1, 5.2.2), ostatnia aktualizacja 8.06.2026 — developer.apple.com/app-store/review/guidelines
- DSA trader requirements — developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements

---

## 12. ZGŁOSZONE DO PRZEGLĄDU (20.09.2026)

Wersja **1.7.63**, build **2609200633**, status **Waiting for Review**,
publikacja **ręczna** — aplikacja nie pojawi się w sklepie bez kliknięcia
użytkownika, nawet po zatwierdzeniu.

**Co było potwierdzone na urządzeniach przed zgłoszeniem** (dwa iPhone'y, iOS 26.6.1
i 26.6.2): alarm z serwera przy zamkniętej aplikacji w 3 sekundy, z syreną,
nad ekranem blokady, oznaczony „PILNE”; odpytywanie serwera bez fałszywych
rozłączeń; zapis do alarmów przetrwał noc; teksty w wariancie iOS.

**Uzgodnione z sesją główną przed wysłaniem:** brak zmian w toku dla wspólnego
kodu, backend stabilny (błędy tunelu spadły do zera na 2,14 mln żądań), adres
polityki prywatności bez zmian. Na czas przeglądu wdrożenia wstrzymane poza
awaryjnymi — recenzent trafiający w restart serwera zobaczyłby tryb awaryjny.

**Czego się spodziewamy:** odpowiedź zwykle w 1–2 dni. Najbardziej prawdopodobny
zarzut to **4.2.2** („aplikacja z innej platformy”); odpowiedzi w sekcji 9 tego
dokumentu, a po zmianie tekstów (B6) aplikacja nie mówi już nigdzie o Androidzie.
