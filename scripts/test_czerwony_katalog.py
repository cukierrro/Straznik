# -*- coding: utf-8 -*-
"""Klucz czerwonego a punkty katalogowe miejscowości (decyzja usera 24.11.2026).

NEPTUN podaje czasem jako pozycję „potwierdzoną” środek miejscowości ze swojego katalogu:
te same współrzędne co do metra u wielu różnych dronów. Kowel (51.21548, 24.70077) leży
54,7 km od granicy, czyli równo na 15 min dolotu, i od 2.08 do 20.11 otworzył 25 z 56
czerwonych; 24.11 dwa kolejne w pow. hrubieszowskim. Dron w takim punkcie dalej niż 50 km
od regionu nie otwiera czerwonego. Bliżej — po staremu. Rakiety — po staremu.
Przypadki to prawdziwe obiekty z historii.

Uruchomienie:  py scripts/test_czerwony_katalog.py
"""
import json
import subprocess
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

KORZEN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KORZEN / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import config, fusion  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


REF = datetime(2026, 11, 24, 18, 16, 30, tzinfo=timezone.utc)
KOWEL = {"lat": 51.21548, "lon": 24.70077}


def dron(**zmiany):
    d = {"type": "uav", "course": "unknown", "heading_source": "unknown", **KOWEL, "dist_km": 54.7,
         "eta_border_min": 15, "confidence": "high", "source_count": 6, "uncertainty_km": 4,
         "position_approximate": False, "position_quality": "confirmed"}
    d.update(zmiany)
    return {"id": 1, "ts": "2026-11-24T18:07:19+00:00", "source": "neptun", "event_type": "neptun_threat",
            "voivodeship": "P0604", "points": 0.9, "title": "Dron", "details": d}


# (opis, zmiany w obiekcie, czy daje klucz)
PRZYPADKI = [
    ("24.11 19:16 hrubieszowski: Kowel 54,7 km, 15 min, wysoka, 6 zgłoszeń", {}, False),
    ("24.11 19:52: grupa 2+ w Kowlu, 8 zgłoszeń", {"source_count": 8, "count": 2}, False),
    ("21.10: Kowel z kursem znanym na PL", {"course": "known", "heading_source": "source", "heading": 258.0}, False),
    ("Kowel, ale region ≤ 50 km (np. powiat bliżej Kowla)", {"dist_km": 49.0, "eta_border_min": 13}, True),
    ("Kowel, równo 50 km do regionu", {"dist_km": 50.0, "eta_border_min": 14}, True),
    ("współrzędne 0,2 km od punktu (tolerancja 0,3)", {"lat": 51.2173, "lon": 24.7008}, False),
    ("0,5 km od Kowla — inny punkt, po staremu", {"lat": 51.2200, "lon": 24.7008, "dist_km": 54.5}, True),
    ("Dublany 54,5 km (18.10 podkarpackie)", {"lat": 49.90411, "lon": 24.08637, "dist_km": 54.5, "course": "known",
                                             "heading_source": "source", "confidence": "medium", "source_count": 3}, False),
    ("Gródek 52,4 km (19.10 lubelskie)", {"lat": 49.78476, "lon": 23.6481, "dist_km": 52.4, "eta_border_min": 14,
                                         "course": "known", "heading_source": "source", "source_count": 4}, False),
    ("Gródek 41,4 km do podkarpackiego — bliżej niż 50, po staremu", {"lat": 49.78476, "lon": 23.6481, "dist_km": 41.4,
                                                                      "eta_border_min": 11}, True),
    ("Drohobycz 53,3 km", {"lat": 49.35196, "lon": 23.51121, "dist_km": 53.3}, False),
    ("Lwów 57,2 km dron odrzutowy, 7 min", {"lat": 49.8397, "lon": 24.0297, "dist_km": 57.2, "eta_border_min": 7,
                                           "jet": True}, False),
    ("Rawa Ruska 4,7 km (20.10) — po staremu", {"lat": 50.2325, "lon": 23.6217, "dist_km": 4.7, "eta_border_min": 0}, True),
    ("Luboml 14,3 km (15.10) — po staremu", {"lat": 51.2254, "lon": 24.0323, "dist_km": 14.3, "eta_border_min": 2}, True),
    ("Shahed w Kowlu: też dron", {"type": "shahed"}, False),
    ("rakieta „we Lwowie” 57,2 km (20.11 04:32) — rakiety po staremu",
     {"type": "missile", "lat": 49.8397, "lon": 24.0297, "dist_km": 57.2, "eta_border_min": 1}, True),
    ("dron 54,7 km poza punktem katalogowym — po staremu", {"lat": 51.10, "lon": 24.80}, True),
    ("bez współrzędnych — po staremu", {"lat": None, "lon": None}, True),
]

