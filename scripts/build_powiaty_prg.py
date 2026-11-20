# -*- coding: utf-8 -*-
"""Geometria 380 powiatów dla alarmów powiatowych → backend/app/powiaty_prg.json.

Źródło: Państwowy Rejestr Granic (PRG), Główny Urząd Geodezji i Kartografii (GUGiK),
warstwa A02_Granice_powiatow ze zbioru „jednostki administracyjne” (stan 10.11.2026).
Tym samym skryptem powstała geometria trybu cienia powiatów (18.11.2026); plik
w backendzie jest z nią identyczny bajt w bajt.

Zawartość: uproszczone obrysy w km (rzut równoodległościowy wokół 51,5°N, uproszczenie
0,3 km), głębokość powiatu od granicy z Ukrainą, Białorusią i Rosją (obwód królewiecki)
oraz odległości obwodów UA. Serwer nie ma shapely — liczy na tych obrysach sam
(app/powiaty.py).

Wymaga pyshp, pyproj i shapely (tylko na komputerze, nie na serwerze).
Uruchomienie: py scripts/build_powiaty_prg.py <katalog z A02_Granice_powiatow.shp> [plik wyjściowy]
"""
import json
import math
import sys
from pathlib import Path

import shapefile                                   # pyshp
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform, unary_union

sys.stdout.reconfigure(encoding="utf-8")
WT = Path(__file__).resolve().parents[1]           # katalog repozytorium
SHP = Path(sys.argv[1]) / "A02_Granice_powiatow"

WOJ_TERC = {"02": "dolnośląskie", "04": "kujawsko-pomorskie", "06": "lubelskie", "08": "lubuskie",
            "10": "łódzkie", "12": "małopolskie", "14": "mazowieckie", "16": "opolskie",
            "18": "podkarpackie", "20": "podlaskie", "22": "pomorskie", "24": "śląskie",
            "26": "świętokrzyskie", "28": "warmińsko-mazurskie", "30": "wielkopolskie",
            "32": "zachodniopomorskie"}

do_metr = Transformer.from_crs(4326, 2180, always_xy=True).transform
LAT0, LON0 = 51.5, 19.0
KY = 111.32
KX = 111.32 * math.cos(math.radians(LAT0))
km = lambda lon, lat: ((lon - LON0) * KX, (lat - LAT0) * KY)

r = shapefile.Reader(str(SHP), encoding="utf-8")
POW = {}
for sr in r.iterShapeRecords():
    terc = sr.record["JPT_KOD_JE"]
    assert len(terc) == 4 and terc[:2] in WOJ_TERC, terc
    POW[terc] = {"g": shape(sr.shape.__geo_interface__), "name": sr.record["JPT_NAZWA_"],
                 "woj": WOJ_TERC[terc[:2]]}
assert len(POW) == 380, len(POW)

kraje = json.loads((WT / "frontend/assets/kraje-v2.geojson").read_text(encoding="utf-8"))
granica = unary_union([transform(do_metr, shape(f["geometry"])) for f in kraje["features"]
                       if f["properties"]["iso"] in ("UKR", "BLR", "RUS")])
obw = json.loads((WT / "frontend/assets/obwody-ua.geojson").read_text(encoding="utf-8"))
OBW = {f["properties"]["oblast"]: transform(do_metr, shape(f["geometry"])) for f in obw["features"]}

out = {"lat0": LAT0, "kx": KX, "ky": KY, "lon0": LON0, "zrodlo": "PRG GUGiK 2026-11-10",
       "powiaty": {}}
for terc, p in sorted(POW.items()):
    gm = transform(do_metr, p["g"]).simplify(150)
    g = transform(lambda x, y, z=None: km(x, y), p["g"]).simplify(0.3)
    polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
    rings = []
    for q in polys:
        rings.append([[round(x, 3), round(y, 3)] for x, y in q.exterior.coords])
        for h in q.interiors:
            rings.append([[round(x, 3), round(y, 3)] for x, y in h.coords])
    minx, miny, maxx, maxy = g.bounds
    out["powiaty"][terc] = {
        "name": p["name"], "woj": p["woj"], "gleb": round(gm.distance(granica) / 1000, 1),
        "obw": {o: round(OBW[o].distance(gm) / 1000, 1) for o in OBW},
        "bbox": [round(minx, 2), round(miny, 2), round(maxx, 2), round(maxy, 2)], "rings": rings}

wyj = Path(sys.argv[2]) if len(sys.argv) > 2 else WT / "backend" / "app" / "powiaty_prg.json"
wyj.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
from collections import Counter
print(len(out["powiaty"]), "powiatów,", wyj.stat().st_size // 1024, "KB;",
      dict(sorted(Counter(v["woj"] for v in out["powiaty"].values()).items())))
