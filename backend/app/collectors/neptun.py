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

from .. import config, db, fusion, geo, stealth
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
status = {"connected": False, "mode": "ws", "last_msg": None, "error": None,
          # D8: rekordy pominięte, bo rzuciły wyjątkiem (np. tekst zamiast liczby)
          "bad_records": 0, "last_bad": None}

# aktywne oficjalne alarmy powietrzne w obwodach UA (z ramek "alerts")
alert_oblasts: set[str] = set()
# Epizody alarmów obwodów (wariant B2): obwód → {"episode": ISO początku}. Koniec
# zapisujemy, gdy obwód zniknie z listy na UA_ALERT_END_GRACE_S przy działającym
# połączeniu — chwilowy brak po zerwaniu połączenia nie może zgasić alarmu.
_episodes: dict[str, dict] = {}
_absent_since: dict[str, float] = {}


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


def _alert_title(oblast: str, voiv: str, km: int) -> str:
    """Tytuł mówi PRAWDĘ o położeniu: „graniczy" tylko dla wspólnej granicy, w
    pozostałych przypadkach odległość. Wcześniej obwód rówieński i żytomierski
    ogłaszały się jako graniczące z Lubelskiem, czym nie są."""
    name = config.UA_OBLAST_PL.get(oblast, oblast)
    # Nazwa województwa zostaje w mianowniku, a odległość idzie po myślniku —
    # inaczej trzeba by odmieniać szesnaście nazw przez przypadki.
    where = "przy granicy" if km <= 0 else f"{km} km"
    return f"Alarm powietrzny w obwodzie {name} (woj. {voiv} — {where})"


def _active_alerts(data) -> dict[str, str | None]:
    """Obwody z `config.UA_ALERT_OBLASTS` z aktywnym alarmem → najwcześniejsze `since`.

    `since` to prawdziwy początek alarmu w rejonie (NEPTUN, ramka `alerts`); alarm
    obwodu trwa od najwcześniejszego z jego aktywnych rejonów."""
    out: dict[str, str | None] = {}
    for field in ("oblasts", "raions"):
        for item in (data or {}).get(field) or []:
            if isinstance(item, str):
                name, since = item, None
            elif isinstance(item, dict):
                if str(item.get("level") or "").lower() in _ALERT_LEVELS_OFF:
                    continue
                name = next((item[k] for k in ("oblast", "name", "region", "title", "key")
                             if isinstance(item.get(k), str) and item[k]), "")
                since = item.get("since") if isinstance(item.get("since"), str) else None
            else:
                continue
            for oblast in config.UA_ALERT_OBLASTS:
                if oblast in name:
                    prev = out.get(oblast)
                    out[oblast] = min(x for x in (prev, since) if x) if (prev or since) else None
    return out


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds")


def _norm_since(since: str | None) -> str:
    """`since` z NEPTUN-a (…Z, mikrosekundy) → ISO UTC do sekundy, jak `ts` sygnałów."""
    try:
        t = datetime.fromisoformat(str(since).replace("Z", "+00:00"))
        return t.astimezone(timezone.utc).isoformat(timespec="seconds")
    except Exception:
        return _iso(time.time())


async def _alert_start(oblast: str, episode: str):
    for voiv, km in config.UA_ALERT_OBLASTS[oblast].items():
        weight = config.ua_alert_weight(km)
        if weight <= 0:
            continue
        await fusion.ingest(
            # OSOBNA klasa źródła: w klasie „neptun" (limit 8,0) trzy obwody naraz
            # dawały 3,0 pkt i żółty alarm bez obiektu na mapie (audyt 11.09.2026).
            source="ua_alert", event_type="ua_alert_border", voivodeship=voiv,
            points=round(config.POINTS["ua_alert_border"] * weight, 2),
            title=_alert_title(oblast, voiv, km),
            details={"oblast": oblast, "distance_km": km, "episode": episode},
            # klucz epizodu: restart serwera w trakcie alarmu nie tworzy drugiego wpisu
            dedup_key=f"neptun_alert:{oblast}:{voiv}:{episode}",
        )