print("1. serwer: fusion.red_key")
for opis, zmiany, klucz in PRZYPADKI:
    ok((fusion.red_key([dron(**zmiany)], REF) is not None) == klucz, f"{'klucz' if klucz else 'bez klucza'}: {opis}")

print("\n2. inne przesłanki nadal otwierają czerwony")
rcb3 = {"id": 9, "ts": "2026-11-24T18:16:00+00:00", "source": "rcb", "event_type": "rso_alert", "voivodeship": "P0604",
        "points": 4.5, "title": "Alert RCB", "details": {"rcb_level": 3}}
ok((fusion.red_key([dron(), rcb3], REF) or {}).get("powod") == "rcb3", "Kowel + RCB 3. stopnia → klucz z RCB")
blizej = dron(lat=50.85, lon=24.32, dist_km=12.5, eta_border_min=1)
ok(fusion.red_key([dron(), blizej], REF) is not None, "Kowel + dron 12,5 km we Włodzimierzu → klucz z bliższego")
ok(fusion.punkt_katalogowy(dron()["details"]) == "Kowel", "punkt rozpoznany jako Kowel")

print("\n3. tryb bez serwera liczy tak samo (engine.js)")
JS = r"""
const fs = require('fs'), vm = require('vm');
const s = new Map();
const c = vm.createContext({console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval, window: {},
  fetch: async () => ({ok: true, text: async () => '{}'}),
  localStorage: {getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)), removeItem: k => s.delete(k)}});
vm.runInContext(fs.readFileSync('frontend/pl-outline.js', 'utf8') + '\n' + fs.readFileSync('frontend/engine.js', 'utf8')
  + '\nthis.klucz = Engine.redKey;', c);
const we = JSON.parse(process.argv[1]);
console.log(JSON.stringify(we.map(d => !!c.klucz([{t: Date.parse('2026-11-24T18:07:19Z'), source: 'neptun',
  event_type: 'neptun_threat', voivodeship: 'lubelskie', details: d}], Date.parse('2026-11-24T18:16:30Z')))));
"""
wejscie = [dron(**z)["details"] for _o, z, _k in PRZYPADKI]
wynik = subprocess.run(["node", "-e", JS, json.dumps(wejscie)], cwd=KORZEN, capture_output=True, text=True, encoding="utf-8")
ok(wynik.returncode == 0, "silnik się uruchomił " + wynik.stderr[:200])
if wynik.returncode == 0:
    js = json.loads(wynik.stdout)
    for (opis, _z, klucz), k in zip(PRZYPADKI, js):
        ok(k == klucz, f"engine.js: {opis}")

print("\n4. stałe serwera i lustra są równe")
silnik = (KORZEN / "frontend/engine.js").read_text(encoding="utf-8")
ok(f"RED_GATE_KATALOG_KM = {config.RED_GATE_KATALOG_KM:.0f}," in silnik, "ten sam próg km")
ok(f"RED_GATE_KATALOG_TOL_KM = {config.RED_GATE_KATALOG_TOL_KM};" in silnik, "ta sama tolerancja")
ok(set(config.RED_GATE_KATALOG_TYPES) == {"uav", "shahed"}
   and 'RED_GATE_KATALOG_TYPES = new Set(["uav", "shahed"])' in silnik, "te same typy")
for p in config.RED_GATE_PUNKTY_KATALOGOWE:
    ok(f'{{ name: "{p["name"]}", lat: {p["lat"]}, lon: {p["lon"]} }}' in silnik, f"punkt {p['name']} w engine.js")
ok(silnik.count("{ name: ") == len(config.RED_GATE_PUNKTY_KATALOGOWE), "tyle samo punktów w obu listach")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK: punkt katalogowy miejscowości dalej niż 50 km nie zapala czerwonego")
