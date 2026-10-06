# -*- coding: utf-8 -*-
"""Strona „Historia zmian": kotwice wydań i strażnik generatora.

Powstał 06.10.2026 po dwóch znaleziskach naraz:

1. Wpisy 1.7.89 i 1.7.90 dopisano RĘCZNIE wewnątrz sekcji poprzedniego
   wydania. Nagłówek był, kotwicy nie — odnośnik zmiany.html#v1-7-90
   prowadził donikąd, a #v1-7-88 na cudzy nagłówek. Strona wyglądała
   dobrze, bo <h2> renderuje się tak samo w cudzej sekcji.
2. scripts/build_changelog.py składa stronę OD ZERA z listy RELEASES
   i nadpisuje plik. Lista stanęła na 1.7.78, strona doszła do 1.7.90:
   jedno uruchomienie skasowałoby dwanaście wydań BEZ ŻADNEGO BŁĘDU.

Uruchomienie: py scripts/test_historia_zmian.py
"""
import importlib.util
import io
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
bledy = 0


def sprawdz(ok, opis):
    global bledy
    print(("  OK  " if ok else "  BLAD") + "  " + opis)
    if not ok:
        bledy += 1


def czytaj(wzgledna):
    tekst = io.open(ROOT / wzgledna, encoding="utf-8", newline="").read()
    # Końce linii normalizujemy po odczycie: przy core.autocrlf=true wzorce
    # z pojedynczym końcem linii nie trafiają i test przewraca się zamiast
    # sprawdzać (lekcja z 28.09).
    return tekst.replace(chr(13) + chr(10), chr(10))


STRONY = ("docs/zmiany.html", "docs/zmiany-en.html")

print("1. Kazde wydanie ma wlasna kotwice")
wersje_stron = {}
for nazwa in STRONY:
    t = czytaj(nazwa)
    kotwice = [m.replace("-", ".") for m in re.findall(r'<section id="v([0-9][0-9-]*)"', t)]
    naglowki = re.findall(r"<h2>([0-9]+[.][0-9]+[.][0-9]+)", t)
    wersje_stron[nazwa] = naglowki
    brak = sorted(set(naglowki) - set(kotwice))
    sprawdz(kotwice == naglowki,
            nazwa + ": kotwice zgadzaja sie z naglowkami"
            + ("" if kotwice == naglowki else " — bez wlasnej kotwicy: " + ", ".join(brak)))
    sprawdz(len(kotwice) == len(set(kotwice)), nazwa + ": zadna kotwica sie nie powtarza")
    sprawdz(t.count("<section ") == t.count("</section>"), nazwa + ": sekcje domkniete")

print("2. Obie wersje jezykowe wymieniaja te same wydania")
pl, en = (wersje_stron[s] for s in STRONY)
sprawdz(pl == en, "PL i EN maja te same wydania w tej samej kolejnosci"
        + ("" if pl == en else " — tylko PL: " + ", ".join(sorted(set(pl) - set(en)))
           + "; tylko EN: " + ", ".join(sorted(set(en) - set(pl)))))

print("3. Generator odmawia pracy, gdy strona wyprzedza liste RELEASES")
spec = importlib.util.spec_from_file_location("bc", ROOT / "scripts" / "build_changelog.py")
bc = importlib.util.module_from_spec(spec)
sys.modules["bc"] = bc
spec.loader.exec_module(bc)

sprawdz(hasattr(bc, "straz"), "build_changelog.py ma funkcje straz()")
zrodlo = czytaj("scripts/build_changelog.py")
sprawdz(re.search(r"def main\(\):\s*straz\(\)", zrodlo) is not None,
        "straz() jest PIERWSZA instrukcja main(), przed jakimkolwiek zapisem")


def z_wersjami(katalog, wersje):
    """Podsuwa generatorowi sztuczna strone o podanych wydaniach."""
    for lang in ("pl", "en"):
        plik = Path(katalog) / bc.TEXTS[lang]["self_file"]
        plik.write_text(
            "".join('<section id="v' + w.replace(".", "-") + '"></section>' for w in wersje),
            encoding="utf-8")
    bc.DOCS = Path(katalog)


oryg_docs, oryg_rel = bc.DOCS, bc.RELEASES
try:
    with tempfile.TemporaryDirectory() as kat:
        bc.RELEASES = [("1.7.78",) + (None,) * 7]

        z_wersjami(kat, ["1.7.90", "1.7.78"])
        try:
            bc.straz()
            sprawdz(False, "strona nowsza niz lista — straz() PRZEPUSCIL, strona poszlaby do skasowania")
        except SystemExit as e:
            sprawdz("1.7.90" in str(e) and "1.7.78" in str(e),
                    "strona nowsza niz lista — straz() przerywa i podaje obie wersje")

        z_wersjami(kat, ["1.7.78", "1.7.77"])
        try:
            bc.straz()
            sprawdz(True, "strona zgodna z lista — straz() przepuszcza")
        except SystemExit as e:
            sprawdz(False, "strona zgodna z lista, a straz() przerwal: " + str(e))

        # Kontrola na samym porownaniu: tekstowo „1.7.9" jest WIEKSZE niz
        # „1.7.90", wiec porownanie napisow blokowaloby poprawne uruchomienie.
        z_wersjami(kat, ["1.7.9"])
        bc.RELEASES = [("1.7.90",) + (None,) * 7]
        try:
            bc.straz()
            sprawdz(True, "1.7.9 < 1.7.90 — porownanie jest liczbowe, nie tekstowe")
        except SystemExit:
            sprawdz(False, "1.7.9 uznane za nowsze niz 1.7.90 — porownanie tekstowe")
finally:
    bc.DOCS, bc.RELEASES = oryg_docs, oryg_rel

print()
print("BLEDY: " + str(bledy))
sys.exit(1 if bledy else 0)
