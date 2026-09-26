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
by link previews for weeks after the situation passed. The superseded
`share-history-v1.jpg` stays in the repository, because other sites may still have
it cached.

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
