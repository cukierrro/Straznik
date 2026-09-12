#!/usr/bin/env python3
"""Odległość obwodów Ukrainy od woj. lubelskiego i podkarpackiego (km).

Źródłem liczb w `config.UA_ALERT_OBLASTS`. Do 1.7.25 była tam płaska lista
„obwodów granicznych", w której obwód rówieński i żytomierski dostawały tyle samo
punktów co wołyński i ogłaszały się jako graniczące z Lubelskiem — czym nie są.
Ten skrypt liczy najkrótszą odległość między wielokątami, żeby wagę dało się
sprawdzić, a nie tylko przyjąć na słowo.

Dane: geoBoundaries gbOpen ADM1 (pobierane przy uruchomieniu, ~11 MB).
Wymaga `shapely`. Uruchomienie:

    py scripts/ua_oblast_rings.py            # tabela odległości
    py scripts/ua_oblast_rings.py --check    # porówna z config.py (kod wyjścia 1 przy różnicy)
"""
from __future__ import annotations

import json
import math
import sys
import urllib.request
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".cache"
API = "https://www.geoboundaries.org/api/current/gbOpen/{iso}/ADM1/"
# Tolerancja dopasowania nazw z config.py do nazw angielskich w geoBoundaries.
OBLAST_EN = {
    "Львівська": "Lviv Oblast", "Волинська": "Volyn Oblast",
    "Закарпатська": "Zakarpattia Oblast", "Івано-Франківська": "Ivano-Frankivsk Oblast",
    "Рівненська": "Rivne Oblast", "Тернопільська": "Ternopil Oblast",
    "Хмельницька": "Khmelnytskyi Oblast", "Чернівецька": "Chernivtsi Oblast",
    "Житомирська": "Zhytomyr Oblast", "Вінницька": "Vinnytsia Oblast",
}
VOIV_EN = {"lubelskie": "Lublin Voivodeship", "podkarpackie": "Subcarpathian Voivodeship"}
LAT0 = 50.0                      # środek obszaru; wystarczy do dystansów rzędu 100 km
KM_LON = 111.32 * math.cos(math.radians(LAT0))


def _fetch(iso: str) -> dict:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"{iso}-adm1.geojson"
    if not path.is_file():
        with urllib.request.urlopen(API.format(iso=iso), timeout=60) as r:
            url = json.load(r)["gjDownloadURL"]
        with urllib.request.urlopen(url, timeout=180) as r:
            path.write_bytes(r.read())
    shapes: dict = {}
    for f in json.loads(path.read_text(encoding="utf-8"))["features"]:
        name = f["properties"].get("shapeName")
        g = shape(f["geometry"]).buffer(0)
        shapes[name] = unary_union([shapes[name], g]) if name in shapes else g
    return shapes


def _km(a, b) -> float:
    to_km = lambda x, y: (x * KM_LON, y * 111.32)
    return transform(to_km, a).distance(transform(to_km, b))


def main() -> int:
    ukr, pol = _fetch("UKR"), _fetch("POL")
    measured: dict[str, dict[str, int]] = {}
    for cyr, en in OBLAST_EN.items():
        if en not in ukr:
            print(f"BRAK w danych: {en}")
            return 1
        measured[cyr] = {voiv: int(round(_km(pol[VOIV_EN[voiv]], ukr[en]) / 5) * 5)
                         for voiv in VOIV_EN}

    if "--check" not in sys.argv:
        print(f"{'obwód':22} {'lubelskie':>10} {'podkarpackie':>13}")
        for cyr, d in sorted(measured.items(), key=lambda kv: min(kv[1].values())):
            print(f"{OBLAST_EN[cyr]:22} {d['lubelskie']:10d} {d['podkarpackie']:13d}")
        return 0

    sys.path.insert(0, str(ROOT / "backend"))
    from app import config
    diff = [f"  {OBLAST_EN[c]}: config={config.UA_ALERT_OBLASTS.get(c)} zmierzone={d}"
            for c, d in measured.items() if config.UA_ALERT_OBLASTS.get(c) != d]
    extra = sorted(set(config.UA_ALERT_OBLASTS) - set(measured))
    if diff or extra:
        print("ROZJAZD config.UA_ALERT_OBLASTS z geometrią:")
        print("\n".join(diff))
        for c in extra:
            print(f"  {c}: jest w config.py, nie ma w tabeli tego skryptu")
        return 1
    print(f"OK — {len(measured)} obwodów, odległości zgodne z config.UA_ALERT_OBLASTS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
