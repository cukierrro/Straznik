# -*- coding: utf-8 -*-
"""Generuje uproszczony kontur Polski do odległości i kursu (audyt A2).

Wyjście (jedno źródło danych dla obu silników):
  backend/app/pl_outline.py  — PL_RINGS (lat, lon), PL_RING_VOIV (indeks woj. dla wierzchołka), PL_VOIVS
  frontend/pl-outline.js     — to samo dla engine.js (tryb awaryjny)

Źródło: frontend/assets/polska.geojson (scalone 16 województw, ten sam kształt co na
mapie), województwo wierzchołka z frontend/assets/wojewodztwa.geojson. Kontur obejmuje
całą granicę, także morską — rakieta z Kaliningradu na Gdańsk ma odległość do wybrzeża.

Uruchomienie: py scripts/build_pl_outline.py   (wymaga shapely)
"""
import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Point, shape

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "frontend" / "assets" / "polska.geojson"
VOIV = ROOT / "frontend" / "assets" / "wojewodztwa.geojson"
OUT_PY = ROOT / "backend" / "app" / "pl_outline.py"
OUT_JS = ROOT / "frontend" / "pl-outline.js"
TOLERANCE_DEG = 0.005          # ok. 350–550 m: poniżej niepewności pozycji NEPTUN-a

gj = json.loads(SRC.read_text(encoding="utf-8"))
geoms = [shape(f["geometry"]) for f in gj.get("features", [gj])]
geom = geoms[0] if len(geoms) == 1 else MultiPolygon([p for g in geoms for p in getattr(g, "geoms", [g])])
geom = geom.simplify(TOLERANCE_DEG, preserve_topology=True)
polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
polys = [p for p in polys if p.area > 0.001]          # pomijamy wysepki

vgj = json.loads(VOIV.read_text(encoding="utf-8"))
voiv_shapes = [(f["properties"]["nazwa"], shape(f["geometry"])) for f in vgj["features"]]
voivs = sorted({name for name, _ in voiv_shapes})
index = {name: i for i, name in enumerate(voivs)}


def voiv_of(x, y):
    p = Point(x, y)
    return index[min(voiv_shapes, key=lambda vs: vs[1].distance(p))[0]]


rings, ring_voiv = [], []
for p in polys:
    coords = p.exterior.coords[:-1]
    rings.append([(round(y, 4), round(x, 4)) for x, y in coords])
    ring_voiv.append([voiv_of(x, y) for x, y in coords])
# Otoczka wypukła z wierzchołków konturu: wycinek kierunków, pod którym punkt spoza
# otoczki widzi Polskę, wyznaczają wyłącznie jej wierzchołki (kilkadziesiąt zamiast ~1000).
from shapely.geometry import MultiPoint  # noqa: E402
hull_src = MultiPoint([(b, a) for ring in rings for a, b in ring]).convex_hull
hull = [(a, b) for b, a in hull_src.exterior.coords[:-1]]

py = ['"""Uproszczony kontur Polski — GENEROWANE przez scripts/build_pl_outline.py. Nie edytować.',
      "", f'Źródło: frontend/assets/polska.geojson, uproszczenie {TOLERANCE_DEG}°."""', "",
      f"PL_VOIVS = {json.dumps(voivs, ensure_ascii=False)}", "", "PL_RINGS = ["]
for ring in rings:
    py.append("    [")
    for i in range(0, len(ring), 6):
        py.append("        " + ", ".join(f"({a}, {b})" for a, b in ring[i:i + 6]) + ",")
    py.append("    ],")
py.append("]")
py.append("")
py.append(f"PL_RING_VOIV = {json.dumps(ring_voiv)}")
py.append("")
py.append(f"PL_HULL = {json.dumps([list(p) for p in hull])}")
OUT_PY.write_text("\n".join(py) + "\n", encoding="utf-8")

js = {"voivs": voivs, "hull": [list(p) for p in hull],
      "rings": [[[a, b, v] for (a, b), v in zip(r, rv)] for r, rv in zip(rings, ring_voiv)]}
OUT_JS.write_text("/* Uproszczony kontur Polski [lat, lon, indeks województwa] — GENEROWANE przez\n"
                  "   scripts/build_pl_outline.py (lustro backend/app/pl_outline.py). Nie edytować. */\n"
                  f"const PL_OUTLINE = {json.dumps(js, ensure_ascii=False, separators=(',', ':'))};\n",
                  encoding="utf-8")
print(f"zapisano {OUT_PY.name} i {OUT_JS.name}: {len(rings)} pierścień/ie, "
      f"{sum(len(r) for r in rings)} punktów, otoczka {len(hull)}, województw {len(voivs)}")
