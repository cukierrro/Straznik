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
import random
import time
from datetime import datetime, timezone

import httpx
import websockets

from .. import config, fusion, geo
from ..neptun_archive import source_metadata

log = logging.getLogger("neptun")

# Nazwy źródłowe bywają ukraińskie/rosyjskie (np. „БпЛА”). Tytuł sygnału jest
# informacją dla polskiego użytkownika, więc opieramy go na stabilnym polu `type`.
THREAT_LABELS_PL = {
    "uav": "Dron / BpSP", "shahed": "Dron Shahed",
    "fpv": "Dron FPV (lokalny)", "missile": "Rakieta manewrująca",
    "cruise": "Rakieta manewrująca", "ballistic": "Rakieta balistyczna",
    "kab": "Kierowana bomba lotnicza (KAB)", "mig31k": "MiG-31K (nosiciel)",
    "recon": "Dron rozpoznawczy",
}


def threat_label_pl(threat_type: str) -> str:
    return THREAT_LABELS_PL.get((threat_type or "").lower(), "Obiekt powietrzny")

# stan: aktywne tracki wg id (dla frontendu i CLI)
tracks: dict[str, dict] = {}
status = {"connected": False, "mode": "ws", "last_msg": None, "error": None}

# aktywne oficjalne alarmy powietrzne w obwodach UA (z ramek "alerts")
alert_oblasts: set[str] = set()


_ALERT_LEVELS_OFF = {"none", "green", "off", "clear", "no", "false"}


def _extract_oblast_names(data) -> set[str]:
    """Obwody z aktywnym alarmem powietrznym — z pól `oblasts` ORAZ `raions`.

    Samo `oblasts` nie dawało nic: NEPTUN trzyma tam wyłącznie obwody okupowane
    (Krym i Ługańsk mają alarm od 2022), więc od 02.08.2026 nie powstał ani jeden
    sygnał `ua_alert_border`. Alarmy zachodniej Ukrainy przychodzą w tej samej
    ramce jako `raions` — rejon z poziomem i powodem („Ракетна загроза”) — i
    niosą nazwę swojego obwodu w polu `oblast` (audyt 11.09.2026).
    """
    out = set()
    for field in ("oblasts", "raions"):
        for item in (data or {}).get(field) or []:
            if isinstance(item, str):
                out.add(item)
                continue
            if not isinstance(item, dict):
                continue
            if str(item.get("level") or "").lower() in _ALERT_LEVELS_OFF:
                continue
            # „oblast" pierwsze: dla rejonu chcemy nazwę OBWODU, nie rejonu
            for k in ("oblast", "name", "region", "title", "key"):
                if isinstance(item.get(k), str) and item[k]:
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
                            # OSOBNA klasa źródła: w klasie „neptun" (limit 8,0)
                            # trzy obwody naraz dawały 3,0 pkt i żółty alarm bez
                            # ani jednego obiektu na mapie (audyt 11.09.2026).
                            source="ua_alert", event_type="ua_alert_border",
                            voivodeship=voiv, points=config.POINTS["ua_alert_border"],
                            title=("Alarm powietrzny w obwodzie "
                                   f"{config.UA_OBLAST_PL.get(oblast, oblast)} "
                                   f"(graniczy z woj. {voiv})"),
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


def _position_info(t: dict) -> dict:
    """Konserwatywna ocena precyzji bez nadpisywania pól NEPTUN-a.

    `confirmed` może potwierdzać sam meldunek, nie pomiar współrzędnych. Dlatego
    znany punkt katalogowy miejscowości klasyfikujemy osobno jako rejonowy.
    """
    quality = (t.get("positionQuality")
               or ((t.get("source_metadata") or {}).get("source_fields") or {})
               .get("positionQuality"))
    if str(quality or "").lower() == "approx" or t.get("areaOnly") is True:
        return {"quality": "approx", "reason": "source_approx"}
    lat, lon = t.get("lat"), t.get("lon")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        for anchor in config.NEPTUN_LOCALITY_ANCHORS:
            if geo.haversine_km(lat, lon, anchor["lat"], anchor["lon"]) \
                    <= config.NEPTUN_LOCALITY_ANCHOR_TOLERANCE_KM:
                return {"quality": "approx", "reason": "locality_center",
                        "locality": anchor["name"]}
    return {"quality": "point", "reason": "source_point"}


