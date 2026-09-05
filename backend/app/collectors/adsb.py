"""Warstwa 2b — ADS-B: aktywność lotnictwa wojskowego nad wschodnią Polską.

To publiczne dane z transponderów (samoloty, które CHCĄ być widoczne) — nie
namierzanie obiektów wroga. Sygnał = statystyczna anomalia: liczba maszyn
wojskowych nad województwem > 2x baseline z ostatnich 7 dni.

Domyślnie darmowe, bezkluczowe API adsb.lol (endpoint /v2/mil — wszystkie
maszyny wojskowe globalnie, filtrujemy bboxem). Fallback: opendata.adsb.fi.
Opcjonalnie ADSBexchange przez RapidAPI (klucz w .env).
"""
import asyncio
import logging
import re
import time
from datetime import datetime, timezone

import httpx

from .. import config, db, fusion, geo

log = logging.getLogger("adsb")
status = {"ok": False, "last": None, "error": None, "provider": config.ADSB_PROVIDER,
          "counts": {}, "baselines": {},
          "baltic_geo": {"ok": False, "provider": None, "candidates": 0}}

# aktualne maszyny wojskowe nad PL-wschód (dla frontendu)
current_aircraft: list[dict] = []
_watch_prev: dict[str, dict] | None = None


def _is_foreign_hex(value: str | None) -> bool:
    """Rosja 100000–1FFFFF, Białoruś 510000–5103FF — jak w frontendzie."""
    try:
        n = int(str(value or "").strip().lower(), 16)
    except ValueError:
        return False
    return 0x100000 <= n <= 0x1FFFFF or 0x510000 <= n <= 0x5103FF


