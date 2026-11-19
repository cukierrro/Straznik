# -*- coding: utf-8 -*-
"""Granice 380 powiatów dla TELEFONU → frontend/assets/powiaty-telefon-v1.json.

Etap 3 alarmów powiatowych (19.11.2026): aplikacja sama, na telefonie, ustala powiat
zapisanego miejsca i zapisuje się do tematu FCM `pow_<TERYT>`. Współrzędne miejsca
nie wychodzą z telefonu — do Firebase idzie tylko numer powiatu.

Źródło: Państwowy Rejestr Granic (PRG), GUGiK, warstwa A02_Granice_powiatow ze zbioru
„jednostki administracyjne” (stan 10.11.2026) — ten sam zbiór co backend
(scripts/build_powiaty_prg.py).

Uproszczenie: Douglas–Peucker w PUWG 1992 (EPSG:2180) z tolerancją UPROSZCZENIE_M
dla każdego powiatu osobno. Uproszczony obrys różni się od prawdziwego najwyżej o tę
tolerancję (cały odcięty kawałek leży w pasie ±tolerancja wokół nowego odcinka), więc
telefon przypisuje miejscu KAŻDY powiat, w którym leży albo od którego obrysu jest
bliżej niż MARGINES_M (> tolerancja + zaokrąglenie współrzędnych + przybliżenie rzutu).
Miejsce przy samej granicy dostaje wtedy dwa powiaty — zapis do sąsiedniego kosztuje
najwyżej powiadomienie za dużo, pomyłka kosztowałaby alarm za mało.

Format: współrzędne × SKALA (1e-5° ≈ 1,1 m) jako liczby całkowite, każdy pierścień
(zewnętrzny i dziury, rozstrzyga parzystość) płaski: x0, y0, dx1, dy1, …

Drugie wyjście (--punkty): punkty testowe z PRAWDZIWYCH (nieuproszczonych) granic
dla scripts/test_powiaty_telefon.cjs — przy granicach powiatów (po obu stronach,
5–400 m), w miastach na prawach powiatu i ich powiatach ziemskich, przy granicy państwa
oraz losowe w całej Polsce.

Wymaga pyshp, pyproj i shapely (tylko na komputerze).
Uruchomienie:
  py scripts/build_powiaty_telefon.py <katalog z A02_Granice_powiatow.shp> [--punkty]
"""
import json
import math
import random
import sys
from pathlib import Path

import shapefile                                   # pyshp
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform
from shapely.strtree import STRtree

sys.stdout.reconfigure(encoding="utf-8")
WT = Path(__file__).resolve().parents[1]
SHP = Path(sys.argv[1]) / "A02_Granice_powiatow"
PUNKTY = "--punkty" in sys.argv

UPROSZCZENIE_M = 100
MARGINES_M = 150
SKALA = 100000

WOJ_TERC = {"02": "dolnośląskie", "04": "kujawsko-pomorskie", "06": "lubelskie", "08": "lubuskie",
            "10": "łódzkie", "12": "małopolskie", "14": "mazowieckie", "16": "opolskie",
            "18": "podkarpackie", "20": "podlaskie", "22": "pomorskie", "24": "śląskie",
            "26": "świętokrzyskie", "28": "warmińsko-mazurskie", "30": "wielkopolskie",
            "32": "zachodniopomorskie"}

do_m = Transformer.from_crs(4326, 2180, always_xy=True).transform
do_st = Transformer.from_crs(2180, 4326, always_xy=True).transform

r = shapefile.Reader(str(SHP), encoding="utf-8")
POW = {}
for sr in r.iterShapeRecords():
    terc = sr.record["JPT_KOD_JE"]
    assert len(terc) == 4 and terc[:2] in WOJ_TERC, terc
    POW[terc] = {"g": transform(do_m, shape(sr.shape.__geo_interface__)),
                 "name": sr.record["JPT_NAZWA_"], "woj": WOJ_TERC[terc[:2]]}
assert len(POW) == 380, len(POW)


def wielokaty(g):
    return list(g.geoms) if g.geom_type == "MultiPolygon" else [g]


def pierscien(coords):
    flat, px, py = [], None, None
    for x, y in coords:
        lon, lat = do_st(x, y)
        ix, iy = round(lon * SKALA), round(lat * SKALA)
        if px is None:
            flat += [ix, iy]
        elif (ix, iy) != (px, py):
            flat += [ix - px, iy - py]
        else:
            continue
        px, py = ix, iy
    return flat


out = {"v": 1, "zrodlo": "PRG GUGiK 2026-11-10", "uproszczenie_m": UPROSZCZENIE_M,
       "margines_m": MARGINES_M, "skala": SKALA, "pow": {}}
