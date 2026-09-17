# Strażnik na iPhone — co musisz zrobić sam (krok po kroku)

Wszystko robisz w przeglądarce na Windowsie. **Mac nie jest potrzebny.**
Do sprawdzenia pushy potrzebny jest **iPhone testera** (Twój albo znajomego).

> **Zasada bezpieczeństwa:** klucze (.p8), plik `GoogleService-Info.plist`
> i identyfikatory kluczy wklejasz **tylko** do GitHub Secrets albo konsol
> Apple/Firebase. Nie wysyłaj ich w czacie, mailu ani nie wrzucaj do repo
> (repo jest publiczne). Claude nigdy nie prosi o ich treść.

Szacowany czas: ok. 1–2 godziny rozłożone na 1–3 dni (Apple zatwierdza konto).

---

## ⚠️ Zanim zapłacisz — przeczytaj

1. **Koszt:** Apple Developer Program **99 USD rocznie** (Apple pokaże kwotę
   w złotych przy zapisie). Bez opłacenia nie ma TestFlight ani App Store.
2. **Twoje imię i nazwisko będą publiczne.** Konto „osoba prywatna” (Individual)
   pokazuje w App Store jako sprzedawcę **prawdziwe imię i nazwisko** z konta —
   nie „cukierrro”. Ukryć nazwisko można tylko kontem firmowym (wymaga numeru
   D-U-N-S i działalności). TestFlight też pokazuje testerom nazwę konta.
3. **Status handlowca (UE, DSA):** przed publikacją w App Store w UE trzeba
   zadeklarować, czy jesteś „trader”. Handlowiec = adres, telefon i e-mail
   **publicznie**. Darmowa aplikacja bez zarobku to według Apple zwykle „nie
   handlowiec” — decyzja należy do Ciebie (to etap App Store, nie TestFlight).
4. **Weryfikacja tożsamości:** Apple może poprosić o skan dowodu w aplikacji
   **Apple Developer** na iPhonie/iPadzie. Jeśli tak — trzeba na chwilę pożyczyć
   urządzenie (logujesz się tam swoim kontem, potem się wylogowujesz).

---

## Krok 1. Konto Apple z weryfikacją dwuetapową

1. Wejdź na stronę konta Apple (account.apple.com) i załóż konto albo zaloguj się.
2. Włącz **weryfikację dwuetapową** — bez iPhone'a wybierz kody **SMS na numer
   telefonu**.

## Krok 2. Apple Developer Program (płatne)

1. developer.apple.com → **Account** → zaloguj się → **Join the Apple Developer Program**
   → **Enroll**.
2. Typ: **Individual / Sole Proprietor**.
3. Dane zgodne z dowodem (imię i nazwisko, adres).
4. Zapłać kartą. Potwierdzenie przychodzi mailem — zwykle w ciągu 48 h.
5. Po zatwierdzeniu: **Account → Membership details** → zapisz **Team ID**
   (10 znaków, np. `AB12CD34EF`). To nie jest sekret, ale nie musi być publiczny.

## Krok 3. Identyfikator aplikacji (App ID)

developer.apple.com → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**

1. **App IDs** → **App** → Continue.
2. Description: `Straznik` (bez polskich znaków — Apple ich tu nie przyjmuje).
3. Bundle ID: **Explicit** → `pl.straznik.app`
4. W **Capabilities** zaznacz:
   - ✅ **Push Notifications**
   - ✅ **Time Sensitive Notifications** (jeśli jest na liście; jeśli nie — pomiń,
     build doda ją sam)
5. Continue → Register.

## Krok 4. Klucz APNs (do pushy) → Firebase

1. **Certificates, Identifiers & Profiles** → **Keys** → **+**
2. Nazwa: `Straznik APNs`, zaznacz **Apple Push Notifications service (APNs)**
   → Configure → Environment **Sandbox & Production** → Save → Continue → Register.
3. **Download** — plik `AuthKey_XXXXXXXXXX.p8`. **Można go pobrać tylko raz.**
   Zapisz w bezpiecznym miejscu (menedżer haseł / dysk zewnętrzny), **poza repo**.
4. Zapisz **Key ID** (10 znaków ze strony klucza).
5. Konsola Firebase → projekt Strażnika → ⚙ **Project settings** → **Cloud Messaging**
   → sekcja **Apple app configuration** (pojawi się po kroku 5; jeśli jej nie
   ma — najpierw zrób krok 5 i wróć) → **APNs Authentication Key** → **Upload**:
   plik .p8, Key ID, Team ID.

## Krok 5. Aplikacja iOS w Firebase + ograniczenie klucza

1. Konsola Firebase → projekt Strażnika → **Add app** → ikona **iOS**.
2. Apple bundle ID: `pl.straznik.app`, nickname: `Strażnik iOS`. App Store ID —
   puste. **Register app**.
3. **Download GoogleService-Info.plist** → zapisz poza repo. Pozostałe kroki
   kreatora (SDK, kod) pomiń — są już w projekcie → Next → Continue to console.
4. **Ogranicz klucz API aplikacji iOS** (Google Cloud Console → wybierz ten sam
   projekt → **APIs & Services** → **Credentials**):
   - otwórz klucz **„iOS key (auto created by Firebase)”**,
   - **Application restrictions** → **iOS apps** → **Add** → `pl.straznik.app` → Done,
   - **API restrictions** — **zostaw tak, jak ustawił Firebase** (zawężenie listy
     API łatwo psuje pushe),
   - **Save**. Zmiana działa po kilku minutach.

   Po tym kroku klucz z pliku `GoogleService-Info.plist` działa tylko z aplikacji
   o identyfikatorze `pl.straznik.app`.

## Krok 6. Aplikacja w App Store Connect

