"""Encode inspected Pixel captures as JPEG, without changing their contents.

Capture with adb shell screencap followed by adb pull into test-out.
The phone shell is CSS in docs/guide.css, not baked into the screenshots.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = {
    "docs-now.png": "01_start.jpg",
    "docs-legend-pl.png": "04_legenda.jpg",
    "docs-settings-pl.png": "settings-pl.jpg",
    "docs-updates-pl.png": "updates-pl.jpg",
    "docs-panel-pl.png": "panel-pl.jpg",
    "docs-history-pl.png": "history-pl.jpg",
    "docs-past-pl.png": "past-pl.jpg",
    "docs-start-en.png": "start-en.jpg",
    "docs-legend-en.png": "legend-en.jpg",
    "docs-settings-en.png": "settings-en.jpg",
    "docs-updates-en.png": "updates-en.jpg",
    "docs-panel-en.png": "panel-en.jpg",
    "docs-history-en.png": "history-en.jpg",
    "docs-past-en.png": "past-en.jpg",
    "docs-aircraft-en.png": "aircraft-en.jpg",
    "docs-object-en.png": "object-en.jpg",
    "docs-object-pl.png": "object-pl.jpg",
}

if __name__ == "__main__":
    missing = [name for name in CAPTURES if not (ROOT / "test-out" / name).is_file()]
    if missing:
        raise SystemExit("Missing captures: " + ", ".join(missing))
    for source, target in CAPTURES.items():
        with Image.open(ROOT / "test-out" / source) as shot:
            if shot.size != (1080, 2400):
                raise ValueError(f"Unexpected Pixel dimensions: {source}: {shot.size}")
            shot.convert("RGB").save(
                ROOT / "docs" / "screens" / target,
                "JPEG", quality=92, subsampling=0, optimize=True, progressive=True,
            )
    print(f"Prepared {len(CAPTURES)} current Pixel screenshots.")
