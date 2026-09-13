"""Strażnik — backend FastAPI: kolektory, fuzja, API, WebSocket, statyka frontendu."""
import asyncio
import logging
import os
import time

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import (alert_log, app_updates, config, db, escalation_shadow, fusion, load_guard,
               monitoring, notify, public_cache, rcb_reference)
from .collectors import adsb, neighbours, neptun, official_alerts, pansa, rcb, rso, rss_media
from .neptun_archive import source_metadata

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("main")
# D10 (audyt): httpx logował każde zapytanie kolektorów na INFO — szum w dzienniku
logging.getLogger("httpx").setLevel(logging.WARNING)

# Publiczna dokumentacja API nie jest potrzebna użytkownikom, a ułatwia nadużycia.
app = FastAPI(title="Strażnik", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])
app.add_middleware(public_cache.PageCacheHeaders)
# ostatni dodany = pierwszy w kolejce: bezpiecznik odrzuca, zanim cokolwiek się policzy
app.add_middleware(load_guard.GuardMiddleware)

# ── WebSocket broadcast ──────────────────────────────────────────────────────
_ws_clients: set[WebSocket] = set()
_last_broadcast = 0.0
_broadcast_pending = False
_ws_message = ""          # gotowa ramka stanu — jedna serializacja dla wszystkich
# Każde połączenie WebSocket to otwarte gniazdo i bufor w tym jednym procesie.
# Powyżej limitu odmawiamy (kod 1013), a klient przechodzi na odpytywanie
# /api/state, które jest gotowymi bajtami i może je trzymać Cloudflare.
WS_MAX_CLIENTS = int(os.getenv("WS_MAX_CLIENTS", "3000"))
WS_SEND_TIMEOUT_S = 3.0


def _load_notice():
    """Komunikat administracyjny (np. zapowiedź testu) z pliku data/notice.json,
    edytowalny na VPS bez restartu. Kształt: {"id","text","until"(opcj. ISO)}.
    Apka tylko WYŚWIETLA go i pozwala zamknąć — ZERO danych zwrotnych (bez
    telemetrii). Zwraca None, gdy pliku brak, jest niepełny albo minął `until`
    (auto-wygaśnięcie, żeby zapomniany komunikat sam zniknął)."""
    import json
    from datetime import datetime, timezone
    try:
        n = json.loads((config.DATA_DIR / "notice.json").read_text(encoding="utf-8"))
        if not n.get("id") or not n.get("text"):
            return None
        until = n.get("until")
        if until:
            try:
                if datetime.now(timezone.utc) > datetime.fromisoformat(
                        str(until).replace("Z", "+00:00")):
                    return None
            except Exception:
                pass
        return {"id": n["id"], "text": n["text"]}
    except Exception:
        return None


def build_state() -> dict:
    return {
        "notice": _load_notice(),
        "fusion": fusion.compute_state(),
        "neptun": neptun.public_state(),
        "adsb": {"aircraft": adsb.current_aircraft,
                 "counts": adsb.status["counts"], "baselines": adsb.status["baselines"],
                 "trails": adsb.trails},
        "health": {
            "neptun": neptun.status["connected"],
            # Alarmy obwodowe UA płyną tym samym WebSocketem co Neptun (nie ma
            # osobnego kolektora), więc ich zdrowie = połączenie Neptuna. Bez tego
            # pola dioda „Alarmy UA" świeciła na czerwono w trybie backendu.
            "ua_alerts": neptun.status["connected"],
            # „ok" tylko przy świeżym sukcesie: sama flaga zostawała zielona,
            # gdy pętla kolektora przestała się kręcić (audyt D2/C8).
            "adsb": monitoring.fresh(adsb.status, config.ADSB_INTERVAL, 300),
            "pansa": monitoring.fresh(pansa.status, config.PANSA_INTERVAL, 900),
            # Dioda „RCB/RSO" pokazuje RSO — jedyne źródło trafnych alarmów. Do
            # 13.09.2026 pokazywała kolektor strony gov.pl, który od E3 jest tylko
            # punktem odniesienia (0 pkt); jego stan jest w /api/health jako rcb.
            "rcb": monitoring.rso_fresh(),
            "rss": {u: st.get("ok", False) for u, st in rss_media.status["feeds"].items()},
            # Litwa/Łotwa/Estonia osobno: w oknie „Źródła” widać, że kanały
            # działają i kiedy był ostatni artykuł oraz ostatni alarm.
            "baltic": rss_media.baltic,
            "neighbour_zones": {"by_country": neighbours.status.get("by_country", {}),
                                "recent_new": neighbours.status.get("recent_new", [])[:12]},
        },
    }