def _is_approx_position(t: dict) -> bool:
    """Pozycja rejonowa jawna w źródle albo rozpoznana lokalnie."""
    derived = t.get("straznik_position")
    return (derived or _position_info(t)).get("quality") == "approx"


def _position_factor(t: dict) -> float:
    info = t.get("straznik_position") or _position_info(t)
    return config.NEPTUN_POSITION_MULT.get(info.get("reason", "point"), 1.0)


def _physical_key(t: dict) -> str:
    """Nie traktuj nowego ID w tym samym rejonowym punkcie jak nowego obiektu."""
    if _is_approx_position(t) and t.get("lat") is not None and t.get("lon") is not None:
        return (f"area:{(t.get('type') or 'unknown').lower()}:"
                f"{float(t['lat']):.3f}:{float(t['lon']):.3f}")
    return f"track:{t.get('id')}"


def _area_distance_label(km: float) -> str:
    if km < 10:
        return "mniej niż 10 km"
    return f"około {int(round(km / 10.0) * 10)} km"


def _evaluate(t: dict) -> dict:
    """Dokleja do tracka ocenę względem granicy PL."""
    lat, lon = t.get("lat"), t.get("lon")
    if lat is None or lon is None:
        return t
    t["straznik_position"] = _position_info(t)
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
              * _position_factor(t)
              # waga kursu: 1,0 przy locie na granicę, mniej przy skosie,
              # kara przy nieznanym kursie (patrz geo.course_factor)
              * course_factor)
    # Podłoga dla ciężkich typów tuż przy granicy — patrz NEPTUN_NEAR_FLOOR_*.
    # Skalowana pewnością kursu: przy nieznanym kursie (×0,5) podłoga też jest
    # połową, więc sam brak danych nie wywoła alarmu.
    if (not _is_approx_position(t)
            and (t.get("type") or "").lower() in config.NEPTUN_NEAR_FLOOR_TYPES
            and dist_km <= config.NEPTUN_NEAR_FLOOR_KM
            and sources >= config.NEPTUN_NEAR_FLOOR_SOURCES):
        points = max(points, config.NEPTUN_NEAR_FLOOR_POINTS * course_factor)
    return round(points, 2)


def _speed_of(t: dict) -> float | None:
    """Prędkość obiektu: podana przez źródło, a gdy jej brak — typowa dla klasy.
    NEPTUN prędkości praktycznie nie podaje (sprawdzone na żywym API), więc
    w praktyce niemal zawsze pracujemy na wartości typowej. Dlatego czas dolotu
    prezentujemy jako SZACUNEK, nigdy jako pomiar."""
    v = (t.get("velocity") or {}).get("speedKmh")
    if isinstance(v, (int, float)) and v > 0:
        return float(v)
    return config.NEPTUN_TYPE_SPEED_KMH.get((t.get("type") or "").lower())


def _eta_per_voiv(t: dict) -> dict:
    """Czas dolotu do każdego województwa (minuty). Liczone raz przy sygnale,
    żeby powiadomienie dla danego regionu mogło podać JEGO czas."""
    if _is_approx_position(t):
        return {}
    sp = _speed_of(t)
    lat, lon = t.get("lat"), t.get("lon")
    if not sp or lat is None or lon is None:
        return {}
    out = {}
    for v in config.VOIVODESHIPS:
        d = geo.dist_to_voiv_km(lat, lon, v)
        e = geo.eta_minutes(d, sp, config.NEPTUN_ETA_BUFFER_MIN)
        if e is not None:
            out[v] = e
    return out


