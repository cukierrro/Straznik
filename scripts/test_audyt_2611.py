# -*- coding: utf-8 -*-
"""Poprawki z audytu bezpieczeństwa 26.11.2026 (ustalenia NISKIE 1–4).

1. gov.pl: po przekierowaniu liczy się też HOST, nie tylko ścieżka; za duża odpowiedź to nie RCB.
2. Aktualizator Androida: górna granica pobieranego pliku (LimitAktualizacji, javac).
3. Zbiory w pamięci serwera nie rosną bez końca (rcb._ostrzezone, telegram_lt `widziane`).
4. Panel powiatów: `terc` i poziom przez esc() w HTML.

Uruchomienie:  py scripts/test_audyt_2611.py
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import types
from pathlib import Path

import httpx

KORZEN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KORZEN / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import config  # noqa: E402
from app.collectors import rcb, telegram_lt  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


class _R:
    def __init__(self, url, text="<html>RCB</html>"):
        self.url = httpx.URL(url)
        self.text = text


print("1. gov.pl: host i rozmiar")
H = "/web/rcb/alert-rcb-zagrozenie-z-powietrza-2611"
ok(not rcb._przekierowany(_R("https://www.gov.pl" + H), H), "ten sam host i ścieżka — artykuł")
ok(rcb._przekierowany(_R("https://www.gov.pl/"), H), "strona główna gov.pl — przekierowanie (jak 09.11)")
ok(rcb._przekierowany(_R("https://gov.pl.example.com" + H), H), "inny host z tą samą ścieżką — NIE artykuł")
ok(rcb._przekierowany(_R("https://gov.pl" + H), H), "gov.pl bez www — też nie ten host (serwer zawsze daje www)")
ok(rcb._za_duza(_R("https://www.gov.pl" + H, "x" * (rcb.GOVPL_MAX_ZNAKOW + 1))), "odpowiedź ponad limit — odrzucona")
ok(not rcb._za_duza(_R("https://www.gov.pl" + H, "x" * 500_000)), "zwykła strona (500 KB) — przyjęta")
src = (KORZEN / "backend/app/collectors/rcb.py").read_text(encoding="utf-8")
ok(re.search(r"if _za_duza\(r\):\s*\n\s*_nieczytelny\(", src) is not None, "artykuł za duży → „nieczytelny” (ponowna próba)")
ok("r.url.host != GOVPL_HOST or _za_duza(r)" in src, "lista RCB też sprawdza host i rozmiar")

print("\n2. aktualizator: górna granica pobierania")
JAVA = KORZEN / "android-app/android/app/src/main/java/pl/straznik/app"


def znajdz(nazwa):
    kandydaci = [Path(os.environ["JAVA_HOME"]) / "bin"] if os.environ.get("JAVA_HOME") else []
    kandydaci += [Path(r"C:\Program Files\Android\Android Studio\jbr\bin"), Path("/usr/lib/jvm/default-java/bin")]
    for k in kandydaci:
        for n in (nazwa + ".exe", nazwa):
            if (k / n).exists():
                return str(k / n)
    return shutil.which(nazwa)


HARNESS = r"""
package pl.straznik.app;
public class TestLimitu {
    public static void main(String[] a) {
        long M = 1L << 20;
        System.out.println("rozmiar " + LimitAktualizacji.limit(15762986L));
        System.out.println("brak " + LimitAktualizacji.limit(0));
        System.out.println("ujemny " + LimitAktualizacji.limit(-5));
        System.out.println("ogromny " + LimitAktualizacji.limit(5000L * M));
        long lim = LimitAktualizacji.limit(15762986L);
        System.out.println("naglowekOk " + LimitAktualizacji.zaDuzyZNaglowka(15762986L, lim));
        System.out.println("naglowekZa " + LimitAktualizacji.zaDuzyZNaglowka(lim + 1, lim));
        System.out.println("bezNaglowka " + LimitAktualizacji.zaDuzyZNaglowka(-1, lim));
    }
}
"""
javac, java = znajdz("javac"), znajdz("java")
ok(javac is not None and java is not None, f"javac i java znalezione ({javac})")
if javac and java:
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        (t / "TestLimitu.java").write_text(HARNESS, encoding="utf-8")
        r = subprocess.run([javac, "-encoding", "UTF-8", "-d", str(t / "out"), str(JAVA / "LimitAktualizacji.java"),
                            str(t / "TestLimitu.java")], capture_output=True, text=True, encoding="utf-8", errors="replace")
        ok(r.returncode == 0, "kompilacja " + r.stderr[:300])
        if r.returncode == 0:
            r = subprocess.run([java, "-cp", str(t / "out"), "pl.straznik.app.TestLimitu"],
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            w = dict(l.split(" ", 1) for l in r.stdout.strip().splitlines())
            ok(w.get("rozmiar") == str(15762986 + (1 << 20)), "limit = rozmiar z serwera + 1 MB")
            ok(w.get("brak") == str(100 << 20) and w.get("ujemny") == str(100 << 20), "bez rozmiaru — 100 MB")
            ok(w.get("ogromny") == str(100 << 20), "zawyżony rozmiar z serwera i tak przycięty do 100 MB")
            ok(w.get("naglowekOk") == "false", "Content-Length równy rozmiarowi — pobieramy")
            ok(w.get("naglowekZa") == "true", "Content-Length ponad limit — odmowa przed pobraniem")
            ok(w.get("bezNaglowka") == "false", "brak Content-Length — decyduje licznik w pętli")
bp = (JAVA / "BackgroundPlugin.java").read_text(encoding="utf-8")
ok("LimitAktualizacji.limit(" in bp and 'call.getDouble("size")' in bp, "installUpdate czyta `size` i liczy limit")
ok(re.search(r"pobrano \+= n;\s*\n\s*if \(pobrano > limitBajtow\)", bp) is not None, "pętla pobierania przerywa po przekroczeniu limitu")
ok("LimitAktualizacji.zaDuzyZNaglowka(rozmiar, limitBajtow)" in bp, "nagłówek Content-Length sprawdzany przed pobraniem")
app = (KORZEN / "frontend/app.js").read_text(encoding="utf-8")
ok(re.search(r"installUpdate\(\{url: rel\.url, sha256: rel\.sha256, size: Number\(rel\.size\) \|\| 0\}\)", app) is not None,
   "aplikacja przekazuje rozmiar z /api/app-version")

print("\n3. zbiory w pamięci serwera z limitem")
rcb._ostrzezone.clear()
rcb.log.disabled = True   # 620 ostrzeżeń testowych nie zaśmieca wyjścia
czas = [1_800_000_000.0]   # prawdziwa skala czasu: pierwsze ostrzeżenie zawsze się zapisuje
stary_time = rcb.time.time
rcb.time.time = lambda: czas[0]
try:
    for i in range(rcb.OSTRZEZONE_MAX + 120):
        czas[0] += 1
        rcb._ostrzez(f"/web/rcb/art-{i:05d}", "test")
finally:
    rcb.time.time = stary_time
ok(len(rcb._ostrzezone) == rcb.OSTRZEZONE_MAX, f"rcb._ostrzezone ≤ {rcb.OSTRZEZONE_MAX} ({len(rcb._ostrzezone)})")
ok("/web/rcb/art-00000" not in rcb._ostrzezone and f"/web/rcb/art-{rcb.OSTRZEZONE_MAX + 119:05d}" in rcb._ostrzezone,
   "odpadają najstarsze, najnowsze zostają")
widziane = set(range(1, 1501))
telegram_lt.przetworz("", widziane, False, 0.0)
ok(len(widziane) == telegram_lt.WIDZIANE_MAX, f"telegram_lt `widziane` ≤ {telegram_lt.WIDZIANE_MAX} ({len(widziane)})")
ok(min(widziane) == 501 and max(widziane) == 1500, "zostają najnowsze numery wpisów")

print("\n4. panel powiatów: wartości w HTML przez esc()")
pp = (KORZEN / "frontend/panel-powiaty.js").read_text(encoding="utf-8")
ok('class="pp-pow level-${esc(p.level)}' in pp, "poziom powiatu w klasie przez esc()")
ok('data-t="${esc(p.terc)}"' in pp, "TERYT w data-t przez esc()")
ok(re.search(r'data-t="\$\{p\.terc\}"', pp) is None, "nie ma już surowego ${p.terc} w atrybucie")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK: poprawki z audytu 26.11.2026 na miejscu")