def refresh_state() -> None:
    """Stan liczony raz i od razu podawany wszystkim: /api/state i WebSocket."""
    global _ws_message
    blob = public_cache.make_blob(build_state())
    public_cache.put("state", blob)
    _ws_message = '{"type":"state","data":' + blob.raw.decode() + "}"


async def _send(ws: WebSocket, message: str):
    try:
        await asyncio.wait_for(ws.send_text(message), WS_SEND_TIMEOUT_S)
        return None
    except Exception:
        return ws


async def broadcast_state():
    """Throttling: max 1 broadcast / 2 s (Neptun potrafi słać dziesiątki upsertów).

    Ramka jest serializowana raz, a wysyłka idzie równolegle z limitem czasu:
    wcześniej każdy klient dostawał osobny json.dumps, po kolei, więc jeden wolny
    telefon wstrzymywał wszystkich."""
    global _last_broadcast, _broadcast_pending
    if _broadcast_pending:
        return
    wait = max(0.0, 2.0 - (time.time() - _last_broadcast))
    _broadcast_pending = True
    if wait:
        await asyncio.sleep(wait)
    _broadcast_pending = False
    _last_broadcast = time.time()
    refresh_state()
    if not _ws_clients:
        return
    message = _ws_message
    clients = list(_ws_clients)
    for i in range(0, len(clients), 500):
        for dead in await asyncio.gather(*(_send(ws, message) for ws in clients[i:i + 500])):
            if dead is not None:
                _ws_clients.discard(dead)


async def state_loop():
    """Wynik maleje z wiekiem sygnałów także bez nowych zdarzeń."""
    while True:
        try:
            refresh_state()
        except Exception as e:
            log.warning("stan: %s", e)
        await asyncio.sleep(3)


async def shed_websockets(fraction: float) -> None:
    """Pod presją pamięci zamyka część połączeń (najpierw te najstarsze w zbiorze).
    Klient dostaje 1013 i przechodzi na odpytywanie gotowego /api/state."""
    victims = list(_ws_clients)[: int(len(_ws_clients) * fraction)]
    for ws in victims:
        _ws_clients.discard(ws)
    await asyncio.gather(*(_close(ws) for ws in victims))


async def _close(ws: WebSocket) -> None:
    try:
        await asyncio.wait_for(ws.close(code=1013), 2)
    except Exception:
        pass


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    if len(_ws_clients) >= WS_MAX_CLIENTS or load_guard.refuse_websocket():
        # 1013 = „spróbuj później”; klient przechodzi na odpytywanie /api/state
        await ws.close(code=1013)
        return
    try:
        await ws.accept()
    except Exception:
        return
    _ws_clients.add(ws)
    try:
        if not _ws_message:
            refresh_state()
        await ws.send_text(_ws_message)
        while True:
            await ws.receive_text()   # klient nic nie musi słać; trzymamy połączenie
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        _ws_clients.discard(ws)


# ── REST API ─────────────────────────────────────────────────────────────────
@app.get("/api/state")
async def api_state(request: Request):
    if public_cache.get("state") is None:
        refresh_state()
    return public_cache.respond(request, "state")


@app.get("/api/signals")
async def api_signals(limit: int = 100):
    # `limit=-1` zwracał całą tabelę (audyt D7/D10)
    return {"signals": db.recent_signals(max(1, min(int(limit), 500)))}


