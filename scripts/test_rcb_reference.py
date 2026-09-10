"""Offline RCB reference audit tests. No collectors and no delivery."""
import sqlite3
import sys
import types
from datetime import datetime, timedelta, timezone
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

from app import db, rcb_reference  # noqa: E402


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    print("PASS", name)


def main():
    old_conn = db._conn
    detected = datetime(2026, 9, 10, 6, 30, tzinfo=timezone.utc)
    try:
        db._conn = sqlite3.connect(":memory:", check_same_thread=False)
        db._conn.executescript(db.SCHEMA)
        # One old signal must be excluded; one recent signal and two map frames retained.
        db._conn.execute(
            "INSERT INTO signals(ts,source,event_type,voivodeship,points,title,details,dedup_key)"
            " VALUES(?,?,?,?,?,?,?,?)",
            ((detected - timedelta(minutes=31)).isoformat(timespec="seconds"),
             "pansa", "pansa_zone", "lubelskie", .5, "old", "{}", "old"))
        db._conn.execute(
            "INSERT INTO signals(ts,source,event_type,voivodeship,points,title,details,dedup_key)"
            " VALUES(?,?,?,?,?,?,?,?)",
            ((detected - timedelta(minutes=10)).isoformat(timespec="seconds"),
             "adsb", "adsb_spike", "lubelskie", 1.0, "recent", "{}", "recent"))
        for minutes in (29, 25, 5):
            db._conn.execute("INSERT INTO snapshots(ts,payload) VALUES(?,?)", (
                (detected - timedelta(minutes=minutes)).isoformat(timespec="seconds"),
                '{"threats":[],"aircraft":[]}'))
        db._conn.commit()

        inserted = rcb_reference.capture(
            source="rso", source_event_id="123", title="Alert RCB",
            voivodeships=["lubelskie"], source_time_raw="2026-09-10 08:20:00",
            bootstrap=False, detected_at=detected)
        rows = db.rcb_reference_events(hours=24 * 365)
        payload = rows[0]["payload"]
        check("reference saved once", inserted and len(rows) == 1)
        check("Polish civil valid_from normalized to UTC",
              rows[0]["source_time_iso"] == "2026-09-10T06:20:00+00:00")
        check("source-to-detection delay kept separate",
              payload["timing"]["source_to_detection_seconds"] == 600)
        check("delivery time is explicitly unknown",
              payload["timing"]["delivery_time_known"] is False)
        check("exact 30-minute map history retained",
              len(payload["map_frames_before"]) == 3)
        check("old signal excluded and recent signal retained",
              [s["title"] for s in payload["signals_before"]] == ["recent"])
        check("score timeline reconstructed", len(payload["score_timeline"]) == 3)
        check("complete history is eligible for lead analysis",
              payload["coverage"]["history_complete"] is True
              and payload["eligible_for_lead_analysis"] is True)
        check("lead marker compares with detection and source time",
              payload["lead_analysis"]["regions"]["lubelskie"]["first_score_1_5"]
              == {"at": "2026-09-10T06:25:00+00:00",
                  "lead_to_detection_seconds": 300,
                  "lead_to_source_seconds": -300})
        duplicate = rcb_reference.capture(
            source="rso", source_event_id="123", title="Alert RCB",
            voivodeships=["lubelskie"], source_time_raw="2026-09-10 08:20:00",
            bootstrap=False, detected_at=detected)
        check("duplicate source event ignored", not duplicate and len(
            db.rcb_reference_events(hours=24 * 365)) == 1)

        rcb_reference.capture(
            source="govpl", source_event_id="https://example/old", title="Old",
            voivodeships=["lubelskie"], bootstrap=True, detected_at=detected)
        bootstrap_row = db.rcb_reference_events(hours=24 * 365)[1]
        check("bootstrap discovery excluded from lead analysis",
              bootstrap_row["payload"]["eligible_for_lead_analysis"] is False)
        db._conn.execute("DELETE FROM snapshots")
        db._conn.commit()
        rcb_reference.capture(
            source="rso", source_event_id="short-history", title="New",
            voivodeships=["lubelskie"], source_time_raw="2026-09-10 08:29:00",
            bootstrap=False, detected_at=detected)
        short_row = db.rcb_reference_events(hours=24 * 365)[2]
        check("missing map history cannot claim measured lead",
              short_row["payload"]["coverage"]["history_complete"] is False
              and short_row["payload"]["eligible_for_lead_analysis"] is False)
        check("reference module has no notification dependency", "app.notify" not in sys.modules)
    finally:
        if db._conn is not None and db._conn is not old_conn:
            db._conn.close()
        db._conn = old_conn
    print("RCB_REFERENCE_RESULT PASS NO_SEND")


if __name__ == "__main__":
    main()
