"""mapa.ua w trybie cienia — trzy dni pomiaru, zero wpływu na punktację (18.09.2026).

Po co: mapa.ua to drugi agregator zagrożeń nad Ukrainą, ale zbudowany inaczej niż
NEPTUN — parsuje kanały Telegram modelem językowym, dorysowuje trasę od strefy
startu do zgeokodowanego celu i trzyma obiekt jako „aktywny” długo po ostatnim
meldunku. Pomiar z 18.09.2026, 20:16: 423 obiekty u nich wobec 25 u NEPTUN-a,
61% ich obiektów widzianych tylko raz, a sześć „aktywnych” sztuk stało dokładnie
na współrzędnych Lwowa — w tym dwa z tytułem „БпЛА курсом на Львове
(Бериславський р-н)”, czyli wieś na Chersońszczyźnie zgeokodowana jako Lwów.

Dlatego zanim cokolwiek z tego trafi do punktacji, przez trzy doby zbieramy
materiał do porównania (decyzja usera 18.09: „3 dni tylko zbierania danych,
żadnych punktacji”):

  mapa_report — każdy nowy meldunek o obiekcie (klucz id + last_seen): pozycja,
                typ, strefa startu, odległość od granicy PL i najbliższy track
                NEPTUN-a w tej samej chwili,
  mapa_tick   — podsumowanie zrzutu: ile obiektów mają, ile z nich świeżych, ile
                pokrywa się z NEPTUN-em, co obie strony mają przy granicy.

Kolektor wyłącza się sam po MAPA_SHADOW_UNTIL (poniedziałek 21.09 do północy),
żeby zapomniany nie odpytywał cudzego serwera w nieskończoność.
"""
import asyncio
import logging
import time
from datetime import datetime

import httpx

from .. import config, geo, stealth
from . import neptun

log = logging.getLogger("mapa_ua_shadow")

# Nagłówek musi być czystym ASCII — httpx koduje nagłówki latin-1, polskie znaki
# wywalały każde zapytanie (18.09.2026).
UA = "Straznik/1.0 (+https://straznik.eu; data comparison, shadow mode)"

status = {"ok": None, "last": None, "error": None, "finished": False,
          "until": config.MAPA_SHADOW_UNTIL, "ticks": 0, "reports": 0, "summary": {}}


def _until_ts() -> float:
    try:
        return datetime.fromisoformat(config.MAPA_SHADOW_UNTIL).timestamp()
    except ValueError:
        return 0.0


def _nearest_neptun(lat: float, lon: float) -> tuple[float, str | None, float | None]:
    """(odległość km, id tracku, wiek meldunku w minutach) najbliższego obiektu NEPTUN-a."""
    best = (999.0, None, None)
    now = time.time()
    for t in neptun.tracks.values():
        tlat, tlon = t.get("lat"), t.get("lon")
        if tlat is None or tlon is None:
            continue
        d = geo.haversine_km(lat, lon, tlat, tlon)
        if d < best[0]:
            age = None
            seen = t.get("updatedAt") or t.get("confirmedAt")
            if seen:
                try:
                    age = round((now - datetime.fromisoformat(
                        seen.replace("Z", "+00:00")).timestamp()) / 60, 1)
                except ValueError:
                    age = None
            best = (round(d, 1), t.get("id"), age)
    return best


def _short(o: dict, now: float) -> dict:
    lat, lon = o.get("lat"), o.get("lon")
    dist_pl = round(geo.nearest_border_point(lat, lon)[0]) if lat is not None else None
    nep_km, nep_id, nep_age = _nearest_neptun(lat, lon) if lat is not None else (None, None, None)
    trail = o.get("trail") or []
    return {
        "id": str(o.get("id")), "kind": o.get("kind"), "subkind": o.get("subkind"),
        "status": o.get("status"), "lat": lat, "lon": lon, "heading": o.get("heading"),
        "speed_kmh": o.get("speed_kmh"), "from_zone": o.get("from_zone"),
        "to_city": o.get("to_city"), "title": (o.get("title") or "")[:200],
        "amount": o.get("amount"), "first_seen": o.get("first_seen"), "last_seen": o.get("last_seen"),
        "age_min": round((now - (o.get("last_seen") or now)) / 60, 1),
        "reports": 1 if o.get("first_seen") == o.get("last_seen") else 2,   # 1 = widziany raz
        "trail_points": len(trail),
        "dist_pl_km": dist_pl,
        "nep_km": nep_km, "nep_id": nep_id, "nep_age_min": nep_age,
    }


