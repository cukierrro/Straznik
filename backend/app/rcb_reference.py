"""Capture official RCB/RSO alerts as retrospective, no-send references."""
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import config, db

log = logging.getLogger("rcb-reference")
WINDOW_MINUTES = 30
status = {"enabled": config.RCB_REFERENCE_AUDIT_ENABLED,
          "mode": ("observe_only" if config.RCB_REFERENCE_AUDIT_ENABLED else "disabled"),
          "last_capture": None,
          "records": 0, "error": None}


def _utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds")


def normalize_source_time(value) -> str | None:
    """Normalize a documented source time without pretending it is delivery."""
    if value is None or str(value).strip() == "":
        return None
    raw = str(value).strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            # RSO valid_from is a Polish local civil time without an offset.
            parsed = parsed.replace(tzinfo=ZoneInfo("Europe/Warsaw"))
        return _utc_iso(parsed)
    except (ValueError, TypeError):
        return None


def _same_reference(signal: dict, source: str, event_id: str) -> bool:
    details = signal.get("details") or {}
    if source == "rso":
        return str(details.get("rso_id")) == event_id
    return details.get("url") == event_id


def _score_timeline(frames: list[dict], score_signals: list[dict],
                    voivodeships: list[str]) -> list[dict]:
    # Local import avoids coupling collectors to the notification path.
    from . import fusion
    out = []
    for frame in frames:
        ref = datetime.fromisoformat(frame["ts"])
        window_start = ref - timedelta(minutes=config.FUSION_WINDOW_MIN)
        active = []
        for signal in score_signals:
            try:
                signal_time = datetime.fromisoformat(signal["ts"])
            except (TypeError, ValueError):
                continue
            if window_start <= signal_time <= ref:
                active.append(signal)
        accumulated = fusion.accumulate(active, ref)
        # Reproduce the same regional spillover used by live compute_state.
        base = {voiv: state.get("_spillover_score", 0.0)
                for voiv, state in accumulated.items()}
        for source_region, score in base.items():
            if score < config.SPILLOVER_MIN_SOURCE_SCORE:
                continue
            for target, depth in fusion._cascade_targets(source_region):
                spill = round(score * config.SPILLOVER_FACTOR ** depth, 1)
                if spill >= config.SPILLOVER_MIN_CONTRIBUTION:
                    accumulated[target]["score"] += spill
        out.append({"ts": frame["ts"], "scores": {
            voiv: round(accumulated.get(voiv, {}).get("score", 0.0), 1)
            for voiv in voivodeships
        }})
    return out


def _lead_analysis(timeline: list[dict], shadow: list[dict],
                   voivodeships: list[str], detected: datetime,
                   source_iso: str | None) -> dict:
    source_time = datetime.fromisoformat(source_iso) if source_iso else None

    def marker(at: str) -> dict:
        moment = datetime.fromisoformat(at)
        return {"at": at,
                "lead_to_detection_seconds": round((detected - moment).total_seconds()),
                "lead_to_source_seconds": (round((source_time - moment).total_seconds())
                                           if source_time else None)}

    regions = {}
    for voiv in voivodeships:
        rows = [(row["ts"], float(row["scores"].get(voiv, 0.0))) for row in timeline]
        entry = {"max_score": max((score for _, score in rows), default=0.0)}
        for threshold, key in ((1.5, "first_score_1_5"), (2.0, "first_score_2_0")):
            found = next((at for at, score in rows if score >= threshold), None)
            entry[key] = marker(found) if found else None
        regions[voiv] = entry
    shadow_markers = []
    seen_bands = set()
    for event in shadow:
        if (event.get("kind") != "candidate" or event.get("voivodeship") not in voivodeships
                or event.get("band") in seen_bands):
            continue
        seen_bands.add(event.get("band"))
        shadow_markers.append({"voivodeship": event["voivodeship"],
                               "band": event.get("band"), **marker(event["ts"])})
    return {"regions": regions, "shadow_candidates": shadow_markers,
            "interpretation": ("positive lead means Strażnik marker preceded the reference; "
                               "source time is not confirmed delivery time")}


