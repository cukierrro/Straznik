"""Dziennik decyzji o alarmach i archiwum migawek — materiał do pomiaru jakości (audyt G1/E9).

Do 13.09.2026 dziennik powiadomień zapisywał tylko czas, województwo i poziom,
a migawki mapy znikały po 12 h. Skargi użytkownika po dwóch dniach nie dało się
sprawdzić, a progów nie dało się stroić na tygodniach danych.

  * alert_log (w straznik.db, trafia do kopii zapasowych) — każda zmiana poziomu
    powiadomień: skład punktów, powiązane alerty RSO, decyzja i wynik doręczenia;
  * archiwum.db (osobny plik, poza kopiami) — pełne migawki mapy co 2 min przez
    30 dni, skompresowane. Utrata archiwum nie wpływa na działanie ostrzeżeń.
"""
import json
import logging
import sqlite3
import subprocess
import threading
import time
import zlib
from datetime import datetime, timedelta, timezone

from . import config, db

log = logging.getLogger("alert_log")

ARCHIVE_PATH = config.DATA_DIR / "archiwum.db"
ARCHIVE_DAYS = 30
MAX_SIGNALS = 25


def _version() -> str:
    try:
        return subprocess.run(["git", "-C", str(config.PROJECT_DIR), "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True, timeout=5).stdout.strip() or "?"
    except Exception:                              # noqa: BLE001
        return "?"


VERSION = _version()


def composition(signals: list[dict]) -> list[dict]:
    """Skład wyniku: co i ile wniosło, łącznie z wpisami wyzerowanymi."""
    out = []
    for s in (signals or [])[:MAX_SIGNALS]:
        d = s.get("details") or {}
        item = {"id": s.get("id"), "ts": s.get("ts"), "source": s.get("source"),
                "type": s.get("event_type"), "voiv": s.get("voivodeship"),
                "title": (s.get("title") or "")[:140], "points": s.get("points"),
                "counted": s.get("counted_points")}
        for flag in ("weight", "cleared", "relay_of", "retrospective", "official_clear",
                     "article_status", "duplicate_of_official", "alert_ended"):
            if s.get(flag) not in (None, False, 0, ""):
                item[flag] = s.get(flag) if not isinstance(s.get(flag), dict) else str(s.get(flag))[:80]
        for key in ("rso_id", "track_id", "eta_alarm", "dist_km", "oblast", "group", "level"):
            if d.get(key) not in (None, ""):
                item[key] = d.get(key)
        out.append(item)
    return out


def record_transition(voiv: str, old_level: str, new_level: str, st: dict, decision: str) -> int | None:
    """Zapis zmiany poziomu powiadomień. Zwraca id wiersza do uzupełnienia doręczeniem."""
    try:
        signals = st.get("signals") or []
        rso_ids = sorted({str((s.get("details") or {}).get("rso_id")) for s in signals
                          if s.get("event_type") == "rso_alert"
                          and (s.get("details") or {}).get("rso_id")})
        return db.add_alert_log(
            voivodeship=voiv, old_level=old_level, new_level=new_level,
            score=st.get("score"), own_score=st.get("own_score"), decision=decision,
            composition=composition(signals), rso_ids=rso_ids, version=VERSION)
    except Exception as exc:                       # noqa: BLE001
        log.warning("dziennik alarmów (%s): %s", voiv, exc)
        return None


def record_delivery(log_id: int | None, decision: str, delivery: dict) -> None:
    if not log_id:
        return
    try:
        db.update_alert_log(log_id, decision, delivery)
    except Exception as exc:                       # noqa: BLE001
        log.warning("dziennik alarmów, doręczenie #%s: %s", log_id, exc)


# ── archiwum migawek ─────────────────────────────────────────────────────────────
_lock = threading.Lock()
_conn: sqlite3.Connection | None = None
_last_prune = 0.0


def _archive() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(ARCHIVE_PATH, check_same_thread=False)
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("CREATE TABLE IF NOT EXISTS snap (ts TEXT PRIMARY KEY, z BLOB NOT NULL)")
    return _conn


def archive_snapshot(payload: dict, ts: str | None = None) -> None:
    global _last_prune
    try:
        blob = zlib.compress(json.dumps(payload, ensure_ascii=False).encode(), 6)
        with _lock:
            conn = _archive()
            conn.execute("INSERT OR REPLACE INTO snap (ts, z) VALUES (?, ?)", (ts or db.now_iso(), blob))
            if time.time() - _last_prune > 3600:
                _last_prune = time.time()
                cutoff = (datetime.now(timezone.utc) - timedelta(days=ARCHIVE_DAYS)).isoformat(timespec="seconds")
                conn.execute("DELETE FROM snap WHERE ts < ?", (cutoff,))
            conn.commit()
    except Exception as exc:                       # noqa: BLE001
        log.warning("archiwum migawek: %s", exc)


def archived_snapshot(at_iso: str) -> dict | None:
    """Najbliższa migawka nie późniejsza niż `at_iso` — do analizy skarg."""
    with _lock:
        row = _archive().execute("SELECT ts, z FROM snap WHERE ts <= ? ORDER BY ts DESC LIMIT 1",
                                 (at_iso,)).fetchone()
    if not row:
        return None
    return {"ts": row[0], **json.loads(zlib.decompress(row[1]))}
