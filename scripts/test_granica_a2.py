# -*- coding: utf-8 -*-
"""Audyt A2b: odległość do konturu Polski i kurs do całego wycinka kraju.

Przypadki z audytu 11.09.2026, które na 19 punktach granicy dawały 0 pkt albo
zawyżoną odległość, oraz porównanie z engine.js (tryb awaryjny) na tych samych
punktach — oba silniki muszą liczyć tak samo.

Uruchomienie: py scripts/test_granica_a2.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, geo  # noqa: E402
from app.collectors import neptun  # noqa: E402

ARGS = (config.NEPTUN_HEADING_TOLERANCE, config.NEPTUN_HEADING_SOFT_DEG,
        config.NEPTUN_UNKNOWN_HEADING_MULT, config.NEPTUN_UNKNOWN_HEADING_MAX_KM)
bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def ocena(lat, lon, hdg):
    return geo.assess_for_scoring(lat, lon, hdg, *ARGS)


print("1. Obiekt nad Polską")
a = ocena(51.25, 22.57, 90)          # Lublin, kurs na wschód
sprawdz(a["dist_km"] == 0 and a["toward_pl"] and a["border_voiv"] == "lubelskie",
        f"Lublin: 0 km, woj. lubelskie, liczony niezależnie od kursu ({a})")
shahed = {"id": "t", "type": "shahed", "confidenceLevel": "high", "sourceCount": 2,
          "positionQuality": "confirmed", "lifecycle": "confirmed", "lat": 51.25, "lon": 22.57}
pts = neptun.score_threat(shahed, a["dist_km"], a["course_factor"])
sprawdz(pts >= 2.0, f"Shahed nad Lublinem ze znanym kursem punktuje ({pts} pkt; dawniej 0)")

print("2. Granica morska")
a = ocena(54.71, 20.51, 285)         # Kaliningrad → Gdańsk (azymut ok. 285°)
sprawdz(a["toward_pl"] and a["course_factor"] == 1.0,
        f"Kaliningrad → Gdańsk: kurs na Polskę ({a['course_factor']}, {a['dist_km']} km)")
a = ocena(54.8, 18.7, 180)
sprawdz(a["dist_km"] <= 15 and a["border_voiv"] == "pomorskie",
        f"Zatoka Gdańska: {a['dist_km']} km, woj. {a['border_voiv']} (dawniej 81 km, warm.-maz.)")

print("3. Przy granicy wschodniej")
a = ocena(50.75, 24.2, 270)
sprawdz(a["dist_km"] < 12 and a["border_voiv"] == "lubelskie", f"10 km od Bugu: {a['dist_km']} km ({a['border_voiv']})")
a = ocena(53.68, 23.83, 270)
sprawdz(a["dist_km"] < 20 and a["border_voiv"] == "podlaskie", f"Grodno: {a['dist_km']} km ({a['border_voiv']})")
a = ocena(50.75, 25.33, 90)          # Łuck, kurs na wschód — od Polski
sprawdz(not a["toward_pl"], f"Łuck z kursem na wschód nie leci na Polskę ({a['course_factor']})")
a = ocena(50.75, 25.33, None)
sprawdz(a["course_factor"] == config.NEPTUN_UNKNOWN_HEADING_MULT, "kurs nieznany do 150 km = ×0,5")

print("4. engine.js liczy to samo")
PUNKTY = [(51.25, 22.57, 90), (54.71, 20.51, 285), (54.8, 18.7, 180), (50.75, 24.2, 270),
          (53.68, 23.83, 270), (50.75, 25.33, 90), (49.84, 24.03, 300), (48.62, 22.3, 330),
          (52.09, 23.73, None), (50.45, 30.52, 280)]
js = r"""
const fs = require("fs"), vm = require("vm");
const ctx = { console, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  window: {}, document: { addEventListener() {} }, fetch: () => Promise.reject(), setInterval() {}, setTimeout() {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1], "utf8"), ctx);
vm.runInContext(fs.readFileSync(process.argv[2], "utf8") + "\n;globalThis.__assess = Engine.assess;", ctx);
const pts = JSON.parse(process.argv[3]);
console.log(JSON.stringify(pts.map(([la, lo, h]) => ctx.__assess(la, lo, h))));
"""
try:
    out = subprocess.run(["node", "-e", js, str(ROOT / "frontend/pl-outline.js"), str(ROOT / "frontend/engine.js"),
                          json.dumps(PUNKTY)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    wyniki = json.loads(out.stdout.strip().splitlines()[-1])
    for (la, lo, h), e in zip(PUNKTY, wyniki):
        p = ocena(la, lo, h)
        zgodne = (abs(p["dist_km"] - e["dist_km"]) <= 0.2 and p["border_voiv"] == e["border_voiv"]
                  and abs(p["course_factor"] - e["course_factor"]) <= 0.01)
        sprawdz(zgodne, f"({la}, {lo}, kurs {h}): python {p['dist_km']} km {p['border_voiv']} cf={p['course_factor']}"
                        f" | engine {e['dist_km']} km {e['border_voiv']} cf={e['course_factor']}")
except Exception as exc:                         # noqa: BLE001
    sprawdz(False, f"uruchomienie engine.js w node: {exc!r} {getattr(out, 'stderr', '')[:400] if 'out' in dir() else ''}")

if bledy:
    print(f"\nBŁĘDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - granica z konturu Polski (A2b), oba silniki zgodne")
