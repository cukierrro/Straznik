"""Warstwa 2b — strefy przestrzeni powietrznej u sąsiadów (RO/EE/LT/LV).

Pomysł: aktywacja strefy zamkniętej dla ruchu cywilnego u sąsiada przy Ukrainie
lub Kaliningradzie/Białorusi bywa sygnałem WYPRZEDZAJĄCYM dla Polski — tak jak
istniejące „media bałtyckie" i „alarmy obwodów UA".

PUNKTACJA (2026-08-06, po analizie kilku dni instrumentacji): liczymy TYLKO realne
zamknięcia — kind ∈ {PROHIBITED, RD, REQ_AUTHORISATION} (odrzucamy NO_RESTRICTION,
CONDITIONAL, RT itp. ≈ 59% doradczego szumu). RO dodatkowo tylko z PÓŁNOCY (przy
granicy z UA). Mapowanie na flankę: LT/EE → podlaskie + warmińsko-mazurskie,
RO → podkarpackie. LV POMINIĘTA w punktowaniu (jej "PROHIBITED" to rutynowe strefy
dronowe, ~671 aktywnych — patrz _COUNTRY_VOIVS). Waga NISKA 0,3 (cap 0,6) — sygnał
POŚREDNI: media 1,5 + sąsiad
0,3 = 1,8 < próg 2,0, więc sam nie domyka alarmu („bez flaszu"). Instrumentacja
loguje NADAL wszystkie aktywne strefy (rutyna też) — filtrujemy tylko wkład do fuzji.
Przegląd na VPS:  journalctl -u straznik | grep "SĄSIAD"

Źródła (zweryfikowane realnym curlem — docs/ZRODLA_STREF_SASIEDZI.md):
- RO: ROMATSA GeoServer WFS `opr:AUP` (GeoJSON; NOTAM + kod Q + okno UTC)
- EE/LT: EANS/Oro Navigacija `uas.geojson` (ED-269; strefy z numerem NOTAM serii A)
- LV: LGS ArcGIS przez proxy same-origin m.airspace.lv (okno epoch ms, operator)
"""
import asyncio
import json
import logging
import re
import ssl
import time
from datetime import datetime, timezone

import httpx

from .. import config, fusion


def _relaxed_tls() -> ssl.SSLContext:
    """Serwer ROMATSA (flightplan.romatsa.ro) używa słabego klucza Diffiego-
    Hellmana; nowoczesny OpenSSL (Ubuntu 24.04) odrzuca handshake z błędem
    „DH_KEY_TOO_SMALL". Dla TEGO hosta luzujemy poziom bezpieczeństwa TLS do
    SECLEVEL=1. Bezpieczne: to publiczny GeoJSON, wyłącznie odczyt, bez sekretów.
    """
    ctx = ssl.create_default_context()
    try:
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
    except ssl.SSLError:
        pass
    return ctx


_RO_TLS = _relaxed_tls()

log = logging.getLogger("neighbours")
status = {"ok": False, "last": None, "error": "not started", "zones_now": 0}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
INTERVAL = 600  # 10 min — strefy zmieniają się wolno, a to tylko instrumentacja

RO_AUP = ("https://flightplan.romatsa.ro/init/geoserver/ows?service=WFS&version=1.0.0"
          "&request=GetFeature&typeName=opr:AUP&outputFormat=application/json")
EE_UAS = "https://utm.eans.ee/avm/utm/uas.geojson"
LT_UAS = "https://utm.ans.lt/avm/utm/uas.geojson"
LV_PROXY = "https://m.airspace.lv/mob/proxy/proxy.ashx?"
LV_LAYER = ("https://LGS-AGS/rest/services/DRONES/DronesZonesUAS/MapServer/{n}/query"
            "?where=1%3D1&outFields=*&returnGeometry=false&f=json")

# strefa z numerem NOTAM, np. A1964/26 albo A196426 — czyli czasowa, nie stała
_NOTAM_RE = re.compile(r"^[A-Z]\d{3,4}/?\d{2}$")

