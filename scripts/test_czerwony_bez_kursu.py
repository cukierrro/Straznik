# -*- coding: utf-8 -*-
"""Klucz czerwonego a dron z nieznanym kursem (wariant B', decyzja usera 1.11.2026).

1.11.2026 o 9:03 jeden dron 36 km od granicy, wiarygodność średnia, 1 meldunek, bez kursu,
otworzył czerwony dla dwóch województw, bez żadnego alertu RCB. Klucz daje teraz dopiero
wysoka wiarygodność i co najmniej 2 zgłoszenia albo pozycja do 30 km od granicy.
Przypadki poniżej to prawdziwe obiekty z tamtego dnia i z przeliczenia na historii.

Uruchomienie:  py scripts/test_czerwony_bez_kursu.py
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


REF = datetime(2026, 11, 1, 8, 3, 30, tzinfo=timezone.utc)


def dron(**zmiany):
    d = {"type": "uav", "course": "unknown", "heading_source": "unknown", "dist_km": 36.3, "eta_border_min": 9,
         "confidence": "medium", "source_count": 1, "uncertainty_km": 4, "position_approximate": False}
    d.update(zmiany)
    return {"id": 1, "ts": "2026-11-01T08:03:03+00:00", "source": "neptun", "event_type": "neptun_threat",
            "voivodeship": "lubelskie", "points": 0.2, "title": "Dron", "details": d}


# (opis, zmiany w obiekcie, czy daje klucz)
PRZYPADKI = [
    ("1.11 9:03: 36,3 km, średnia, 1 meldunek, bez kursu", {}, False),
    ("16.10: 54,5 km, średnia, 3 meldunki, bez kursu", {"dist_km": 54.5, "eta_border_min": 15, "source_count": 3}, False),
    ("wysoka, ale 1 meldunek, 36 km", {"confidence": "high"}, False),
    ("1.11 3:06: 42 km, wysoka, 3 meldunki, bez kursu", {"dist_km": 42.0, "eta_border_min": 11, "confidence": "high", "source_count": 3}, True),
    ("równo 2 meldunki przy wysokiej", {"confidence": "high", "source_count": 2}, True),
    ("20.10: 5,7 km, bez kursu, nawet ze słabą jakością", {"dist_km": 5.7, "eta_border_min": 1}, True),
    ("równo 30 km, średnia, 1 meldunek", {"dist_km": 30.0, "eta_border_min": 8}, True),
    ("30,1 km, średnia, 1 meldunek", {"dist_km": 30.1, "eta_border_min": 8}, False),
    ("kurs znany: reguła nie dotyczy", {"course": "known", "heading_source": "source"}, True),
    ("kurs z ruchu: reguła nie dotyczy", {"course": "estimated", "heading_source": "measured"}, True),
    ("Shahed bez kursu, 1 meldunek: też dron", {"type": "shahed"}, False),
    ("rakieta balistyczna bez kursu, 1 meldunek: reguła nie dotyczy", {"type": "ballistic"}, True),
    ("manewrująca bez kursu, 1 meldunek: reguła nie dotyczy", {"type": "cruise"}, True),
]

print("1. serwer: fusion.red_key")
for opis, zmiany, klucz in PRZYPADKI:
    ok((fusion.red_key([dron(**zmiany)], REF) is not None) == klucz, f"{'klucz' if klucz else 'bez klucza'}: {opis}")

print("\n2. RCB 3. stopnia działa niezależnie")
rcb3 = {"id": 9, "ts": "2026-11-01T08:03:00+00:00", "source": "rcb", "event_type": "rso_alert", "voivodeship": "lubelskie",
        "points": 4.5, "title": "Alert RCB", "details": {"rcb_level": 3}}
ok((fusion.red_key([dron(), rcb3], REF) or {}).get("powod") == "rcb3", "słaby dron + RCB 3 → klucz z RCB")

print("\n3. zostaje decyzja z 28.09: kurs domniemany przy pozycji punktowej")
ok(fusion.red_key([dron(course="presumptive", heading_source="presumptive", dist_km=18.5, eta_border_min=5)], REF) is not None,
   "dron 18,5 km z kursem domniemanym nadal daje klucz")

print("\n4. tryb bez serwera liczy tak samo (engine.js)")
JS = r"""
const fs = require('fs'), vm = require('vm');
const s = new Map();
const c = vm.createContext({console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval, window: {},
  fetch: async () => ({ok: true, text: async () => '{}'}),
  localStorage: {getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)), removeItem: k => s.delete(k)}});
vm.runInContext(fs.readFileSync('frontend/pl-outline.js', 'utf8') + '\n' + fs.readFileSync('frontend/engine.js', 'utf8')
  + '\nthis.klucz = Engine.redKey;', c);
const we = JSON.parse(process.argv[1]);
console.log(JSON.stringify(we.map(d => !!c.klucz([{t: Date.parse('2026-11-01T08:03:03Z'), source: 'neptun', event_type: 'neptun_threat', details: d}],
  Date.parse('2026-11-01T08:03:30Z')))));
"""
wejscie = [dron(**z)["details"] for _o, z, _k in PRZYPADKI]
wynik = subprocess.run(["node", "-e", JS, json.dumps(wejscie)], cwd=KORZEN, capture_output=True, text=True, encoding="utf-8")
ok(wynik.returncode == 0, "silnik się uruchomił " + wynik.stderr[:200])
if wynik.returncode == 0:
    js = json.loads(wynik.stdout)
    for (opis, _z, klucz), k in zip(PRZYPADKI, js):
        ok(k == klucz, f"engine.js: {opis}")

print("\n5. stałe serwera i lustra są równe")
silnik = (KORZEN / "frontend/engine.js").read_text(encoding="utf-8")
ok(f"RED_GATE_BEZ_KURSU_KM = {config.RED_GATE_BEZ_KURSU_KM:.0f}," in silnik, "ten sam próg km")
ok(f"RED_GATE_BEZ_KURSU_MIN_ZGLOSZEN = {config.RED_GATE_BEZ_KURSU_MIN_ZGLOSZEN};" in silnik, "ta sama liczba zgłoszeń")
ok(set(config.RED_GATE_BEZ_KURSU_TYPES) == {"uav", "shahed"} and 'new Set(["uav", "shahed"])' in silnik, "te same typy")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK: dron bez kursu otwiera czerwony tylko z dobrej jakości albo bardzo blisko")
