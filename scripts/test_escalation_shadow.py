"""Offline tests for production shadow mode. No collectors or delivery APIs."""
import sqlite3
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
try:
    import dotenv  # noqa: F401
except ImportError:
    sys.modules["dotenv"] = types.SimpleNamespace(load_dotenv=lambda *a, **k: None)
try:
    import truststore  # noqa: F401
except ImportError:
    sys.modules["truststore"] = types.SimpleNamespace(inject_into_ssl=lambda: None)

from app import db, escalation_shadow as shadow  # noqa: E402


def iso(seconds: float) -> str:
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat()


def state(score: float, track_id: str = "A", points: float | None = None,
          distance: float = 95.0, source: str = "neptun") -> dict:
    signals = [] if points is None else [{
        "source": source, "counted_points": points,
        "details": {"track_id": track_id, "dist_km": distance},
    }]
    return {"score": score, "signals": signals}


def track(now: float, *, track_id: str = "A", distance: float = 95.0,
          count=1, quality="exact", object_type="uav", toward=True) -> dict:
    return {"id": track_id, "type": object_type, "lat": 50.0,
            "lon": 24.0 + (now % 10) * 0.0001, "count": count,
            "uncertaintyKm": 4.0, "observedAt": iso(now),
            "positionQuality": quality,
            "pl_assessment": {"border_voiv": "lubelskie", "toward_pl": toward,
                              "dist_km": distance}}


def check(name: str, condition):
    if not condition:
        raise AssertionError(name)
    print("PASS", name)


def fresh():
    shadow._sessions.clear()


