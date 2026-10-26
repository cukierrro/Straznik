# Current user-guide screenshots

The Polish and English guides retain 12 real captures from Strażnik 1.7.16
(version code 46), running on a Pixel 7 emulator with Android 14.
Captured on 6 September 2026. These are observations of the application,
not fabricated alert scenarios. No public test notifications were sent.

The four history captures now used are `history-map-pl.png`,
`history-watch-pl.png`, `history-map-en.png`, `history-watch-en.png`.
They are unchanged 1080 × 2400 PNG screenshots of release 1.7.17 (code 47),
captured on 7 September 2026 on Pixel 7 / Android 14, using real server history.
They were captured after reloading the app to discard the in-memory regression
fixture. The SUM9125 replay is a separate local test, not the guide screenshot
source. No public push notifications or production signal writes were used.
The previous `history-*.jpg` and `past-*.jpg` remain as unused historical assets.

Current Polish captures: `01_start.jpg`, `04_legenda.jpg`, `settings-pl.jpg`,
`updates-pl.jpg`, `panel-pl.jpg`, `object-pl.jpg`.

Current English captures: `start-en.jpg`, `legend-en.jpg`, `settings-en.jpg`,
`updates-en.jpg`, `panel-en.jpg`,
`object-en.jpg`.

The “My places” captures are `places-pl.png` and `places-en.png`: unchanged
1080 × 2400 PNG screenshots of signed release 1.7.19 (code 49), Pixel 7 /
Android 14, captured 9 September 2026. They show a voluntary one-time test
position in Warsaw, stored only in the emulator, and the foreground/background
explanation. No public test alerts were sent.

The approximate-position captures are `approx-position-pl.png` and
`approx-position-en.png`: unchanged 1080 × 2400 PNG screenshots of signed
release 1.7.21 (code 51), Pixel 7 / Android 14, captured 11 September 2026.
They use an isolated in-memory replay of the real archived NEPTUN entry
`trk_00178131` solely to verify the card. They are not presented as a current
object or alert. The test uses source quality `confirmed`, but coordinates at
the recognised centre of Lutsk; it confirms that the derived area position
shows only rounded distance and no route, arrival time or saved-place ETA. It
performs no production writes or public notifications.

The aircraft cards are `aircraft-pl.png` and `aircraft-en.png`: unchanged
1080 × 2400 screenshots of signed release 1.7.18 (code 48), Pixel 7 / Android 14,
captured 8 September 2026. They show real RCH5078 / 10-0213 / hex ae4d66
observations, with a photograph of another C-17 from the model library.
The capture test used actual server-backed snapshots, not synthetic aircraft.
The photo captions and license links are part of the app. Cards scroll for
additional telemetry. The initial HTTPS certificate failure was resolved by
the user disabling the interfering host shield temporarily; app certificate
validation was never bypassed. No public test alerts were sent.
The older `aircraft-en.jpg` remains an unused historical asset.

The alarm section also includes two explicitly labelled historical test
captures: `30_alert_zolty_tlo.jpg` (1440 × 3200) and
`32_alarm_pelnoekranowy.jpg` (720 × 1600). They illustrate the expanded yellow
notification and native red full-screen alarm. Both retain their original
Polish UI, including in the English guide. They are not presented as captures
of 1.7.16 or as current incidents, and their example scores are not a reference
for today's scoring rules. Other image files remain unused historical assets.

The GROTA captures `g25-przygotuj-listy*`, `g26-lista-otwarta*`, `g27-zasady*` and the new
`g28-zasady-instrukcja*`, `g29-zasady-dane*` (Polish, `-en`, `-uk`) come from release 1.7.80
and were taken on 26 September 2026 on a Pixel-sized emulator (1080 x 2340, Android 12,
Test_API31), then downscaled to 720 x 1560 JPEG like the rest of the GROTA set. Nothing in
them is retouched. Two items in the new "Basement or garage" checklist were ticked by hand
before the capture so the counter shows 2/8; everything else is the app's own state with the
shelter pack from the PSP register of 21 September 2026 (86,388 points), which is why
`g29-*` reads "21.09.2026". No alerts were sent and no production data was written.

