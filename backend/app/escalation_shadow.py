"""Observe progression candidates on live data without any delivery path.

This module deliberately does not import ``notify`` and never changes fusion
scores.  It persists conservative, inspectable decisions for later review.
"""
import logging
import math
from collections import Counter
from datetime import datetime, timezone

from . import config, db

log = logging.getLogger("progression-shadow")

BANDS = (2.5, 3.0, 3.5)
PROXIMITY_BAND = 1.5
# Experimental distances for an early-attention candidate. Fast/heavy threats
# need more reaction time; a reconnaissance track is only considered very near
# the border. FPV is intentionally absent.
EARLY_DISTANCE_KM = {
    "ballistic": 250.0, "cruise": 250.0, "missile": 250.0, "mig31k": 250.0,
    "kab": 120.0, "shahed": 100.0, "uav": 100.0, "recon": 60.0,
}
EARLY_CORROBORATING_SOURCES = {"neptun", "adsb", "pansa", "neighbours", "media"}
EARLY_OPERATIONAL_SOURCES = {"neptun", "adsb", "pansa"}
FRESH_SECONDS = 5 * 60
GAP_SECONDS = 2 * 60
RESET_SECONDS = 60 * 60
MAX_LEDGER = 1000

status = {"enabled": False, "mode": "observe_only", "last_eval": None,
          "error": None, "candidates": 0, "last_candidate": None}
_sessions: dict[str, "Session"] = {}


def _timestamp(value) -> float | None:
    if not isinstance(value, str) or not value.endswith(("Z", "+00:00")):
        # Require an explicit timezone. Other offsets still pass below.
        if not isinstance(value, str) or not (len(value) >= 6 and value[-6] in "+-"
                                               and value[-3] == ":"):
            return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def _distance(a: dict, b: dict) -> float:
    r = math.pi / 180
    dlat = (a["lat"] - b["lat"]) * r
    dlon = (a["lon"] - b["lon"]) * r
    h = (math.sin(dlat / 2) ** 2
         + math.cos(a["lat"] * r) * math.cos(b["lat"] * r)
         * math.sin(dlon / 2) ** 2)
    return 12742 * math.asin(math.sqrt(min(1, h)))


class TrackGuard:
    """Conservative continuity guard; source track is not a physical identity."""
    def __init__(self, saved: dict | None = None):
        self.records: dict[str, dict] = {}
        if saved:
            if saved.get("version") != 1 or not isinstance(saved.get("records"), list):
                raise ValueError("invalid guard state")
            for row in saved["records"]:
                if not isinstance(row, list) or len(row) != 2 or row[0] in self.records:
                    raise ValueError("invalid guard record")
                self.records[row[0]] = row[1]

    def export(self) -> dict:
        return {"version": 1, "records": [[key, value] for key, value in self.records.items()]}

    def check(self, item: dict, now: float) -> tuple[bool, str]:
        if (not isinstance(item.get("id"), str) or not item["id"]
                or item.get("count") != 1
                or any(not isinstance(item.get(k), (int, float))
                       or isinstance(item.get(k), bool) or not math.isfinite(item[k])
                       for k in ("lat", "lon", "uncertainty", "observed_at", "max_speed"))
                or abs(item["lat"]) > 90 or abs(item["lon"]) > 180
                or item["uncertainty"] < 0 or item["max_speed"] <= 0
                or item["observed_at"] > now or now - item["observed_at"] > FRESH_SECONDS):
            return False, "invalid-or-stale-observation"
        for key, old in list(self.records.items()):
            if now - old["observed_at"] > RESET_SECONDS:
                del self.records[key]
        old = self.records.get(item["id"])
        if not old and len(self.records) >= MAX_LEDGER:
            return False, "ledger-full"
        if old and item["observed_at"] <= old["observed_at"]:
            return False, "repeated-or-reversed-observation"

        def reachable(previous: dict) -> bool:
            limit = (previous["uncertainty"] + item["uncertainty"]
                     + max(previous["max_speed"], item["max_speed"])
                     * abs(item["observed_at"] - previous["observed_at"]) / 3600)
            return _distance(previous, item) <= limit

        aliases = [old_item for key, old_item in self.records.items()
                   if key != item["id"] and reachable(old_item)]
        observations = 1
        quarantined = bool(aliases)
        reason = "possible-reacquisition-or-overlap" if aliases else "candidate-needs-second-observation"
        if old:
            observations = int(old.get("observations", 1)) + 1
            quarantined = bool(old.get("quarantined")) or not reachable(old) or bool(aliases)
            reason = "uncertain-continuity" if quarantined else "continuous-source-track"
        self.records[item["id"]] = {**item, "observations": observations,
                                    "quarantined": quarantined}
        return bool(old) and not quarantined and not aliases, reason


