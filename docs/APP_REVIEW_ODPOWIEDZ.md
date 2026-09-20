# Odpowiedź do App Review — Guideline 2.1, Information Needed (20.09.2026)

Apple **nie odrzuciło aplikacji za wadę**. Powód formalny: konto deweloperskie ma krótką
historię w App Store, więc recenzent prosi o komplet informacji. Tę samą treść trzeba
wkleić w dwa miejsca: jako odpowiedź w App Review i w pole **Notes** w sekcji
*App Review Information* (żeby przy kolejnych wydaniach już o to nie pytali).

**Czeka na jedną rzecz:** adres nagrania ekranu z fizycznego iPhone'a (punkt 1).
Scenariusz nagrania dla testerów jest osobno; gotowy plik położymy na naszym serwerze,
żeby recenzent otwierał go jednym kliknięciem, bez logowania.

Fakty w tekście są sprawdzone w kodzie 20.09.2026: źródła danych, brak kont i płatności,
lokalizacja wyłącznie opcjonalna przy zapisywaniu miejsca, zastrzeżenie o nieoficjalności
na ekranie „O aplikacji”, adresy polityki prywatności.

---

## Tekst do wklejenia (angielski)

Thank you for the guidance. Below is the information you requested. Strażnik is a free,
non-commercial public-safety application for Poland, published by an individual developer.

**1. Screen recording**

A screen recording captured on a physical iPhone running the latest iOS is available here:
`<ADRES NAGRANIA — UZUPEŁNIĆ>`

The recording begins with launching the app from the home screen and shows the typical user
flow: granting notification permission, the live map, the signal list, the 12-hour history
playback (used to demonstrate what the app looks like during an actual event, since the app
is intentionally quiet when there is no threat), notification settings per region, saved
places, alarm sound selection, the About screen, and the app version.

The following flows do not appear in the recording because the app does not have them:

- There is **no account registration, no login and no user accounts** of any kind, therefore
  no account deletion flow is required. The app is fully usable immediately after install.
- There is **no user-generated content**, no comments, no messaging and no user-to-user
  interaction, therefore no content reporting or blocking mechanism is required.
- There is **no paid content, no in-app purchase, no subscription and no advertising**. The
  app is free in its entirety and has no monetization inside the app.

**2. Purpose and target audience**

Strażnik ("The Guardian") is an early-warning application about air threats over Poland.

The problem it solves: official public warnings in Poland (RCB text alerts, sirens) are issued
only after an official decision is made, and they reach people relatively late. Strażnik
continuously aggregates publicly available data — flight-tracking data, published airspace
restrictions, official alert feeds, and public reports from Ukraine — scores the situation for
each of the 16 Polish regions, and notifies the user when the score crosses a threshold. It
also shows the underlying evidence on a map, so the user can see what the assessment is based
on rather than being asked to trust a single number.

On the two most recent real events (16 and 17 September 2026) the app's own assessment reached
its elevated level 17 and 7 minutes respectively before the corresponding official alert was
published.

Target audience: residents of Poland, in particular the eastern regions bordering Ukraine and
Belarus. The app is free and is not directed at children.

**3. Setting up and accessing the main features**

No credentials, no sample files and no test account are needed — there is nothing to log in to.

1. Install and launch the app.
2. Accept the notification permission when iOS asks. This is the only permission required for
   the core feature.
3. The map opens immediately and shows the current assessment for all regions. When nothing is
   happening, the map is deliberately calm — this is the normal state of the app.
4. Bottom tab **Sygnały** ("Signals") lists the individual pieces of evidence currently being
   scored, with their source and weight.
5. Bottom tab **Historia** ("History") replays the last 12 hours. Dragging the slider back to a
   moment when something was happening is the fastest way to see how the app behaves during an
   actual event.
6. Bottom tab **Więcej** ("More") → **Ustawienia** ("Settings") contains four sections: which
   regions should trigger notifications, saved places, alarm sound, and app information.

Location access is optional and is only offered when the user chooses to save a place using the
current position. The coordinates stay on the device; they are never sent to our server. The app
works fully without granting location access.

**4. External services used**

The app itself communicates with a single service: our own backend at `straznik.eu`, which runs
on a virtual server operated by the developer. Map tiles are loaded from OpenFreeMap
(`openfreemap.org`), with CARTO basemaps as a fallback. Push notifications are delivered through
Apple Push Notification service, addressed through Firebase Cloud Messaging (Google).

Our backend collects data from the following public sources:

- **NEPTUN** (`neptun.in.ua`) — public Ukrainian aggregator of air-threat reports and tracks.
- **ADS-B flight data** — `api.adsb.lol`, `api.airplanes.live`, `opendata.adsb.fi`; public
  community networks of aircraft transponder data.
- **PANSA / Polish Air Navigation Services Agency** (`airspace.pansa.pl`) — published temporary
  airspace restrictions.
- **RCB and RSO** — official Polish public warning feeds, published by the Government Centre for
  Security on `gov.pl` and through the Regional Warning System on `komunikaty.tvp.pl`.
- **Public media feeds** — RSS from Polish news outlets.
- **Neighbouring countries' public airspace and alert feeds** — Estonia, Lithuania, Latvia and
  Romania.
- **Cloudflare** — content delivery and the tunnel through which the server is reached.

There are **no authentication services, no payment processors and no AI services** involved in
delivering the app's functionality.

**5. Regional differences**

There are none. Every user receives exactly the same features and the same content; nothing is
gated by country, account or device. The data itself describes Poland and the immediately
neighbouring area, because that is the subject of the app, but the application behaves
identically wherever it is installed. The interface is available in Polish and English.

**6. Regulated industry and third-party material**

Strażnik is an independent, unofficial tool. It is **not** an emergency service, it is not
operated by or affiliated with any government body, and it does not present itself as one. The
About screen states plainly that the app does not replace sirens, RCB alerts or the RSO system,
and the user sees this wording inside the app.

All data sources listed in point 4 are publicly published feeds made available by their owners
for public use. The app republishes public information with its source attributed and does not
redistribute any licensed or protected dataset. Official Polish warnings (RCB, RSO) are public
information published by the state.

Map data is © OpenStreetMap contributors, used under the Open Database License, with attribution
displayed in the app's map view. Map tiles are served by OpenFreeMap.

The app collects no personal data, has no analytics and no tracking. Our privacy policy is
published here:

- English: https://cukierrro.github.io/Straznik/prywatnosc-en.html
- Polish: https://cukierrro.github.io/Straznik/prywatnosc.html

Please let us know if anything above needs to be expanded — we will provide whatever else is
useful to complete the review.
