"""Pozycja rejonowa z dużą niepewnością nie otwiera czerwonego (15.10.2026).

18:43 lubelskie dostało czerwony: klucz otworzył meldunek „2× dron, około 50 km”
z pozycją w środku obwodu wołyńskiego (±70 km, kurs nieznany), a resztę punktów
dopchnął Alert RCB poziomu 1. Przeliczenie historii od 15.09 pokazało, że każdy
prawdziwy czerwony otworzył obiekt z niepewnością 4–25 km.

Uruchomienie: python scripts/test_czerwony_rejonowy.py
"""
import os
import sys
import tempfile
from datetime import datetime, timezone

os.environ.setdefault("STRAZNIK_DATA_DIR", tempfile.mkdtemp(prefix="straznik_test_"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
from app import config, fusion  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("OK   " if warunek else "ZLE  ") + opis)
    if not warunek:
        bledy.append(opis)


REF = datetime(2026, 10, 15, 16, 43, 54, tzinfo=timezone.utc)


def meldunek(unc, area, ts="2026-10-15T16:29:41+00:00", km=53.6, eta=15):
    return {"id": 7092, "ts": ts, "source": "neptun", "event_type": "neptun_threat",
            "voivodeship": "lubelskie", "points": 0.26,
            "title": "2× Dron / BpSP kursem na granicę PL, około 50 km [pozycja rejonowa] [kurs nieznany]",
            "details": {"type": "uav", "dist_km": km, "eta_border_min": eta, "track_id": "trk_00269843",
                        "course": "unknown", "area_only": area, "uncertainty_km": unc}}


sprawdz(config.RED_GATE_AREA_MAX_UNC_KM == 30.0, "próg niepewności pozycji rejonowej = 30 km")
sprawdz(fusion.red_key([meldunek(70, True)], REF) is None,
        "15.10: pozycja rejonowa ±70 km nie otwiera czerwonego")
sprawdz(fusion.red_key([meldunek(70, True, km=40, eta=None)], REF) is None,
        "bezpiecznik 50 km też nie działa dla pozycji rejonowej ±70 km")
sprawdz((fusion.red_key([meldunek(25, None)], REF) or {}).get("powod") == "eta",
        "13.10: dokładna pozycja ±25 km dalej otwiera czerwony")
sprawdz((fusion.red_key([meldunek(10, True)], REF) or {}).get("powod") == "eta",
        "pozycja rejonowa z małą niepewnością dalej otwiera czerwony")
sprawdz((fusion.red_key([meldunek(None, True)], REF) or {}).get("powod") == "eta",
        "brak podanej niepewności — jak dotąd (klucz zostaje)")

# punkty meldunku zostają — zmienia się tylko klucz
per = fusion.accumulate([meldunek(70, True)], REF)
liczone = [s for s in per["lubelskie"]["signals"] if s.get("id") == 7092]
sprawdz(bool(liczone) and liczone[0]["counted_points"] > 0, "meldunek rejonowy dalej daje punkty")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nwszystko OK")