def _eta_alarm_level(a: dict, sources: int, confidence: str,
                     eta_safe: float | None, *, approximate: bool = False) -> str | None:
    """Poziom ETA po wszystkich bezpiecznikach jakości danych."""
    eligible = (not approximate and a.get("heading_known")
                and sources >= config.NEPTUN_ETA_MIN_SOURCES
                and confidence in config.NEPTUN_ETA_CONFIDENCE and eta_safe is not None)
    if not eligible:
        return None
    if eta_safe <= config.NEPTUN_ETA_HIGH_MIN:
        return "high"
    if eta_safe <= config.NEPTUN_ETA_ELEVATED_MIN:
        return "elevated"
    return None


def _reconnect_wait(exc: Exception, backoff: float) -> tuple[float, float]:
    """(czas oczekiwania, następny backoff); 1013 dostaje 15–30 s jitteru."""
    overloaded = getattr(exc, "code", None) == 1013 or "server full" in str(exc).lower()
    if overloaded:
        return random.uniform(15, 30), 30
    return backoff, min(backoff * 2, 60)


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
    approximate = _is_approx_position(t)
    speed = None if approximate else _speed_of(t)
    eta_raw = geo.eta_raw_minutes(a["dist_km"], speed)
    eta_conservative = (max(0.0, eta_raw - config.NEPTUN_ETA_BUFFER_MIN)
                        if eta_raw is not None else None)
    eta_safe = geo.eta_minutes(a["dist_km"], speed, config.NEPTUN_ETA_BUFFER_MIN)
    # Alarm ETA jest niezależnym zabezpieczeniem dla bliskiego, wiarygodnego
    # obiektu. Nie działa przy nieznanym kursie, pojedynczym zgłoszeniu ani niskiej
    # pewności. Punkty podnosimy najwyżej do progu danego alarmu; deduplikacja po
    # track_id sprawia, że nie sumuje się on drugi raz ze zwykłą punktacją obiektu.
    eta_level = _eta_alarm_level(a, sources, conf, eta_conservative,
                                 approximate=approximate)
    if eta_level == "high":
        points = max(points, config.THRESHOLD_HIGH)
    elif eta_level == "elevated":
        points = max(points, config.THRESHOLD_ELEVATED)
    ile = f"{count}× " if count > 1 else ""
    kurs_info = ("" if a.get("heading_known") else
                 (" [kurs szacowany z ruchu]" if t.get("heading_estimated") is not None
                  else " [kurs nieznany]"))
    eta_info = (f", konserwatywny czas dolotu ~{eta_safe} min" if eta_level else "")
    position = t.get("straznik_position") or _position_info(t)
    distance_info = (_area_distance_label(a["dist_km"]) + " [pozycja rejonowa]"
                     if approximate else f"{a['dist_km']} km")
    title = (f"{ile}{threat_label_pl(ttype)} kursem na granicę PL, {distance_info}{kurs_info}{eta_info} "
             f"(woj. {a['border_voiv']}, confidence: {conf}, {sources} potwierdzeń, "
             f"±{t.get('uncertaintyKm', '?')} km)")
    # Poziom w kluczu deduplikacji: gdy obiekt się zbliży albo zyska potwierdzenia,
    # jego waga rośnie i sygnał ma prawo wejść ponownie z wyższą punktacją.
    tier = int(points * 2)
    await fusion.ingest(
        source="neptun", event_type="neptun_threat", voivodeship=a["border_voiv"],
        points=points, title=title,
        details={"track_id": t.get("id"), "type": ttype, "count": count,
                 "source_metadata": source_metadata(t),
                 "lat": t.get("lat"), "lon": t.get("lon"), "heading": t.get("heading"),
                 "confidence": conf, "source_count": sources,
                 "lifecycle": t.get("lifecycle"),
                 "uncertainty_km": t.get("uncertaintyKm"),
                 "position_quality": t.get("positionQuality"),
                 "area_only": t.get("areaOnly"),
                 "position_approximate": approximate,
                 "position_reason": position.get("reason"),
                 "position_locality": position.get("locality"),
                 "distance_display_km": (int(round(a["dist_km"] / 10.0) * 10)
                                         if approximate else a["dist_km"]),
                 "physical_key": _physical_key(t),
                 "dist_km": a["dist_km"], "region": t.get("region"),
                 "course": ("known" if a.get("heading_known") else
                            "estimated" if t.get("heading_estimated") is not None else "unknown"),
                 "course_factor": a.get("course_factor"),
                 # czas dolotu: do granicy PL i do KAŻDEGO województwa (użytkownicy
                 # wybierają różne regiony, a „130 km" znaczy co innego dla kogoś
                 # przy granicy niż dla kogoś w centrum kraju)
                 "speed_kmh": speed,
                 "eta_raw_border_min": round(eta_raw, 1) if eta_raw is not None else None,
                 "eta_border_min": eta_safe,
                 "eta_buffer_min": config.NEPTUN_ETA_BUFFER_MIN,
                 "eta_alarm": eta_level,
                 "eta_voiv_min": _eta_per_voiv(t)},
        dedup_key=f"neptun:{t.get('id')}:t{tier}",
    )


