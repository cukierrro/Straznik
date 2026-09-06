"""Check the bilingual static guide, local links and current screenshot assets."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "docs"


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
            assert attrs.get("width") == "1080" and attrs.get("height") == "2400"
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
            assert shot.format == "JPEG" and shot.size == (1080, 2400), path
            shot.verify()
    assert len(images) == 17, images
    print(f"OK: 2 languages, {len(pages['index.html'].sections)} matching sections, "
          f"{len(images)} valid Pixel screenshots, local links and alt text.")


if __name__ == "__main__":
    main()