The GROTA map and rules captures `g11-mapa*`, `g13-mapa-filtry*`, `g14-mapa-rodzaje*`,
`g15-mapa-ciemna*`, `g29-zasady-dane*` and `g30-lista*` (Polish, `-en`, `-uk`) were retaken
on 19 October 2026 for release 1.7.99, from a debug build of that release (module abd4d376c3,
PSP register of 19 October), on a Pixel-sized emulator (1080 x 2340, Android 12, Test_API31),
then downscaled to 720 x 1560 JPEG like the rest of the GROTA set. Nothing in them is retouched.
The position is a fake GPS fix in Lublin's Old Town, the same spot as the older captures, so the
figures still line up with the text. They show the counts the app really holds (87 316 points,
19 658 / 7 504 / 60 154 by access, 85 146 / 895 / 1 275 by location certainty). The route and the
"Goal" marker come from opening the NOW tab before the captures.

Two things about these captures are worth stating plainly. First, a real Russian drone attack was
under way that evening (Lublin province 9.5 pts, Subcarpathian 9.9 — both above the red threshold),
and the test phone sits in Lublin, so the app opened on a genuine red alert screen. We acknowledged
it and then turned off "Alerts on this phone" in Settings, so that a new alert would not cover the
app mid-series; that switch is not visible in any of the frames and changes nothing about GROTA
itself. No alerts were sent and no production data was written. Second, the previous set (15 October,
release 1.7.95) was built before `cap copy`, so it still showed the module from 1.7.94: the numbers
on it matched the shipped pack, but the look predated the 14 October contrast and touch-target work.
This set is the first one built with the assets actually synchronised, and it replaces those frames.

The GROTA captures `g13-mapa-filtry*` and `g29-zasady-dane*` were retaken, and
`g31-zmiana-wykazu*` and `g32-adres-imiennicy*` are new (Polish, `-en`, `-uk`), on
26 October 2026 between 15:28 and 16:03 Europe/Warsaw. They come from a debug build of the
`grota-zmiana-wykazu` branch — the same GROTA module as release 1.8.01 (module 66b55272b6, shelter pack from the PSP register
of 26 October 2026, 87,835 points) on the Pixel 7 emulator with Android 14, with the screen
set to `wm size 1080x2340` so the frames match the rest of the GROTA set, then downscaled to
720 x 1560 JPEG. Nothing in them is retouched. The position is the same fake GPS fix in
Lublin's Old Town as the earlier sets. `g13-*` shows the counts the pack really holds
(87 835 points, 19 591 / 7 578 / 60 666 by access, 85 668 / 897 / 1 270 by location
certainty), and `g29-*` the register date that goes with them.

`g31-zmiana-wykazu*` shows the warning that the register changed. To produce it, a test place
"Dom" in Kromolice was written to the app's own storage with the shelter `OZO-852EACB93576`
saved from the register of 14 September 2026 — the point that PSP has since rewritten to a
building in Gostyń. Everything in the warning (the old address, the new one, the 23 km and
the "On request" access) is what the app computed from the two packs; only the saved place is
made up, and its note "piwnica, wejscie od podworza" stays Polish in the English and Ukrainian
frames because it is text a user types, not an interface string. `g32-adres-imiennicy*` was
taken with the emulator's Wi-Fi switched off, so the offline town list really is what answers;
the province names in the results stay Polish in all three languages, as they are in the
register. Both new screens first appear in release 1.8.01.

There is deliberately no screenshot for "When the map gets old": the offline map packs have not
been rebuilt since that code was written, so no device can honestly show the "There is a newer
map" line yet. The section is described in words until a newer pack exists.

No alerts were sent and no production data was written.

## Updating

`history-lubelskie-user.png` is an unchanged 1440 × 3200 screenshot supplied
by the user on 6 September 2026 (capture date and app version unverified).
It shows history at 15:11 with 2.2 points in Lublin province, not a current
warning. Both guides retain its Polish UI and identify it as a historical
example. The original file's contents must not be retouched.

The shared link-preview image is `docs/share-panel-v2.jpg`, copied byte for
byte to `frontend/assets/share-panel-v2.jpg`. Its 1200 × 630 composition comes
from rendering `docs/social-card.html`; the screen is `screens/share-app-2026-09-12.png`
inside a CSS phone shell. Render it at twice the size and downscale, so the text
on the phone stays readable:

    msedge --headless=new --disable-gpu --hide-scrollbars       --force-device-scale-factor=2 --window-size=1200,630       --screenshot=card.png file:///…/docs/social-card.html