async def _alert_end(oblast: str, episode: str, ended_at: float):
    name = config.UA_OBLAST_PL.get(oblast, oblast)
    for voiv, km in config.UA_ALERT_OBLASTS[oblast].items():
        if config.ua_alert_weight(km) <= 0:
            continue
        await fusion.ingest(
            source="ua_alert", event_type="ua_alert_end", voivodeship=voiv, points=0.0,
            title=f"Koniec alarmu powietrznego w obwodzie {name} (woj. {voiv})",
            details={"oblast": oblast, "episode": episode, "ended_at": _iso(ended_at)},
            dedup_key=f"neptun_alert_end:{oblast}:{voiv}:{episode}",
        )


async def _finish_ended(now: float | None = None):
    """Zamyka epizody, których obwód zniknął z listy na dłużej niż UA_ALERT_END_GRACE_S.
    Tylko przy działającym połączeniu: bez niego nie wiemy, czy alarm się skończył."""
    now = now or time.time()
    if not status.get("connected"):
        return
    for oblast, gone_at in list(_absent_since.items()):
        if now - gone_at < config.UA_ALERT_END_GRACE_S:
            continue
        _absent_since.pop(oblast, None)
        ep = _episodes.pop(oblast, None)
        if ep:
            log.info("koniec alarmu w obwodzie %s (od %s)", oblast, ep["episode"])
            await _alert_end(oblast, ep["episode"], gone_at)


async def _handle_alerts(data, now: float | None = None):
    """Pełna lista aktywnych alarmów z NEPTUN-a ⇒ początki i końce epizodów.

    Alarm w obwodzie po ukraińskiej stronie daje punkty polskim województwom, tym
    mniejsze, im dalej leży obwód; wiek liczy się od `since`, a koniec alarmu
    od razu gasi punkty (fusion.ua_alert_factor)."""
    global alert_oblasts
    now = now or time.time()
    active = _active_alerts(data)
    for oblast, since in active.items():
        _absent_since.pop(oblast, None)
        if oblast not in _episodes:
            episode = _norm_since(since)
            _episodes[oblast] = {"episode": episode}
            await _alert_start(oblast, episode)
    for oblast in _episodes:
        if oblast not in active:
            _absent_since.setdefault(oblast, now)
    alert_oblasts = set(active)
    await _finish_ended(now)


def restore_episodes(now: datetime | None = None):
    """Po restarcie: otwarte epizody z bazy (start bez końca, młodsze niż UA_ALERT_MAX_MIN).
    Pierwsza ramka `alerts` po połączeniu (NEPTUN wysyła ją od razu) potwierdzi,
    które trwają; pozostałe zamknie _finish_ended po okresie łaski."""
    rows = db.events_since(config.UA_ALERT_MAX_MIN, ("ua_alert_border", "ua_alert_end"))
    ended = {((s.get("details") or {}).get("oblast"), (s.get("details") or {}).get("episode"))
             for s in rows if s.get("event_type") == "ua_alert_end"}
    for s in sorted(rows, key=lambda x: x.get("ts", "")):
        d = s.get("details") or {}
        if (s.get("event_type") == "ua_alert_border" and d.get("episode")
                and d.get("oblast") in config.UA_ALERT_OBLASTS
                and (d["oblast"], d["episode"]) not in ended):
            _episodes[d["oblast"]] = {"episode": d["episode"]}
    if _episodes:
        log.info("otwarte epizody alarmów obwodów po restarcie: %s", _episodes)


async def _end_loop():
    while True:
        await asyncio.sleep(30)
        try:
            await _finish_ended()
        except Exception as e:
            log.warning("koniec alarmów obwodów: %s", e)


# Ostatnia znana pozycja tracka — do wyliczenia kursu, gdy NEPTUN go nie podaje.
_last_pos: dict[str, tuple[float, float]] = {}
_MIN_MOVE_KM = 2.0   # mniejsze przesunięcia to szum pozycji (±km niepewności)
# ostatni kurs z ruchu: kolejne małe kroki (< 2 km) nie kasują go od razu
_last_est: dict[str, tuple[float, float]] = {}
_EST_KEEP_S = 600
# Krótka historia pozycji dla mapy (opcja „trasy obiektów”). Aplikacja zbierała
# ślad dopiero od otwarcia, więc przez pierwsze minuty nie było czego rysować.
# Nie trafia do migawek historii — tylko do stanu na żywo.
_trail: dict[str, list] = {}
TRAIL_MIN_KM, TRAIL_MAX_PTS, TRAIL_MAX_AGE_S = 0.7, 20, 45 * 60