# ── SCORING: tylko realne zamknięcia, zmapowane na przygraniczne woj. PL ──────
_MEANINGFUL = {"PROHIBITED", "RD", "REQ_AUTHORISATION"}   # reszta = doradcze/rutyna
_RO_NORTH = 47.0            # tylko północna RO (przy granicy z UA); płd./M.Czarne odpada
_COUNTRY_VOIVS = {         # sygnał wyprzedzający → polskie województwo(a) przy tej flance
    "RO": ["podkarpackie"],
    "EE": ["podlaskie", "warmińsko-mazurskie"],
    "LT": ["podlaskie", "warmińsko-mazurskie"],
    # LV CELOWO POMINIĘTA w punktowaniu: na Łotwie "PROHIBITED" to standardowy typ
    # stref dronowych (lotniska, granice) — ~671 aktywnych naraz, czysta rutyna, nie
    # zamknięcie przez zagrożenie (inna taksonomia niż RO/EE). Zostaje w logach
    # (instrumentacja); wróci, gdy dodamy filtr operatora wojskowego (TOFLYSERVICE).
}


def _centroid_lat(geom):
    """Przybliżona szerokość środka strefy (średnia z wierzchołków) — do
    odróżnienia północnej RO (istotnej dla PL przez granicę z UA) od południowej."""
    lats = []

    def walk(x):
        if isinstance(x, (list, tuple)):
            if len(x) >= 2 and isinstance(x[0], (int, float)) and isinstance(x[1], (int, float)):
                lats.append(x[1])
            else:
                for e in x:
                    walk(e)

    try:
        walk((geom or {}).get("coordinates"))
    except Exception:
        pass
    return sum(lats) / len(lats) if lats else None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


async def _get(client, url, headers=None):
    r = await client.get(url, headers={"User-Agent": UA, **(headers or {})})
    r.raise_for_status()
    return r.json()


def _parse_ro(data) -> list[dict]:
    """opr:AUP: aktywne teraz, z kodem Q (znaki 1-2 = typ strefy, 3-4 = status)."""
    now, out = _now(), []
    for f in data.get("features", []):
        p = f.get("properties", {}) or {}
        df, dt = _iso(p.get("dfrom")), _iso(p.get("dto"))
        if not (df and dt and df <= now <= dt):
            continue
        m = re.search(r"Q\)\s*\w{4}/Q(\w{4})", p.get("mesaj", "") or "")
        q = m.group(1) if m else "????"
        out.append({"country": "RO", "ident": p.get("serie"), "kind": q[:2],
                    "reason": q, "lower": p.get("lower"), "upper": p.get("upper"),
                    "note": f"tip={p.get('tip')}", "lat": _centroid_lat(f.get("geometry"))})
    return out


def _parse_ed269(data, country) -> list[dict]:
    """ED-269 (EE/LT): strefy z numerem NOTAM, jeszcze nie wygasłe."""
    now, out = _now(), []
    for f in data.get("features", []):
        p = f.get("properties", {}) or {}
        name = (p.get("name") or "").strip()
        ident = (p.get("identifier") or "").strip()
        if not (_NOTAM_RE.match(name) or _NOTAM_RE.match(ident)):
            continue                      # tylko czasowe (NOTAM), pomijamy stałe
        exp = _iso((p.get("extendedProperties") or {}).get("expirationTime"))
        if exp and exp < now:
            continue                      # już wygasłe
        msg = (p.get("message") or "")
        out.append({"country": country, "ident": name or ident,
                    "kind": p.get("restriction") or "?", "reason": p.get("reason") or "",
                    "lower": p.get("lower"), "upper": p.get("upper"),
                    "note": msg[:70].replace("\n", " ")})
    return out