@app.get("/api/history")
async def api_history(at: str | None = None, hours: int = 12):
    """Przeglądanie wstecz: migawka mapy z wybranego momentu + sygnały do niego.

    Bez parametru `at` zwraca tylko listę dostępnych znaczników czasu.
    """
    times = db.snapshot_times(hours)
    if at is None:
        return {"times": times, "hours": hours}
    snap = db.snapshot_at(at)
    if snap is None:
        return {"times": times, "at": at, "snapshot": None, "signals": []}
    from datetime import datetime, timedelta
    end = snap["ts"]
    try:
        ref = datetime.fromisoformat(end)
        start = (ref - timedelta(minutes=config.FUSION_WINDOW_MIN)).isoformat(timespec="seconds")
    except Exception:
        ref, start = None, end
    sigs = db.signals_between(start, end)
    if ref is not None:
        long_start = (ref - timedelta(minutes=config.FUSION_WINDOW_MIN + config.UA_ALERT_MAX_MIN)
                      ).isoformat(timespec="seconds")
        sigs += fusion.active_ua_alerts(
            [s for s in db.signals_between(long_start, end)
             if s.get("event_type") in ("ua_alert_border", "ua_alert_end")], ref)
    # ten sam limit klasy źródła co fuzja na żywo — bez tego historia sumowała
    # surowe punkty (np. 4 rutynowe strefy PAŻP = fałszywe 4.0 zamiast 1.0)
    per_voiv = fusion.accumulate(sigs, ref)
    scores = {v: round(st["score"], 1) for v, st in per_voiv.items() if st["score"] > 0}
    annotated = [sig for st in per_voiv.values() for sig in st["signals"]]
    annotated.sort(key=lambda s: s["ts"], reverse=True)
    return {"times": times, "at": at, "snapshot": snap,
            "signals": annotated, "scores": scores}


@app.get("/api/history/timeline")
async def api_timeline(request: Request):
    """Oś czasu suwaka historii (najwyższy wynik w kraju dla każdej migawki).
    Gotowa odpowiedź z public_cache, odświeżana co minutę."""
    if public_cache.get("timeline") is None:
        await public_cache.rebuild("timeline", public_cache.build_timeline)
    return public_cache.respond(request, "timeline")


@app.get("/api/history/bundle")
async def api_history_bundle(request: Request):
    """Cała historia 12 h w JEDNYM pobraniu: migawki + surowe sygnały z okna.
    Klient przewija suwak lokalnie. Paczka jest składana w tle co minutę
    i podawana jako gotowe, skompresowane bajty (public_cache) — składanie przy
    każdym wejściu zabiło serwer 13.09.2026 o 04:54."""
    if public_cache.get("bundle") is None:
        await public_cache.rebuild("bundle", public_cache.build_bundle_bytes)
    return public_cache.respond(request, "bundle")


@app.get("/api/adsb/watch")
async def api_adsb_watch(hours: int = 12):
    """Small read-only journal; independent of the large snapshot bundle."""
    return {"events": db.adsb_watch_events(max(1, min(hours, 12)))}


@app.get("/api/health")
async def api_health():
    return {
        "neptun": neptun.status, "adsb": adsb.status, "pansa": pansa.status,
        "rcb": rcb.status, "rso": rso.status, "rss": rss_media.status["feeds"],
        "neighbours": neighbours.status,
        "official_alerts": official_alerts.status,
        "notify": {"ntfy": config.NTFY_ENABLED and bool(config.NTFY_TOPIC),
                   "telegram": config.TELEGRAM_ENABLED,
                   "webpush": config.WEBPUSH_ENABLED,
                   # cicha awaria wysyłki do aplikacji nie może być niewidoczna
                   "fcm": notify.fcm_status},
        "progression_shadow": escalation_shadow.status,
        "rcb_reference": rcb_reference.status,
        "public_cache": {**public_cache.status, "ws_clients": len(_ws_clients),
                         "ws_max": WS_MAX_CLIENTS},
        "load_guard": load_guard.status,
        "backup": _backup_status(),
        "critical": monitoring.critical_check(),
        "tasks": monitoring.supervisor,
        "heartbeat": monitoring.public_heartbeat(),
    }