def main():
    now = 1_800_000_000.0
    fresh()
    first = shadow.evaluate_region("lubelskie", state(0.8, points=0.8),
                                   {"A": track(now)}, now=now, healthy=True,
                                   persist=False)
    second = shadow.evaluate_region("lubelskie", state(0.8, points=0.8),
                                    {"A": track(now + 60)}, now=now + 60,
                                    healthy=True, persist=False)
    repeat = shadow.evaluate_region("lubelskie", state(0.8, points=0.8),
                                    {"A": track(now + 60)}, now=now + 90,
                                    healthy=True, persist=False)
    check("first report cannot trigger 1.5", first["kind"] == "none")
    check("continuous single drone within 100 km is a 1.5 candidate even below 1.5 score",
          second["kind"] == "candidate" and second["band"] == 1.5)
    check("same observation does not repeat 1.5", repeat["kind"] == "none")

    fresh()
    shadow.evaluate_region("lubelskie", state(0.9, points=0.9, distance=200),
                           {"A": track(now, distance=200, object_type="missile")},
                           now=now, healthy=True, persist=False)
    missile = shadow.evaluate_region("lubelskie", state(0.9, points=0.9, distance=200),
                                     {"A": track(now + 60, distance=200,
                                                 object_type="missile")},
                                     now=now + 60, healthy=True, persist=False)
    check("fast missile can qualify farther than a drone",
          missile["kind"] == "candidate" and missile["band"] == 1.5)

    for label, object_type, distance in (
            ("KAB", "kab", 115), ("reconnaissance", "recon", 55)):
        fresh()
        shadow.evaluate_region(
            "lubelskie", state(0.7, points=0.7, distance=distance),
            {"A": track(now, distance=distance, object_type=object_type)},
            now=now, healthy=True, persist=False)
        object_decision = shadow.evaluate_region(
            "lubelskie", state(0.7, points=0.7, distance=distance),
            {"A": track(now + 60, distance=distance, object_type=object_type)},
            now=now + 60, healthy=True, persist=False)
        check(f"{label} has its own early-attention distance",
              object_decision["kind"] == "candidate")

    for label, kwargs in (
            ("FPV", {"object_type": "fpv"}),
            ("unknown object", {"object_type": "unknown"}),
            ("object flying away", {"toward": False})):
        fresh()
        shadow.evaluate_region(
            "lubelskie", state(0.8, points=0.8), {"A": track(now, **kwargs)},
            now=now, healthy=True, persist=False)
        excluded = shadow.evaluate_region(
            "lubelskie", state(0.8, points=0.8),
            {"A": track(now + 60, **kwargs)}, now=now + 60,
            healthy=True, persist=False)
        check(f"{label} cannot create proximity candidate",
              excluded["kind"] != "candidate")

    fresh()
    weak = {"score": 1.8, "signals": [
        {"source": "media", "event_type": "media_keywords", "counted_points": 1.5},
        {"source": "pansa", "event_type": "pansa_zone", "counted_points": 0.3},
    ]}
    corroborated = shadow.evaluate_region("lubelskie", weak, {}, now=now,
                                          healthy=True, persist=False)
    check("two independent classes can qualify weak 1.5-2.0 situation",
          corroborated["kind"] == "candidate")

    for label, signals in (
            ("border air alert plus significant PAŻP zone", [
                {"source": "neptun", "event_type": "ua_alert_border",
                 "counted_points": 1.0},
                {"source": "pansa", "event_type": "pansa_zone",
                 "counted_points": 0.5},
            ]),
            ("ADS-B military spike plus significant PAŻP zone", [
                {"source": "adsb", "event_type": "adsb_spike",
                 "counted_points": 1.0},
                {"source": "pansa", "event_type": "pansa_zone",
                 "counted_points": 0.5},
            ])):
        fresh()
        combined = shadow.evaluate_region(
            "lubelskie", {"score": 1.5, "signals": signals}, {}, now=now,
            healthy=True, persist=False)
        check(f"{label} is observed as early corroboration",
              combined["kind"] == "candidate")

    fresh()
    media_only = shadow.evaluate_region(
        "lubelskie", {"score": 1.5, "signals": [
            {"source": "media", "event_type": "media_keywords", "counted_points": 1.5}]},
        {}, now=now, healthy=True, persist=False)
    check("single media article cannot qualify early attention",
          media_only["kind"] != "candidate")

    fresh()
    unqualified_neptun = shadow.evaluate_region(
        "lubelskie", {"score": 1.8, "signals": [
            {"source": "neptun", "event_type": "neptun_threat", "counted_points": 1.5,
             "details": {"track_id": "A", "dist_km": 90}},
            {"source": "neighbours", "event_type": "neighbour_zone", "counted_points": 0.3},
        ]}, {"A": track(now, quality="approx")}, now=now, healthy=True, persist=False)
    check("unqualified approximate NEPTUN track cannot corroborate early attention",
          unqualified_neptun["kind"] != "candidate")

    for label, altered in (("approximate", {"quality": "approx"}),
                           ("group", {"count": 2})):
        fresh()
        one = track(now, **altered)
        two = track(now + 60, **altered)
        shadow.evaluate_region("lubelskie", state(1.7, points=1.7), {"A": one},
                               now=now, healthy=True, persist=False)
        decision = shadow.evaluate_region("lubelskie", state(1.7, points=1.7), {"A": two},
                                          now=now + 60, healthy=True, persist=False)
        check(f"{label} position/group cannot trigger 1.5", decision["kind"] != "candidate")

    fresh()
    shadow.evaluate_region("lubelskie", state(2.1, points=0.1),
                           {"A": track(now, distance=180)}, now=now,
                           healthy=True, persist=False)
    progressed = shadow.evaluate_region("lubelskie", state(2.6, points=0.6, distance=140),
                                        {"A": track(now + 60, distance=140)},
                                        now=now + 60, healthy=True, persist=False)
    check("fresh qualified growth produces 2.5 candidate",
          progressed["kind"] == "candidate" and progressed["band"] == 2.5)

    fresh()
    shadow.evaluate_region("lubelskie", state(2.1), {}, now=now,
                           healthy=True, persist=False)
    media = shadow.evaluate_region("lubelskie", state(3.6, "X", 1.5, source="media"), {},
                                   now=now + 60, healthy=True, persist=False)
    check("RSS/media score cannot create progression", media["kind"] == "none")

    fresh()
    shadow.evaluate_region("lubelskie", state(2.1, points=0.1),
                           {"A": track(now, distance=180)}, now=now,
                           healthy=True, persist=False)
    jump = shadow.evaluate_region("lubelskie", state(3.6, points=1.6, distance=95),
                                  {"A": track(now + 60, distance=95)},
                                  now=now + 60, healthy=True, persist=False)
    check("multi-band jump records only highest candidate",
          jump["kind"] == "candidate" and jump["band"] == 3.5)

    red = shadow.evaluate_region("lubelskie", state(4.0), {}, now=now + 120,
                                 healthy=True, persist=False)
    check("shadow never replaces production red alert", red["kind"] == "none")
    check("shadow module has no notification dependency", "app.notify" not in sys.modules)

    old_conn = db._conn
    try:
        db._conn = sqlite3.connect(":memory:", check_same_thread=False)
        db._conn.executescript(db.SCHEMA)
        fresh()
        shadow.evaluate_region("lubelskie", state(0.8, points=0.8),
                               {"A": track(now)}, now=now, healthy=True)
        persisted_candidate = shadow.evaluate_region(
            "lubelskie", state(0.8, points=0.8), {"A": track(now + 60)},
            now=now + 60, healthy=True)
        check("shadow state persists", db.load_escalation_shadow_state("lubelskie") is not None)
        fresh()  # simulated process restart
        after_restart = shadow.evaluate_region(
            "lubelskie", state(0.8, points=0.8), {"A": track(now + 60)},
            now=now + 90, healthy=True)
        rows = db.escalation_shadow_events(1)
        check("candidate audit row persists", persisted_candidate["kind"] == "candidate"
              and sum(r["kind"] == "candidate" for r in rows) == 1)
        check("restart does not replay early candidate", after_restart["kind"] != "candidate")
    finally:
        if db._conn is not None and db._conn is not old_conn:
            db._conn.close()
        db._conn = old_conn
    print("ESCALATION_SHADOW_RESULT PASS NO_SEND")


if __name__ == "__main__":
    main()
