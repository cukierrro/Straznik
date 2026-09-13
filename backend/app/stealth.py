"""Dziennik obserwacji w trybie stealth — wyłącznie do analizy, bez UI i bez punktów.

Zbieramy materiał do przyszłego trybu prognozy schematu uderzeń:
  qra_article    — artykuł o poderwaniu lotnictwa (także zagraniczny, z flagą),
  qra_wave       — fala artykułów z kilku redakcji (krajowa, północ, zagraniczna),
  air_support    — tankowce, AWACS i rozpoznanie nad regionem (próbki trasy).

Osobny plik bazy: dziennik nie puchnie w głównej bazie sygnałów, a jego utrata
nie wpływa na działanie ostrzeżeń. Każdy błąd zapisu jest połykany z logiem.
"""
import json
import logging
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone

from . import config

log = logging.getLogger("stealth")
DB_PATH = config.DATA_DIR / "obserwacje.db"

# Ile trzymamy: próbki tras są liczne, artykuły i fale — rzadkie i cenne.
RETENTION_DAYS = {"air_support": 180}
DEFAULT_RETENTION_DAYS = 730

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None
_last_prune = 0.0
status = {"records_24h": {}, "error": None}

SCHEMA = """
CREATE TABLE IF NOT EXISTS obs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    data TEXT NOT NULL,
    UNIQUE(kind, key)
);
CREATE INDEX IF NOT EXISTS obs_kind_ts ON obs(kind, ts);
"""


def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.executescript(SCHEMA)
    return _conn


def _iso(ts: float | datetime | None) -> str:
    if ts is None:
        dt = datetime.now(timezone.utc)
    elif isinstance(ts, datetime):
        dt = ts.astimezone(timezone.utc)
    else:
        dt = datetime.fromtimestamp(ts, timezone.utc)
    return dt.isoformat(timespec="seconds")


def record(kind: str, key: str, data: dict, ts: float | datetime | None = None) -> bool:
    """Zapisuje obserwację; True, gdy nowa (klucz nie był widziany)."""
    try:
        with _lock:
            cur = _db().execute(
                "INSERT OR IGNORE INTO obs (ts, kind, key, data) VALUES (?,?,?,?)",
                (_iso(ts), kind, key, json.dumps(data, ensure_ascii=False)))
            _db().commit()
            new = cur.rowcount > 0
        if new:
            _maybe_prune()
        return new
    except Exception as exc:                      # noqa: BLE001
        status["error"] = repr(exc)
        log.warning("stealth: zapis %s nieudany: %s", kind, exc)
        return False


def query(kind: str, since_minutes: float) -> list[dict]:
    cutoff = _iso(datetime.now(timezone.utc) - timedelta(minutes=since_minutes))
    try:
        with _lock:
            rows = _db().execute(
                "SELECT ts, key, data FROM obs WHERE kind=? AND ts>=? ORDER BY ts",
                (kind, cutoff)).fetchall()
        return [{"ts": ts, "key": key, **json.loads(data)} for ts, key, data in rows]
    except Exception as exc:                      # noqa: BLE001
        status["error"] = repr(exc)
        return []


def _maybe_prune() -> None:
    global _last_prune
    now = time.time()
    if now - _last_prune < 3600:
        return
    _last_prune = now
    try:
        with _lock:
            conn = _db()
            kinds = [k for (k,) in conn.execute("SELECT DISTINCT kind FROM obs")]
            for kind in kinds:
                days = RETENTION_DAYS.get(kind, DEFAULT_RETENTION_DAYS)
                cutoff = _iso(datetime.now(timezone.utc) - timedelta(days=days))
                conn.execute("DELETE FROM obs WHERE kind=? AND ts<?", (kind, cutoff))
            conn.commit()
            cutoff = _iso(datetime.now(timezone.utc) - timedelta(hours=24))
            status["records_24h"] = dict(conn.execute(
                "SELECT kind, COUNT(*) FROM obs WHERE ts>=? GROUP BY kind", (cutoff,)).fetchall())
    except Exception as exc:                      # noqa: BLE001
        status["error"] = repr(exc)


# ── Wsparcie lotnictwa: tankowce, AWACS, rozpoznanie ───────────────────────────
# Kody typów ICAO z /v2/mil (pole `desc` bywa puste). B762 i A332 to też
# samoloty pasażerskie, ale do tej funkcji trafiają tylko rekordy już uznane
# za wojskowe (flaga rejestru albo _looks_military).
AIR_SUPPORT_TYPES = {
    "K35R": "tanker", "K35E": "tanker", "KC10": "tanker", "K46": "tanker",
    "KC46": "tanker", "B762": "tanker", "A332": "tanker", "A339": "tanker",
    "MRTT": "tanker", "A400": "tanker_transport", "C130": "transport",
    "E3TF": "awacs", "E3CF": "awacs", "E737": "awacs", "E2": "awacs",
    "R135": "isr", "RC135": "isr", "P8": "isr", "Q4": "isr", "RQ4": "isr",
    "MQ9": "isr", "GLF5": "isr", "GL5T": "isr", "CL60": "isr", "DH8C": "isr",
}
# Region zainteresowania: Polska, Bałtyk, państwa bałtyckie, Rumunia i zachód
# Morza Czarnego — tam krążą maszyny wspierające dyżury nad wschodnią flanką.
AIR_SUPPORT_BBOX = (43.0, 60.5, 12.0, 32.0)   # lat_min, lat_max, lon_min, lon_max
AIR_SUPPORT_SAMPLE_S = 300
_air_last: dict[str, float] = {}


def air_support_role(ac: dict) -> str | None:
    t = str(ac.get("t") or ac.get("type") or "").upper().replace("-", "")
    return AIR_SUPPORT_TYPES.get(t)


def observe_air_support(aircraft: list[dict], now: float | None = None) -> int:
    """Próbka trasy co 5 min na maszynę. Zwraca liczbę zapisanych próbek."""
    now = now or time.time()
    lat_min, lat_max, lon_min, lon_max = AIR_SUPPORT_BBOX
    saved = 0
    for ac in aircraft:
        role = air_support_role(ac)
        lat, lon = ac.get("lat"), ac.get("lon")
        if not role or lat is None or lon is None:
            continue
        if not (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max):
            continue
        hexid = str(ac.get("hex") or "").lower() or f"cs:{(ac.get('flight') or '').strip()}"
        if now - _air_last.get(hexid, 0) < AIR_SUPPORT_SAMPLE_S:
            continue
        _air_last[hexid] = now
        bucket = int(now // AIR_SUPPORT_SAMPLE_S)
        if record("air_support", f"{hexid}:{bucket}", {
            "hex": hexid, "role": role, "type": ac.get("t"),
            "callsign": (ac.get("flight") or "").strip(), "reg": ac.get("r"),
            "op": ac.get("ownOp"), "lat": lat, "lon": lon, "alt": ac.get("alt_baro"),
            "gs": ac.get("gs"), "track": ac.get("track"),
        }, now):
            saved += 1
    if len(_air_last) > 5000:
        for k, v in list(_air_last.items()):
            if now - v > 3600:
                _air_last.pop(k, None)
    return saved


def air_support_summary(minutes: float = 90) -> dict:
    """Ile różnych maszyn wsparcia widziano ostatnio — kontekst do fal QRA."""
    roles: dict[str, set] = {}
    for row in query("air_support", minutes):
        roles.setdefault(row.get("role") or "?", set()).add(row.get("hex"))
    return {role: len(hexes) for role, hexes in roles.items()}