async def once(client: httpx.AsyncClient) -> dict:
    r = await client.get(config.MAPA_SHADOW_URL, headers={"User-Agent": UA,
                                                          "Accept": "application/json"})
    r.raise_for_status()
    data = r.json()
    now = time.time()
    objects = data.get("objects") or []
    fresh = [o for o in objects
             if o.get("lat") is not None and o.get("last_seen")
             and now - o["last_seen"] <= config.MAPA_SHADOW_FRESH_S]

    zapisane = 0
    krotkie = []
    for o in fresh:
        s = _short(o, now)
        krotkie.append(s)
        if stealth.record("mapa_report", f"{s['id']}@{o['last_seen']}", s, now):
            zapisane += 1

    nep = [t for t in neptun.tracks.values() if t.get("lat") is not None]
    match_km = config.MAPA_SHADOW_MATCH_KM
    wspolne = sum(1 for s in krotkie if (s["nep_km"] or 999) <= match_km)
    nep_sami = sum(1 for t in nep
                   if min((geo.haversine_km(t["lat"], t["lon"], s["lat"], s["lon"])
                           for s in krotkie), default=999) > match_km)
    blisko_pl = [s for s in krotkie if (s["dist_pl_km"] or 9999) <= config.MAPA_SHADOW_NEAR_PL_KM]
    nep_blisko = sum(1 for t in nep
                     if geo.nearest_border_point(t["lat"], t["lon"])[0] <= config.MAPA_SHADOW_NEAR_PL_KM)

    atak = data.get("attack") or {}
    tick = {
        "mapa_total": len(objects),
        "mapa_active": sum(1 for o in objects if o.get("status") == "active"),
        "mapa_fresh": len(fresh),
        "mapa_seen_once": sum(1 for s in krotkie if s["reports"] == 1),
        "neptun_total": len(nep),
        "wspolne": wspolne,
        "tylko_mapa": len(krotkie) - wspolne,
        "tylko_neptun": nep_sami,
        "mapa_blisko_pl": len(blisko_pl),
        "neptun_blisko_pl": nep_blisko,
        "blisko_pl": [{k: s[k] for k in ("id", "kind", "status", "lat", "lon", "dist_pl_km",
                                         "nep_km", "age_min", "reports", "title")}
                      for s in sorted(blisko_pl, key=lambda x: x["dist_pl_km"] or 9999)[:20]],
        "attack_id": atak.get("id"), "attack_status": atak.get("status"),
        "attack_objects": atak.get("total_objects"),
        "neptun_connected": bool(neptun.status.get("connected")),
        "nowych_meldunkow": zapisane,
    }
    stealth.record("mapa_tick", datetime.fromtimestamp(now).strftime("%Y-%m-%dT%H:%M"), tick, now)
    status["reports"] += zapisane
    status["ticks"] += 1
    status["summary"] = {k: tick[k] for k in
                         ("mapa_total", "mapa_fresh", "neptun_total", "wspolne",
                          "tylko_mapa", "tylko_neptun", "mapa_blisko_pl", "neptun_blisko_pl")}
    return tick


async def run():
    koniec = _until_ts()
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        while True:
            if koniec and time.time() > koniec:
                if not status["finished"]:
                    status["finished"] = True
                    log.info("mapa.ua: koniec okna pomiarowego (%s) — zebrano %d meldunków w %d zrzutach",
                             config.MAPA_SHADOW_UNTIL, status["reports"], status["ticks"])
                await asyncio.sleep(3600)
                continue
            try:
                tick = await once(client)
                status.update(ok=True, last=time.time(), error=None)
                if tick["mapa_blisko_pl"] or tick["neptun_blisko_pl"]:
                    log.info("mapa.ua: %d obiektów ≤%d km od granicy PL (NEPTUN: %d), świeżych %d/%d",
                             tick["mapa_blisko_pl"], config.MAPA_SHADOW_NEAR_PL_KM,
                             tick["neptun_blisko_pl"], tick["mapa_fresh"], tick["mapa_total"])
            except Exception as exc:                          # noqa: BLE001
                status.update(ok=False, last=time.time(), error=repr(exc)[:200])
                log.warning("mapa.ua: zrzut nieudany: %s", exc)
            await asyncio.sleep(config.MAPA_SHADOW_INTERVAL)
