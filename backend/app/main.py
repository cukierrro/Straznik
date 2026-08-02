"""Strażnik — backend FastAPI: kolektory, fuzja, API, WebSocket, statyka frontendu."""
import asyncio
import logging
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, db, fusion, notify
from .collectors import adsb, neptun, pansa, rcb, rss_media

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("main")

app = FastAPI(title="Strażnik", docs_url="/api/docs")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

# ── WebSocket broadcast ──────────────────────────────────────────────────────
_ws_clients: set[WebSocket] = set()
_last_broadcast = 0.0
_broadcast_pending = False


def build_state() -> dict:
    return {
        "fusion": fusion.compute_state(),
        "neptun": neptun.public_state(),
        "adsb": {"aircraft": adsb.current_aircraft,
                 "counts": adsb.status["counts"], "baselines": adsb.status["baselines"]},
        "health": {
            "neptun": neptun.status["connected"],
            # Alarmy obwodowe UA płyną tym samym WebSocketem co Neptun (nie ma
            # osobnego kolektora), więc ich zdrowie = połączenie Neptuna. Bez tego
            # pola dioda „Alarmy UA" świeciła na czerwono w trybie backendu.
            "ua_alerts": neptun.status["connected"],
            "adsb": adsb.status["ok"],
            "pansa": pansa.status["ok"],
            "rcb": rcb.status["ok"],
            "rss": {u: st.get("ok", False) for u, st in rss_media.status["feeds"].items()},
        },
    }


async def broadcast_state():
    """Throttling: max 1 broadcast / 2 s (Neptun potrafi słać dziesiątki upsertów)."""
    global _last_broadcast, _broadcast_pending
    if _broadcast_pending:
        return
    wait = max(0.0, 2.0 - (time.time() - _last_broadcast))
    _broadcast_pending = True
    if wait:
        await asyncio.sleep(wait)
    _broadcast_pending = False
    _last_broadcast = time.time()
    if not _ws_clients:
        return
    state = build_state()
    dead = []
    for ws in list(_ws_clients):
        try:
            await ws.send_json({"type": "state", "data": state})
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.discard(ws)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    _ws_clients.add(ws)
    try:
        await ws.send_json({"type": "state", "data": build_state()})
        while True:
            await ws.receive_text()   # klient nic nie musi słać; trzymamy połączenie
    except WebSocketDisconnect:
        pass
    finally:
        _ws_clients.discard(ws)


# ── REST API ─────────────────────────────────────────────────────────────────
@app.get("/api/state")
async def api_state():
    return build_state()


@app.get("/api/signals")
async def api_signals(limit: int = 100):
    return {"signals": db.recent_signals(limit)}


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
        start = (datetime.fromisoformat(end)
                 - timedelta(minutes=config.FUSION_WINDOW_MIN)).isoformat(timespec="seconds")
    except Exception:
        start = end
    return {"times": times, "at": at, "snapshot": snap,
            "signals": db.signals_between(start, end)}


@app.get("/api/history/timeline")
async def api_timeline(hours: int = 12):
    """Oś czasu: dla każdej migawki najwyższy wynik w kraju w tamtym momencie.

    Potrzebne, żeby suwak historii mógł być pokolorowany poziomem zagrożenia,
    a nie jednolitą barwą.
    """
    from datetime import datetime, timedelta
    times = db.snapshot_times(hours)
    if not times:
        return {"points": []}
    start = (datetime.fromisoformat(times[0])
             - timedelta(minutes=config.FUSION_WINDOW_MIN)).isoformat(timespec="seconds")
    signals = db.signals_between(start, times[-1])
    parsed = []
    for s in signals:
        try:
            parsed.append((datetime.fromisoformat(s["ts"]), s["voivodeship"], s["points"]))
        except Exception:
            continue
    out = []
    for ts in times:
        t = datetime.fromisoformat(ts)
        window_start = t - timedelta(minutes=config.FUSION_WINDOW_MIN)
        per_voiv: dict[str, float] = {}
        for sig_t, voiv, pts in parsed:
            if not (window_start <= sig_t <= t) or pts <= 0 or not voiv:
                continue
            age_min = (t - sig_t).total_seconds() / 60
            w = 1.0 if age_min <= config.FUSION_FULL_MIN else max(
                0.0, 1 - (age_min - config.FUSION_FULL_MIN)
                / max(config.FUSION_WINDOW_MIN - config.FUSION_FULL_MIN, 1))
            per_voiv[voiv] = per_voiv.get(voiv, 0.0) + pts * w
        best = max(per_voiv.values()) if per_voiv else 0.0
        top = max(per_voiv, key=per_voiv.get) if per_voiv else None
        out.append({"ts": ts, "score": round(best, 1), "voiv": top,
                    "level": fusion.level_for(best)})
    return {"points": out}


@app.get("/api/health")
async def api_health():
    return {
        "neptun": neptun.status, "adsb": adsb.status, "pansa": pansa.status,
        "rcb": rcb.status, "rss": rss_media.status["feeds"],
        "notify": {"ntfy": config.NTFY_ENABLED and bool(config.NTFY_TOPIC),
                   "telegram": config.TELEGRAM_ENABLED,
                   "webpush": config.WEBPUSH_ENABLED},
    }


@app.get("/api/push/key")
async def push_key():
    return {"publicKey": notify.vapid_public_key()}


@app.post("/api/push/subscribe")
async def push_subscribe(sub: dict):
    if not sub.get("endpoint"):
        return JSONResponse({"error": "bad subscription"}, status_code=400)
    db.add_push_sub(sub)
    return {"ok": True}


@app.post("/api/push/unsubscribe")
async def push_unsubscribe(body: dict):
    db.remove_push_sub(body.get("endpoint", ""))
    return {"ok": True}


@app.post("/api/test-signal")
async def test_signal(body: dict):
    """Testowe wstrzyknięcie sygnału (weryfikacja fuzji i powiadomień end-to-end)."""
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
    for coro in (neptun.run(), rss_media.run(), rcb.run(), adsb.run(), pansa.run(),
                 snapshot_loop()):
        asyncio.create_task(coro)
    log.info("Strażnik wystartował — kolektory uruchomione")


async def snapshot_loop():
    """Migawka pozycji co 2 min — materiał do przeglądania 12 h wstecz."""
    await asyncio.sleep(45)      # poczekaj, aż kolektory się zapełnią
    while True:
        try:
            db.add_snapshot({
                "threats": [
                    {k: t.get(k) for k in ("id", "type", "lat", "lon", "heading",
                                           "confidenceLevel", "uncertaintyKm", "region",
                                           "locality", "sourceCount", "destination")}
                    for t in neptun.tracks.values() if t.get("lat") is not None],
                "aircraft": adsb.current_aircraft,
            })
        except Exception as e:
            log.warning("snapshot błąd: %s", e)
        await asyncio.sleep(120)


# statyka frontendu (montowana na końcu, żeby nie przykryć /api i /ws)
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