def _movement_heading(t: dict) -> float | None:
    """Kurs z przesunięcia względem poprzedniej obserwacji tego samego obiektu
    (kotwica po ruchu ≥ 2 km, pamięć 10 min). Liczony zawsze, także gdy NEPTUN
    podaje własny kurs — alarm ETA potrzebuje kursu z ruchu (audyt G3)."""
    tid, lat, lon = t.get("id"), t.get("lat"), t.get("lon")
    prev = _last_pos.get(tid)
    if prev and geo.haversine_km(prev[0], prev[1], lat, lon) >= _MIN_MOVE_KM:
        est = geo.bearing_deg(prev[0], prev[1], lat, lon)
        _last_est[tid] = (est, time.time())
        t["heading_movement"] = round(est, 1)
        return est
    kept = _last_est.get(tid)
    if kept and time.time() - kept[1] <= _EST_KEEP_S:
        t["heading_movement"] = round(kept[0], 1)
        return kept[0]
    return None


def _heading_of(t: dict) -> float | None:
    """Kurs z danych, a gdy go brak — wyliczony z przesunięcia względem
    poprzedniej obserwacji tego samego obiektu. NEPTUN często nie podaje
    `heading` (tak przepadła rakieta 130 km od granicy), a kierunek lotu da się
    odtworzyć z kolejnych pozycji — to samo robi UI, rysując ślad."""
    h = t.get("heading")
    moved = _movement_heading(t)
    if h is not None:
        return h
    if moved is not None:
        t["heading_estimated"] = round(moved, 1)
        return moved
    return None


def heading_source(t: dict) -> str:
    """Skąd jest kurs: presumptive (NEPTUN „kursem na X”, pole presumptiveCourse),
    reported (kurs podany przez źródło), measured (z ruchu), unknown.

    Audyt G3: kurs domniemany różnił się od faktycznego ruchu o medianę 90°, a mimo
    to uruchamiał alarm ETA. Punkty liczymy po staremu; alarm ETA tylko bez
    domniemania albo przy kursie z ruchu."""
    if t.get("heading") is not None:
        return "presumptive" if t.get("presumptiveCourse") is True else "reported"
    return "measured" if t.get("heading_estimated") is not None else "unknown"


# Audyt G2, TRYB CIENIA: 74% sygnałów NEPTUN leżało we współrzędnych powtarzanych
# przez różne obiekty i w różne dni (środek Sarn, Chmielnickiego) — to punkt
# katalogowy miejscowości, a nie pomiar, ale dostaje pełną wagę, ETA i ślad.
# Zanim zmienimy punktację, zapisujemy (bez punktów), które pozycje by się
# zakwalifikowały. Pamięć tylko w procesie; kryterium dni liczy się od startu.
_coord_seen: dict[str, dict] = {}
_COORD_KEEP_S = 7 * 24 * 3600
_COORD_MAX_KEYS = 5000


def _catalog_point_shadow(t: dict, now: float | None = None) -> bool:
    if is_national(t) or _is_approx_position(t):
        return False
    lat, lon, tid = t.get("lat"), t.get("lon"), t.get("id")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or tid is None:
        return False
    now = now or time.time()
    key = f"{lat:.4f}:{lon:.4f}"
    rec = _coord_seen.setdefault(key, {"ids": {}, "days": set(), "last": now})
    rec["ids"][tid] = now
    rec["days"].add(datetime.fromtimestamp(now, timezone.utc).date().isoformat())
    rec["last"] = now
    rec["ids"] = {i: ts for i, ts in rec["ids"].items() if now - ts <= _COORD_KEEP_S}
    if len(_coord_seen) > _COORD_MAX_KEYS:
        for old in sorted(_coord_seen, key=lambda k: _coord_seen[k]["last"])[:500]:
            _coord_seen.pop(old, None)
    if len(rec["ids"]) < 2 and len(rec["days"]) < 2:
        return False
    a = t.get("pl_assessment") or {}
    try:
        return stealth.record("catalog_point_shadow", f"{key}:{tid}", {
            "track_id": tid, "type": t.get("type"), "lat": lat, "lon": lon,
            "ids_same_point": len(rec["ids"]), "days_same_point": len(rec["days"]),
            "region": t.get("region"), "locality": t.get("locality"),
            "confidence": t.get("confidenceLevel"), "position_quality": t.get("positionQuality"),
            "dist_km": a.get("dist_km"), "toward_pl": a.get("toward_pl"),
            "would_be": "locality_center",
        }, now)
    except Exception as exc:                          # noqa: BLE001
        log.debug("cień punktów katalogowych: %s", exc)
        return False


