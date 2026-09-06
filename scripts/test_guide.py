"""Check the bilingual static guide, local links and current screenshot assets."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "docs"
HISTORICAL = {
    "screens/30_alert_zolty_tlo.jpg": (1440, 3200),
    "screens/32_alarm_pelnoekranowy.jpg": (720, 1600),
    "screens/history-lubelskie-user.png": (1440, 3200),
}


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path, self.ids, self.refs, self.images = path, set(), [], []
        self.sections = []
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            assert attrs["id"] not in self.ids, (self.path, "duplicate id", attrs["id"])
            self.ids.add(attrs["id"])
        if tag == "section":
            self.sections.append(attrs["id"])
        for name in ("src", "href"):
            if name in attrs:
                self.refs.append(attrs[name])
        if tag == "img":
            assert attrs.get("alt", "").strip(), (self.path, "missing alt")
            expected = HISTORICAL.get(attrs["src"], (1080, 2400))
            assert (int(attrs.get("width", 0)), int(attrs.get("height", 0))) == expected
            self.images.append(attrs["src"])


def main():
    pages = {name: Page(ROOT / name) for name in ("index.html", "en.html")}
    assert pages["index.html"].sections == pages["en.html"].sections
    images = set()
    for page in pages.values():
        images.update(page.images)
        for ref in page.refs:
            url = urlsplit(ref)
            if url.scheme or url.netloc:
                continue
            target = ROOT / unquote(url.path) if url.path else page.path
            assert target.is_file(), (page.path, "missing file", ref)
            if url.fragment and target.name in pages:
                assert unquote(url.fragment) in pages[target.name].ids, (page.path, ref)
    for path in images:
        with Image.open(ROOT / path) as shot:
            fmt = "PNG" if path.endswith(".png") else "JPEG"
            assert shot.format == fmt and shot.size == HISTORICAL.get(path, (1080, 2400)), path
            shot.verify()
    assert len(images) == 20 and set(HISTORICAL).issubset(images), images
    share = ROOT / "share-history-v1.jpg"
    assert share.read_bytes() == (ROOT.parent / "frontend/assets/share-history-v1.jpg").read_bytes()
    with Image.open(share) as card:
        assert card.format == "JPEG" and card.size == (1200, 630)
    for file, expected in [(ROOT / "index.html", "https://cukierrro.github.io/Straznik/share-history-v1.jpg"),
                           (ROOT / "en.html", "https://cukierrro.github.io/Straznik/share-history-v1.jpg"),
                           (ROOT.parent / "frontend/index.html", "https://straznik.eu/assets/share-history-v1.jpg")]:
        html = file.read_text(encoding="utf-8")
        assert f'property="og:image" content="{expected}"' in html
        assert f'name="twitter:image" content="{expected}"' in html
    print(f"OK: 2 languages, {len(pages['index.html'].sections)} matching sections, "
          f"20 screenshots, local links, alt text and shared 1200x630 preview.")


if __name__ == "__main__":
    main()
