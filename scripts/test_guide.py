"""Check the PL/EN/UK static guide, local links and current screenshot assets."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "docs"
HISTORICAL = {}   # instrukcja od 1.7.37 używa wyłącznie bieżących zrzutów
# nie-zrzuty (logo hostingu): własny rozmiar i nie liczą się do puli zrzutów
OTHER_IMAGES = {"mikrus-logo.svg": (86, 14)}
# odrębne zrzuty: instrukcja 21 ekranów × PL/EN, 14 ekranów po ukraińsku
# (reszta ukraińskich czeka na moment, gdy na mapie będzie co pokazać)
# + 7 archiwalnych w historii zmian
EXPECTED_SHOTS = 63


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
            src = attrs["src"]
            expected = OTHER_IMAGES.get(src) or HISTORICAL.get(src, (1080, 2400))
            assert (int(attrs.get("width", 0)), int(attrs.get("height", 0))) == expected
            if src not in OTHER_IMAGES:
                self.images.append(src)


def main():
    pages = {name: Page(ROOT / name)
             for name in ("index.html", "en.html", "uk.html", "zmiany.html", "zmiany-en.html")}
    # trzy języki instrukcji: polski (źródło), angielski, ukraiński (od 23.09.2026)
    assert pages["index.html"].sections == pages["en.html"].sections
    assert pages["index.html"].sections == pages["uk.html"].sections
    # historia zmian: te same wydania w obu językach, każde z własną sekcją
    assert pages["zmiany.html"].sections == pages["zmiany-en.html"].sections
    assert len(pages["zmiany.html"].sections) >= 12, pages["zmiany.html"].sections
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
    assert len(images) == EXPECTED_SHOTS and set(HISTORICAL).issubset(images), images
    share = ROOT / "share-panel-v2.jpg"
    assert share.read_bytes() == (ROOT.parent / "frontend/assets/share-panel-v2.jpg").read_bytes()
    with Image.open(share) as card:
        assert card.format == "JPEG" and card.size == (1200, 630)
    for file, expected in [(ROOT / "index.html", "https://cukierrro.github.io/Straznik/share-panel-v2.jpg"),
                           (ROOT / "en.html", "https://cukierrro.github.io/Straznik/share-panel-v2.jpg"),
                           (ROOT / "uk.html", "https://cukierrro.github.io/Straznik/share-panel-v2.jpg"),
                           (ROOT.parent / "frontend/index.html", "https://straznik.eu/assets/share-panel-v2.jpg")]:
        html = file.read_text(encoding="utf-8")
        assert f'property="og:image" content="{expected}"' in html
        assert f'name="twitter:image" content="{expected}"' in html
    print(f"OK: 3 languages, {len(pages['index.html'].sections)} matching sections, "
          f"{EXPECTED_SHOTS} screenshots, local links, alt text and shared 1200x630 preview.")


if __name__ == "__main__":
    main()
