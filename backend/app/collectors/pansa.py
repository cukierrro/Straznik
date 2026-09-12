"""Warstwa 2a — PAŻP: rezerwacje przestrzeni powietrznej (AUP/UUP).

Strona airspace.pansa.pl to SPA, ale jej mapa karmi się publicznym JSON-em
(znalezionym w /meta/configuration → ajaxUrl):

    GET /map-configuration/aup   — plan na dobę (AUP)
    GET /map-configuration/uup   — aktualizacja w ciągu doby (UUP)

Każdy element to Feature GeoJSON: geometria strefy, centroid, designator
(np. EPTR130B, EPD15), typ (TSA/TRA/D/EA…) oraz lista airspaceReservations
z oknem czasowym, pułapami i jednostką.

Przypisanie do województwa: centroid strefy → point-in-polygon na tym samym
GeoJSON-ie województw, którego używa frontend. Sygnał wystawiamy, gdy nad
województwem pojawi się NOWA aktywna rezerwacja (nieobecna w poprzednim
odczycie) w oknie czasowym obejmującym teraz.
"""
import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone

import httpx

from .. import config, fusion

log = logging.getLogger("pansa")
status = {"ok": False, "last": None, "error": "not started", "zones_now": 0}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
BASE = "https://airspace.pansa.pl"
ENDPOINTS = (f"{BASE}/map-configuration/uup", f"{BASE}/map-configuration/aup")

_voiv_polys: list[tuple[str, list]] = []   # (nazwa, lista pierścieni)
_prev_active: set[str] | None = None
_SEEN_PATH = config.DATA_DIR / "pansa_seen.json"
_REPEAT_WINDOW_S = 7 * 24 * 3600
_ROUTINE_TYPES = {"TRA", "TSA", "MRT", "ATZ"}
_SCORING_TYPES = {"ADHOC", "R", "NPZ", "D"}

# ── strefy pokazywane w aplikacji (informacyjnie, BEZ punktów) ──────────────
# Użytkownik ma widzieć, kiedy i gdzie wojsko zamyka kawałek nieba, ale nie ma
# tonąć w rutynie: nad samą ścianą wschodnią stoi codziennie ~70 stref, z czego
# większość to skoki spadochronowe, szybowce i szkolenie (audyt 12.09.2026).
_SHOW_TYPES = {"ADHOC", "R", "NPZ", "D", "TSA"}
# TRA pokazujemy tylko wtedy, gdy powołał ją NOTAM albo suplement — zwykła TRA
# z adnotacją „PJE"/„GLD"/typem samolotu to lotnictwo sportowe, nie zagrożenie.
_TRA_SHOW_MARKS = ("NOT.", "SUP")
_CIVIL_MARKS = ("PJE", "GLD", "CLN", "BSP", "UAV")


def _is_threat_zone(zone_type: str, remarks: str) -> bool:
    """Czy strefa ma charakter wojskowy/ograniczający, a nie sportowy."""
    t = (zone_type or "").upper()
    r = (remarks or "").upper()
    if t == "ATZ":
        return False
    # Rezerwacje pod loty bezzałogowe (BSP/UAV), skoki (PJE) i szybowce (GLD) to
    # lotnictwo cywilne. Bez tego filtra na mapie stało 19 stref dronowych, które
    # wyglądały jak reakcja wojska — pomiar 12.09.2026: 50 stref, po filtrze 31.
    if t in ("TRA", "ADHOC") and any(m in r for m in _CIVIL_MARKS):
        return False
    if t in _SHOW_TYPES:
        return True
    if t == "TRA":
        return any(m in r for m in _TRA_SHOW_MARKS)
    return False


# designator -> {"since": ts pierwszego zobaczenia, "feature": GeoJSON}
_zones_shown: dict[str, dict] = {}
_zones_since: dict[str, float] = {}
# ostatnie zdarzenia stref (aktywacja/zniesienie) — okno 12 h jak historia
_zone_events: list[dict] = []
_EVENT_WINDOW_S = 12 * 3600