then resize 2400 × 1260 → 1200 × 630 and save as JPEG. The rendered file is JPEG;
check the actual format rather than assuming screenshot bytes are PNG.

The phone screen must show a state that is **below the alert threshold** and the
caption must say when it was captured. A live red or yellow level would be cached
by link previews for weeks after the situation passed. The superseded `share-history-v1.jpg`
was removed on 29 September 2026: nothing had referenced it since 12 September,
it showed an interface two months out of date, and the only cost of dropping it
is a broken preview on a third-party page that cached that exact image URL.
`git show e3e0ad5^:docs/share-history-v1.jpg` brings it back if that turns out
to matter.

Use a new versioned filename for future preview revisions, and update the
Open Graph / Twitter metadata (`docs/index.html`, `docs/en.html`,
`frontend/index.html`, `scripts/build_changelog.py`) and `scripts/test_guide.py`
together.

Capture PNG files with `adb shell screencap -p /sdcard/<name>.png` and
`adb pull`, not PowerShell output redirection. Inspect each capture before
publishing. The source filenames used by `scripts/prepare_guide_screens.py`
are in that script; PNG inputs belong in the ignored `test-out` directory.
The helper requires Pillow and encodes full-size 1080 × 2400 JPEGs without
cropping or replacing any screen content.

`docs/guide.css` adds the slightly angled phone shell at display time.
Clicking a screen opens the original image without that shell. Perspective
does not change the stored screenshot. Some labels in the English APK are
still Polish; guide captions explicitly note this instead of retouching them.

The settings captures `set-alarmy-*.jpg`, `set-dzwiek-*.jpg` and
`set-aplikacja-*.jpg` (pl/en/uk) were replaced on 24 September 2026: 1080 × 2400
screenshots of the **signed** release 1.7.78 (code 107) on a Pixel 7 emulator
with Android 14, taken through the app's own interface in each language. They
show a fresh installation, so the Alerts tab states that no province has been
chosen yet — that is the real state of the app, not a staged one. The Sound tab
shows the new "Attention sound volume (yellow)" section and the Alerts tab the
optional "Alert despite Do Not Disturb" button, which the app displays only
while that permission is missing. No public test alerts were sent; the local
alarm tests used during the same session are not part of these captures.

The start screen and object cards were refreshed for release 1.7.84 on
28 September 2026: `start-pl.jpg`, `start-en.jpg`, `start-uk.jpg`,
`object-pl.jpg`, `object-en.jpg`, `card-mini-pl.jpg`, `card-mini-en.jpg`.
All are 1080 × 2400 captures of the signed 1.7.84 APK on a Pixel 7 emulator
with Android 14, on live server data. They were replaced because 1.7.84
stopped shading the position-uncertainty circle: it is now a dashed outline
only, which is visible on every screenshot that shows a NEPTUN object. The
objects visible on them are whatever the sources reported at that moment over
Ukraine; they are observations, not staged alert scenarios, and no public test
notifications were sent. The Ukrainian guide reuses the English object cards,
as before. Screens without a NEPTUN object (`panel-*`, the settings tabs, the
ADS-B and zone captures) were deliberately NOT replaced — the change is not
visible on them.

## 1797 — release 1.7.97 (18 October 2026)

`1797/` holds 21 captures (pl/en/uk): `set-start`, `panel`, `card-mini`, `object`,
`history`, `history-zwiniety`, `history-panel`. They replace the 1795/1796 files
of the same names in the PL/EN/UK and iPhone guides, because 1.7.97 changed what
these screens look like: the map moves above the open bottom panel, the object
card has a new height and the "heading to a target" line, history province cards
collapse and the bar buttons have labels, and Settings opened from the Menu have
a "‹ Menu" button.

All are unchanged 1080 × 2400 screenshots of a 1.7.97 debug build (code 126,
the same web code as the release) on the Pixel 7 emulator with Android 14,
default density, taken on the afternoon of 18 October 2026 (PL ~15:18–15:25,
EN ~15:27–15:30, UK ~15:35–15:38, Europe/Warsaw) on live server data. Screens
were opened with real taps (`adb shell input tap`); the map was only framed
(moved and zoomed) to put a drone in view before tapping it. The drones over
Rivne oblast and the Lublin scores (below threshold in PL, elevated attention
in EN/UK a few minutes later) are what the sources reported at that moment, not
staged scenarios. No public test notifications were sent.