def capture(*, source: str, source_event_id: str, title: str,
            voivodeships: list[str], source_time_raw=None, bootstrap: bool,
            detected_at: datetime | None = None) -> bool:
    """Persist the 30 minutes preceding first collector detection.

    ``source_time_raw`` may be publication/valid-from time. It is explicitly
    not treated as proof of when a person's SMS or push was delivered.
    """
    if not config.RCB_REFERENCE_AUDIT_ENABLED:
        status.update(enabled=False, mode="disabled")
        return False
    detected = (detected_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    start = detected - timedelta(minutes=WINDOW_MINUTES)
    scoring_start = start - timedelta(minutes=config.FUSION_WINDOW_MIN)
    detected_iso, start_iso = _utc_iso(detected), _utc_iso(start)
    source_iso = normalize_source_time(source_time_raw)
    try:
        signals = [s for s in db.signals_between(start_iso, detected_iso)
                   if not _same_reference(s, source, str(source_event_id))]
        frames = db.snapshots_between(start_iso, detected_iso)
        scoring_signals = [s for s in db.signals_between(_utc_iso(scoring_start), detected_iso)
                           if not _same_reference(s, source, str(source_event_id))]
        shadow = db.escalation_shadow_events_between(start_iso, detected_iso)
        source_delay = None
        if source_iso:
            source_delay = round((detected - datetime.fromisoformat(source_iso)).total_seconds())
        first_frame = datetime.fromisoformat(frames[0]["ts"]) if frames else None
        # Snapshots normally arrive every two minutes. Allow one delayed frame,
        # but never present a short post-restart fragment as a full 30-minute lead study.
        history_complete = bool(first_frame and first_frame <= start + timedelta(minutes=3))
        timeline = _score_timeline(frames, scoring_signals,
                                   sorted(set(voivodeships)))
        payload = {
            "schema_version": 1,
            "purpose": "retrospective_reference_only",
            "title": title,
            "voivodeships": sorted(set(voivodeships)),
            "window": {"minutes": WINDOW_MINUTES, "start": start_iso,
                       "end_exclusive": detected_iso},
            "timing": {"source_time_kind": ("valid_from" if source == "rso"
                                               else "publication_if_available"),
                       "source_time_raw": source_time_raw,
                       "source_time_iso": source_iso,
                       "first_detected_at": detected_iso,
                       "source_to_detection_seconds": source_delay,
                       "delivery_time_known": False},
            "eligible_for_lead_analysis": not bootstrap and history_complete,
            "coverage": {"history_complete": history_complete,
                         "map_frame_count": len(frames),
                         "first_map_frame": frames[0]["ts"] if frames else None,
                         "last_map_frame": frames[-1]["ts"] if frames else None},
            "signals_before": signals,
            "shadow_events_before": shadow,
            "map_frames_before": frames,
            "score_timeline": timeline,
            "lead_analysis": _lead_analysis(timeline, shadow,
                                             sorted(set(voivodeships)),
                                             detected, source_iso),
        }
        inserted = db.add_rcb_reference_event(
            source, str(source_event_id), detected_iso,
            None if source_time_raw is None else str(source_time_raw), source_iso,
            bootstrap, payload,
        )
        if inserted:
            status["records"] += 1
            status["last_capture"] = detected_iso
            log.info("RCB wzorzec bez wysyłki: źródło=%s id=%s bootstrap=%s klatki=%d sygnały=%d",
                     source, source_event_id, bootstrap, len(frames), len(signals))
        status.update(enabled=True, mode="observe_only", error=None)
        return inserted
    except Exception as exc:
        status.update(enabled=True, mode="observe_only", error=str(exc))
        log.exception("RCB wzorzec: błąd zapisu")
        return False