def _parse_lv(features) -> list[dict]:
    """ArcGIS: strefy aktywne teraz wg TIMEPERIODSTART/ENDDATE (epoch ms)."""
    now_ms, out = _now().timestamp() * 1000, []
    for f in features:
        a = f.get("attributes", {}) or {}
        start, end = a.get("TIMEPERIODSTARTDATE"), a.get("TIMEPERIODENDDATE")
        if a.get("PERMANENT") in (1, "1", True):
            continue
        if not (start and end and start <= now_ms <= end):
            continue
        out.append({"country": "LV", "ident": a.get("ZONENAME"),
                    "kind": a.get("RESTRICTIONNAME") or "?", "reason": a.get("REASONNAME") or "",
                    "lower": a.get("LOWERLIMIT"), "upper": a.get("UPPERLIMIT"),
                    "note": (a.get("TOFLYSERVICE") or a.get("TOFLYNAME") or "")[:50]})
    return out


# zbiór identyfikatorów z poprzedniego obiegu — logujemy tylko NOWE aktywacje
_prev: set[str] = set()


async def _tick(client: httpx.AsyncClient):
    global _prev
    zones: list[dict] = []
    errs = []

    # RO — osobny klient z poluzowanym TLS (słaby DH po stronie ROMATSA)
    try:
        async with httpx.AsyncClient(timeout=30, verify=_RO_TLS,
                                     follow_redirects=True) as ro:
            zones += _parse_ro(await _get(ro, RO_AUP))
    except Exception as e:
        errs.append(f"RO:{e}")

    for name, url in (("EE", EE_UAS), ("LT", LT_UAS)):
        try:
            zones += _parse_ed269(await _get(client, url), name)
        except Exception as e:
            errs.append(f"{name}:{e}")

    try:  # LV — 4 warstwy przez proxy
        for n in (0, 1, 2, 3):
            data = await _get(client, LV_PROXY + LV_LAYER.format(n=n),
                              headers={"Referer": "https://m.airspace.lv/mob/"})
            zones += _parse_lv(data.get("features", []))
    except Exception as e:
        errs.append(f"LV:{e}")

    per = {}
    for z in zones:
        per[z["country"]] = per.get(z["country"], 0) + 1
    log.info("SĄSIAD podsumowanie: %s (aktywnych czasowych stref) %s",
             " ".join(f"{k}={v}" for k, v in sorted(per.items())) or "brak",
             ("| błędy: " + "; ".join(errs)) if errs else "")

    cur = set()
    for z in zones:
        key = f"{z['country']}:{z['ident']}"
        cur.add(key)
        if _prev and key not in _prev:      # nowa aktywacja od poprzedniego obiegu
            log.info("SĄSIAD nowa: %s %s typ=%s powód=%s pułap=%s–%s %s",
                     z["country"], z["ident"], z["kind"], z["reason"],
                     z["lower"], z["upper"], z["note"])
            # SCORING: tylko realne zamknięcia (PROHIBITED / RD / REQ_AUTHORISATION);
            # RO dodatkowo tylko z północy (przy granicy z UA — płd./M.Czarne odpada).
            # Niska waga (0,3, cap 0,6) — sygnał POŚREDNI, sam nie domyka alarmu.
            if z["kind"] in _MEANINGFUL and (
                    z["country"] != "RO" or (z.get("lat") or 0) >= _RO_NORTH):
                for voiv in _COUNTRY_VOIVS.get(z["country"], []):
                    await fusion.ingest(
                        source="neighbours", event_type="neighbour_zone",
                        voivodeship=voiv, points=config.POINTS["neighbour_zone"],
                        title=(f"Sąsiad ({z['country']}): {z['kind']} {z['ident']} — "
                               "zamknięcie przestrzeni, możliwy sygnał wyprzedzający"),
                        details={"country": z["country"], "kind": z["kind"],
                                 "ident": z["ident"]},
                        dedup_key=f"neigh:{z['country']}:{z['ident']}:{voiv}",
                    )
    _prev = cur
    status.update(ok=not errs, last=time.time(), error="; ".join(errs) or None,
                  zones_now=len(zones))


async def run():
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        while True:
            try:
                await _tick(client)
            except Exception as e:
                log.warning("neighbours tick błąd: %s", e)
                status.update(ok=False, error=str(e))
            await asyncio.sleep(INTERVAL)