async def _handle_threats(threats: list[dict], replace: bool, *,
                          received_at: float | None = None, transport: str = "unknown",
                          message_type: str = "unknown", source_message_ts=None):
    # Receipt time belongs to the incoming batch, never to the later snapshot.
    received_iso = datetime.fromtimestamp(
        time.time() if received_at is None else received_at, timezone.utc,
    ).isoformat(timespec="milliseconds")
    if replace:
        tracks.clear()
    for t in threats:
        t = dict(t)
        # Always overwrite this reserved field; the source cannot claim local receipt.
        t["_receipt"] = {"received_at": received_iso, "transport": transport,
                         "message_type": message_type, "source_message_ts": source_message_ts}
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
                        await _handle_threats(data.get("threats") or [], replace=True,
                                             received_at=status["last_msg"], transport="ws",
                                             message_type=etype, source_message_ts=env.get("ts"))
                    elif etype == "upsert":
                        await _handle_threats([data], replace=False,
                                             received_at=status["last_msg"], transport="ws",
                                             message_type=etype, source_message_ts=env.get("ts"))
                    elif etype == "remove":
                        tracks.pop((data or {}).get("id"), None)
                        if fusion.on_state_change:
                            asyncio.create_task(fusion.on_state_change())
                    elif etype == "alerts":
                        await _handle_alerts(data)
                    # heartbeat — ignorujemy
        except Exception as e:
            status.update(connected=False, error=str(e))
            # Kod 1013 / „server full” oznacza przeciążenie źródła. Natychmiastowe
            # reconnecty tylko je pogarszały (15 takich zdarzeń w teście), więc
            # stosujemy 15–30 s losowego rozrzutu. Inne awarie zachowują szybki
            # wykładniczy powrót 1,2,4…60 s.
            wait, backoff = _reconnect_wait(e, backoff)
            log.warning("Neptun WS rozłączony (%s), reconnect za %.1fs", e, wait)
            await _rest_fallback_once()
            await asyncio.sleep(wait)


async def _rest_fallback_once():
    """Jednorazowy snapshot REST, gdy WS leży (nie częściej niż co 5 s wg API)."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(config.NEPTUN_REST_URL)
            received_at = time.time()
            r.raise_for_status()
            data = r.json()
            await _handle_threats(data.get("threats") or [], replace=True,
                                 received_at=received_at, transport="rest",
                                 message_type="snapshot", source_message_ts=data.get("ts"))
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
