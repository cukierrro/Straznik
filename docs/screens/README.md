# Current user-guide screenshots

The Polish and English guides use 17 real captures from Strażnik 1.7.16
(version code 46), running on a Pixel 7 emulator with Android 14.
Captured on 6 September 2026. These are observations of the application,
not fabricated alert scenarios. No public test notifications were sent.

Current Polish captures: `01_start.jpg`, `04_legenda.jpg`, `settings-pl.jpg`,
`updates-pl.jpg`, `panel-pl.jpg`, `history-pl.jpg`, `past-pl.jpg`, `object-pl.jpg`.

Current English captures: `start-en.jpg`, `legend-en.jpg`, `settings-en.jpg`,
`updates-en.jpg`, `panel-en.jpg`, `history-en.jpg`, `past-en.jpg`,
`aircraft-en.jpg`, `object-en.jpg`.

The alarm section also includes two explicitly labelled historical test
captures: `30_alert_zolty_tlo.jpg` (1440 × 3200) and
`32_alarm_pelnoekranowy.jpg` (720 × 1600). They illustrate the expanded yellow
notification and native red full-screen alarm. Both retain their original
Polish UI, including in the English guide. They are not presented as captures
of 1.7.16 or as current incidents, and their example scores are not a reference
for today's scoring rules. Other image files remain unused historical assets.

## Updating

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
