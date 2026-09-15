# -*- coding: utf-8 -*-
"""Alarm ogólnokrajowy NEPTUN-a (np. „national-mig31k”) nie jest obiektem z pozycją.

Zdarzenie z 14.09.2026: MiG-31K z id „national-mig31k”, regionem „Загальнодержавна
загроза” i stałym punktem 49,0 / 31,2 stał 35 min na mapie jak samolot. Serwer ma
go oznaczyć (straznik_national), nie liczyć odległości ani punktów, a zgłoszony
obiekt z własnym id i obwodem ma zostać zwykłym obiektem.

Uruchomienie: py scripts/test_national_threat.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app.collectors import neptun  # noqa: E402
from app import fusion  # noqa: E402

ingested = []


async def fake_ingest(**kw):
    ingested.append(kw)
    return True

fusion.ingest = fake_ingest
fusion.on_state_change = None

NATIONAL = {"id": "national-mig31k", "type": "mig31k", "lat": 49, "lon": 31.2,
            "heading": None, "confidenceLevel": "high", "sourceCount": 3,
            "region": "Загальнодержавна загроза", "positionQuality": "approx",
            "status": "active", "confirmedAt": "2026-09-14T16:22:33Z"}
BY_REGION = {**NATIONAL, "id": "trk_x_region_only"}
# Zgłoszony MiG-31K z własną pozycją nad Wołyniem, kursem na PL.
REAL = {"id": "trk_00999001", "type": "mig31k", "lat": 51.2, "lon": 24.7, "heading": 290,
        "confidenceLevel": "high", "sourceCount": 3, "region": "Волинська область",
        "positionQuality": "confirmed", "lifecycle": "confirmed", "status": "active"}

assert neptun.is_national(NATIONAL)
assert neptun.is_national(BY_REGION)
assert not neptun.is_national(REAL)

asyncio.run(neptun._handle_threats([dict(NATIONAL), dict(REAL)], replace=True))

nat = neptun.tracks["national-mig31k"]
assert nat["straznik_national"] == {"since": "2026-09-14T16:22:33Z"}, nat.get("straznik_national")
assert nat["pl_assessment"] is None
assert "straznik_trail" not in nat
assert not any(s["details"]["track_id"] == "national-mig31k" for s in ingested), "alarm ogólnokrajowy dał punkty"

# 15.09.2026: NEPTUN oznacza start jako „моніторинг, не тривога” polem advisory.
ADVISORY = {**NATIONAL, "id": "national-mig31k-adv", "advisory": True}
asyncio.run(neptun._handle_threats([dict(ADVISORY)], replace=False))
assert neptun.tracks["national-mig31k-adv"]["straznik_national"] == {
    "since": "2026-09-14T16:22:33Z", "advisory": True}

real = neptun.tracks["trk_00999001"]
assert "straznik_national" not in real
assert real["pl_assessment"] and real["pl_assessment"]["dist_km"] < 150
assert any(s["details"]["track_id"] == "trk_00999001" and s["points"] > 0 for s in ingested), \
    "zgłoszony MiG-31K przy granicy powinien nadal punktować"

print("OK - alarm ogólnokrajowy jako komunikat bez punktów, zgłoszony obiekt bez zmian")
