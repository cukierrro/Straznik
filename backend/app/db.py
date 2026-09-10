"""SQLite: log sygnałów, próbki ADS-B, subskrypcje push, log powiadomień.

sqlite3 w trybie WAL + krótkie transakcje; wywołania z asyncio przez
asyncio.to_thread nie są konieczne przy tej skali (pojedyncze inserty)."""
import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

from . import config

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    source TEXT NOT NULL,          -- neptun|adsb|pansa|media|rcb
    event_type TEXT NOT NULL,
    voivodeship TEXT,
    points REAL NOT NULL,
    title TEXT,
    details TEXT,                  -- JSON
    dedup_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(ts);
CREATE TABLE IF NOT EXISTS adsb_samples (
    ts TEXT NOT NULL,
    voivodeship TEXT NOT NULL,
    mil_count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adsb_ts ON adsb_samples(ts);
CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    sub_json TEXT NOT NULL,
    created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notif_log (
    ts TEXT NOT NULL,
    voivodeship TEXT NOT NULL,
    level TEXT NOT NULL
);
-- migawki mapy do przeglądania wstecz (12 h)
CREATE TABLE IF NOT EXISTS snapshots (
    ts TEXT PRIMARY KEY,
    payload TEXT NOT NULL         -- JSON: {threats:[...], aircraft:[...]}
);
CREATE INDEX IF NOT EXISTS idx_snap_ts ON snapshots(ts);
-- krótkotrwałe obce maszyny mogą pojawić się między migawkami mapy
CREATE TABLE IF NOT EXISTS adsb_watch_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    hex TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adsb_watch_ts ON adsb_watch_events(ts);
CREATE TABLE IF NOT EXISTS escalation_shadow_state (
    voivodeship TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS escalation_shadow_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    voivodeship TEXT NOT NULL,
    kind TEXT NOT NULL,
    band REAL,
    score REAL NOT NULL,
    qualified REAL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_escalation_shadow_ts ON escalation_shadow_events(ts);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init():
    global _conn
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    _conn.execute("PRAGMA journal_mode=WAL")
    _conn.executescript(SCHEMA)
    _conn.commit()


def add_signal(source: str, event_type: str, voivodeship: str | None, points: float,
               title: str, details: dict, dedup_key: str) -> bool:
    """Zwraca True, jeśli sygnał jest nowy (nie było duplikatu)."""
    with _lock:
        try:
            _conn.execute(
                "INSERT INTO signals (ts, source, event_type, voivodeship, points, title, details, dedup_key)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (now_iso(), source, event_type, voivodeship, points, title,
                 json.dumps(details, ensure_ascii=False), dedup_key),
            )
            _conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False


def signals_since(minutes: int) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat(timespec="seconds")
    with _lock:
        rows = _conn.execute(
            "SELECT id, ts, source, event_type, voivodeship, points, title, details"
            " FROM signals WHERE ts >= ? ORDER BY ts DESC", (cutoff,),
        ).fetchall()
    out = []
    for r in rows:
        out.append({
            "id": r[0], "ts": r[1], "source": r[2], "event_type": r[3],
            "voivodeship": r[4], "points": r[5], "title": r[6],
            "details": json.loads(r[7]) if r[7] else {},
        })
    return out


def recent_signals(limit: int = 200) -> list[dict]:
    with _lock:
        rows = _conn.execute(
            "SELECT id, ts, source, event_type, voivodeship, points, title, details"
            " FROM signals ORDER BY id DESC LIMIT ?", (limit,),
        ).fetchall()
    return [{
        "id": r[0], "ts": r[1], "source": r[2], "event_type": r[3],
        "voivodeship": r[4], "points": r[5], "title": r[6],
        "details": json.loads(r[7]) if r[7] else {},
    } for r in rows]


def add_adsb_sample(voiv: str, count: int):
    with _lock:
        _conn.execute("INSERT INTO adsb_samples (ts, voivodeship, mil_count) VALUES (?,?,?)",
                      (now_iso(), voiv, count))
        # sprzątanie starszych niż 14 dni
        cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat(timespec="seconds")
        _conn.execute("DELETE FROM adsb_samples WHERE ts < ?", (cutoff,))
        _conn.commit()


def adsb_baseline(voiv: str, days: int) -> float:
    """Średni ruch wojskowy o TEJ PORZE DOBY z ostatnich `days` dni.

    Średnia z całej doby myliłaby noc z dniem: gdy nocą nad regionem nie ma nic,
    a po południu lata kilka maszyn, dobowa średnia wypada tak nisko, że każde
    normalne popołudnie przekracza próg „dwukrotnie więcej niż zwykle”. Porównanie
    godziny z tymi samymi godzinami z poprzednich dni usuwa ten fałszywy alarm.

    Gdy dla danej godziny nie ma jeszcze próbek (świeża instalacja), schodzimy do
    średniej dobowej — lepsza zgrubna wartość niż brak porównania.
    """
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days)).isoformat(timespec="seconds")
    hour = f"{now.hour:02d}"
    with _lock:
        row = _conn.execute(
            "SELECT AVG(mil_count) FROM adsb_samples "
            "WHERE voivodeship=? AND ts >= ? AND substr(ts, 12, 2) = ?",
            (voiv, cutoff, hour),
        ).fetchone()
        if row and row[0] is not None:
            return float(row[0])
        row = _conn.execute(
            "SELECT AVG(mil_count) FROM adsb_samples WHERE voivodeship=? AND ts >= ?",
            (voiv, cutoff),
        ).fetchone()
    return float(row[0]) if row and row[0] is not None else 0.0