def is_jet(t: dict) -> bool:
    """Dron odrzutowy (Geran-3 / Shahed-238) rozpoznany z opisu NEPTUN-a (audyt G6)."""
    text = f"{t.get('title') or ''} {t.get('explanationShort') or ''}".lower()
    return any(m in text for m in config.NEPTUN_JET_MARKERS)


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


def is_national(t: dict) -> bool:
    """Alarm ogólnokrajowy NEPTUN-a (np. „national-mig31k”), a nie obiekt z pozycją."""
    if str(t.get("id") or "").startswith(config.NEPTUN_NATIONAL_ID_PREFIX):
        return True
    region = str(t.get("region") or "").lower()
    return any(m in region for m in config.NEPTUN_NATIONAL_REGION_MARKERS)


def _evaluate(t: dict) -> dict:
    """Dokleja do tracka ocenę względem granicy PL."""
    if is_national(t):
        # Punkt w środku Ukrainy jest umowny: bez oceny odległości, kursu, trasy,
        # ETA i cieni. Brak pl_assessment zatrzymuje też _maybe_signal i tryb
        # cienia progresji. 14.09.2026 „national-mig31k” stał 35 min na mapie
        # jak samolot. Czas startu dla komunikatu w aplikacji.
        t["straznik_national"] = {"since": t.get("confirmedAt") or t.get("createdAt")
                                  or t.get("updatedAt")}
        t["straznik_position"] = {"quality": "approx", "reason": "national_alert"}
        t["pl_assessment"] = None
        t["border_region"] = False
        return t
    lat, lon = t.get("lat"), t.get("lon")
    if lat is None or lon is None:
        return t
    t["straznik_position"] = _position_info(t)
    heading = _heading_of(t)
    t["heading_source"] = heading_source(t)
    if is_jet(t):
        t["straznik_jet"] = True
    a = geo.assess_for_scoring(lat, lon, heading, config.NEPTUN_HEADING_TOLERANCE,
                          config.NEPTUN_HEADING_SOFT_DEG,
                          config.NEPTUN_UNKNOWN_HEADING_MULT,
                          config.NEPTUN_UNKNOWN_HEADING_MAX_KM)
    # A5 (audyt 11.09.2026): kotwica kursu przesuwa się dopiero po ruchu o co
    # najmniej _MIN_MOVE_KM. Nadpisywana przy każdej aktualizacji nie pozwalała
    # policzyć kursu z ruchu, gdy kolejne pozycje różniły się o mniej niż 2 km.
    tid = t.get("id")
    if tid is not None:
        prev = _last_pos.get(tid)
        if prev is None or geo.haversine_km(prev[0], prev[1], lat, lon) >= _MIN_MOVE_KM:
            _last_pos[tid] = (lat, lon)
        if not _is_approx_position(t):
            now = time.time()
            pts = [p for p in _trail.get(tid, []) if now - p["t"] <= TRAIL_MAX_AGE_S]
            if not pts or geo.haversine_km(pts[-1]["lat"], pts[-1]["lon"], lat, lon) >= TRAIL_MIN_KM:
                pts.append({"lat": round(lat, 4), "lon": round(lon, 4), "t": int(now)})
            _trail[tid] = pts[-TRAIL_MAX_PTS:]
            t["straznik_trail"] = _trail[tid]
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


def _measured_speed(t: dict) -> float | None:
    """Prędkość z dwóch ostatnich punktów śladu (ruch ≥ 0,7 km, odstęp ≥ 30 s)."""
    pts = t.get("straznik_trail") or []
    if len(pts) < 2:
        return None
    a, b = pts[-2], pts[-1]
    dt_h = (b["t"] - a["t"]) / 3600
    if dt_h < 30 / 3600:
        return None
    v = geo.haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) / dt_h
    return v if 20 < v < 4000 else None


