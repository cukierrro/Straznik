# -*- coding: utf-8 -*-
"""A5: kurs z ruchu przy małych krokach i cień ETA z jednego zgłoszenia.

Uruchomienie:  py scripts/test_kurs_kotwica.py
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
from app import config, stealth                                     # noqa: E402

_tmp = tempfile.TemporaryDirectory()
stealth.DB_PATH = Path(_tmp.name) / "obs.db"
stealth._conn = None
from app.collectors import neptun                                   # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. kurs z ruchu przy krokach po ~1,1 km")
neptun._last_pos.clear()
neptun._last_est.clear()
lat, lon = 50.40, 25.00          # obiekt leci na zachód, po 0,016° (~1,1 km) na odczyt
kursy = []
for i in range(4):
    t = {"id": "r1", "type": "shahed", "lat": lat, "lon": lon - 0.016 * i}
    neptun._evaluate(t)
    kursy.append(t.get("heading_estimated"))
sprawdz(kursy[0] is None and kursy[1] is None, f"pierwsze kroki < 2 km bez kursu ({kursy})")
sprawdz(kursy[2] is not None and 260 <= kursy[2] <= 280,
        f"po łącznym przesunięciu ≥ 2 km kurs ok. 270° ({kursy[2]})")
sprawdz(neptun._last_pos["r1"][1] == lon - 0.016 * 2, "kotwica przesunięta dopiero po ruchu ≥ 2 km")
sprawdz(kursy[3] is not None and 260 <= kursy[3] <= 280, f"kolejny mały krok zachowuje kurs ({kursy[3]})")

print("2. cień ETA dla rakiety z jednym zgłoszeniem")
a = {"dist_km": 40, "border_voiv": "lubelskie", "heading_known": False}
t = {"id": "k1", "type": "cruise", "lat": 51.0, "lon": 24.5}
neptun._eta_single_source_shadow(t, a, 1, "medium", 2.0, False, None)
neptun._eta_single_source_shadow({**t, "id": "k2"}, a, 2, "medium", 2.0, False, None)
neptun._eta_single_source_shadow({**t, "id": "k3", "type": "shahed"}, a, 1, "medium", 2.0, False, None)
neptun._eta_single_source_shadow({**t, "id": "k4"}, a, 1, "low", 2.0, False, None)
rows = stealth.query("eta_single_source_shadow", 60)
sprawdz([r["track_id"] for r in rows] == ["k1"] and rows[0]["would_be"] == "high",
        f"zapis tylko dla rakiety, 1 zgłoszenie, pewność ≥ średnia ({[r['track_id'] for r in rows]})")

stealth._conn and stealth._conn.close()
if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - kotwica kursu i cień ETA")
