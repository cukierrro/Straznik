"""Wlot na Białoruś — tryb cienia (16.09.2026). Bez punktów, bez mapy, bez powiadomień.

Białoruś to dla nas czarna plama: ukraińskie kanały monitoringu (a za nimi NEPTUN)
kończą śledzenie drona na granicy, a Hajun nie działa od lutego 2025. Z danych, które
już mamy, da się jednak zobaczyć moment wlotu:

  inside    — NEPTUN podał pozycję wewnątrz obrysu Białorusi (pierwszy raz dla tracka),
  vanished  — track zniknął do 25 km od granicy białoruskiej (po stronie UA), a ostatni
              kurs prowadził w stronę Białorusi.

Dla każdego wlotu zapisujemy do obserwacje.db (kind „by_entry”) kurs i jego źródło,
odległość do granicy Polski, czy kurs prowadzi na Polskę i szacowany czas dolotu przy
prędkości typowej dla klasy. Po kilku atakach porównamy to z alarmami w Polsce
(RSO/RCB, DORSZ) i z mediami białoruskimi (collectors/by_media_shadow.py). Informację
„wleciał na Białoruś” w aplikacji włączymy dopiero po tym porównaniu.
"""
import json
import logging
import math
import time

from . import config, geo, stealth

log = logging.getLogger("by_entry_shadow")

EDGE_KM = 25.0            # „zniknął przy granicy”: do tylu km od obrysu Białorusi
TOWARD_BY_DEG = 70.0      # kurs w stronę najbliższego punktu granicy BY (±)
TOWARD_PL_DEG = 60.0      # kurs w stronę najbliższego punktu granicy PL (±)
MEMORY_S = 6 * 3600

status = {"entries": 0, "last": [], "error": None, "rings": 0}
_last: dict[str, dict] = {}       # track id → ostatnia obserwacja
_inside: set[str] = set()         # tracki już zapisane jako „inside”


def _load_rings() -> list[list[tuple[float, float]]]:
    try:
        path = config.FRONTEND_DIR / "assets" / "kraje-v2.geojson"
        data = json.loads(path.read_text(encoding="utf-8"))
        feat = next(f for f in data["features"] if f["properties"].get("iso") == "BLR")
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        rings = [[(la, lo) for lo, la in poly[0]] for poly in polys]
        status["rings"] = len(rings)
        return rings
    except Exception as exc:                      # noqa: BLE001
        status["error"] = f"obrys BY: {exc!r}"
        log.warning("brak obrysu Białorusi: %r", exc)
        return []


BY_RINGS = _load_rings()


def in_belarus(lat: float, lon: float) -> bool:
    return any(geo.point_in_ring(lat, lon, r) for r in BY_RINGS)


def nearest_by_point(lat: float, lon: float) -> tuple[float, float, float] | None:
    """(dist_km, lat, lon) najbliższego punktu granicy Białorusi (rzut płaski, jak geo)."""
    kx = math.cos(math.radians(lat))
    best = None
    for ring in BY_RINGS:
        n = len(ring)
        for i in range(n):
            a, b = ring[i], ring[(i + 1) % n]
            ax, ay = (a[1] - lon) * kx, a[0] - lat
            dx, dy = (b[1] - a[1]) * kx, b[0] - a[0]
            den = dx * dx + dy * dy
            tt = 0.0 if den == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / den))
            d2 = (ax + dx * tt) ** 2 + (ay + dy * tt) ** 2
            if best is None or d2 < best[0]:
                best = (d2, a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt)
    if best is None:
        return None
    return geo.haversine_km(lat, lon, best[1], best[2]), best[1], best[2]


def _heading(t: dict) -> tuple[float | None, str]:
    """Kurs z ruchu ma pierwszeństwo (audyt G3: domniemany mylił się o medianę 90°)."""
    if t.get("heading_movement") is not None:
        return float(t["heading_movement"]), "measured"
    if t.get("heading") is not None:
        return float(t["heading"]), "presumptive" if t.get("presumptiveCourse") is True else "reported"
    return None, "unknown"


