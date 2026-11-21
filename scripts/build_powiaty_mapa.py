# -*- coding: utf-8 -*-
"""Granice 380 powiatów do RYSOWANIA na mapie → frontend/assets/powiaty-mapa-v1.geojson.

Mapa powiatów (wydanie 1.8.10, decyzja usera 21.11.2026): alarmy przychodzą dla powiatu,
więc mapa ma umieć pokazać powiaty zamiast województw. Plik telefonu
(powiaty-telefon-v1.json) służy do ustalania powiatu miejsca i ma inny format (pierścienie
bez podziału na obrys i dziury), więc do rysowania jest osobny, zwykły GeoJSON.

Źródło: PRG GUGiK, warstwa A02_Granice_powiatow (stan 10.11.2026) — ten sam zbiór co
backend i plik telefonu.

Uproszczenie: shapely.coverage_simplify w PUWG 1992 (EPSG:2180). Upraszcza WSPÓLNE
granice sąsiednich powiatów jednakowo, więc na mapie nie ma szczelin ani zakładek między
powiatami (zwykłe simplify każdego powiatu osobno zostawia szpary widoczne po przybliżeniu).
Tylko do rysowania — przypisanie miejsca do powiatu robi plik telefonu z własnym marginesem.

Właściwości: t — TERYT (id cechy), k — nazwa krótka („Lublin”, „lubelski”), w — województwo.
Miasto na prawach powiatu poznać po wielkiej literze w `k`, jak w powiaty.js.

Wymaga pyshp, pyproj i shapely ≥ 2.1 (tylko na komputerze).
Uruchomienie:
  py scripts/build_powiaty_mapa.py <katalog z A02_Granice_powiatow.shp>
"""
import json
import sys
from pathlib import Path

import shapefile                                   # pyshp
import shapely
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform

sys.stdout.reconfigure(encoding="utf-8")
WT = Path(__file__).resolve().parents[1]
SHP = Path(sys.argv[1]) / "A02_Granice_powiatow"

TOLERANCJA_M = 600          # coverage_simplify (Visvalingam–Whyatt), jednostki układu 2180
MIEJSCA = 4                 # 1e-4° ≈ 11 m — poniżej piksela przy zoomie mapy aplikacji

WOJ_TERC = {"02": "dolnośląskie", "04": "kujawsko-pomorskie", "06": "lubelskie", "08": "lubuskie",
            "10": "łódzkie", "12": "małopolskie", "14": "mazowieckie", "16": "opolskie",
            "18": "podkarpackie", "20": "podlaskie", "22": "pomorskie", "24": "śląskie",
            "26": "świętokrzyskie", "28": "warmińsko-mazurskie", "30": "wielkopolskie",
            "32": "zachodniopomorskie"}

do_m = Transformer.from_crs(4326, 2180, always_xy=True).transform
do_st = Transformer.from_crs(2180, 4326, always_xy=True).transform

r = shapefile.Reader(str(SHP), encoding="utf-8")
tercs, geoms, nazwy = [], [], []
for sr in r.iterShapeRecords():
    terc = sr.record["JPT_KOD_JE"]
    assert len(terc) == 4 and terc[:2] in WOJ_TERC, terc
    tercs.append(terc)
    geoms.append(transform(do_m, shape(sr.shape.__geo_interface__)))
    nazwy.append(sr.record["JPT_NAZWA_"])
assert len(tercs) == 380 and len(set(tercs)) == 380, len(tercs)

uproszczone = shapely.coverage_simplify(geoms, TOLERANCJA_M)


def zaokraglij(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], MIEJSCA), round(obj[1], MIEJSCA)]
        return [zaokraglij(o) for o in obj]
    return obj


cechy, wierzcholki = [], 0
for terc, g, n in sorted(zip(tercs, uproszczone, nazwy)):
    assert not g.is_empty and g.is_valid, terc
    wierzcholki += shapely.get_num_coordinates(g)
    gm = mapping(transform(do_st, g))
    k = n[7:] if n.startswith("powiat ") else n
    cechy.append({"type": "Feature", "id": int(terc),
                  "properties": {"t": terc, "k": k, "w": WOJ_TERC[terc[:2]]},
                  "geometry": {"type": gm["type"], "coordinates": zaokraglij(gm["coordinates"])}})

out = {"type": "FeatureCollection",
       "zrodlo": "PRG GUGiK 2026-11-10 (A02_Granice_powiatow), coverage_simplify "
                 f"{TOLERANCJA_M} m w EPSG:2180",
       "features": cechy}
wyj = WT / "frontend" / "assets" / "powiaty-mapa-v1.geojson"
wyj.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(cechy)} powiatów, {wierzcholki} wierzchołków, {wyj.stat().st_size // 1024} KB → {wyj}")