@app.get("/api/health/critical")
async def api_health_critical():
    """Dla monitoringu zewnętrznego: 503, gdy alarm może nie dotrzeć.

    Osobny adres, bo /api/health sprawdza aplikacja przy starcie — kod 503 tam
    przełączyłby wszystkich użytkowników na tryb awaryjny."""
    result = monitoring.critical_check()
    return JSONResponse(result, status_code=200 if result["ok"] else 503,
                        headers={"Cache-Control": "no-store"})


def _backup_status() -> dict:
    """Ostatnia kopia zapasowa (scripts/backup_vps.py, co 6 h). `stale` = starsza niż 7 h."""
    import json
    from datetime import datetime, timezone
    try:
        st = json.loads((config.DATA_DIR / "backup_status.json").read_text(encoding="utf-8"))
        age_h = (datetime.now(timezone.utc) - datetime.fromisoformat(st["at"])).total_seconds() / 3600
        return {**st, "age_h": round(age_h, 1), "stale": age_h > 7}
    except Exception:
        return {"ok": False, "error": "brak kopii"}


@app.get("/api/zones")
async def api_zones(request: Request):
    """Aktywne strefy PAŻP o charakterze wojskowym — WYŁĄCZNIE informacyjnie.

    Nie wchodzą do punktacji i nie wywołują powiadomień. Osobny endpoint, a nie
    część /api/state, bo geometria stref waży setki kilobajtów, a stan leci przez
    WebSocket co kilka sekund. Aplikacja pobiera to raz na kilka minut.
    """
    if public_cache.get("zones") is None:
        await public_cache.rebuild("zones", _zones_payload, in_thread=False)
    return public_cache.respond(request, "zones")


def _zones_payload() -> dict:
    return {"zones": pansa.zones_geojson(), "events": pansa.zone_events()}


@app.get("/api/app-version")
async def api_app_version():
    """Bezpieczne metadane APK. GitHub jest odpytywany najwyżej raz na 5 min,
    niezależnie od liczby telefonów sprawdzających aktualizację."""
    try:
        return await app_updates.latest()
    except Exception as exc:
        log.warning("Metadane aktualizacji niedostępne: %r", exc)
        return JSONResponse({"error": "update metadata unavailable"}, status_code=503)


@app.get("/api/push/key")
async def push_key():
    return {"publicKey": notify.vapid_public_key()}


@app.post("/api/push/subscribe")
async def push_subscribe(sub: dict):
    voivodeships = sub.get("voivodeships")
    if (not notify.validate_push_subscription(sub)
            or not isinstance(voivodeships, list)
            or not 1 <= len(voivodeships) <= len(config.VOIVODESHIPS)
            or any(v not in config.VOIVODESHIPS for v in voivodeships)):
        return JSONResponse({"error": "bad subscription"}, status_code=400)
    clean_sub = {key: sub[key] for key in ("endpoint", "expirationTime", "keys")
                 if key in sub}
    db.add_push_sub(clean_sub, voivodeships)
    return {"ok": True}


@app.post("/api/push/unsubscribe")
async def push_unsubscribe(body: dict):
    db.remove_push_sub(body.get("endpoint", ""))
    return {"ok": True}


@app.post("/api/test-signal")
async def test_signal(body: dict):
    """Testowe wstrzyknięcie sygnału (weryfikacja fuzji i powiadomień end-to-end).

    Domyślnie wyłączony na produkcji — bez tego każdy mógłby wstrzykiwać fałszywe
    alarmy i wyzwalać push do wszystkich. Włącz flagą TEST_SIGNAL_ENABLED.
    """
    if not config.TEST_SIGNAL_ENABLED:
        return JSONResponse({"error": "not found"}, status_code=404)
    voiv = body.get("voivodeship", "lubelskie")
    points = float(body.get("points", 2.0))
    is_new = await fusion.ingest(
        source="test", event_type="test", voivodeship=voiv, points=points,
        title=body.get("title", f"Sygnał testowy ({points} pkt)"),
        details={"test": True}, dedup_key=f"test:{time.time()}",
    )
    return {"ok": True, "new": is_new, "state": fusion.compute_state()["voivodeships"][voiv]}


