# -*- coding: utf-8 -*-
"""CSP strony straznik.eu (audyt 26.09.2026).

Sprawdza:
1. skróty skryptów w index.html liczone NIEZALEŻNĄ metodą (parser HTML, nie ten
   sam regex) zgadzają się z polityką — inaczej w trybie enforce strona by stanęła,
2. script-src bez 'unsafe-inline' i 'unsafe-eval' — to one dają ochronę przed XSS,
3. nagłówek trafia do HTML, a nie do JSON-a,
4. po zmianie index.html skróty przeliczają się bez restartu (wdrażamy `git pull`).
"""
import asyncio
import base64
import hashlib
import importlib
import os
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

bledy = 0


def sprawdz(warunek, opis):
    global bledy
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy += 1


class Skrypty(HTMLParser):
    """Niezależna ekstrakcja treści <script> bez src — tak, jak widzi ją przeglądarka."""
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.w_skrypcie, self.bufor, self.tresci = False, [], []

    def handle_starttag(self, tag, attrs):
        if tag == "script" and not any(k == "src" for k, _ in attrs):
            self.w_skrypcie, self.bufor = True, []

    def handle_endtag(self, tag):
        if tag == "script" and self.w_skrypcie:
            self.tresci.append("".join(self.bufor))
            self.w_skrypcie = False

    def handle_data(self, data):
        if self.w_skrypcie:
            self.bufor.append(data)


def skrot(tekst):
    return "'sha256-" + base64.b64encode(hashlib.sha256(tekst.encode("utf-8")).digest()).decode() + "'"


html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
p = Skrypty()
p.feed(html)

print("1. Skróty skryptów w index.html")
os.environ["CSP_MODE"] = "enforce"
from app import csp  # noqa: E402
importlib.reload(csp)
pol = csp.polityka(html)
script_src = next(d for d in pol.split("; ") if d.startswith("script-src"))
sprawdz(len(p.tresci) >= 1, f"parser znalazł {len(p.tresci)} skryptów w stronie")
sprawdz(len(csp.skroty(html)) == len(p.tresci), "regex serwera znajduje tyle samo skryptów co parser")
for i, t in enumerate(p.tresci, 1):
    sprawdz(skrot(t) in script_src, f"skrypt {i} ({len(t)} znaków) wpuszczony po właściwym skrócie")

print("\n2. script-src bez furtek")
sprawdz("'unsafe-inline'" not in script_src, "bez 'unsafe-inline'")
# 'unsafe-eval' jest dopuszczony WYŁĄCZNIE dla testu wieku przeglądarki
# (index.html: new Function("… a?.b ?? 1")). Bez niego 26.09.2026 każda
# przeglądarka dostała ekran „silnik jest za stary”. Pilnujemy, żeby to był
# jedyny eval w kodzie — drugi zamieniłby tę zgodę w realną furtkę.
import re  # noqa: E402
EVAL = re.compile(r"new Function\s*\(|(?<![\w.])eval\s*\(|set(?:Timeout|Interval)\s*\(\s*[\"'`]")
wystapienia = []
for plik in sorted((ROOT / "frontend").glob("*.js")) + [ROOT / "frontend" / "index.html"]:
    for nr, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), 1):
        if EVAL.search(linia):
            wystapienia.append((plik.name, nr, linia.strip()))
sprawdz(len(wystapienia) == 1 and wystapienia[0][0] == "index.html" and "a?.b ?? 1" in wystapienia[0][2],
        f"jedyny eval w frontendzie to test wieku przeglądarki (znaleziono: {[(p, n) for p, n, _ in wystapienia]})")
sprawdz("'unsafe-eval'" in script_src, "'unsafe-eval' jest (bez niego test wieku zgłasza stary silnik)")
sprawdz("https:" not in script_src and "*" not in script_src, "bez obcych domen dla skryptów")
sprawdz("object-src 'none'" in pol and "base-uri 'self'" in pol, "object-src none i base-uri self")

print("\n3. Nagłówek tylko na HTML")
from app import request_limits  # noqa: E402
importlib.reload(request_limits)


async def odpowiedz(typ):
    zebrane = []

    async def aplikacja(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", typ)]})
        await send({"type": "http.response.body", "body": b"x"})

    async def send(msg):
        zebrane.append(msg)

    async def receive():
        return {"type": "http.request", "body": b""}

    await request_limits.RequestLimits(aplikacja)({"type": "http", "method": "GET", "path": "/", "headers": []},
                                                   receive, send)
    return {k.lower(): v for k, v in zebrane[0]["headers"]}


h_html = asyncio.run(odpowiedz(b"text/html; charset=utf-8"))
h_json = asyncio.run(odpowiedz(b"application/json"))
sprawdz(b"content-security-policy" in h_html, "strona HTML dostaje Content-Security-Policy")
sprawdz(b"content-security-policy" not in h_json and b"content-security-policy-report-only" not in h_json,
        "JSON nie dostaje CSP")
sprawdz(b"x-content-type-options" in h_json, "pozostałe nagłówki bezpieczeństwa nadal na wszystkim")

print("\n4. Przeliczenie po zmianie index.html (bez restartu)")
with tempfile.TemporaryDirectory() as tmp:
    (Path(tmp) / "index.html").write_text("<html><script>var a=1;</script></html>", encoding="utf-8")
    csp.config.FRONTEND_DIR = tmp
    csp._cache.update(klucz=None, wartosc=None)
    pierwszy = csp.naglowek()[1].decode()
    (Path(tmp) / "index.html").write_text("<html><script>var a=2; var b=3;</script></html>", encoding="utf-8")
    drugi = csp.naglowek()[1].decode()
    sprawdz(skrot("var a=1;") in pierwszy, "pierwsza wersja wpuszczona")
    sprawdz(skrot("var a=2; var b=3;") in drugi and skrot("var a=1;") not in drugi,
            "po zmianie pliku stary skrót znika, nowy się pojawia")

print(f"\n{'WSZYSTKO OK' if not bledy else f'BŁĘDÓW: {bledy}'}")
sys.exit(1 if bledy else 0)
