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

from app import config, db, rcb_reference  # noqa: E402


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    print("PASS", name)


def main():
    old_conn = db._conn
    detected = datetime(2026, 9, 10, 6, 30, tzinfo=timezone.utc)

    # Zegar zamrożony na godzinę po zdarzeniu. Zapis do rcb_reference_events
    # kasuje wpisy starsze niż 30 dni licząc od PRAWDZIWEGO „teraz", więc od
    # 10.10.2026 06:30 UTC stała data z testu znikała zaraz po zapisie i test
    # padał bez żadnej zmiany w kodzie. Daty zostają stałe (z nich wynika czas
    # polski i oczekiwane wartości), a test przestaje zależeć od dnia uruchomienia.
    zegar = [detected + timedelta(hours=1)]  # przestawiany niżej dla testu retencji

    class _StalyZegar(datetime):
        @classmethod
        def now(cls, tz=None):
            chwila = zegar[0]
            return chwila.astimezone(tz) if tz else chwila.replace(tzinfo=None)

    stare_zegary = (db.datetime, rcb_reference.datetime)
    db.datetime = rcb_reference.datetime = _StalyZegar
    stara_flaga, stary_status = config.RCB_REFERENCE_AUDIT_ENABLED, dict(rcb_reference.status)
    try:
        db._conn = sqlite3.connect(":memory:", check_same_thread=False)
        db._conn.executescript(db.SCHEMA)

        # Flaga ustawiana jawnie: wynik nie może zależeć od RCB_REFERENCE_AUDIT_ENABLED
        # w .env maszyny, na której chodzi test. Wyłączony audyt niczego nie zapisuje.
        config.RCB_REFERENCE_AUDIT_ENABLED = False
        disabled = rcb_reference.capture(
            source="rso", source_event_id="off", title="Off",
            voivodeships=["lubelskie"], bootstrap=False, detected_at=detected)
        check("disabled audit saves nothing", disabled is False and not db._conn.execute(
            "SELECT COUNT(*) FROM rcb_reference_events").fetchone()[0])
        check("disabled audit reported in status", rcb_reference.status["enabled"] is False)
        config.RCB_REFERENCE_AUDIT_ENABLED = True
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
              "map_frames_before" not in payload and payload["coverage"]["map_frame_count"] == 3)
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

        # Retencja 30 dni — mechanizm, który 10.10.2026 wysadził stałą datę tego testu.
        pozniej = detected + timedelta(days=31)
        zegar[0] = pozniej + timedelta(hours=1)
        rcb_reference.capture(
            source="rso", source_event_id="next-month", title="Later",
            voivodeships=["lubelskie"], bootstrap=False, detected_at=pozniej)
        check("entries older than 30 days pruned on insert",
              [r[0] for r in db._conn.execute(
                  "SELECT source_event_id FROM rcb_reference_events")] == ["next-month"])
    finally:
        db.datetime, rcb_reference.datetime = stare_zegary
        config.RCB_REFERENCE_AUDIT_ENABLED = stara_flaga
        rcb_reference.status.clear()
        rcb_reference.status.update(stary_status)
        if db._conn is not None and db._conn is not old_conn:
            db._conn.close()
        db._conn = old_conn
    print("RCB_REFERENCE_RESULT PASS NO_SEND")


if __name__ == "__main__":
    main()
