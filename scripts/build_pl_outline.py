# -*- coding: utf-8 -*-
"""Generuje backend/app/pl_outline.py — uproszczony kontur Polski do odległości (audyt A2).

Źródło: frontend/assets/polska.geojson (scalone 16 województw, ten sam kształt co
na mapie). Kontur obejmuje całą granicę, także morską — rakieta z Kaliningradu
na Gdańsk ma odległość do wybrzeża, a nie do punktu przy Braniewie.

Uruchomienie: py scripts/build_pl_outline.py   (wymaga shapely)
"""
import json
from pathlib import Path

from shapely.geometry import shape, Polygon, MultiPolygon

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "frontend" / "assets" / "polska.geojson"
OUT = ROOT / "backend" / "app" / "pl_outline.py"
TOLERANCE_DEG = 0.005          # ok. 350–550 m: poniżej niepewności pozycji NEPTUN-a

gj = json.loads(SRC.read_text(encoding="utf-8"))
geoms = [shape(f["geometry"]) for f in gj.get("features", [gj])]
geom = geoms[0] if len(geoms) == 1 else MultiPolygon([p for g in geoms for p in getattr(g, "geoms", [g])])
geom = geom.simplify(TOLERANCE_DEG, preserve_topology=True)
polys = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
polys = [p for p in polys if p.area > 0.001]          # pomijamy wysepki
rings = [[(round(y, 4), round(x, 4)) for x, y in p.exterior.coords[:-1]] for p in polys]

lines = ['"""Uproszczony kontur Polski (lat, lon) — GENEROWANE przez scripts/build_pl_outline.py.',
         '',
         f'Źródło: frontend/assets/polska.geojson, uproszczenie {TOLERANCE_DEG}°. Nie edytować ręcznie."""',
         "", "PL_RINGS = ["]
for ring in rings:
    lines.append("    [")
    for i in range(0, len(ring), 6):
        lines.append("        " + ", ".join(f"({a}, {b})" for a, b in ring[i:i + 6]) + ",")
    lines.append("    ],")
lines.append("]")
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"zapisano {OUT.name}: {len(rings)} pierścień/ie, {sum(len(r) for r in rings)} punktów")
