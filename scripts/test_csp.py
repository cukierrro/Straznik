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
# Od 1.8.04 (31.10.2026) bez 'unsafe-eval': test wieku przeglądarki robi plik silnik.js
# samą składnią, a nie `new Function(…)`. W kodzie nie może być ŻADNEGO evala —
# meta CSP w aplikacji by go zablokowała i GROTA albo cała strona uznałaby WebView za stary.
import re  # noqa: E402
EVAL = re.compile(r"new Function\s*\(|(?<![\w.])eval\s*\(|set(?:Timeout|Interval)\s*\(\s*[\"'`]")
wystapienia = []
# GROTA ładuje się do tej samej strony (grota/*.js) — audyt 26.10.2026: test dotąd jej nie widział
for plik in (sorted((ROOT / "frontend").glob("*.js")) + [ROOT / "frontend" / "index.html"]
             + sorted((ROOT / "grota").glob("*.js"))):
    for nr, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), 1):
        if EVAL.search(linia):
            wystapienia.append((plik.name, nr, linia.strip()))
sprawdz(not wystapienia, f"brak evala w kodzie strony i GROTY (znaleziono: {[(p, n) for p, n, _ in wystapienia]})")
sprawdz("'unsafe-eval'" not in script_src, "bez 'unsafe-eval'")
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

print("\n5. CSP w aplikacji (meta w index.html, 1.8.04)")
# Aplikacja wczytuje index.html z plików — nagłówka serwera nie dostaje. Plugin natywny ma
# setRedMode / setRedSilent / setQuietHours, więc XSS mógłby po cichu wyciszyć czerwony alarm.
meta = re.findall(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)">', html)
sprawdz(len(meta) == 1, "index.html ma jedną meta Content-Security-Policy")
meta_pol = meta[0] if meta else ""
i_meta = html.find('http-equiv="Content-Security-Policy"')
i_charset = html.find('<meta charset="utf-8">')
i_skrypt = html.find("<script")
sprawdz(0 <= i_charset < i_meta < i_skrypt,
        "meta CSP zaraz po kodowaniu i przed pierwszym <script> (obejmuje tylko to, co po niej)")
dyr = lambda pol: {d.split(" ", 1)[0]: d for d in pol.split("; ")}
m, srv = dyr(meta_pol), dyr(pol)
sprawdz(m.get("script-src") == "script-src 'self'", f"aplikacja: script-src tylko 'self' ({m.get('script-src')})")
# frame-ancestors nie działa w <meta>; script-src serwera ma dodatkowo skrót JSON-LD
pominiete = {"frame-ancestors", "script-src"}
rozne = sorted(k for k in set(m) | set(srv) if k not in pominiete and m.get(k) != srv.get(k))
sprawdz(not rozne, f"pozostałe dyrektywy meta = nagłówek serwera (różne: {rozne})")
sprawdz("frame-ancestors" not in m, "bez frame-ancestors w meta (przeglądarka go tam ignoruje)")

# Skrypty wykonywalne wpisane w stronę są zabronione — zostaje tylko JSON-LD (dane).
class Wpisane(HTMLParser):
    def __init__(self):
        super().__init__()
        self.wykonywalne, self.atrybuty_on = 0, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and "src" not in a and a.get("type") != "application/ld+json":
            self.wykonywalne += 1
        self.atrybuty_on += [f"<{tag} {k}>" for k in a if k.startswith("on")]


w = Wpisane()
w.feed(html)
sprawdz(w.wykonywalne == 0, f"brak skryptów wpisanych w index.html (jest {w.wykonywalne})")
sprawdz(not w.atrybuty_on, f"brak atrybutów on…= w index.html ({w.atrybuty_on})")
# atrybuty on…= w szablonach JS (innerHTML) — CSP ich nie wykona, zdjęcie typu w karcie
# obiektu 26.09–31.10.2026 nie chowało się przez to po błędzie
ON_W_SZABLONIE = re.compile(r"""\son(?:error|load|click|change|input|submit|mouse\w+|key\w+)\s*=\s*["']""")
szablony = [(f.name, nr) for f in sorted((ROOT / "frontend").glob("*.js")) + sorted((ROOT / "grota").glob("*.js"))
            for nr, linia in enumerate(f.read_text(encoding="utf-8").splitlines(), 1)
            if ON_W_SZABLONIE.search(linia)]
sprawdz(not szablony, f"brak atrybutów on…= w szablonach JS ({szablony})")

# Każdy skrypt strony musi trafić do APK — dawniej skrypt budowania miał listę nazw
# i gubił pliki (voiv-outline.js), a brak silnik.js dałby ekran „za stary silnik”.
src = re.findall(r'<script src="([^"?]+)', html)
brak = [s_ for s_ in src if not (ROOT / "frontend" / s_).is_file()]
sprawdz(not brak, f"każdy <script src> z index.html istnieje we frontend/ (brak: {brak})")
bat = (ROOT / "1_buduj_i_testuj.bat").read_text(encoding="utf-8")
sprawdz('copy /y "%REPO%\\frontend\\*.js"' in bat, "budowanie APK kopiuje wszystkie frontend\\*.js")
kolejnosc = [html.find(f'src="{n}') for n in ("klasy.js", "wariant.js", "silnik.js", "start.js")]
sprawdz(all(i > 0 for i in kolejnosc) and kolejnosc == sorted(kolejnosc),
        "w <head> kolejno: klasy.js, wariant.js, silnik.js, start.js")
silnik = (ROOT / "frontend" / "silnik.js").read_text(encoding="utf-8")
sprawdz("?." in silnik and "??" in silnik and "STRAZNIK_SILNIK_NOWY" in silnik,
        "silnik.js sprawdza składnię ?. i ?? i ustawia flagę")
start = (ROOT / "frontend" / "start.js").read_text(encoding="utf-8")
sprawdz("STRAZNIK_OLD_ENGINE = window.STRAZNIK_SILNIK_NOWY !== true" in start,
        "start.js uznaje silnik za stary, gdy flagi brak")

print(f"\n{'WSZYSTKO OK' if not bledy else f'BŁĘDÓW: {bledy}'}")
sys.exit(1 if bledy else 0)