appstoreconnect.apple.com → **Apps** → **+** → **New App**

- Platform: **iOS**
- Name: `Strażnik` (jeśli zajęta: np. `Strażnik – mapa zagrożeń`)
- Primary language: **Polish**
- Bundle ID: `pl.straznik.app`
- SKU: `straznik-ios`
- User access: Full Access → **Create**

## Krok 7. Klucz App Store Connect API (do budowania w chmurze)

To **inny** klucz niż APNs. Pozwala GitHubowi podpisać aplikację i wysłać ją do
TestFlight bez Maca.

1. App Store Connect → **Users and Access** → **Integrations** →
   **App Store Connect API** → **Team Keys** → **+** (za pierwszym razem:
   „Request Access”, akceptacja).
2. Name: `GitHub Actions Straznik`, Access: **Admin**.
   (Admin jest potrzebny, żeby Apple sam wystawił certyfikat dystrybucyjny
   w chmurze. Ten klucz ma duże uprawnienia — trzymaj go tylko w GitHub Secrets.)
3. **Download** `AuthKey_YYYYYYYYYY.p8` (**tylko raz**) → poza repo.
4. Zapisz **Key ID** (w wierszu klucza) i **Issuer ID** (nad tabelą).

## Krok 8. Sekrety w GitHubie

1. Zakoduj pliki do base64 — PowerShell, **wynik trafia od razu do schowka,
   nie na ekran** (podmień ścieżki):
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\SCIEZKA\AuthKey_YYYYYYYYYY.p8")) | Set-Clipboard
   ```
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\SCIEZKA\GoogleService-Info.plist")) | Set-Clipboard
   ```
2. GitHub → repo **Straznik** → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**. Dodaj pięć sekretów (nazwy dokładnie tak):

   | Nazwa | Wartość |
   |---|---|
   | `APPLE_TEAM_ID` | Team ID z kroku 2 |
   | `ASC_KEY_ID` | Key ID z kroku 7 |
   | `ASC_ISSUER_ID` | Issuer ID z kroku 7 |
   | `ASC_KEY_P8_BASE64` | schowek po pierwszym poleceniu (klucz API, **nie** APNs) |
   | `IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` | schowek po drugim poleceniu |

3. Po wklejeniu wyczyść schowek (skopiuj dowolne słowo).

## Krok 9. Pierwszy build

Gałąź `ios` z projektem jest gotowa lokalnie. Po Twojej zgodzie Claude ją wypchnie
(sam `main` zostaje nietknięty). Potem:

1. GitHub → **Actions** → **iOS — build i TestFlight** → ostatnie uruchomienie.
2. Bez sekretów workflow robi tylko **sprawdzenie kompilacji** (zielone = kod
   się buduje). Z sekretami — **wysyła do TestFlight**.
3. Czas: ok. 15–25 min (pierwszy raz dłużej — pobiera Firebase).
4. Przy błędzie w zakładce uruchomienia jest plik **xcodebuild-log** — daj znać,
   Claude go przeczyta.

## Krok 10. TestFlight — testerzy

1. App Store Connect → **Strażnik** → **TestFlight**. Build pojawia się po
   przetworzeniu (5–30 min). Status „Missing Compliance” nie powinien się pojawić
   (aplikacja deklaruje tylko HTTPS).
2. **Testerzy zewnętrzni** (dowolne osoby, do 10 000): **External Testing** → **+**
   grupa `Testerzy` → dodaj build → wypełnij **Test Information** (opis, e-mail
   do opinii) → pierwszy build przechodzi **Beta App Review** (zwykle do 1–2 dni)
   → włącz **Public Link** i wyślij link testerom.
3. Tester instaluje aplikację **TestFlight** z App Store, otwiera link, instaluje
   Strażnika. Build wygasa po **90 dniach**.

## Krok 11. Co sprawdzić na iPhonie testera

- [ ] Mapa, panel, historia, „Moje miejsca” działają.
- [ ] Ustawienia → Alarmy: „Zapisany do alarmów dla: … (potwierdzone przez Firebase)”.
- [ ] Dźwięk → **Test: czerwony natywny (za 5 s)** → zablokuj ekran → przychodzi
      powiadomienie z syreną.
- [ ] To samo w trybie Skupienia / „Nie przeszkadzać”.
- [ ] To samo z przełącznikiem wyciszenia (spodziewane: bez dźwięku — ograniczenie iOS).
- [ ] Push z serwera **tylko na temat testowy** (po wdrożeniu zmiany A z
      `POTRZEBNE_ZMIANY_WSPOLNE.md` przez sesję główną) — przy zamkniętej aplikacji.
- [ ] Wyłączenie „Alarmy na tym telefonie” → „nie jest zapisany do żadnego województwa”.

---

## Etap 2 (po testach): Critical Alerts

Wniosek do Apple o przebijanie wyciszenia: developer.apple.com → Contact →
**Critical Alerts Entitlement request**. Apple przyznaje to głównie aplikacjom
zdrowotnym, bezpieczeństwa publicznego i domowego — dla nieoficjalnej aplikacji
**wynik jest niepewny**. Tekst wniosku Claude przygotuje, gdy aplikacja będzie
już w TestFlight (Apple często pyta o działającą wersję).

## Podsumowanie kosztów

| Co | Koszt |
|---|---|
| Apple Developer Program | 99 USD / rok |
| GitHub Actions (repo publiczne) | 0 zł |
| Firebase Cloud Messaging | 0 zł |
| TestFlight | 0 zł |

Uwaga: jeśli repo stanie się **prywatne**, minuty macOS w GitHub Actions są płatne
(ok. 0,06 USD/min, jeden build ≈ 1–2 USD).
