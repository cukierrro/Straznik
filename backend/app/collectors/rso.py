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

from .. import config, fusion, rcb_reference

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
RSO_END = ("zakończył", "zakonczyl", "zakończen", "zakonczen",
           # „Alert RCB zakończony" nie pasował do form powyżej i przechodził jako
           # nowy alarm; tak samo „zagrożenie minęło" (test 12.09.2026)
           "zakończon", "zakonczon", "odwoł", "odwol",
           "brak zagroż", "brak zagroz", "zniesion", "sytuacja opanowan",
           "zagrożenie minęł", "zagrozenie minel", "niebezpieczeństwo minęł",
           "niebezpieczenstwo minel")
# …ale te zwroty opisują alert WCIĄŻ OBOWIĄZUJĄCY i nie mogą go wyłączyć.
RSO_CONTINUES = ("do odwołania", "do odwolania", "do czasu odwołania",
                 "do czasu odwolania", "do czasu zakończenia", "do czasu zakonczenia",
                 "aż do odwołania", "az do odwolania")

_seen: set[str] = set()
_bootstrap = False


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).replace("ł", "l")


def _is_rcb_air_alert(text: str, headline: str | None = None) -> bool:
    """Czy to alert RCB o zagrożeniu z powietrza.

    Znaczniki KOŃCA zagrożenia szukamy wyłącznie w tytule i skrócie. Szukane w
    całej treści odrzucały prawdziwe alerty, bo sam alert często zawiera zwrot
    „obowiązuje do odwołania" albo „do czasu zakończenia" (audyt 11.09.2026).
    """
    t = (text or "").lower()
    head = (headline if headline is not None else text or "").lower()
    for cont in RSO_CONTINUES:      # zwroty TRWAJĄCEGO alertu, nie jego końca
        head = head.replace(cont, " ")
    if any(w in head for w in RSO_END):
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


BOOTSTRAP_FRESH_MIN = 60


def _issued_recently(item: dict, minutes: int = BOOTSTRAP_FRESH_MIN) -> bool:
    """Czy alert wydano w ostatnich `minutes`. `valid_from` jest w czasie lokalnym
    PL bez strefy, więc porównujemy z lokalnym „teraz" (jak w `_still_active`)."""
    vf = item.get("valid_from")
    if not vf:
        return False
    try:
        from datetime import datetime, timedelta, timezone
        start = datetime.strptime(str(vf)[:19], "%Y-%m-%d %H:%M:%S")
        now_pl = (datetime.now(timezone.utc) + timedelta(hours=2)).replace(tzinfo=None)
        return start >= now_pl - timedelta(minutes=minutes)
    except Exception:
        return False


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
        headline = f"{it.get('title','')} {it.get('shortcut','')}"
        if not _is_rcb_air_alert(text, headline):
            continue
        active += 1
        mid = str(it.get("id"))
        if not _still_active(it):
            continue
        voivodeships = _voivs_for(it)
        reference_new = False
        for voiv in voivodeships:
            key = f"rso:{mid}:{voiv}"
            if key in _seen:
                continue
            _seen.add(key)
            if not _bootstrap and not _issued_recently(it):
                # Pierwszy przebieg: STARE alerty nie mają alarmować. Świeży alert
                # (patrz _issued_recently) musi jednak zadziałać normalnie — alert
                # wydany w czasie przestoju albo sekundę przed wdrożeniem dostawał
                # 0 pkt i ten sam klucz deduplikacji, więc przepadał na zawsze,
                # a RCB to jedyne źródło trafnych alarmów (audyt 11.09.2026).
                fusion.db.add_signal("rcb", "rso_alert_seen", voiv, 0.0,
                                     f"RCB/RSO (istniejący przy starcie): „{it.get('title','')[:110]}”",
                                     {"rso_id": mid}, key)
                reference_new = True
                continue
            title = it.get("shortcut") or it.get("title") or "Alert RCB"
            inserted = await fusion.ingest(
                source="rcb", event_type="rso_alert", voivodeship=voiv,
                points=config.POINTS["rcb_alert"],
                title=f"Alert RCB (RSO): „{title[:120]}”",
                details={"rso_id": mid, "valid_from": it.get("valid_from"),
                         "valid_to": it.get("valid_to")},
                dedup_key=key,
            )
            reference_new = reference_new or inserted
        if reference_new:
            rcb_reference.capture(
                source="rso", source_event_id=mid,
                title=it.get("shortcut") or it.get("title") or "Alert RCB",
                voivodeships=voivodeships, source_time_raw=it.get("valid_from"),
                bootstrap=not _bootstrap,
            )
    status["active"] = active
    _bootstrap = True


async def run():
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await _check(client)
            await asyncio.sleep(config.RSO_INTERVAL)
