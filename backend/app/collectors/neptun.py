"""Warstwa 1 — Neptun (neptun.in.ua): WebSocket real-time + REST fallback.

Protokół WS: koperty {type, ts, data}, type ∈ snapshot|upsert|remove|heartbeat|alerts.
Warunek API: widoczna atrybucja "Dane: NEPTUN" w UI (jest w frontendzie).

Neptun to agregator crowdsourcingowy/OSINT — nie wojskowy radar. Zawsze
przekazujemy dalej confidenceLevel i uncertaintyKm, niczego nie "uściślamy".
"""
import asyncio
import json
import logging
import math
import time

import httpx
import websockets

from .. import config, fusion, geo

log = logging.getLogger("neptun")

# stan: aktywne tracki wg id (dla frontendu i CLI)
tracks: dict[str, dict] = {}
status = {"connected": False, "mode": "ws", "last_msg": None, "error": None}

# aktywne oficjalne alarmy powietrzne w obwodach UA (z ramek "alerts")
alert_oblasts: set[str] = set()


def _extract_oblast_names(data) -> set[str]:
    """Ramka alerts: {raions, oblasts} — elementy mogą być stringami lub dict-ami."""
    out = set()
    for item in (data or {}).get("oblasts") or []:
        if isinstance(item, str):
            out.add(item)
        elif isinstance(item, dict):
            for k in ("name", "region", "title", "oblast", "key"):
                if isinstance(item.get(k), str):
                    out.add(item[k])
                    break
    return out


async def _handle_alerts(data):
    """Alarm w obwodzie graniczącym z PL ⇒ +1 pkt dla przyległych województw
    (rising edge; oficjalny sygnał ukraińskiej OC, słabszy niż konkretny track)."""
    global alert_oblasts
    names = _extract_oblast_names(data)
    new_active = set()
    for name in names:
        for oblast, voivs in config.UA_BORDER_OBLASTS.items():
            if oblast in name:
                new_active.add(oblast)
                if oblast not in alert_oblasts:
                    hour_key = time.strftime("%Y-%m-%dT%H")
                    for voiv in voivs:
                        await fusion.ingest(
                            source="neptun", event_type="ua_alert_border",
                            voivodeship=voiv, points=config.POINTS["ua_alert_border"],
                            title=f"Alarm powietrzny w obwodzie {oblast} (graniczy z woj. {voiv})",
                            details={"oblast": oblast},
                            dedup_key=f"neptun_alert:{oblast}:{voiv}:{hour_key}",
                        )
    alert_oblasts = new_active


# Ostatnia znana pozycja tracka — do wyliczenia kursu, gdy NEPTUN go nie podaje.
_last_pos: dict[str, tuple[float, float]] = {}
_MIN_MOVE_KM = 2.0   # mniejsze przesunięcia to szum pozycji (±km niepewności)


def _heading_of(t: dict) -> float | None:
    """Kurs z danych, a gdy go brak — wyliczony z przesunięcia względem
    poprzedniej obserwacji tego samego obiektu. NEPTUN często nie podaje
    `heading` (tak przepadła rakieta 130 km od granicy), a kierunek lotu da się
    odtworzyć z kolejnych pozycji — to samo robi UI, rysując ślad."""
    h = t.get("heading")
    if h is not None:
        return h
    tid, lat, lon = t.get("id"), t.get("lat"), t.get("lon")
    prev = _last_pos.get(tid)
    if prev and geo.haversine_km(prev[0], prev[1], lat, lon) >= _MIN_MOVE_KM:
        est = geo.bearing_deg(prev[0], prev[1], lat, lon)
        t["heading_estimated"] = round(est, 1)
        return est
    return None


def _evaluate(t: dict) -> dict:
    """Dokleja do tracka ocenę względem granicy PL."""
    lat, lon = t.get("lat"), t.get("lon")
    if lat is None or lon is None:
        return t
    heading = _heading_of(t)
    a = geo.assess_threat(lat, lon, heading, config.NEPTUN_HEADING_TOLERANCE,
                          config.NEPTUN_HEADING_SOFT_DEG,
                          config.NEPTUN_UNKNOWN_HEADING_MULT,
                          config.NEPTUN_UNKNOWN_HEADING_MAX_KM)
    if t.get("id") is not None:
        _last_pos[t["id"]] = (lat, lon)
    t["pl_assessment"] = a
    region = t.get("region") or ""
    t["border_region"] = any(r in region for r in config.NEPTUN_BORDER_REGIONS)
    return t


def _dist_mult(km: float) -> float:
    """Mnożnik odległości z interpolacji liniowej po NEPTUN_DIST_CURVE —
    bez skoków na okrągłych kilometrach (patrz komentarz przy krzywej)."""
    pts = config.NEPTUN_DIST_CURVE
    if km <= pts[0][0]:
        return pts[0][1]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if km <= x2:
            return round(y1 + (y2 - y1) * (km - x1) / (x2 - x1), 4)
    return 0.0


def _source_mult(n: int) -> float:
    for limit, mult in config.NEPTUN_SOURCE_MULT:
        if n <= limit:
            return mult
    return config.NEPTUN_SOURCE_MULT_MAX


