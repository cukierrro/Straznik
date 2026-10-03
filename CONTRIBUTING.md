# Jak pomóc Strażnikowi

Krótko: **zgłoszenia — tak, kod — nie.** Poniżej dlaczego i co naprawdę pomaga.

## Kod źródłowy jest jawny, ale prawa są zastrzeżone

Strażnik jest **source-available**, a nie open source. Kod leży tutaj po to, żeby
każdy mógł sprawdzić, co aplikacja robi z danymi — że nie zbiera lokalizacji, nie
wysyła jej na serwer i działa tak, jak opisuje polityka prywatności. To jedyny
uczciwy powód, dla którego można kogoś prosić o zainstalowanie aplikacji spoza
sklepu.

Prawa pozostają zastrzeżone — patrz [`LICENSE`](LICENSE).

**Dlatego nie przyjmujemy pull requestów.** Scalenie cudzego kodu do projektu
z zastrzeżonymi prawami zaciemniłoby autorstwo, a tego w narzędziu ostrzegawczym
wolimy uniknąć. Nadesłane PR-y zamykamy z podziękowaniem — to nie jest ocena
jakości Twojej pracy.

## Co pomaga najbardziej

**Zgłoszenia.** Naprawdę z nich korzystamy — kilka wydań powstało wprost
z uwag czytelników. Jeśli coś wygląda źle, opisz to, choćby jednym zdaniem.

Co warto podać:

- **co widziałeś i czego się spodziewałeś** — sama różnica bywa całą diagnozą;
- **godzinę, do minuty** — bez niej nie odtworzymy stanu danych z tamtej chwili;
- **urządzenie i wersję**: telefon, system, przeglądarka albo numer wydania
  (⚙ → Aplikacja → „Zainstalowana wersja");
- **zrzut ekranu**, jeśli rzecz jest widoczna.

Masz pomysł na rozwiązanie? Opisz je słowami w zgłoszeniu. Czytamy uważnie
i często z takich opisów korzystamy.

## Dwie prośby o bezpieczeństwo

**Nie wklejaj do konsoli przeglądarki kodu od nieznajomych** — także takiego,
który znajdziesz w tym repozytorium albo w zgłoszeniach. To typowy sposób
przejmowania kont i sesji.

**Podatności zgłaszaj prywatnie**, nie publicznym zgłoszeniem — zasady są
w [`SECURITY.md`](SECURITY.md).

---

## In English

Strażnik is **source-available, not open source**. The code is public so that
anyone can verify what the app does with data; the rights are reserved
(see [`LICENSE`](LICENSE)).

**We do not accept pull requests** — merging third-party code into an
all-rights-reserved project would blur authorship. Submitted PRs are closed with
thanks; it is not a judgement on your work.

**Bug reports are very welcome.** Please include what you saw and what you
expected, **the time to the minute** (without it we cannot reconstruct the data),
your device, system and app version, and a screenshot if the problem is visible.
If you have a fix in mind, describe it in words — we read those carefully.

Please **never paste code from strangers into your browser console**, and report
security vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md).