On the Ukrainian history screens the labels under the history buttons are
hidden: that is the app's own behaviour when the labels do not fit (1.7.97).

## 1798 — release 1.7.98 (18 October 2026)

`1798/set-start-{pl,en,uk}.jpg` replace the 1797 settings start screens: in 1.7.98
the "‹ Menu" button moved from below the list of sections to the top, next to
"Close". Unchanged 1080 × 2400 screenshots of a 1.7.98 debug build (code 127) on
the Pixel 7 emulator with Android 14, taken on the evening of 18 October 2026 with
real taps (Menu → Settings). The same run tapped through every Menu window and
Settings section in all three languages to check the back buttons; only the
settings start screens are used in the guides. No public test notifications were sent.

## 1799 — release 1.7.99 (19 October 2026)

`1799/panel-{pl,en,uk}.jpg` and `1799/history-panel-{pl,en,uk}.jpg` replace the
1797 files: 1.7.99 stopped passing NEPTUN objects to neighbouring provinces and
shows NEPTUN signal titles in Polish, both visible on these panels. Unchanged
1080 × 2400 screenshots of a 1.7.99 debug build (code 128) on the Pixel 7
emulator with Android 14, taken on the evening of 19 October 2026 (PL ~20:15,
EN ~20:18, UK ~20:22 Europe/Warsaw), after the server had been deployed with the
new scoring, during a real drone attack — the scores are live data from that
moment. The emulator is subscribed to Lublin alerts, so a real red alert screen
appeared on start; it was acknowledged before the screenshots. No test
notifications were sent; the emulator sound was muted.

`1799/map-uncertain-{pl,en,uk}.jpg`, `1799/object-points-{pl,en,uk}.jpg` and
`1799/set-mapa-{pl,en,uk}.jpg` were taken on 19 October 2026 between 23:24 and 23:34 Polish
time on the Pixel 7 emulator (1080 x 2400, Android 14) from a debug build of release 1.7.99,
with the production server's data. The map and card shots use the history view at 21:39
Polish time, when a drone was circling Lviv and most of the icons were "heading towards …"
reports: they show the dimmed, dashed icon for an uncertain position, the default circles
(only the tapped object and confirmed positions within 50 km of the border), the position
badge and the "Points now" row with the reason a province gets nothing. They replace
`1797/card-mini-*`, `1797/object-*` and `1796/set-mapa-*` in the guides. During the series a
real red alert was in force for Lubelskie and Podkarpackie; it was acknowledged on the
emulator and "Alerts on this phone" was switched off there so it would not cover the app
again — that setting is not visible in any shot. No alerts were sent and nothing was written
to production. Nothing in the images is retouched.

## 1800 — release 1.8.00 (21 October 2026)

`1800/alarm-{pl,en,uk}.jpg` and `1800/alarm2-{pl,en,uk}.jpg` replace the 1795
alert screens in all guides (the iPhone guides use `alarm-{pl,en}.jpg`): in 1.8.00
the acknowledge button and the choices moved to the top, the alert shows at most
3 reasons with “The full list of signals is in the panel”, and siren, vibration and
flashing stop after 15 minutes. Unchanged 1080 × 2400 screenshots of a 1.8.00 debug
build (code 129) on the Pixel 7 emulator with Android 14, taken on the evening of
21 October 2026 (PL ~21:53, EN ~21:55, UK ~22:00 Europe/Warsaw; the UK pair was
retaken after the score line got “хв” instead of “min”, so the UK pair shows the Lublin signals of ~22:00 — two NEPTUN drones and the RCB alert — rather than the PL/EN set). In the UK signal lines the units “km” and “min” are still shown untranslated; that is how 1.8.00 renders them. The alert is the local
test (▶ Test: full alert) on the live Lublin signals of that moment, during a real
drone alert in Lublin province; the RCB alert text is quoted in Polish in every
language because that is how the source publishes it. No notifications were sent;
the emulator sound was muted.
