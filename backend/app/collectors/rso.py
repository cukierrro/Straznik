"""Warstwa 2e — oficjalne alerty RCB przez RSO (Regionalny System Ostrzegania).

Dlaczego osobno od `rcb.py`: tamten scrapuje ARTYKUŁY z gov.pl/web/rcb, a realne
„Alert RCB" (SMS/SPO) to broadcasty RSO — nie wpisy na stronie. Podczas ataku
20.08.2026 ludzie dostali oficjalny alert RCB, a Strażnik go nie widział, bo
scraper gov.pl go nie łapie. RSO agreguje te broadcasty i wystawia je publicznie
w JSON (bez tokenu) przez TVP: `komunikaty.tvp.pl/komunikatyxml/...`.

RSO niesie MNÓSTWO komunikatów niezwiązanych z zagrożeniem powietrznym (burze
IMGW, poziomy wód, drogi). Dlatego filtr jest wąski: komunikat musi być
POCHODZENIA RCB (prefiks „UWAGA! UWAGA! UWAGA!" / „Alert RCB" / „SPO-") ORAZ mieć
kontekst POWIETRZNY (atak powietrzny, dron, rakieta, naruszenie przestrzeni…).
Komunikaty „zakończenie / brak zagrożenia" są pomijane (nie alarmujemy na odwołanie).
"""
import asyncio
import logging
import time
import unicodedata

import httpx

from .. import config, fusion

log = logging.getLogger("rso")
status = {"ok": False, "last": None, "error": None, "active": 0}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Komunikat musi POCHODZIĆ od RCB — to odsiewa IMGW/drogi/wodę, które też są w RSO.
RSO_ORIGIN = ("alert rcb", "uwaga! uwaga! uwaga", "uwaga!uwaga!uwaga",
              "spo-", "rcb/", " rcb ", "(rcb", "rcb ")
# …i mieć kontekst POWIETRZNY (RCB alarmuje też o powodziach, upałach itp.).
RSO_AIR = ("powietrzn", "z powietrza", "dron", "bezzałogow", "bezzalogow", "bsp",
           "shahed", "geran", "rakiet", "pocisk", "nalot", "ostrzał", "ostrzal",
           "obiekt lataj", "naruszenie przestrzeni", "myśliwc", "mysliwc",
           "obrony powietrzn", "obiekt powietrzn")
# Nie alarmujemy na komunikat KOŃCZĄCY zagrożenie / odwołanie.
RSO_END = ("zakończył", "zakonczyl", "zakończen", "zakonczen", "odwoł", "odwol",
           "brak zagroż", "brak zagroz", "zniesion", "sytuacja opanowan")

_seen: set[str] = set()
_bootstrap = False


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).replace("ł", "l")


def _is_rcb_air_alert(text: str) -> bool:
    t = (text or "").lower()
    if any(w in t for w in RSO_END):
        return False
    return any(o in t for o in RSO_ORIGIN) and any(a in t for a in RSO_AIR)


# slug_name z RSO (bez „ł"/diakrytyków?) → nasze nazwy województw
_VOIV_BY_FOLD = {_fold(v): v for v in config.VOIVODESHIPS}


def _voivs_for(item: dict) -> list[str]:
    out = []
    prov = item.get("provinces") or {}
    if isinstance(prov, dict):
        for p in prov.values():
            v = _VOIV_BY_FOLD.get(_fold((p or {}).get("slug_name") or (p or {}).get("name")))
            if v and v not in out:
                out.append(v)
    # brak przypisania → cała ściana wschodnia (alert ogólnokrajowy dotyczy nas)
    return out or list(config.PRIORITY_VOIVODESHIPS)


def _still_active(item: dict) -> bool:
    """Pomija komunikaty wygasłe. valid_to jest w czasie lokalnym PL (bez strefy),
    porównujemy z przybliżonym „teraz" lokalnym (UTC+2, lato) z zapasem."""
    vt = item.get("valid_to")
    if not vt:
        return True
    try:
        from datetime import datetime, timezone, timedelta
        end = datetime.strptime(str(vt)[:19], "%Y-%m-%d %H:%M:%S")
        now_pl = datetime.now(timezone.utc) + timedelta(hours=2)   # CEST, przybliżenie
        return end.replace(tzinfo=None) >= now_pl.replace(tzinfo=None) - timedelta(hours=1)
    except Exception:
        return True


async def _check(client: httpx.AsyncClient):
    global _bootstrap
    try:
        r = await client.get(config.RSO_URL, headers={"User-Agent": UA},
                             follow_redirects=True)
        r.raise_for_status()
        data = r.json()
        status.update(ok=True, last=time.time(), error=None)
    except Exception as e:
        status.update(ok=False, error=repr(e))
        return

    items = data.get("newses") or []
    active = 0
    for it in items:
        text = f"{it.get('title','')} {it.get('shortcut','')} {it.get('content','')}"
        if not _is_rcb_air_alert(text):
            continue
        active += 1
        mid = str(it.get("id"))
        if not _still_active(it):
            continue
        for voiv in _voivs_for(it):
            key = f"rso:{mid}:{voiv}"
            if key in _seen:
                continue
            _seen.add(key)
            if not _bootstrap:
                # pierwszy przebieg: istniejące już alerty NIE mają alarmować
                fusion.db.add_signal("rcb", "rso_alert_seen", voiv, 0.0,
                                     f"RCB/RSO (istniejący przy starcie): „{it.get('title','')[:110]}”",
                                     {"rso_id": mid}, key)
                continue
            title = it.get("shortcut") or it.get("title") or "Alert RCB"
            await fusion.ingest(
                source="rcb", event_type="rso_alert", voivodeship=voiv,
                points=config.POINTS["rcb_alert"],
                title=f"Alert RCB (RSO): „{title[:120]}”",
                details={"rso_id": mid, "valid_from": it.get("valid_from"),
                         "valid_to": it.get("valid_to")},
                dedup_key=key,
            )
    status["active"] = active
    _bootstrap = True


async def run():
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await _check(client)
            await asyncio.sleep(config.RSO_INTERVAL)
