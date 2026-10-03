# Zgłaszanie podatności

Strażnik ostrzega ludzi przed zagrożeniem z powietrza. Błąd bezpieczeństwa może
tu znaczyć więcej niż wyciek danych — może znaczyć fałszywy alarm albo alarm,
który nie dotarł. Traktujemy takie zgłoszenia poważnie i z wdzięcznością.

## Jak zgłosić

**Prywatnie, przez GitHuba:** zakładka **Security** → **Report a vulnerability**.
Zgłoszenie widzi tylko autor projektu; nie trzeba nigdzie pisać maila.

**Nie otwieraj publicznego zgłoszenia (issue) dla podatności.** Publiczny opis
daje przewagę komuś, kto chciałby to wykorzystać, zanim zdążymy naprawić.

Co warto opisać:

- na czym polega problem i co pozwala osiągnąć;
- jak go powtórzyć — najkrócej, jak się da;
- czego dotyczy: aplikacji na Androida, wersji na iPhone'a, strony
  `straznik.eu` czy serwera;
- wersja i urządzenie, jeśli ma to znaczenie.

Jeśli masz gotową poprawkę, **opisz ją słowami** — kodu nie przyjmujemy,
patrz [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Czego się spodziewać

Projekt prowadzi jedna osoba, więc nie obiecuję terminów, których nie dotrzymam.
Odpowiadam najszybciej, jak umiem. Bezpieczeństwo przeglądamy regularnie:
szybki przegląd co tydzień, gruntowny audyt co miesiąc.

Jeśli zgłoszenie okaże się trafne, naprawiamy je i opisujemy w notatkach wydania
(`docs/RELEASE_*.md`) — bez szczegółów, które ułatwiłyby atak na osoby, które
jeszcze nie zaktualizowały aplikacji.

## Które wersje wspieramy

Tylko **najnowsze wydanie**. Aplikacja aktualizuje się poza sklepem, a poprawki
trafiają wyłącznie do kolejnych wersji — starszych nie łatamy wstecz.
Numer swojej wersji sprawdzisz w ⚙ → Aplikacja → „Zainstalowana wersja".

## Czego NIE zgłaszać tą drogą

- **Zwykłych błędów i pomysłów** — te są mile widziane jako publiczne zgłoszenia.
- **Fałszywych lub brakujących alarmów wynikających z danych źródłowych.**
  Strażnik łączy źródła OSINT (NEPTUN, ADS-B, PAŻP, RCB/RSO, media) i **nie jest
  radarem ani źródłem oficjalnym**. Rozbieżność ze stanem faktycznym to zwykle
  właściwość danych, nie podatność — ale opisz ją zgłoszeniem, bo to bywa cenne.

---

## In English

Please report vulnerabilities **privately** via GitHub: the **Security** tab →
**Report a vulnerability**. Only the maintainer sees it, and you do not need an
e-mail address. **Please do not open a public issue for a vulnerability.**

Describe what the problem allows, the shortest way to reproduce it, and whether
it affects the Android app, the iPhone version, `straznik.eu` or the server.
If you have a fix in mind, describe it in words — we do not accept code
(see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

Only the **latest release** is supported; fixes ship in new versions and are not
backported. The project is run by one person, so no response time is promised,
but reports are read and taken seriously.
