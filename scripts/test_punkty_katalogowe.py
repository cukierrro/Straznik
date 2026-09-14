# -*- coding: utf-8 -*-
"""Audyt G2, tryb cienia: te same współrzędne u dwóch obiektów trafiają do dziennika.

Nic nie zmienia punktów — tylko zapisujemy kandydatów na punkt katalogowy
miejscowości (stealth kind `catalog_point_shadow`).

Uruchomienie: py scripts/test_punkty_katalogowe.py
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import stealth  # noqa: E402

stealth.DB_PATH = Path(tempfile.mkdtemp()) / "obserwacje-test.db"
stealth._conn = None
from app.collectors import neptun  # noqa: E402

base = {"type": "shahed", "lat": 50.6199, "lon": 26.2516, "heading": 290, "confidenceLevel": "high",
        "sourceCount": 2, "positionQuality": "confirmed", "region": "Рівненська область",
        "locality": "Рівне", "pl_assessment": {"dist_km": 170.0, "toward_pl": True}}
now = 1_789_400_000.0

first = neptun._catalog_point_shadow({**base, "id": "trk_a"}, now)
second = neptun._catalog_point_shadow({**base, "id": "trk_b"}, now + 60)
other = neptun._catalog_point_shadow({**base, "id": "trk_c", "lat": 50.7011}, now + 120)
approx = neptun._catalog_point_shadow({**base, "id": "trk_d", "positionQuality": "approx"}, now + 180)
next_day = neptun._catalog_point_shadow({**base, "id": "trk_c", "lat": 50.7011}, now + 26 * 3600)

rows = stealth.query("catalog_point_shadow", since_minutes=10 ** 7)
ok = (not first and second and not other and not approx and next_day
      and {r["track_id"] for r in rows} == {"trk_b", "trk_c"})
print("pierwszy obiekt w punkcie: bez wpisu" if not first else "BŁĄD: wpis przy pierwszym obiekcie")
print("drugi obiekt w tym samym punkcie: wpis" if second else "BŁĄD: brak wpisu przy drugim obiekcie")
print("inny punkt: bez wpisu" if not other else "BŁĄD: wpis dla innego punktu")
print("pozycja przybliżona: pomijana" if not approx else "BŁĄD: wpis dla pozycji przybliżonej")
print("ten sam punkt następnego dnia: wpis" if next_day else "BŁĄD: brak wpisu dla drugiego dnia")
if not ok:
    print("BŁĄD", rows)
    sys.exit(1)
print("OK - cień punktów katalogowych")