class ProgressionModel:
    def __init__(self, saved: dict | None = None):
        self.anchor: dict[str, dict] | None = None
        self.anchor_score = 0.0
        self.anchor_at = 0.0
        self.high_water = 2.0
        self.previous_score = 0.0
        self.last_tick: float | None = None
        if saved:
            self.anchor = ({key: value for key, value in saved["anchor"]}
                           if saved.get("anchor") is not None else None)
            self.anchor_score = float(saved["anchor_score"])
            self.anchor_at = float(saved["anchor_at"])
            self.high_water = float(saved["high_water"])
            self.previous_score = float(saved["previous_score"])
            self.last_tick = saved.get("last_tick")

    def export(self) -> dict:
        return {"anchor": ([[key, value] for key, value in self.anchor.items()]
                           if self.anchor is not None else None),
                "anchor_score": self.anchor_score, "anchor_at": self.anchor_at,
                "high_water": self.high_water, "previous_score": self.previous_score,
                "last_tick": self.last_tick}

    def rebase(self, now: float, score: float, objects: list[dict]):
        self.anchor = {o["physical_id"]: dict(o) for o in objects}
        self.anchor_score = score
        self.anchor_at = now
        self.high_water = max((2.0, *[band for band in BANDS if band <= score]))
        self.previous_score = score
        self.last_tick = now

    def advance(self, now: float, score: float, objects: list[dict]) -> dict:
        if (not math.isfinite(now) or not math.isfinite(score) or score < 0
                or (self.last_tick is not None and now < self.last_tick)):
            return {"kind": "none", "reason": "invalid-clock-or-score"}
        self.last_tick = now
        previous = self.previous_score
        self.previous_score = score
        current = {o["physical_id"]: dict(o) for o in objects}
        if score >= config.THRESHOLD_HIGH:
            self.high_water = config.THRESHOLD_HIGH
            return {"kind": "none", "reason": "red-remains-production-path",
                    "production_rising": previous < config.THRESHOLD_HIGH}
        if score < config.THRESHOLD_ELEVATED:
            return {"kind": "none", "reason": "below-yellow"}
        if self.anchor is None:
            self.rebase(now, score, objects)
            return {"kind": "baseline", "reason": "first-yellow-baseline"}

        growth = 0.0
        reasons = []
        for key, old in self.anchor.items():
            nxt = current.get(key)
            if nxt is None:
                growth -= old["points"]
            elif nxt["points"] < old["points"]:
                growth += nxt["points"] - old["points"]
        for key, nxt in current.items():
            if (nxt["observed_at"] > now or now - nxt["observed_at"] > FRESH_SECONDS
                    or nxt["observed_at"] <= self.anchor_at):
                continue
            old = self.anchor.get(key)
            if old is None and nxt["points"] > 0:
                growth += nxt["points"]
                reasons.append({"type": "new_source_track", "track": key})
            elif old and nxt["points"] > old["points"] and nxt["observed_at"] > old["observed_at"]:
                approach = old["distance"] - nxt["distance"]
                if approach > max(10.0, old["uncertainty"] + nxt["uncertainty"]):
                    growth += nxt["points"] - old["points"]
                    reasons.append({"type": "approach", "track": key,
                                    "km": round(approach, 1)})
        qualified = min(score, self.anchor_score + growth)
        bands = [band for band in BANDS if band > self.high_water and qualified + 1e-9 >= band]
        if not bands or not reasons or growth <= 0:
            return {"kind": "none", "qualified": qualified,
                    "reason": "no-fresh-qualified-progression"}
        band = max(bands)
        self.high_water = band
        self.anchor = current
        self.anchor_at = now
        self.anchor_score = qualified
        return {"kind": "candidate", "band": band, "qualified": qualified,
                "growth": growth, "reasons": reasons}


