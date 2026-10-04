"""Instrukcja GROTY (PL/EN/UK): zrzuty, odnośniki i liczby zgodne z paczką punktów.

Dlaczego osobno od test_guide.py: tamten sprawdza instrukcję Strażnika (index/en/uk) i nigdy
nie zaglądał do stron GROTY, więc zrzuty i opisy modułu nie były niczym pilnowane.

Najważniejsza asercja jest na końcu: data wykazu PSP i liczba punktów podane w instrukcji muszą
zgadzać się z paczką w `grota/data/polska.min.json`. Po przebudowie paczki instrukcja zostawała
z poprzednimi liczbami i nikt tego nie widział aż do czytelnika.
"""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from PIL import Image

KORZEN = Path(__file__).resolve().parents[1]
DOCS = KORZEN / "docs"
PACZKA = KORZEN / "grota" / "data" / "polska.min.json"
STRONY = ("grota.html", "grota-en.html", "grota-uk.html")
ROZMIAR = (720, 1560)
# wycinek, nie pełny ekran: karta alarmu pokazana bez reszty mapy
INNE = {f"screens/grota/g02-alarm{s}.jpg": (720, 631) for s in ("", "-en", "-uk")}


class Strona(HTMLParser):
    def __init__(self, sciezka):
        super().__init__()
        self.sciezka, self.ids, self.odnosniki, self.obrazy = sciezka, set(), [], []
        self.sekcje = []
        self.tekst = sciezka.read_text(encoding="utf-8")
        self.feed(self.tekst)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            assert a["id"] not in self.ids, (self.sciezka, "powtórzony id", a["id"])
            self.ids.add(a["id"])
        if tag == "section":
            self.sekcje.append(a["id"])
        for pole in ("src", "href"):
            if pole in a:
                self.odnosniki.append(a[pole])
        if tag == "img":
            assert a.get("alt", "").strip(), (self.sciezka, "zrzut bez tekstu alternatywnego", a.get("src"))
            oczekiwany = INNE.get(a["src"], ROZMIAR)
            assert (int(a.get("width", 0)), int(a.get("height", 0))) == oczekiwany, (self.sciezka, a.get("src"))
            self.obrazy.append(a["src"])


def main():
    strony = {nazwa: Strona(DOCS / nazwa) for nazwa in STRONY}

    # ten sam układ rozdziałów we wszystkich trzech językach
    for nazwa in STRONY[1:]:
        assert strony[nazwa].sekcje == strony[STRONY[0]].sekcje, (nazwa, strony[nazwa].sekcje)

    obrazy = set()
    for strona in strony.values():
        obrazy.update(strona.obrazy)
        for ref in strona.odnosniki:
            url = urlsplit(ref)
            if url.scheme or url.netloc:
                continue
            cel = DOCS / unquote(url.path) if url.path else strona.sciezka
            assert cel.is_file(), (strona.sciezka, "brak pliku", ref)
            if url.fragment and cel.name in strony:
                assert unquote(url.fragment) in strony[cel.name].ids, (strona.sciezka, ref)

    # zrzut ma być prawdziwym plikiem o tym rozmiarze, który deklaruje strona
    for sciezka in sorted(obrazy):
        with Image.open(DOCS / sciezka) as zrzut:
            assert zrzut.format == "JPEG" and zrzut.size == INNE.get(sciezka, ROZMIAR), (sciezka, zrzut.format, zrzut.size)
            zrzut.verify()

    # liczby z paczki: data wykazu i liczba punktów
    paczka = json.loads(PACZKA.read_text(encoding="utf-8"))
    rok, miesiac, dzien = paczka["data_danych"].split("-")
    data = f"{dzien}.{miesiac}.{rok}"
    ile = len(paczka["punkty"])
    zapisy = {"grota.html": f"{ile:,}".replace(",", " "),      # 86 533
              "grota-uk.html": f"{ile:,}".replace(",", " "),
              "grota-en.html": f"{ile:,}"}                     # 86,533
    for nazwa, strona in strony.items():
        assert data in strona.tekst, (nazwa, "brak daty wykazu z paczki", data)
        assert zapisy[nazwa] in strona.tekst, (nazwa, "brak liczby punktów z paczki", zapisy[nazwa])

    print(f"OK: instrukcja GROTY w 3 językach, {len(strony[STRONY[0]].sekcje)} rozdziałów, "
          f"{len(obrazy)} zrzutów {ROZMIAR[0]}x{ROZMIAR[1]}, wykaz z {data} i {ile} punktów zgodne z paczką.")


if __name__ == "__main__":
    main()