def _speed_of(t: dict) -> float | None:
    """Prędkość obiektu: podana przez źródło, a gdy jej brak — typowa dla klasy.
    NEPTUN prędkości praktycznie nie podaje (sprawdzone na żywym API), więc
    w praktyce niemal zawsze pracujemy na wartości typowej. Dlatego czas dolotu
    prezentujemy jako SZACUNEK, nigdy jako pomiar."""
    v = (t.get("velocity") or {}).get("speedKmh")
    if isinstance(v, (int, float)) and v > 0:
        return float(v)
    if t.get("straznik_jet") or is_jet(t):
        # Geran-3: przelot 300–370 km/h, na końcowym odcinku do 550–600 km/h.
        # Decyzja usera 14.09.2026: 450 km/h, a gdy ruch w danych daje prędkość —
        # większa z zmierzonej i przelotowej (dron, który naprawdę przyspieszył).
        measured = _measured_speed(t)
        if measured is not None:
            return max(measured, config.NEPTUN_JET_CRUISE_KMH)
        return config.NEPTUN_JET_SPEED_KMH
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
    """Poziom ETA po wszystkich bezpiecznikach jakości danych.

    `a` to ocena z kursem, któremu wierzymy dla alarmu: przy kursie domniemanym
    (G3) — ocena z kursu z ruchu albo brak kursu."""
    eligible = (not approximate and a.get("heading_known") and a.get("toward_pl", True)
                and sources >= config.NEPTUN_ETA_MIN_SOURCES
                and confidence in config.NEPTUN_ETA_CONFIDENCE and eta_safe is not None)
    if not eligible:
        return None
    if eta_safe <= config.NEPTUN_ETA_HIGH_MIN:
        return "high"
    if eta_safe <= config.NEPTUN_ETA_ELEVATED_MIN:
        return "elevated"
    return None


# A5 (audyt 11.09.2026), TRYB CIENIA: rakieta 45 km od granicy z jednym zgłoszeniem
# ma dziś 0,5–0,9 pkt, bo alarm ETA wymaga dwóch zgłoszeń i znanego kursu — a rakiety
# w danych NEPTUN-a nigdy nie mają kursu. Zanim dopuścimy żółty z jednego zgłoszenia,
# zapisujemy (bez punktów), kiedy by zadziałał, i porównamy to z alertami RCB.
ETA_SHADOW_TYPES = ("ballistic", "cruise", "missile", "mig31k")


def _eta_single_source_shadow(t: dict, a: dict, sources: int, conf: str,
                              eta_conservative: float | None, approximate: bool,
                              eta_level: str | None) -> None:
    ttype = (t.get("type") or "").lower()
    if (eta_level or approximate or ttype not in ETA_SHADOW_TYPES or sources != 1
            or conf not in config.NEPTUN_ETA_CONFIDENCE or eta_conservative is None
            or eta_conservative > config.NEPTUN_ETA_ELEVATED_MIN):
        return
    level = "high" if eta_conservative <= config.NEPTUN_ETA_HIGH_MIN else "elevated"
    try:
        stealth.record("eta_single_source_shadow", f"{t.get('id')}:{level}", {
            "track_id": t.get("id"), "type": ttype, "would_be": level,
            "eta_conservative_min": round(eta_conservative, 1), "dist_km": a.get("dist_km"),
            "voivodeship": a.get("border_voiv"), "confidence": conf,
            "heading_known": a.get("heading_known"), "lat": t.get("lat"), "lon": t.get("lon"),
        })
    except Exception as exc:                      # noqa: BLE001
        log.debug("cień ETA: %s", exc)


