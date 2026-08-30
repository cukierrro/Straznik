"""Regresja: kolejne poziomy tego samego toru Neptuna nie sumują się."""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import fusion


def sig(sid, ts, track, points):
    return {"id": sid, "ts": ts, "source": "neptun",
            "event_type": "neptun_threat", "voivodeship": "lubelskie",
            "points": points, "title": track, "details": {"track_id": track}}


ref = datetime(2026, 8, 30, 13, 0, tzinfo=timezone.utc)
signals = [
    sig(1, "2026-08-30T12:48:00+00:00", "track-a", 0.22),
    sig(2, "2026-08-30T12:58:00+00:00", "track-a", 0.79),
    sig(3, "2026-08-30T12:57:00+00:00", "track-b", 0.50),
]
state = fusion.accumulate(signals, ref)["lubelskie"]
assert round(state["score"], 2) == 1.29, state
counted = {s["id"]: s["counted_points"] for s in state["signals"]}
assert counted == {1: 0.0, 3: 0.5, 2: 0.8}, counted
print("OK: ten sam track liczony raz; niezależne tracki nadal się sumują")