def score_threat(t: dict, dist_km: float, course_factor: float = 1.0) -> float:
    """Punkty za pojedynczy track: co leci, ile tego, jak blisko, jak pewnie.

    Zwraca 0 dla typów nieistotnych dla Polski (FPV) i dla obiektów spoza
    zasięgu. Wzór i kalibrację opisuje komentarz przy NEPTUN_TYPE_WEIGHTS.
    """
    weight = config.NEPTUN_TYPE_WEIGHTS.get((t.get("type") or "").lower(), 0.0)
    if weight <= 0 or dist_km >= config.NEPTUN_MAX_KM:
        return 0.0
    count = max(int(t.get("count") or 1), 1)
    conf = (t.get("confidenceLevel") or "low").lower()
    life = (t.get("lifecycle") or "uncertain").lower()
    sources = max(int(t.get("sourceCount") or 1), 1)
    points = (weight
              * math.sqrt(count)
              * _dist_mult(dist_km)
              * config.NEPTUN_CONF_MULT.get(conf, 0.35)
              * _source_mult(sources)
              * config.NEPTUN_LIFECYCLE_MULT.get(life, 0.85)
              # waga kursu: 1,0 przy locie na granicę, mniej przy skosie,
              # kara przy nieznanym kursie (patrz geo.course_factor)
              * course_factor)
    # Podłoga dla ciężkich typów tuż przy granicy — patrz NEPTUN_NEAR_FLOOR_*.
    # Skalowana pewnością kursu: przy nieznanym kursie (×0,5) podłoga też jest
    # połową, więc sam brak danych nie wywoła alarmu.
    if ((t.get("type") or "").lower() in config.NEPTUN_NEAR_FLOOR_TYPES
            and dist_km <= config.NEPTUN_NEAR_FLOOR_KM
            and sources >= config.NEPTUN_NEAR_FLOOR_SOURCES):
        points = max(points, config.NEPTUN_NEAR_FLOOR_POINTS * course_factor)
    return round(points, 2)


async def _maybe_signal(t: dict):
    """Reguła fuzji dla Neptuna: obiekt kursem na PL, punktowany wg wagi zagrożenia."""
    a = t.get("pl_assessment")
    if not a or not a["toward_pl"]:
        return
    points = score_threat(t, a["dist_km"], a.get("course_factor", 1.0))
    if points <= 0:
        return

    ttype = (t.get("type") or "").lower()
    count = max(int(t.get("count") or 1), 1)
    conf = (t.get("confidenceLevel") or "low").lower()
    sources = max(int(t.get("sourceCount") or 1), 1)
    ile = f"{count}× " if count > 1 else ""
    kurs_info = ("" if a.get("heading_known") else
                 (" [kurs szacowany z ruchu]" if t.get("heading_estimated") is not None
                  else " [kurs nieznany]"))
    title = (f"{ile}{t.get('title') or ttype} kursem na granicę PL, {a['dist_km']} km{kurs_info} "
             f"(woj. {a['border_voiv']}, confidence: {conf}, {sources} potwierdzeń, "
             f"±{t.get('uncertaintyKm', '?')} km)")
    # Poziom w kluczu deduplikacji: gdy obiekt się zbliży albo zyska potwierdzenia,
    # jego waga rośnie i sygnał ma prawo wejść ponownie z wyższą punktacją.
    tier = int(points * 2)
    await fusion.ingest(
        source="neptun", event_type="neptun_threat", voivodeship=a["border_voiv"],
        points=points, title=title,
        details={"track_id": t.get("id"), "type": ttype, "count": count,
                 "lat": t.get("lat"), "lon": t.get("lon"), "heading": t.get("heading"),
                 "confidence": conf, "source_count": sources,
                 "lifecycle": t.get("lifecycle"),
                 "uncertainty_km": t.get("uncertaintyKm"),
                 "dist_km": a["dist_km"], "region": t.get("region"),
                 "course": ("known" if a.get("heading_known") else
                            "estimated" if t.get("heading_estimated") is not None else "unknown"),
                 "course_factor": a.get("course_factor")},
        dedup_key=f"neptun:{t.get('id')}:t{tier}",
    )


async def _handle_threats(threats: list[dict], replace: bool):
    if replace:
        tracks.clear()
    for t in threats:
        t = _evaluate(t)
        tracks[t.get("id")] = t
        await _maybe_signal(t)
    if fusion.on_state_change:
        asyncio.create_task(fusion.on_state_change())


async def _ws_loop():
    backoff = 1
    while True:
        try:
            async with websockets.connect(
                config.NEPTUN_WS_URL, ping_interval=25, ping_timeout=15, max_size=8 * 2**20,
            ) as ws:
                status.update(connected=True, mode="ws", error=None)
                log.info("Neptun WS połączony")
                backoff = 1
                async for raw in ws:
                    status["last_msg"] = time.time()
                    try:
                        env = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    etype = env.get("type")
                    data = env.get("data") or {}
                    if etype == "snapshot":
                        await _handle_threats(data.get("threats") or [], replace=True)
                    elif etype == "upsert":
                        await _handle_threats([data], replace=False)
                    elif etype == "remove":
                        tracks.pop((data or {}).get("id"), None)
                        if fusion.on_state_change:
                            asyncio.create_task(fusion.on_state_change())
                    elif etype == "alerts":
                        await _handle_alerts(data)
                    # heartbeat — ignorujemy
        except Exception as e:
            status.update(connected=False, error=str(e))
            log.warning("Neptun WS rozłączony (%s), reconnect za %ss", e, backoff)
            await _rest_fallback_once()
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)


async def _rest_fallback_once():
    """Jednorazowy snapshot REST, gdy WS leży (nie częściej niż co 5 s wg API)."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(config.NEPTUN_REST_URL)
            r.raise_for_status()
            data = r.json()
            await _handle_threats(data.get("threats") or [], replace=True)
            status["mode"] = "rest-fallback"
            status["last_msg"] = time.time()
    except Exception as e:
        log.warning("Neptun REST fallback błąd: %s", e)


async def run():
    await _ws_loop()


def public_state() -> dict:
    """Stan dla frontendu: wszystkie aktywne tracki + ocena PL."""
    return {
        "status": {k: status[k] for k in ("connected", "mode", "last_msg")},
        "threats": list(tracks.values()),
        "alert_oblasts": sorted(alert_oblasts),
    }