class Session:
    def __init__(self, region: str, saved: dict | None = None):
        self.region = region
        self.serial = 0
        self.quiet_since: float | None = None
        self.last_seen: float | None = None
        self.model = ProgressionModel()
        self.guard = TrackGuard()
        self.recovering = False
        self.early_emitted = False
        if saved:
            try:
                if saved.get("version") != 1 or saved.get("region") != region:
                    raise ValueError("invalid session")
                self.serial = int(saved["serial"])
                self.quiet_since = saved.get("quiet_since")
                self.last_seen = saved.get("last_seen")
                self.early_emitted = bool(saved.get("early_emitted", False))
                self.model = ProgressionModel(saved["model"])
                self.guard = TrackGuard(saved["guard"])
            except (KeyError, TypeError, ValueError, OverflowError):
                self.recovering = True

    def export(self) -> dict:
        return {"version": 1, "region": self.region, "serial": self.serial,
                "quiet_since": self.quiet_since, "last_seen": self.last_seen,
                "early_emitted": self.early_emitted,
                "model": self.model.export(), "guard": self.guard.export()}


def _session(region: str, load: bool = True) -> Session:
    if region not in _sessions:
        saved = db.load_escalation_shadow_state(region) if load else None
        _sessions[region] = Session(region, saved)
    return _sessions[region]


def _source_observed_at(track: dict) -> float | None:
    for key in ("observedAt", "observed_at"):
        if key in track:
            parsed = _timestamp(track.get(key))
            if parsed is not None:
                return parsed
    return None


def _objects(session: Session, region: str, state: dict, tracks: dict[str, dict],
             now: float) -> tuple[list[dict], Counter]:
    scored = {}
    for signal in state.get("signals", []):
        details = signal.get("details") or {}
        track_id = details.get("track_id")
        points = signal.get("counted_points", 0)
        if signal.get("source") == "neptun" and track_id and isinstance(points, (int, float)) and points > 0:
            scored[track_id] = signal
    objects, blockers = [], Counter()
    for track_id, raw in tracks.items():
        assessment = raw.get("pl_assessment") or {}
        if assessment.get("border_voiv") != region:
            continue
        if assessment.get("toward_pl") is not True:
            blockers["not-heading-toward-poland"] += 1
            continue
        observed_at = _source_observed_at(raw)
        count = raw.get("count") if "count" in raw else None
        speed = config.NEPTUN_TYPE_SPEED_KMH.get(str(raw.get("type") or "").lower())
        if str(raw.get("positionQuality") or "").lower() == "approx":
            blockers["approximate-position"] += 1
            continue
        item = {"id": str(track_id), "lat": raw.get("lat"), "lon": raw.get("lon"),
                "uncertainty": raw.get("uncertaintyKm"), "observed_at": observed_at,
                "max_speed": speed, "count": count}
        eligible, reason = session.guard.check(item, now)
        if not eligible:
            blockers[reason] += 1
            continue
        signal = scored.get(track_id)
        if not signal:
            blockers["no-counted-direct-signal"] += 1
            continue
        # Use the live assessment, not the older distance retained in the
        # fusion signal.  The signal proves that this track was point-worthy;
        # the current assessment proves where it is heading now.
        distance = assessment.get("dist_km")
        points = signal.get("counted_points")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool)
                   and math.isfinite(v) and v >= 0
                   for v in (distance, points, raw.get("uncertaintyKm"))):
            blockers["missing-score-distance-or-uncertainty"] += 1
            continue
        objects.append({"physical_id": str(track_id), "observed_at": observed_at,
                        "points": float(points), "distance": float(distance),
                        "uncertainty": float(raw["uncertaintyKm"]),
                        "type": str(raw.get("type") or "").lower()})
    return objects, blockers