# Strefy zobaczone w pierwszym odczycie po starcie procesu. Nie wiemy, kiedy je
# włączono (plan dobowy PAŻP przepisuje startDate codziennie o 06:00 UTC), więc
# nie wolno ich zgłaszać jako aktywacji ani pisać użytkownikowi „włączona teraz".
_zones_at_boot: set[str] = set()
_ZONES_SINCE_PATH = config.DATA_DIR / "zones_since.json"
_ZONES_SINCE_TTL_S = 7 * 24 * 3600
_since_loaded = False


def _load_zones_since() -> None:
    """Wczytaj „od kiedy" z dysku.

    Bez tego każdy restart usługi resetował wiek stref: strefa stojąca od 10.09
    znów wyglądałaby na świeżo włączoną, a dziennik zdarzeń dostawałby serię
    fałszywych aktywacji wszystkich 30+ stref naraz.
    """
    global _since_loaded
    _since_loaded = True
    try:
        raw = json.loads(_ZONES_SINCE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return
    cut = time.time() - _ZONES_SINCE_TTL_S
    for des, ts in (raw or {}).items():
        try:
            ts = float(ts)
        except (TypeError, ValueError):
            continue
        if ts >= cut:
            _zones_since[des] = ts


def _save_zones_since() -> None:
    try:
        _ZONES_SINCE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _ZONES_SINCE_PATH.write_text(json.dumps(_zones_since), encoding="utf-8")
    except Exception as e:      # dysk pełny / brak praw — to tylko wygoda
        log.debug("PAŻP: nie zapisano wieku stref: %s", e)


def zones_geojson() -> dict:
    """Aktywne strefy związane z zagrożeniem, gotowe dla mapy w aplikacji."""
    return {"type": "FeatureCollection",
            "features": [z["feature"] for z in _zones_shown.values()]}


def zone_events() -> list[dict]:
    """Kiedy która strefa się włączyła i wyłączyła (okno 12 h)."""
    return list(_zone_events)


def _load_seen(now_ts: float | None = None) -> dict[str, float]:
    """Ostatnie wystąpienia designatorów; plik przeżywa restart VPS."""
    now_ts = now_ts or time.time()
    try:
        raw = json.loads(_SEEN_PATH.read_text(encoding="utf-8"))
        return {str(k): float(v) for k, v in raw.items()
                if now_ts - float(v) <= _REPEAT_WINDOW_S}
    except (OSError, ValueError, TypeError):
        return {}


def _save_seen(seen: dict[str, float]) -> None:
    """Zapis atomowy — awaria w połowie nie może skasować pamięci rutyny."""
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _SEEN_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(seen, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    os.replace(tmp, _SEEN_PATH)


def _should_score(info: dict, seen: dict[str, float], now_ts: float) -> bool:
    zone_type = str(info.get("type") or "").upper()
    lower = str(info.get("lower") or "").upper()
    upper = str(info.get("upper") or "").upper()
    if zone_type in _ROUTINE_TYPES or zone_type not in _SCORING_TYPES:
        return False
    if not (lower == "GND" and upper.startswith("F")):
        return False
    previous = seen.get(str(info.get("designator") or ""))
    return previous is None or now_ts - previous > _REPEAT_WINDOW_S


def _load_voivodeships():
    """Poligony województw z assetu frontendu (jedno źródło prawdy)."""
    global _voiv_polys
    if _voiv_polys:
        return
    path = config.FRONTEND_DIR / "assets" / "wojewodztwa.geojson"
    data = json.loads(path.read_text(encoding="utf-8"))
    for f in data["features"]:
        name = f["properties"]["nazwa"]
        geom = f["geometry"]
        polys = ([geom["coordinates"]] if geom["type"] == "Polygon"
                 else geom["coordinates"])
        _voiv_polys.append((name, polys))


def _ring_contains(ring, x, y) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def voiv_at(lon: float, lat: float) -> str | None:
    _load_voivodeships()
    for name, polys in _voiv_polys:
        for poly in polys:
            if _ring_contains(poly[0], lon, lat) and not any(
                    _ring_contains(hole, lon, lat) for hole in poly[1:]):
                return name
    return None


def _parse_dt(s: str):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _active_now(res: dict, now: datetime) -> bool:
    start, end = _parse_dt(res.get("startDate", "")), _parse_dt(res.get("endDate", ""))
    if not start or not end:
        return False
    return start <= now <= end and (res.get("reservationStatus") or "").upper() != "CANCELLED"


async def _fetch(client: httpx.AsyncClient) -> list[dict] | None:
    """UUP (aktualizacja bieżąca) ma pierwszeństwo, AUP jako zapas."""
    last_err = None
    for url in ENDPOINTS:
        try:
            r = await client.get(url, headers={"User-Agent": UA, "Accept": "application/json"})
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list) and data:
                status.update(ok=True, last=time.time(), error=None)
                return data
        except Exception as e:
            last_err = e
    status.update(ok=False, error=str(last_err) if last_err else "pusta odpowiedź")
    return None


async def _tick(client: httpx.AsyncClient):
    global _prev_active
    features = await _fetch(client)
    if features is None:
        return
    now = datetime.now(timezone.utc)
    now_epoch = time.time()
    pierwszy_tick = not _since_loaded
    if pierwszy_tick:
        _load_zones_since()
    znane_przed = set(_zones_since)
    active: dict[str, dict] = {}
    pokazywane: dict[str, dict] = {}

    for f in features:
        props = f.get("properties") or {}
        designator = props.get("designator")
        if not designator:
            continue
        current = [r for r in (props.get("airspaceReservations") or []) if _active_now(r, now)]
        if not current:
            continue
        centroid = (props.get("centroid") or [{}])[0]
        lon, lat = centroid.get("x"), centroid.get("y")
        if lon is None or lat is None:
            continue
        voiv = voiv_at(float(lon), float(lat))
        if voiv is None:
            continue           # strefa poza PL (np. nad Bałtykiem)
        res = current[0]
        active[designator] = {
            "voiv": voiv, "type": props.get("airspaceElementType"),
            "lower": res.get("lowerAltitude"), "upper": res.get("upperAltitude"),
            "unit": res.get("unit"), "remarks": res.get("remarks"),
            "end": res.get("endDate"),
        }
        zone_type = props.get("airspaceElementType")
        remarks = res.get("remarks") or ""
        if not _is_threat_zone(zone_type, remarks) or not f.get("geometry"):
            continue
        since = _zones_since.setdefault(designator, now_epoch)
        pokazywane[designator] = {"feature": {
            "type": "Feature", "geometry": f["geometry"], "properties": {
                "designator": designator, "type": zone_type, "voiv": voiv,
                "lower": res.get("lowerAltitude"), "upper": res.get("upperAltitude"),
                "remarks": remarks.strip(), "unit": res.get("unit"),
                "start": res.get("startDate"),
                "end": res.get("endDate"), "since": since,
                "atBoot": designator in _zones_at_boot,
                # strefa stojąca dłużej niż dobę to STAN, nie zdarzenie —
                # aplikacja rysuje ją inaczej i pisze o tym wprost
                "standing": (now_epoch - since) > 24 * 3600,
            }}}

    status["zones_now"] = len(active)
    status["zones_shown"] = len(pokazywane)

    # zdarzenia: co się włączyło i co zniknęło od poprzedniego odczytu
    if pierwszy_tick:
        # Pierwszy odczyt pokazuje stan zastany, a nie zdarzenia: bez tego każdy
        # restart usługi wpisywał do dziennika 30+ fałszywych aktywacji naraz.
        _zones_at_boot.update(pokazywane)
        for des in pokazywane:
            pokazywane[des]["feature"]["properties"]["atBoot"] = True
    for des in sorted(set(pokazywane) - set(_zones_shown)):
        if pierwszy_tick:
            continue
        _zone_events.append({"ts": now.isoformat(timespec="seconds"), "action": "on",
                             **{k: pokazywane[des]["feature"]["properties"][k]
                                for k in ("designator", "type", "voiv", "lower", "upper")}})
    for des in sorted(set(_zones_shown) - set(pokazywane)):
        _zone_events.append({"ts": now.isoformat(timespec="seconds"), "action": "off",
                             **{k: _zones_shown[des]["feature"]["properties"][k]
                                for k in ("designator", "type", "voiv", "lower", "upper")}})
        _zones_since.pop(des, None)
        _zones_at_boot.discard(des)
    cut = now - timedelta(seconds=_EVENT_WINDOW_S)
    cut_iso = cut.isoformat(timespec="seconds")
    _zone_events[:] = [e for e in _zone_events if e["ts"] >= cut_iso][-300:]
    _zones_shown.clear()
    _zones_shown.update(pokazywane)
    if set(_zones_since) != znane_przed:
        _save_zones_since()

    now_ts = time.time()
    seen = _load_seen(now_ts)
    if _prev_active is not None:
        for designator in set(active) - _prev_active:
            info = active[designator]
            info["designator"] = designator
            # Instrumentacja (bez zmiany punktacji): loguj KAŻDĄ nową aktywację —
            # też spoza ściany wschodniej — żeby rozpoznać, które typy/pułapy to
            # rutynowe tło (TSA/TRA/ATZ, wąskie pasma), a które rzadkie
            # pełnokolumnowe zamknięcia (kandydaci na wyższą wagę). Na tej
            # podstawie zdecydujemy o różnicowaniu wag stref PAŻP.
            # Przegląd na VPS:  journalctl -u straznik | grep "PAŻP nowa"
            log.info("PAŻP nowa: typ=%s %s pułap=%s–%s woj=%s",
                     info.get("type"), designator, info.get("lower"),
                     info.get("upper"), info["voiv"])
            polnoc = info["voiv"] in config.NORTH_VOIVODESHIPS
            if info["voiv"] not in config.PRIORITY_VOIVODESHIPS and not polnoc:
                continue       # ściana wschodnia i północ — reszta bez punktów
            # Test 3-dniowy: nawet po filtrze GND–F sześć z siedmiu trafień było
            # rutyną. TRA/TSA/MRT/ATZ nie punktują nigdy. Dopuszczamy wyłącznie
            # ADHOC/R/NPZ/D z pełną kolumną i tylko gdy designator nie pojawił się
            # przez 7 dni. Dzięki temu codzienna EPTR10A/EPD29 nie wraca jako alarm.
            if not _should_score(info, seen, now_ts):
                continue
            desc = f"{info['type'] or ''} {designator}".strip()
            detail = f"{info['lower']}–{info['upper']}"
            if info["remarks"]:
                detail += f", {info['remarks']}"
            await fusion.ingest(
                source="pansa", event_type="pansa_zone", voivodeship=info["voiv"],
                points=config.POINTS["pansa_zone_north" if polnoc else "pansa_zone"],
                title=f"PAŻP: aktywacja strefy {desc} nad woj. {info['voiv']} ({detail})",
                details={"designator": designator, **info},
                dedup_key=f"pansa:{designator}:{info['end']}",
            )
    # Pamięć obejmuje także strefy zastane przy starcie i rutynowe — jeśli
    # znikną i wrócą jutro, zostaną rozpoznane jako powtarzalne tło.
    for designator in active:
        seen[designator] = now_ts
    _save_seen(seen)
    _prev_active = set(active)


async def run():
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            try:
                await _tick(client)
            except Exception as e:
                log.warning("pansa tick błąd: %s", e)
                status.update(ok=False, error=str(e))
            await asyncio.sleep(config.PANSA_INTERVAL)
