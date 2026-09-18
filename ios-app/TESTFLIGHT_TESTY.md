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

**Wniosek 1 — do instrukcji i do aplikacji:** żeby alarm przebił tryb Skupienia,
użytkownik musi mieć włączone „Powiadomienia czasowo zależne” dla Strażnika
(Ustawienia → Powiadomienia → Strażnik) oraz dopuścić aplikację w danym trybie
Skupienia (Ustawienia → Skupienie → Sen → Aplikacje). Bez tego iOS wstrzymuje
powiadomienie do odblokowania telefonu. Aplikacja umie to wykryć — zmiana B4
w `POTRZEBNE_ZMIANY_WSPOLNE.md`.

**Wniosek 2 — mocniejszy argument do wniosku o Critical Alerts:** bez tego
uprawnienia nocny alarm przy wyciszonym telefonie jest bezgłośny. Warto dopisać
ten wynik do wniosku (`WNIOSEK_CRITICAL_ALERTS.md`).

**Stan Test Information (18.09.2026):** wypełnione i zapisane — opis wersji
testowej (polski), e-mail do opinii, adres polityki prywatności, dane kontaktowe
do przeglądu (imię, nazwisko, telefon, e-mail) i notatki dla recenzenta po
angielsku. Marketing URL i umowa licencyjna celowo puste. „Sign-in required”
odznaczone. Pułapka: dopóki numer telefonu był pusty, App Store Connect nie
zapisywał notatek dla recenzenta („another field is invalid”).