def _speed(t: dict) -> float | None:
    v = (t.get("velocity") or {}).get("speedKmh")
    if isinstance(v, (int, float)) and v > 0:
        return float(v)
    if t.get("straznik_jet"):
        return config.NEPTUN_JET_SPEED_KMH
    return config.NEPTUN_TYPE_SPEED_KMH.get((t.get("type") or "").lower())


def _snapshot(t: dict, now: float) -> dict:
    hdg, src = _heading(t)
    return {"id": str(t.get("id")), "lat": t.get("lat"), "lon": t.get("lon"), "at": now,
            "type": t.get("type"), "heading": hdg, "heading_source": src,
            "speed_kmh": _speed(t), "count": t.get("count"),
            "position_quality": ((t.get("source_metadata") or {}).get("source_fields") or {})
            .get("positionQuality") or t.get("positionQuality"),
            "region": (t.get("regionName") or "")[:80], "confidence": t.get("confidenceLevel")}


def _record(phase: str, snap: dict, now: float, extra: dict | None = None) -> None:
    lat, lon = snap["lat"], snap["lon"]
    pl_km, plat, plon, voiv = geo.nearest_outline_point(lat, lon)
    brg_pl = geo.bearing_deg(lat, lon, plat, plon)
    hdg = snap["heading"]
    speed = snap["speed_kmh"]
    data = {**snap, "phase": phase, "dist_pl_km": round(pl_km), "nearest_pl_voiv": voiv,
            "bearing_to_pl": round(brg_pl), "toward_pl": None if hdg is None
            else geo.angle_diff(hdg, brg_pl) <= TOWARD_PL_DEG,
            "eta_pl_min": round(pl_km / speed * 60) if speed else None,
            "seen": stealth._iso(now), "last_report": stealth._iso(snap["at"]), **(extra or {})}
    if stealth.record("by_entry", f"{snap['id']}:{phase}", data, ts=snap["at"]):
        status["entries"] += 1
        status["last"] = ([data] + status["last"])[:15]
        log.info("BY cień: %s %s %s kurs=%s(%s) do PL %s km, ETA %s min", phase, snap["id"],
                 snap["type"], hdg, snap["heading_source"], data["dist_pl_km"], data["eta_pl_min"])


def observe(t: dict, now: float | None = None) -> None:
    """Każda aktualizacja tracka NEPTUN (po _evaluate — potrzebny kurs z ruchu)."""
    if not BY_RINGS or t.get("lat") is None or t.get("lon") is None:
        return
    now = now or time.time()
    try:
        snap = _snapshot(t, now)
        tid = snap["id"]
        if in_belarus(snap["lat"], snap["lon"]):
            if tid not in _inside:
                _inside.add(tid)
                prev = _last.get(tid)
                _record("inside", snap, now, {"came_from": None if not prev else
                                              {"lat": prev["lat"], "lon": prev["lon"],
                                               "min_before": round((now - prev["at"]) / 60, 1)}})
        _last[tid] = snap
        if len(_last) > 3000:
            for k in [k for k, v in _last.items() if now - v["at"] > MEMORY_S]:
                _last.pop(k, None)
                _inside.discard(k)
    except Exception as exc:                      # noqa: BLE001
        status["error"] = repr(exc)[:200]


def removed(tid, now: float | None = None) -> None:
    """Track zniknął z NEPTUN-a (komunikat remove albo brak w pełnym snapshocie)."""
    now = now or time.time()
    snap = _last.pop(str(tid), None)
    was_inside = str(tid) in _inside
    _inside.discard(str(tid))
    if not snap or was_inside or not BY_RINGS:
        return
    try:
        near = nearest_by_point(snap["lat"], snap["lon"])
        if not near or near[0] > EDGE_KM or in_belarus(snap["lat"], snap["lon"]):
            return
        brg_by = geo.bearing_deg(snap["lat"], snap["lon"], near[1], near[2])
        hdg = snap["heading"]
        if hdg is None or geo.angle_diff(hdg, brg_by) > TOWARD_BY_DEG:
            return
        _record("vanished", snap, now, {"dist_by_km": round(near[0], 1),
                                        "bearing_to_by": round(brg_by),
                                        "silent_min": round((now - snap["at"]) / 60, 1)})
    except Exception as exc:                      # noqa: BLE001
        status["error"] = repr(exc)[:200]
