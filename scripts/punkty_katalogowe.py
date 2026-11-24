# -*- coding: utf-8 -*-
"""Przegląd tygodniowy: nowe punkty katalogowe miejscowości przy granicy (decyzja usera 24.11.2026).

NEPTUN podaje czasem jako pozycję „potwierdzoną” środek miejscowości ze swojego katalogu —
te same współrzędne u wielu RÓŻNYCH dronów. Taki punkt dalej niż 50 km od regionu nie
otwiera czerwonego, ale tylko jeśli jest na liście config.RED_GATE_PUNKTY_KATALOGOWE.
Lista jest ręczna, więc ten skrypt szuka kandydatów do dopisania.

Czyta archiwum migawek (data/archiwum.db, tabela snap) WYŁĄCZNIE do odczytu.

  python3 scripts/punkty_katalogowe.py /opt/straznik/data/archiwum.db [--dni 7]

Kod wyjścia: 0 — brak nowych kandydatów w paśmie, w którym zwykły dron otwiera klucz
(50–60 km); 1 — są kandydaci do sprawdzenia albo nie udało się przeczytać archiwum.
Dalsze punkty (60–110 km, ważne tylko dla dronów odrzutowych) wypisuje informacyjnie.
"""
import argparse
import json
import sqlite3
import sys
import zlib
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
try:
    from app import config  # noqa: E402
    LISTA = config.RED_GATE_PUNKTY_KATALOGOWE
    TOL = config.RED_GATE_KATALOG_TOL_KM
    PROG = config.RED_GATE_KATALOG_KM
except Exception as exc:                          # noqa: BLE001
    print(f"NIE UDAŁO SIĘ wczytać listy z config.py: {exc}")
    sys.exit(1)

MIN_TOROW = 3
PASMO_PILNE = (PROG, 60.0)
PASMO_INFO = (60.0, 110.0)


def km(a, b, c, d):
    p = radians
    return 2 * 6371 * asin(sqrt(sin(p(c - a) / 2) ** 2 + cos(p(a)) * cos(p(c)) * sin(p(d - b) / 2) ** 2))


def na_liscie(lat, lon):
    return any(km(lat, lon, p["lat"], p["lon"]) <= TOL for p in LISTA)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archiwum")
    ap.add_argument("--dni", type=int, default=7)
    a = ap.parse_args()
    od = (datetime.now(timezone.utc) - timedelta(days=a.dni)).isoformat(timespec="seconds")
    try:
        conn = sqlite3.connect(f"file:{a.archiwum}?mode=ro", uri=True)
        wiersze = conn.execute("select ts, z from snap where ts >= ? order by ts", (od,)).fetchall()
    except Exception as exc:                      # noqa: BLE001
        print(f"NIE UDAŁO SIĘ przeczytać archiwum: {exc}")
        return 1
    if not wiersze:
        print(f"NIE UDAŁO SIĘ: archiwum nie ma migawek z ostatnich {a.dni} dni")
        return 1

    punkty = defaultdict(lambda: {"tory": set(), "km": None, "nazwy": set(), "dni": set()})
    for ts, z in wiersze:
        for t in json.loads(zlib.decompress(z)).get("threats") or []:
            pa = t.get("pl_assessment") or {}
            if t.get("lat") is None or pa.get("dist_km") is None:
                continue
            # punkt „kursem na X” i pozycję rejonową już dziś pomija klucz — liczą się tylko „potwierdzone”
            if t.get("destination") is True or t.get("areaOnly") is True:
                continue
            if (t.get("type") or "").lower() not in config.RED_GATE_KATALOG_TYPES:
                continue
            if not (PASMO_PILNE[0] < pa["dist_km"] <= PASMO_INFO[1]):
                continue
            k = (round(t["lat"], 5), round(t["lon"], 5))
            p = punkty[k]
            p["tory"].add(t.get("id"))
            p["km"] = pa["dist_km"]
            p["nazwy"].add(t.get("locality") or "?")
            p["dni"].add(ts[:10])

    kand = sorted((p["km"], k, p) for k, p in punkty.items()
                  if len(p["tory"]) >= MIN_TOROW and not na_liscie(*k))
    pilne = [x for x in kand if x[0] <= PASMO_PILNE[1]]
    print(f"Migawek: {len(wiersze)} z {a.dni} dni. Punkty na liście: {', '.join(p['name'] for p in LISTA)}.")
    print(f"\nKandydaci {PASMO_PILNE[0]:.0f}–{PASMO_PILNE[1]:.0f} km (zwykły dron otwiera tu klucz): {len(pilne)}")
    for d, k, p in pilne:
        print(f"  {d:5.1f} km  {k}  {', '.join(sorted(p['nazwy']))}  dronów {len(p['tory'])}, dni {len(p['dni'])}")
    info = [x for x in kand if x[0] > PASMO_PILNE[1]]
    print(f"\nInformacyjnie {PASMO_INFO[0]:.0f}–{PASMO_INFO[1]:.0f} km (tylko drony odrzutowe): {len(info)}")
    for d, k, p in info:
        print(f"  {d:5.1f} km  {k}  {', '.join(sorted(p['nazwy']))}  dronów {len(p['tory'])}, dni {len(p['dni'])}")
    if pilne:
        print("\nDO SPRAWDZENIA: czy to środek miejscowości (te same współrzędne u różnych dronów),"
              " a jeśli tak — dopisać do config.RED_GATE_PUNKTY_KATALOGOWE i engine.js (decyzja usera).")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
