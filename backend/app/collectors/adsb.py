"""Warstwa 2b — ADS-B: aktywność lotnictwa wojskowego nad wschodnią Polską.

To publiczne dane z transponderów (samoloty, które CHCĄ być widoczne) — nie
namierzanie obiektów wroga. Sygnał = statystyczna anomalia: liczba maszyn
wojskowych nad województwem > 2x baseline z ostatnich 7 dni.

Domyślnie darmowe, bezkluczowe API adsb.lol (endpoint /v2/mil — wszystkie
maszyny wojskowe globalnie, filtrujemy bboxem). Fallback: adsb.fi.
Opcjonalnie ADSBexchange przez RapidAPI (klucz w .env).
"""
import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx

from .. import config, db, fusion, geo

log = logging.getLogger("adsb")
status = {"ok": False, "last": None, "error": None, "provider": config.ADSB_PROVIDER,
          "counts": {}, "baselines": {}}

# aktualne maszyny wojskowe nad PL-wschód (dla frontendu)
current_aircraft: list[dict] = []

MIL_CALLSIGN_PREFIXES = ("NATO", "MMF", "REDEYE", "BART", "OSY", "PLF", "HKY",
                         "VIPER", "WOLF", "FENIX", "DUKE", "TIGER")


async def _fetch_mil(client: httpx.AsyncClient) -> list[dict] | None:
    prov = config.ADSB_PROVIDER
    try:
        if prov == "adsbx" and config.ADSBX_RAPIDAPI_KEY:
            r = await client.get(
                "https://adsbexchange-com1.p.rapidapi.com/v2/mil/",
                headers={"X-RapidAPI-Key": config.ADSBX_RAPIDAPI_KEY,
                         "X-RapidAPI-Host": "adsbexchange-com1.p.rapidapi.com"})
            r.raise_for_status()
            return r.json().get("ac") or []
        base = "https://api.adsb.fi/v2" if prov == "adsb.fi" else "https://api.adsb.lol/v2"
        r = await client.get(f"{base}/mil")
        r.raise_for_status()
        return r.json().get("ac") or []
    except Exception as e:
        status.update(ok=False, error=f"{prov}: {e}")
        # automatyczny fallback adsb.lol -> adsb.fi
        if prov == "adsb.lol":
            try:
                r = await client.get("https://api.adsb.fi/v2/mil")
                r.raise_for_status()
                status.update(ok=True, error=None, provider="adsb.fi(fallback)")
                return r.json().get("ac") or []
            except Exception:
                pass
        return None


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
    }


async def _tick(client: httpx.AsyncClient):
    ac_list = await _fetch_mil(client)
    if ac_list is None:
        return
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