# ── Start ────────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    db.init()
    notify.init_vapid()
    notify.init_fcm()
    fusion.on_level_change = notify.notify_level
    fusion.on_state_change = broadcast_state
    # Każde zadanie pod nadzorcą: wyjątek nie zatrzymuje go na zawsze (audyt D2).
    jobs = {
        "neptun": neptun.run, "rss": rss_media.run, "rcb_govpl": rcb.run, "rso": rso.run,
        "adsb": adsb.run, "pansa": pansa.run, "neighbours": neighbours.run,
        "official_alerts": official_alerts.run, "snapshots": snapshot_loop,
        "progression_shadow": progression_shadow_loop, "levels": level_loop,
        "state": state_loop, "heartbeat": monitoring.heartbeat_loop,
        "load_guard": lambda: load_guard.monitor(shed_websockets),
        "cache_bundle": lambda: public_cache.refresh_loop(
            "bundle", public_cache.build_bundle_bytes, 60),
        "cache_timeline": lambda: public_cache.refresh_loop(
            "timeline", public_cache.build_timeline, 60),
        "cache_zones": lambda: public_cache.refresh_loop(
            "zones", _zones_payload, 30, in_thread=False),
    }
    for name, factory in jobs.items():
        monitoring.start(name, factory)
    log.info("Strażnik wystartował — kolektory uruchomione")


async def level_loop():
    """Reewaluacja progów bez nowego sygnału — wynik spada z wiekiem sam.

    Bez tej pętli `fusion.reevaluate()` ruszało tylko przy nowym sygnale, więc po
    cichej godzinie serwer nadal „pamiętał" poprzedni poziom i kolejny wzrost do
    tego samego poziomu nie wysyłał powiadomienia (audyt 11.09.2026).
    """
    await asyncio.sleep(20)
    while True:
        try:
            await fusion.reevaluate()
        except Exception as e:
            log.warning("reewaluacja poziomów: %s", e)
        await asyncio.sleep(45)


async def snapshot_loop():
    """Migawka pozycji co 2 min — materiał do przeglądania 12 h wstecz."""
    await asyncio.sleep(45)      # poczekaj, aż kolektory się zapełnią
    while True:
        try:
            snapshot = {
                "threats": [
                    {**{k: t.get(k) for k in ("id", "type", "lat", "lon", "heading",
                                           "confidenceLevel", "uncertaintyKm", "region",
                                           "locality", "sourceCount", "destination",
                                           "positionQuality", "areaOnly",
                                           "straznik_position",
                                           # pl_assessment: bez tego karta w historii
                                           # pokazywała „? km" (dist liczony live, ale
                                           # nie persystowany do migawki)
                                           "pl_assessment")},
                     "source_metadata": source_metadata(t)}
                    for t in neptun.tracks.values() if t.get("lat") is not None],
                "aircraft": adsb.current_aircraft,
            }
            db.add_snapshot(snapshot)
            # G1: to samo na 30 dni w osobnym, skompresowanym archiwum
            await asyncio.to_thread(alert_log.archive_snapshot, snapshot)
        except Exception as e:
            log.warning("snapshot błąd: %s", e)
        await asyncio.sleep(120)


async def progression_shadow_loop():
    """Observe live threshold progression; structurally unable to send alerts."""
    if not config.ESCALATION_SHADOW_ENABLED:
        escalation_shadow.status.update(enabled=False, mode="disabled")
        return
    await asyncio.sleep(15)
    while True:
        try:
            state = fusion.compute_state()
            escalation_shadow.evaluate_all(
                state["voivodeships"], neptun.tracks, now=time.time(),
                healthy=bool(neptun.status.get("connected")),
            )
        except Exception as e:
            escalation_shadow.status["error"] = str(e)
            log.exception("tryb cienia progresji: błąd")
        await asyncio.sleep(120)


# statyka frontendu (montowana na końcu, żeby nie przykryć /api i /ws)
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