def add_snapshot(payload: dict, keep_hours: int = 12):
    with _lock:
        _conn.execute("INSERT OR REPLACE INTO snapshots (ts, payload) VALUES (?,?)",
                      (now_iso(), json.dumps(payload, ensure_ascii=False)))
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=keep_hours)).isoformat(timespec="seconds")
        _conn.execute("DELETE FROM snapshots WHERE ts < ?", (cutoff,))
        _conn.commit()


def add_adsb_watch_event(kind: str, aircraft: dict, keep_hours: int = 12):
    """Trwały ślad wejścia/wyjścia obcej maszyny; zero wpływu na punktację."""
    ts = now_iso()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=keep_hours)).isoformat(timespec="seconds")
    with _lock:
        _conn.execute("INSERT INTO adsb_watch_events (ts, kind, hex, payload) VALUES (?,?,?,?)",
                      (ts, kind, str(aircraft.get("hex") or ""),
                       json.dumps(aircraft, ensure_ascii=False)))
        _conn.execute("DELETE FROM adsb_watch_events WHERE ts < ?", (cutoff,))
        _conn.commit()


def adsb_watch_events(hours: int = 12) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
    with _lock:
        rows = _conn.execute(
            "SELECT ts, kind, hex, payload FROM adsb_watch_events WHERE ts >= ? ORDER BY ts",
            (cutoff,)).fetchall()
    return [{"ts": r[0], "kind": r[1], "hex": r[2], **json.loads(r[3])} for r in rows]


def snapshot_times(hours: int = 12) -> list[str]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
    with _lock:
        rows = _conn.execute("SELECT ts FROM snapshots WHERE ts >= ? ORDER BY ts",
                             (cutoff,)).fetchall()
    return [r[0] for r in rows]