# A4 i A10 (audyt 11.09.2026) — TRYB CIENIA. Historia sygnałów nie pozwala ich
# sprawdzić wstecz (sygnał zapisuje się tylko przy zmianie punktów, więc nie widać,
# czy obiekt dalej leciał albo zawrócił). Zanim zmienią punktację, zapisujemy do
# dziennika stealth, co by zrobiły; pełne migawki zbiera archiwum 30 dni.
#   A4: trwające zagrożenie traci wagę po 30 min, bo sygnał się nie odnawia —
#       „odnowiłbym", gdy obiekt nadal leci na PL, ostatni sygnał ma > 30 min,
#       pozycja nie jest katalogowa/rejonowa i obiekt przesunął się o ≥ 2 km;
#   A10: zawrócony obiekt trzyma wynik do godziny — „wyzerowałbym", gdy kurs
#       z ruchu dwa razy z rzędu wskazuje od Polski.
_signalled: dict[str, dict] = {}     # track_id -> ostatni zapisany sygnał (czas, pozycja, pkt)
_away_streak: dict[str, int] = {}
RENEW_AFTER_S = config.FUSION_FULL_MIN * 60
TURNAWAY_STREAK = 2


def _renewal_shadow(t: dict, a: dict, points: float, approximate: bool,
                    now: float | None = None) -> None:
    tid = t.get("id")
    last = _signalled.get(tid)
    if not last or approximate:
        return
    now = now or time.time()
    if now - last["at"] < RENEW_AFTER_S:
        return
    moved = geo.haversine_km(last["lat"], last["lon"], t["lat"], t["lon"])
    if moved < _MIN_MOVE_KM:
        return
    bucket = int((now - last["first"]) // RENEW_AFTER_S)
    stealth.record("neptun_renew_shadow", f"{tid}:{bucket}", {
        "track_id": tid, "type": t.get("type"), "voivodeship": a.get("border_voiv"),
        "points": round(points, 2), "last_signal_age_min": round((now - last["at"]) / 60, 1),
        "active_min": round((now - last["first"]) / 60, 1), "moved_km": round(moved, 1),
        "dist_km": a.get("dist_km"), "lat": t.get("lat"), "lon": t.get("lon"),
    }, now)


def _turnaway_shadow(t: dict, now: float | None = None) -> None:
    """Wołane dla każdej aktualizacji tracka (także gdy już nie leci na PL)."""
    tid = t.get("id")
    if tid not in _signalled:
        return
    a = t.get("pl_assessment") or {}
    measured = t.get("heading_estimated") is not None
    if measured and a.get("toward_pl") is False:
        _away_streak[tid] = _away_streak.get(tid, 0) + 1
    else:
        _away_streak[tid] = 0
        return
    if _away_streak[tid] == TURNAWAY_STREAK:
        last = _signalled[tid]
        stealth.record("neptun_turnaway_shadow", f"{tid}:{int(last['at'])}", {
            "track_id": tid, "type": t.get("type"), "voivodeship": last.get("voiv"),
            "points_held": last.get("points"), "heading_estimated": t.get("heading_estimated"),
            "dist_km": a.get("dist_km"), "lat": t.get("lat"), "lon": t.get("lon"),
            "since_signal_min": round(((now or time.time()) - last["at"]) / 60, 1),
        }, now)


def _remember_signal(t: dict, a: dict, points: float, now: float | None = None) -> None:
    now = now or time.time()
    tid = t.get("id")
    prev = _signalled.get(tid)
    _signalled[tid] = {"at": now, "first": prev["first"] if prev else now,
                       "lat": t.get("lat"), "lon": t.get("lon"),
                       "points": round(points, 2), "voiv": a.get("border_voiv")}


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
    course_src = t.get("heading_source") or heading_source(t)
    eta_a = a
    if course_src == "presumptive":
        moved = t.get("heading_movement")
        eta_a = (geo.assess_for_scoring(t["lat"], t["lon"], moved, config.NEPTUN_HEADING_TOLERANCE,
                                   config.NEPTUN_HEADING_SOFT_DEG,
                                   config.NEPTUN_UNKNOWN_HEADING_MULT,
                                   config.NEPTUN_UNKNOWN_HEADING_MAX_KM)
                 if moved is not None else {"heading_known": False})
    eta_level = _eta_alarm_level(eta_a, sources, conf, eta_conservative,
                                 approximate=approximate)
    _eta_single_source_shadow(t, a, sources, conf, eta_conservative, approximate, eta_level)
    if eta_level == "high":
        points = max(points, config.THRESHOLD_HIGH)
    elif eta_level == "elevated":
        points = max(points, config.THRESHOLD_ELEVATED)
    ile = f"{count}× " if count > 1 else ""
    kurs_info = (" [kurs domniemany — na cel]" if course_src == "presumptive"
                 else "" if a.get("heading_known") else
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
    try:
        _renewal_shadow(t, a, points, approximate)
    except Exception as exc:                      # noqa: BLE001
        log.debug("cień odnowienia: %s", exc)
    inserted = await fusion.ingest(
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
                 "course": ("presumptive" if course_src == "presumptive" else
                            "known" if a.get("heading_known") else
                            "estimated" if t.get("heading_estimated") is not None else "unknown"),
                 "heading_source": course_src,
                 "jet": bool(t.get("straznik_jet")),
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
    if inserted or t.get("id") not in _signalled:
        # po restarcie duplikat z bazy też ustawia punkt odniesienia (bez „first" sprzed restartu)
        _remember_signal(t, a, points)


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
        # D8 (audyt 11.09.2026): jeden zepsuty obiekt („count": "dużo") rzucał
        # wyjątek, który zamykał połączenie — a po ponownym połączeniu snapshot
        # zawierał ten sam rekord, więc NEPTUN leżał, dopóki obiekt był aktywny.
        # Zły rekord pomijamy i liczymy; reszta paczki idzie dalej.
        try:
            t = dict(t)
            # Always overwrite this reserved field; the source cannot claim local receipt.
            t["_receipt"] = {"received_at": received_iso, "transport": transport,
                             "message_type": message_type, "source_message_ts": source_message_ts}
            t = _evaluate(t)
            tracks[t.get("id")] = t
            _catalog_point_shadow(t)
            _turnaway_shadow(t)
            await _maybe_signal(t)
        except Exception as exc:                  # noqa: BLE001
            _bad_record(t, exc)
    if replace:
        # pełny snapshot: zapominamy kotwice obiektów, których już nie ma
        for cache in (_last_pos, _last_est, _signalled, _away_streak, _trail):
            for tid in [k for k in cache if k not in tracks]:
                cache.pop(tid, None)
    if fusion.on_state_change:
        asyncio.create_task(fusion.on_state_change())


def _bad_record(record, exc: Exception) -> None:
    status["bad_records"] = status.get("bad_records", 0) + 1
    rid = record.get("id") if isinstance(record, dict) else None
    status["last_bad"] = {"at": time.time(), "id": rid, "error": repr(exc)[:200]}
    tracks.pop(rid, None) if rid is not None else None
    log.warning("NEPTUN: pominięty rekord %r (%s)", rid, exc)


async def _dispatch(env: dict, received_at: float) -> None:
    etype = env.get("type")
    data = env.get("data") or {}
    if etype == "snapshot":
        await _handle_threats(data.get("threats") or [], replace=True,
                             received_at=received_at, transport="ws",
                             message_type=etype, source_message_ts=env.get("ts"))
    elif etype == "upsert":
        await _handle_threats([data], replace=False,
                             received_at=received_at, transport="ws",
                             message_type=etype, source_message_ts=env.get("ts"))
    elif etype == "remove":
        tracks.pop((data or {}).get("id"), None)
        if fusion.on_state_change:
            asyncio.create_task(fusion.on_state_change())
    elif etype == "alerts":
        await _handle_alerts(data)
    # heartbeat — ignorujemy


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
                    try:
                        await _dispatch(env, status["last_msg"])
                    except Exception as exc:          # noqa: BLE001
                        # D8: błąd obróbki jednej ramki nie może zerwać połączenia
                        _bad_record(env.get("data") if isinstance(env, dict) else None, exc)
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


_end_task: asyncio.Task | None = None


async def run():
    global _end_task
    try:
        restore_episodes()
    except Exception as e:
        log.warning("odtwarzanie epizodów alarmów: %s", e)
    # nadzorca (main._supervise) może wołać run() ponownie — pętla końców jedna
    if _end_task is None or _end_task.done():
        _end_task = asyncio.create_task(_end_loop())
    await _ws_loop()


def public_state() -> dict:
    """Stan dla frontendu: wszystkie aktywne tracki + ocena PL."""
    return {
        "status": {k: status[k] for k in ("connected", "mode", "last_msg")},
        "threats": list(tracks.values()),
        "alert_oblasts": sorted(alert_oblasts),
    }
