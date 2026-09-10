"""Offline regression tests for cross-source RCB/media deduplication."""
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
# Testuje wyłącznie czystą fuzję; nie potrzebuje integracji TLS ani pliku .env.
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_args, **_kwargs: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import fusion


REF = datetime(2026, 9, 10, 4, 30, tzinfo=timezone.utc)


def sig(sid, ts, source, event_type, voiv, points, title, details=None):
    return {"id": sid, "ts": ts, "source": source, "event_type": event_type,
            "voivodeship": voiv, "points": points, "title": title,
            "details": details or {}}


official_lub = sig(
    1, "2026-09-10T04:21:41+00:00", "rcb", "rso_alert", "lubelskie", 2.0,
    "Alert RCB (RSO): UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. "
    "W przestrzeni RP operuje polskie lotnictwo.", {"rso_id": "23321638"})
relay_media = sig(
    2, "2026-09-10T04:24:55+00:00", "media", "media_keywords", "lubelskie", 1.5,
    "Media: ALERT RCB: rosyjski atak powietrzny na Ukrainę. Polskie lotnictwo "
    "operuje w przestrzeni RP")


def test_relay_is_visible_but_scores_zero():
    state = fusion.accumulate([official_lub, relay_media], REF)["lubelskie"]
    assert state["score"] == 2.0
    media = next(s for s in state["signals"] if s["source"] == "media")
    assert media["counted_points"] == 0.0
    assert media["duplicate_of_official"] == "23321638"
    text = fusion.breakdown_text(state["signals"])
    assert "+0.0 pkt — powtórzenie oficjalnego alertu" in text


def test_rcb_mention_with_new_information_is_not_suppressed():
    distinct = sig(
        3, "2026-09-10T04:25:00+00:00", "media", "media_keywords", "lubelskie", 1.5,
        "Media: Rosja zaatakowała Kijów pociskami balistycznymi. Alert RCB dla Lubelszczyzny")
    state = fusion.accumulate([official_lub, distinct], REF)["lubelskie"]
    assert state["score"] == 3.5
    assert "duplicate_of_official" not in state["signals"][1]


def test_regional_rcb_does_not_spill_or_make_today_red():
    neptun = sig(4, "2026-09-10T04:08:20+00:00", "neptun", "neptun_threat",
                  "lubelskie", 1.0, "Dron", {"track_id": "today-1"})
    official_pod = sig(
        5, "2026-09-10T04:29:50+00:00", "rcb", "rso_alert", "podkarpackie", 2.0,
        official_lub["title"], {"rso_id": "23321639"})
    original = fusion.db.signals_since
    original_weight = fusion._age_weight
    fusion.db.signals_since = lambda _minutes: [neptun, official_lub, relay_media, official_pod]
    fusion._age_weight = lambda _ts, _ref=None: 1.0
    try:
        state = fusion.compute_state()["voivodeships"]
    finally:
        fusion.db.signals_since = original
        fusion._age_weight = original_weight
    assert state["lubelskie"]["score"] == 3.0
    assert state["lubelskie"]["level"] == "elevated"
    assert state["podkarpackie"]["score"] == 2.0
    assert not any(s["source"] == "spillover" for s in state["lubelskie"]["signals"])


def test_independent_non_rcb_risk_can_still_spill():
    signals = [
        sig(6, "2026-09-10T04:20:00+00:00", "media", "media_keywords",
            "lubelskie", 1.5, "Niezależna relacja o naruszeniu przestrzeni"),
        sig(7, "2026-09-10T04:20:30+00:00", "neptun", "neptun_threat",
            "lubelskie", 0.5, "Dron", {"track_id": "independent-1"}),
    ]
    original = fusion.db.signals_since
    original_weight = fusion._age_weight
    fusion.db.signals_since = lambda _minutes: signals
    fusion._age_weight = lambda _ts, _ref=None: 1.0
    try:
        state = fusion.compute_state()["voivodeships"]
    finally:
        fusion.db.signals_since = original
        fusion._age_weight = original_weight
    assert state["lubelskie"]["score"] == 2.0
    assert state["podkarpackie"]["score"] == 0.8


def test_stored_wyryki_retrospective_is_visible_but_scores_zero():
    historical = sig(
        721, "2026-09-10T17:31:11+00:00", "media", "media_keywords",
        "lubelskie", 1.5,
        "Media: „Najpierw postawimy choinkę. Dom w Wyrykach ma być gotowy na święta”")
    state = fusion.accumulate(
        [historical], datetime(2026, 9, 10, 17, 40, tzinfo=timezone.utc)
    )["lubelskie"]
    assert state["score"] == 0.0
    assert state["signals"][0]["counted_points"] == 0.0
    assert state["signals"][0]["retrospective"] is True
    assert "materiał historyczny/następstwa, bez punktów" in fusion.breakdown_text(
        state["signals"])


if __name__ == "__main__":
    test_relay_is_visible_but_scores_zero()
    test_rcb_mention_with_new_information_is_not_suppressed()
    test_regional_rcb_does_not_spill_or_make_today_red()
    test_independent_non_rcb_risk_can_still_spill()
    test_stored_wyryki_retrospective_is_visible_but_scores_zero()
    print("OK: 5 regresji RCB/media, materiałów historycznych i propagacji")