def _watch_transitions(previous: dict[str, dict] | None,
                       current: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    """Zwraca wejścia i wyjścia; None oznacza pierwszy obieg bez zdarzeń."""
    if previous is None:
        return [], []
    return ([current[h] for h in current.keys() - previous.keys()],
            [previous[h] for h in previous.keys() - current.keys()])

MIL_CALLSIGN_PREFIXES = ("NATO", "MMF", "REDEYE", "BART", "OSY", "PLF", "HKY",
                         "VIPER", "WOLF", "FENIX", "DUKE", "TIGER", "KAPLAN",
                         "TUAF", "TURAF", "SOLOTURK")

# Dwa koła po 220 NM pokrywają LT/LV/EE i najbliższy Bałtyk. To tylko dwa małe
# zapytania/min, nie globalny zrzut całego ruchu cywilnego.
BALTIC_GEO_POINTS = ((55.5, 24.0, 220), (58.2, 25.5, 220))
MIL_TYPES = {"F16", "F15", "F18", "FA18", "F35", "EUFI", "RFAL", "JAS39",
             "MIR2", "M2K", "SU27", "SU30", "SU35", "MIG29", "MIG31",
             "A10", "B1", "B2", "B52", "E3CF", "E3TF", "A400", "C130",
             "C17", "KC135", "ATLA"}
MIL_OPERATOR_WORDS = ("air force", "airforce", "army", "navy", "military",
                      "nato", "force aérienne", "luftwaffe", "Türk Hava",
                      "turkish af", "polish af")

# Nagłówek jak z przeglądarki — bez niego adsb.lol odrzuca żądanie (403).
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Darmowe, bezkluczowe źródła maszyn wojskowych (globalnie, filtrujemy bboxem).
MIL_ENDPOINTS = {
    "adsb.lol": "https://api.adsb.lol/v2/mil",
    "adsb.fi": "https://opendata.adsb.fi/api/v2/mil",
}


async def _fetch_mil(client: httpx.AsyncClient) -> list[dict] | None:
    """Lista maszyn wojskowych: wybrany dostawca, a przy błędzie kolejni zapasowi.

    UWAGA (20.08.2026): adsb.lol zaczął odrzucać domyślny User-Agent bibliotek
    (`python-httpx/...`) z kodem 403 — dokładnie ten sam adres z nagłówkiem
    przeglądarki zwraca 200. Dlatego KAŻDE żądanie idzie z UA jak z przeglądarki.
    Przy okazji: stary zapasowy adres `api.adsb.fi/v2` już nie istnieje (404),
    adsb.fi wystawia dane pod `opendata.adsb.fi/api/v2`.
    """
    prov = config.ADSB_PROVIDER
    if prov == "adsbx" and config.ADSBX_RAPIDAPI_KEY:
        try:
            r = await client.get(
                "https://adsbexchange-com1.p.rapidapi.com/v2/mil/",
                headers={"X-RapidAPI-Key": config.ADSBX_RAPIDAPI_KEY,
                         "X-RapidAPI-Host": "adsbexchange-com1.p.rapidapi.com"})
            r.raise_for_status()
            status.update(ok=True, error=None, provider="adsbx")
            return r.json().get("ac") or []
        except Exception as e:
            status.update(ok=False, error=f"adsbx: {e}")

    # wybrany dostawca pierwszy, pozostali jako zapas
    order = [prov] + [p for p in MIL_ENDPOINTS if p != prov]
    last_err = None
    for name in order:
        url = MIL_ENDPOINTS.get(name)
        if not url:
            continue
        try:
            r = await client.get(url, headers={"User-Agent": UA})
            r.raise_for_status()
            status.update(ok=True, error=None,
                          provider=name if name == prov else f"{name}(fallback)")
            return r.json().get("ac") or []
        except Exception as e:
            last_err = f"{name}: {e}"
            log.warning("ADS-B %s nie odpowiada: %s", name, e)
    status.update(ok=False, error=last_err)
    return None


def _looks_military(ac: dict) -> bool:
    """Konserwatywna klasyfikacja rekordu z zapytania geograficznego."""
    try:
        if int(ac.get("dbFlags") or 0) & 1:  # tar1090: bit 0 = military
            return True
    except (TypeError, ValueError):
        pass
    callsign = (ac.get("flight") or "").strip().upper()
    if callsign.startswith(MIL_CALLSIGN_PREFIXES):
        return True
    ac_type = re.sub(r"[^A-Z0-9]", "", str(ac.get("t") or "").upper())
    if ac_type in MIL_TYPES:
        return True
    operator = str(ac.get("ownOp") or "").lower()
    return any(word.lower() in operator for word in MIL_OPERATOR_WORDS)


async def _fetch_baltic_geo(client: httpx.AsyncClient, provider: str) -> list[dict]:
    """Wszystkie rekordy w dwóch kołach, potem lokalny filtr wojskowy.

    `/v2/mil` ominął nocne tureckie F-16, choć według użytkownika były widoczne
    w FR24. Zapytanie geograficzne usuwa zależność od flagi „military” dostawcy.
    Przy awarii wybranego hosta próbujemy drugi, ale nigdy nie odpytujemy obu
    równolegle bez potrzeby.
    """
    order = [provider] + [p for p in MIL_ENDPOINTS if p != provider]
    last_error = None
    for name in order:
        base = MIL_ENDPOINTS.get(name, "").rsplit("/mil", 1)[0]
        if not base:
            continue
        try:
            responses = await asyncio.gather(*[
                client.get(f"{base}/point/{lat}/{lon}/{radius}",
                           headers={"User-Agent": UA})
                for lat, lon, radius in BALTIC_GEO_POINTS
            ])
            merged = {}
            for response in responses:
                response.raise_for_status()
                for ac in response.json().get("ac") or []:
                    key = ac.get("hex") or f"{ac.get('lat')}:{ac.get('lon')}:{ac.get('flight')}"
                    merged[key] = ac
            candidates = []
            for ac in merged.values():
                if _looks_military(ac):
                    candidates.append({**ac, "_straznik_detection": "baltic_geo"})
            status["baltic_geo"] = {"ok": True, "provider": name,
                                    "candidates": len(candidates), "error": None}
            return candidates
        except Exception as exc:
            last_error = f"{name}: {exc!r}"
    status["baltic_geo"] = {"ok": False, "provider": None, "candidates": 0,
                            "error": last_error}
    return []


def _classify(ac: dict) -> dict | None:
    """Punktujemy tylko województwa priorytetowe, ale pokazujemy szerszą strefę
    (wschodnia flanka NATO), żeby było widać kontekst — np. tankowce nad Rumunią."""
    lat, lon = ac.get("lat"), ac.get("lon")
    if lat is None or lon is None:
        return None
    voiv = geo.voiv_for_point(lat, lon)
    if voiv is None and not geo.in_watch_area(lat, lon):
        return None
    callsign = (ac.get("flight") or "").strip()
    return {
        "hex": ac.get("hex"), "callsign": callsign, "type": ac.get("t"),
        "lat": lat, "lon": lon, "alt": ac.get("alt_baro"),
        "gs": ac.get("gs"), "track": ac.get("track"), "voivodeship": voiv,
        "desc": ac.get("desc"),
        # wzbogacenie: rejestracja, operator, kategoria (A7=wiropłat),
        # prędkość pionowa [ft/min], rocznik — wszystko wprost z ADS-B/rejestru
        "reg": ac.get("r"), "op": ac.get("ownOp"), "cat": ac.get("category"),
        "vr": ac.get("baro_rate"), "year": ac.get("year"),
        "detection": ac.get("_straznik_detection", "mil_registry"),
    }


async def _tick(client: httpx.AsyncClient):
    global _watch_prev
    ac_list = await _fetch_mil(client)
    if ac_list is None:
        return
    selected = str(status.get("provider") or config.ADSB_PROVIDER).replace("(fallback)", "")
    geo_candidates = await _fetch_baltic_geo(client, selected)
    merged: dict[str, dict] = {}
    for ac in ac_list:
        key = ac.get("hex") or f"{ac.get('lat')}:{ac.get('lon')}:{ac.get('flight')}"
        merged[key] = {**ac, "_straznik_detection": "mil_registry"}
    for ac in geo_candidates:
        key = ac.get("hex") or f"{ac.get('lat')}:{ac.get('lon')}:{ac.get('flight')}"
        merged.setdefault(key, ac)
    ac_list = list(merged.values())
    status.update(ok=True, last=time.time(), error=None)

    per_voiv: dict[str, list] = {v: [] for v in geo.VOIV_BBOX}
    global current_aircraft
    current = []
    for ac in ac_list:
        c = _classify(ac)
        if c:
            if c["voivodeship"] in per_voiv:
                per_voiv[c["voivodeship"]].append(c)
            current.append(c)
    current_aircraft = current

    # Rejestrujemy przejścia co minutę, niezależnie od migawki mapy co 2 min.
    # Pierwszy obieg po restarcie tylko ustanawia bazę, żeby nie tworzyć lawiny
    # fałszywych „wejść”. Ostatnia znana pozycja jest zachowana także przy wyjściu.
    watch_now = {p["hex"]: p for p in current if p.get("hex") and _is_foreign_hex(p.get("hex"))}
    entered, exited = _watch_transitions(_watch_prev, watch_now)
    for plane in entered:
        db.add_adsb_watch_event("enter", plane)
    for plane in exited:
        db.add_adsb_watch_event("exit", plane)
    _watch_prev = watch_now

    hour_key = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
    for voiv, planes in per_voiv.items():
        n = len(planes)
        db.add_adsb_sample(voiv, n)
        baseline = db.adsb_baseline(voiv, config.ADSB_BASELINE_DAYS)
        status["counts"][voiv] = n
        status["baselines"][voiv] = round(baseline, 2)
        spike = (baseline > 0 and n >= config.ADSB_MIN_COUNT
                 and n > config.ADSB_SPIKE_FACTOR * baseline)
        if spike:
            calls = ", ".join(p["callsign"] or p["hex"] for p in planes[:6])
            await fusion.ingest(
                source="adsb", event_type="adsb_spike", voivodeship=voiv,
                points=config.POINTS["adsb_spike"],
                title=(f"ADS-B: {n} maszyn wojskowych nad woj. {voiv} "
                       f"(baseline 7d: {baseline:.1f}) — {calls}"),
                details={"count": n, "baseline": round(baseline, 2),
                         "aircraft": planes[:12]},
                # jeden sygnał na województwo na godzinę
                dedup_key=f"adsb:{voiv}:{hour_key}",
            )


async def run():
    async with httpx.AsyncClient(timeout=25) as client:
        while True:
            try:
                await _tick(client)
            except Exception as e:
                log.warning("adsb tick błąd: %s", e)
            await asyncio.sleep(config.ADSB_INTERVAL)
