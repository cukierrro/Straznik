# -*- coding: utf-8 -*-
"""Kurs z ruchu dopiero po przesunięciu ≥ niepewność meldunku (decyzja usera 20.11.2026).

20.11 rakieta pod Lwowem przez godzinę skakała o 2,6–3,4 km przy ±4 km i co kilka minut
dostawała „kurs z ruchu na Polskę” (pełne punkty, czas dolotu 0–1 min). Przeliczenie
21.10–20.11 na migawkach: 0 zmian powiadomień.

Uruchomienie:  py scripts/test_prog_ruchu.py
"""
import re
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import geo  # noqa: E402
from app.collectors import neptun  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


def przesun(lat, lon, km, kurs):
    import math
    d = km / 6371.0
    la1, lo1, b = math.radians(lat), math.radians(lon), math.radians(kurs)
    la2 = math.asin(math.sin(la1) * math.cos(d) + math.cos(la1) * math.sin(d) * math.cos(b))
    lo2 = lo1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(la1), math.cos(d) - math.sin(la1) * math.sin(la2))
    return math.degrees(la2), math.degrees(lo2)


def od_nowa():
    neptun._last_pos.clear()
    neptun._last_est.clear()


LWOW = (49.836, 24.032)

print("1. Próg")
ok(neptun.prog_ruchu_km({"uncertaintyKm": 4}) == 4.0, "±4 km → 4 km")
ok(neptun.prog_ruchu_km({"uncertaintyKm": 1}) == 2.0, "±1 km → nadal minimum 2 km")
ok(neptun.prog_ruchu_km({}) == 2.0, "bez niepewności → 2 km jak dotąd")
ok(neptun.prog_ruchu_km({"uncertaintyKm": "x"}) == 2.0, "śmieci w polu nie wywracają")

print("\n2. Rakieta spod Lwowa (20.11): skoki 3,4 km przy ±4 km to nie kurs")
od_nowa()
neptun._last_pos["trk_l"] = LWOW
la, lo = przesun(*LWOW, 3.4, 150)
t = {"id": "trk_l", "lat": la, "lon": lo, "uncertaintyKm": 4, "type": "missile"}
ok(neptun._movement_heading(t) is None, "przesunięcie 3,4 km < 4 km — brak kursu z ruchu")
la, lo = przesun(*LWOW, 2.6, 330)
ok(neptun._movement_heading({"id": "trk_l", "lat": la, "lon": lo, "uncertaintyKm": 4}) is None,
   "2,6 km — też nie (dawniej dawało 335°)")

print("\n3. Lecący obiekt nadal dostaje kurs")
od_nowa()
neptun._last_pos["trk_d"] = LWOW
la, lo = przesun(*LWOW, 12, 300)
h = neptun._movement_heading({"id": "trk_d", "lat": la, "lon": lo, "uncertaintyKm": 10, "type": "uav"})
ok(h is not None and abs(((h - 300) + 180) % 360 - 180) < 2, f"12 km przy ±10 km — kurs z ruchu ({h})")
la, lo = przesun(*LWOW, 2.5, 300)
ok(neptun._movement_heading({"id": "trk_d", "lat": la, "lon": lo, "uncertaintyKm": 1}) is not None,
   "przy ±1 km wystarcza dawne 2 km")

print("\n4. Lustra w aplikacji (tryb wbudowany i karta)")
eng = (ROOT / "frontend" / "engine.js").read_text(encoding="utf-8")
app = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
ok(re.search(r"const progRuchuKm = \(t\) => Math\.max\(2, Number\(t\?\.uncertaintyKm\) \|\| 0\)", eng) is not None,
   "engine.js: progRuchuKm = max(2, niepewność)")
ok("haversine(prev[0], prev[1], t.lat, t.lon) >= progRuchuKm(t)" in eng, "engine.js: kurs z ruchu po progu")
ok("haversine(kotw[0], kotw[1], t.lat, t.lon) >= progRuchuKm(t)) lastPos.set" in eng,
   "engine.js: kotwica przesuwa się dopiero po progu (jak serwer)")
ok("kmBetween(a, b) >= Math.max(2, Number(t.uncertaintyKm) || 0)" in app, "app.js measuredHeading: ten sam próg")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - kurs z ruchu dopiero po przesunięciu większym niż niepewność meldunku")