def _early_attention_reasons(state: dict, objects: list[dict]) -> list[dict]:
    reasons = []
    qualified_track_ids = {item["physical_id"] for item in objects}
    for item in objects:
        limit = EARLY_DISTANCE_KM.get(item["type"])
        if limit is not None and item["distance"] <= limit:
            reasons.append({"type": "air_object_near_border", "track": item["physical_id"],
                            "object_type": item["type"], "km": round(item["distance"], 1),
                            "limit_km": limit})

    # A weak combined score can be worth watching when at least two genuinely
    # different classes agree. A lone article, spillover, or neighbour-zone
    # report cannot qualify. At least one operational sensor/official-UA class
    # must be present; RCB already reaches the normal yellow threshold itself.
    sources = set()
    for signal in state.get("signals", []):
        points = signal.get("counted_points", 0)
        source = signal.get("source")
        if (not isinstance(points, (int, float)) or points <= 0
                or source not in EARLY_CORROBORATING_SOURCES
                or signal.get("propagated") is True
                or signal.get("event_type") == "neighbour_spillover"):
            continue
        if (source == "neptun" and signal.get("event_type") == "neptun_threat"
                and str((signal.get("details") or {}).get("track_id"))
                not in qualified_track_ids):
            continue
        sources.add(source)
    score = float(state.get("score", 0.0))
    if (PROXIMITY_BAND <= score < config.THRESHOLD_ELEVATED
            and len(sources) >= 2 and sources & EARLY_OPERATIONAL_SOURCES):
        reasons.append({"type": "independent_weak_corroboration",
                        "sources": sorted(sources), "score": score})
    return reasons


def evaluate_region(region: str, state: dict, tracks: dict[str, dict], *,
                    now: float, healthy: bool, persist: bool = True) -> dict:
    session = _session(region, load=persist)
    score = float(state.get("score", 0.0))
    gap = session.last_seen is not None and now - session.last_seen > GAP_SECONDS
    if session.last_seen is not None and now < session.last_seen:
        return {"kind": "none", "reason": "clock-reversed"}
    session.last_seen = now
    objects, blockers = _objects(session, region, state, tracks, now)

    if not healthy:
        session.quiet_since = None
        decision = {"kind": "none", "reason": "source-unhealthy"}
    else:
        reset = False
        early_reasons = _early_attention_reasons(state, objects)
        # A qualified object or corroborated weak situation is not "calm" even
        # below 1.5. A lone RSS item cannot create early_reasons.
        if score < PROXIMITY_BAND and not early_reasons:
            if session.quiet_since is None:
                session.quiet_since = now
            elif now - session.quiet_since >= RESET_SECONDS:
                session.model = ProgressionModel()
                session.guard = TrackGuard()
                session.serial += 1
                session.quiet_since = now
                session.early_emitted = False
                reset = True
        else:
            session.quiet_since = None
        if session.recovering or gap:
            if config.THRESHOLD_ELEVATED <= score < config.THRESHOLD_HIGH:
                session.model.rebase(now, score, objects)
            session.recovering = False
            decision = {"kind": "none", "reason": "recovery-baseline-no-replay"}
        else:
            decision = session.model.advance(now, score, objects)
            if (score < config.THRESHOLD_ELEVATED
                    and early_reasons and not session.early_emitted):
                session.early_emitted = True
                decision = {"kind": "candidate", "band": PROXIMITY_BAND,
                            "qualified": score, "growth": 0.0,
                            "reasons": early_reasons}
        if reset:
            decision = {"kind": "reset", "reason": "one-hour-confirmed-calm"}

    payload = {"serial": session.serial, "decision": decision,
               "qualified_objects": len(objects), "blockers": dict(blockers)}
    if persist:
        db.save_escalation_shadow_state(region, session.export())
        if score >= config.THRESHOLD_ELEVATED or decision["kind"] in {"candidate", "reset"}:
            db.log_escalation_shadow_event(
                region, decision["kind"] if decision["kind"] != "none" else "sample",
                score, decision.get("qualified"), decision.get("band"), payload,
            )
    if decision["kind"] == "candidate":
        status["candidates"] += 1
        status["last_candidate"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        log.info("KANDYDAT bez wysyłki: woj=%s próg=%.1f wynik=%.1f kwalifikowany=%.2f powody=%s",
                 region, decision["band"], score, decision["qualified"], decision["reasons"])
    return {**decision, "objects": len(objects), "blockers": dict(blockers)}


def evaluate_all(voivodeships: dict, tracks: dict[str, dict], *, now: float,
                 healthy: bool):
    for region in config.VOIVODESHIPS:
        evaluate_region(region, voivodeships.get(region, {}), tracks,
                        now=now, healthy=healthy)
    status.update(enabled=True, last_eval=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                  error=None)