def all_snapshots(hours: int = 12) -> list[dict]:
    """Wszystkie migawki z ostatnich N h w JEDNYM zapytaniu — pod pobranie hurtem
    (`/api/history/bundle`), żeby klient przewijał historię lokalnie zamiast pytać
    serwer o każdą pozycję suwaka."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
    with _lock:
        rows = _conn.execute("SELECT ts, payload FROM snapshots WHERE ts >= ? ORDER BY ts",
                             (cutoff,)).fetchall()
    return [{"ts": r[0], **json.loads(r[1])} for r in rows]


def snapshot_at(ts: str) -> dict | None:
    """Najbliższa migawka nie późniejsza niż podany moment."""
    with _lock:
        row = _conn.execute(
            "SELECT ts, payload FROM snapshots WHERE ts <= ? ORDER BY ts DESC LIMIT 1",
            (ts,)).fetchone()
        if row is None:
            row = _conn.execute(
                "SELECT ts, payload FROM snapshots ORDER BY ts LIMIT 1").fetchone()
    if row is None:
        return None
    return {"ts": row[0], **json.loads(row[1])}


def signals_between(start: str, end: str) -> list[dict]:
    with _lock:
        rows = _conn.execute(
            "SELECT id, ts, source, event_type, voivodeship, points, title, details"
            " FROM signals WHERE ts >= ? AND ts <= ? ORDER BY ts DESC", (start, end)).fetchall()
    return [{"id": r[0], "ts": r[1], "source": r[2], "event_type": r[3],
             "voivodeship": r[4], "points": r[5], "title": r[6],
             "details": json.loads(r[7]) if r[7] else {}} for r in rows]


def add_push_sub(sub: dict, voivodeships: list[str]):
    stored = {**sub, "_voivodeships": sorted(set(voivodeships))}
    with _lock:
        _conn.execute(
            "INSERT OR REPLACE INTO push_subs (endpoint, sub_json, created) VALUES (?,?,?)",
            (sub.get("endpoint", ""), json.dumps(stored), now_iso()),
        )
        _conn.commit()


def remove_push_sub(endpoint: str):
    with _lock:
        _conn.execute("DELETE FROM push_subs WHERE endpoint=?", (endpoint,))
        _conn.commit()


def all_push_subs(voivodeship: str | None = None) -> list[dict]:
    with _lock:
        rows = _conn.execute("SELECT sub_json FROM push_subs").fetchall()
    out = []
    for row in rows:
        sub = json.loads(row[0])
        assigned = sub.pop("_voivodeships", None)
        # Legacy records had no region and must not receive nationwide alerts.
        # The frontend upgrades an existing browser subscription on its next
        # visit, without asking the user for notification permission again.
        if voivodeship is None or (isinstance(assigned, list) and voivodeship in assigned):
            out.append(sub)
    return out


def last_notif(voiv: str, level: str):
    with _lock:
        row = _conn.execute(
            "SELECT MAX(ts) FROM notif_log WHERE voivodeship=? AND level=?",
            (voiv, level),
        ).fetchone()
    return row[0] if row else None


def log_notif(voiv: str, level: str):
    with _lock:
        _conn.execute("INSERT INTO notif_log (ts, voivodeship, level) VALUES (?,?,?)",
                      (now_iso(), voiv, level))
        _conn.commit()


def load_escalation_shadow_state(voiv: str) -> dict | None:
    with _lock:
        row = _conn.execute(
            "SELECT payload FROM escalation_shadow_state WHERE voivodeship=?", (voiv,),
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row[0])
    except (TypeError, json.JSONDecodeError):
        return None


def save_escalation_shadow_state(voiv: str, payload: dict):
    with _lock:
        _conn.execute(
            "INSERT OR REPLACE INTO escalation_shadow_state"
            " (voivodeship,payload,updated) VALUES (?,?,?)",
            (voiv, json.dumps(payload, ensure_ascii=False), now_iso()),
        )
        _conn.commit()


def log_escalation_shadow_event(voiv: str, kind: str, score: float,
                                qualified: float | None, band: float | None,
                                payload: dict, keep_days: int = 14):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=keep_days)).isoformat(timespec="seconds")
    with _lock:
        _conn.execute(
            "INSERT INTO escalation_shadow_events"
            " (ts,voivodeship,kind,band,score,qualified,payload) VALUES (?,?,?,?,?,?,?)",
            (now_iso(), voiv, kind, band, score, qualified,
             json.dumps(payload, ensure_ascii=False)),
        )
        _conn.execute("DELETE FROM escalation_shadow_events WHERE ts < ?", (cutoff,))
        _conn.commit()


def escalation_shadow_events(hours: int = 48) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
    with _lock:
        rows = _conn.execute(
            "SELECT ts,voivodeship,kind,band,score,qualified,payload"
            " FROM escalation_shadow_events WHERE ts >= ? ORDER BY ts", (cutoff,),
        ).fetchall()
    return [{"ts": r[0], "voivodeship": r[1], "kind": r[2], "band": r[3],
             "score": r[4], "qualified": r[5], "payload": json.loads(r[6])}
            for r in rows]