wierzcholki = 0
for terc, p in sorted(POW.items()):
    s = p["g"].simplify(UPROSZCZENIE_M, preserve_topology=True)
    rings = []
    for q in wielokaty(s):
        rings.append(pierscien(q.exterior.coords))
        rings += [pierscien(h.coords) for h in q.interiors]
    wierzcholki += sum(len(x) // 2 for x in rings)
    # Prostokąt z samych współrzędnych w stopniach. NIE z narożników prostokąta w PUWG 1992:
    # siatka 2180 jest obrócona względem południków (na wschodzie o ~3°), więc rzut narożników
    # dawał prostokąt za ciasny i telefon pomijał powiat (pierwsza wersja, Bug przy Hrubieszowie).
    xs, ys = [], []
    for flat in rings:
        x = y = 0
        for i in range(0, len(flat), 2):
            x, y = (flat[i], flat[i + 1]) if i == 0 else (x + flat[i], y + flat[i + 1])
            xs.append(x)
            ys.append(y)
    out["pow"][terc] = {"n": p["name"], "w": p["woj"],
                        "b": [min(xs), min(ys), max(xs), max(ys)], "r": rings}

wyj = WT / "frontend" / "assets" / "powiaty-telefon-v1.json"
wyj.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(out['pow'])} powiatów, {wierzcholki} wierzchołków, {wyj.stat().st_size // 1024} KB → {wyj}")

if not PUNKTY:
    sys.exit(0)

# ── punkty testowe z prawdziwych granic ─────────────────────────────────────────
random.seed(20261119)
tercs = sorted(POW)
geoms = [POW[t]["g"] for t in tercs]
drzewo = STRtree(geoms)


def prawdziwy(x, y):
    pt = Point(x, y)
    for i in drzewo.query(pt):
        if geoms[i].covers(pt):
            return tercs[i]
    return None


def do_granicy(x, y, terc):
    """Odległość (m) od najbliższej granicy powiatu `terc` z innym powiatem lub krajem."""
    return POW[terc]["g"].exterior.distance(Point(x, y)) if POW[terc]["g"].geom_type == "Polygon" \
        else min(q.exterior.distance(Point(x, y)) for q in wielokaty(POW[terc]["g"]))


def granica_dokladna(x, y, terc):
    g = POW[terc]["g"]
    return g.boundary.distance(Point(x, y))


punkty = []


def dodaj(x, y, rodzaj):
    t = prawdziwy(x, y)
    if t is None:
        return
    lon, lat = do_st(x, y)
    punkty.append([round(lat, 6), round(lon, 6), t, round(granica_dokladna(x, y, t)), rodzaj])


# 1. przy granicach powiatów: punkty na obrysie, przesunięte w normalnej o ±d
for terc in tercs:
    for q in wielokaty(POW[terc]["g"]):
        ring = q.exterior
        L = ring.length
        n = max(2, min(5, int(L / 40000)))
        for k in range(n):
            s0 = random.uniform(0, L)
            a, b = ring.interpolate(s0), ring.interpolate(min(L, s0 + 5))
            dx, dy = b.x - a.x, b.y - a.y
            dl = math.hypot(dx, dy) or 1
            nx, ny = -dy / dl, dx / dl
            for d in (5, 30, 80, 140, 160, 300):
                znak = random.choice((-1, 1))
                dodaj(a.x + znak * nx * d, a.y + znak * ny * d, "granica")
# 2. miasta na prawach powiatu (nazwa wielką literą) i powiat ziemski wokół
def miasto(terc):
    n = POW[terc]["name"]
    return n[len("powiat "):][:1].isupper() if n.startswith("powiat ") else n[:1].isupper()


for terc in tercs:
    g = POW[terc]["g"]
    pt = g.representative_point()
    dodaj(pt.x, pt.y, "miasto" if miasto(terc) else "srodek")
    if miasto(terc):
        c = g.centroid
        dodaj(c.x, c.y, "miasto")
        for _ in range(6):                          # pierścień 0,5–8 km wokół miasta
            ang, rr = random.uniform(0, 2 * math.pi), random.uniform(500, 8000)
            minx, miny, maxx, maxy = g.bounds
            R = max(maxx - minx, maxy - miny) / 2 + rr
            dodaj(c.x + R * math.cos(ang), c.y + R * math.sin(ang), "wokol_miasta")
# 3. losowo w całej Polsce
minx = min(g.bounds[0] for g in geoms); maxx = max(g.bounds[2] for g in geoms)
miny = min(g.bounds[1] for g in geoms); maxy = max(g.bounds[3] for g in geoms)
while sum(1 for p in punkty if p[4] == "losowy") < 1500:
    dodaj(random.uniform(minx, maxx), random.uniform(miny, maxy), "losowy")

# Punkty nazwane (sprawdzane z nazwy w teście): Lublin wobec powiatu lubelskiego itd.
NAZWANE = [("Lublin, Plac Litewski", 51.24808, 22.56037, "0663"),
           ("Świdnik (powiat świdnicki, lubelskie)", 51.21980, 22.69620, "0617"),
           ("Rzeszów, Rynek", 50.03760, 22.00460, "1863"),
           ("Kraków, Rynek Główny", 50.06170, 19.93730, "1261"),
           ("Warszawa, Pałac Kultury", 52.23180, 21.00600, "1465"),
           ("Chełm, centrum", 51.13260, 23.47130, "0662"),
           ("Zamość, Rynek Wielki", 50.71690, 23.25280, "0664"),
           ("Przemyśl, Rynek", 49.78350, 22.76800, "1862"),
           ("Białystok, Rynek Kościuszki", 53.13250, 23.15880, "2061"),
           ("Hrubieszów", 50.80800, 23.89150, "0604"),
           ("Terespol (przy Bugu)", 52.07500, 23.61600, "0601"),
           ("Ustrzyki Górne", 49.10500, 22.65200, "1801")]
for nazwa, lat, lon, oczek in NAZWANE:
    x, y = do_m(lon, lat)
    t = prawdziwy(x, y)
    if t != oczek:
        print("NAZWANY ROZNY:", nazwa, t, POW.get(t, {}).get("name"), "oczekiwano", oczek)
    punkty.append([lat, lon, t, round(granica_dokladna(x, y, t)), "nazwany", nazwa])

plik = WT / "scripts" / "dane_testowe" / "powiaty_punkty.json"
plik.write_text(json.dumps({"zrodlo": "PRG GUGiK 2026-11-10 (granice nieuproszczone)",
                            "pola": ["lat", "lon", "teryt", "m do granicy powiatu", "rodzaj", "nazwa"],
                            "punkty": punkty}, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8")
from collections import Counter
print(len(punkty), "punktów testowych", dict(Counter(p[4] for p in punkty)), "→", plik)
