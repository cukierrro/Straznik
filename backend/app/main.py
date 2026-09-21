"""Strażnik — backend FastAPI: kolektory, fuzja, API, WebSocket, statyka frontendu."""
import asyncio
import hashlib
import json
import logging
import os
import time

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from . import (alert_log, app_updates, blob_store, by_entry_shadow, config, db, escalation_shadow, fusion, load_guard,
               monitoring, notify, public_cache, rcb_reference, request_limits)
from .collectors import (adsb, by_media_shadow, mapa_ua_shadow, neighbours, neptun,
                         official_alerts, pansa, rcb, ro_shadow, rso, rss_media)
from .neptun_archive import source_metadata

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("main")
# D10 (audyt): httpx logował każde zapytanie kolektorów na INFO — szum w dzienniku
logging.getLogger("httpx").setLevel(logging.WARNING)


class _QuietWebSocketLog(logging.Filter):
    """17.09.2026: uvicorn logował każde otwarcie i odmowę WebSocketu na INFO —
    ~1 mln linii na godzinę przy syrenach, 0,5 GB pamięci podręcznej dziennika.
    Ostrzeżenia i błędy przechodzą bez zmian."""
    NOISE = ("connection open", "connection closed", "connection rejected")

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno > logging.INFO:
            return True
        msg = record.getMessage()
        return not (msg.startswith(self.NOISE) or '"WebSocket ' in msg)


logging.getLogger("uvicorn.error").addFilter(_QuietWebSocketLog())

# Publiczna dokumentacja API nie jest potrzebna użytkownikom, a ułatwia nadużycia.
app = FastAPI(title="Strażnik", docs_url=None, redoc_url=None, openapi_url=None)
# expose_headers: bez tego aplikacja (inne źródło niż serwer) NIE WIDZI nagłówka
# ETag, więc nie może odpytywać warunkowo i za każdym razem ściąga cały stan.
# Przeglądarka udostępnia skryptowi tylko kilka nagłówków, a ETag nie jest jednym
# z nich (20.09.2026, przy przejściu z WebSocketu na odpytywanie).
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"], expose_headers=["ETag"])
app.add_middleware(public_cache.PageCacheHeaders)
app.add_middleware(public_cache.StaticCacheHeaders)
# ostatni dodany = pierwszy w kolejce: bezpiecznik odrzuca, zanim cokolwiek się policzy
app.add_middleware(load_guard.GuardMiddleware)
# jeszcze wcześniej: za duża treść i zalew subskrypcji odpadają przed kolejką (audyt 16.09)
app.add_middleware(request_limits.RequestLimits)

# ── WebSocket broadcast ──────────────────────────────────────────────────────
_ws_clients: set[WebSocket] = set()
# Klienci w trybie sygnału (od 1.7.59, /ws?v=2): zamiast całego stanu (~39 KB)
# dostają ~70 B „zmieniło się" z ETagiem i pobierają stan z /api/state, który
# Cloudflare trzyma w pamięci na brzegu. 17.09.2026 pomiar: rozsyłka pełnego stanu
# do 1595 połączeń trwała średnio 1,07 s (kompresja liczona osobno dla każdego
# klienta) — przy 6000 nie zdążyłaby przed następną.
_ws_tick_clients: set[WebSocket] = set()
_last_broadcast = 0.0
_broadcast_pending = False
_ws_message = ""          # gotowa ramka stanu — jedna serializacja dla wszystkich
_ws_tick = ""             # krótka ramka „zmieniło się" z ETagiem stanu
# Ile połączeń i jak krótko żyją: komunikat „brak połączenia" pokazuje się po zerwaniu,
# więc bez tych liczb nie wiadomo, czy ludzie widzą go sporadycznie, czy stale (17.09.2026).
ws_life = {"accepted": 0, "closed": 0, "short_30s": 0, "short_5min": 0, "sum_s": 0.0}
# pomiar rozsyłki (17.09.2026): ile trwa i ile bajtów idzie do klientów — bez tego
# nie wiadomo, czy zacięcia pętli biorą się z kompresji per klient, czy skądinąd
broadcast_stats = {"count": 0, "clients": 0, "bytes": 0, "last_ms": 0, "max_ms": 0,
                   "build_ms": 0, "max_build_ms": 0, "sum_ms": 0.0, "frame_bytes": 0,
                   "tick_clients": 0, "tick_last_ms": 0, "tick_max_ms": 0, "tick_sum_ms": 0.0,
                   "tick_count": 0}
# Każde połączenie WebSocket to otwarte gniazdo i bufor w tym jednym procesie.
# Powyżej limitu odmawiamy (kod 1013), a klient przechodzi na odpytywanie
# /api/state, które jest gotowymi bajtami i trzyma je Cloudflare.
# 17.09.2026: 3000 zapełniło się przy syrenach w Lublinie, a proces miał 660 MB
# z 2,5 GB; 6000 po wdrożeniu zapełniło się w minutę przy 777 MB i ~20% rdzenia.
# Twardy limit wyżej; właściwą granicą są pamięć i opóźnienie pętli
# (load_guard.refuse_websocket).
WS_MAX_CLIENTS = int(os.getenv("WS_MAX_CLIENTS", "15000"))
WS_SEND_TIMEOUT_S = 3.0


def _load_notice(plik: str = "notice.json"):
    """Komunikat administracyjny (np. zapowiedź testu) z pliku data/notice.json,
    edytowalny na VPS bez restartu. Kształt: {"id","text","until"(opcj. ISO)}.
    Apka tylko WYŚWIETLA go i pozwala zamknąć — ZERO danych zwrotnych (bez
    telemetrii). Zwraca None, gdy pliku brak, jest niepełny albo minął `until`
    (auto-wygaśnięcie, żeby zapomniany komunikat sam zniknął)."""
    import json
    from datetime import datetime, timezone
    try:
        n = json.loads((config.DATA_DIR / plik).read_text(encoding="utf-8"))
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


# Odcisk stanu BEZ pól, które tykają same z siebie: `fusion.ts` i znacznik ostatniej
# wiadomości NEPTUN-a. Bez tego /api/state dostawał nowy ETag co kilka sekund, choć
# mapa się nie zmieniała — każde warunkowe zapytanie ściągało wtedy pełne 28 KB
# zamiast dostać „304" (pomiar 20.09.2026: 15 pełnych odpowiedzi i jedna 304 na
# 75 sekund). Przy odpytywaniu zamiast WebSocketu to ta różnica decyduje o ruchu.
_state_fingerprint = ""
_state_built_at = 0.0
_state_ts = ""            # `fusion.ts` obecnego stanu = wersja dla klientów
STATE_MAX_AGE_S = 60      # mimo wszystko odświeżamy co minutę, żeby `ts` nie odpłynął


def refresh_state() -> None:
    """Stan liczony raz i od razu podawany wszystkim: /api/state i WebSocket."""
    global _ws_message, _ws_tick, _state_fingerprint, _state_built_at, _state_ts
    payload = build_state()
    fus = payload.get("fusion") or {}
    nep = (payload.get("neptun") or {}).get("status") or {}
    ts, last_msg = fus.get("ts"), nep.get("last_msg")
    if ts is not None:
        fus["ts"] = ""
    if last_msg is not None:
        nep["last_msg"] = 0
    probe = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    odcisk = hashlib.blake2b(probe, digest_size=10).hexdigest()
    swiezy = time.time() - _state_built_at < STATE_MAX_AGE_S
    if odcisk == _state_fingerprint and swiezy and public_cache.get("state") is not None:
        return                      # nic istotnego się nie zmieniło — ETag zostaje
    if ts is not None:
        fus["ts"] = ts
    if last_msg is not None:
        nep["last_msg"] = last_msg
    _state_fingerprint = odcisk
    _state_built_at = time.time()
    _state_ts = str(fus.get("ts") or "")
    blob = public_cache.make_blob(payload)
    public_cache.put("state", blob)
    _ws_tick = '{"type":"tick","etag":' + json.dumps(blob.etag) + "}"
    _ws_message = '{"type":"state","data":' + blob.raw.decode() + "}"
    # Komunikat wyłącznie do starych wersji aplikacji.
    #
    # Gniazdo otwierają dziś tylko wydania ≤1.7.62 — od 1.7.63 telefon odpytuje
    # i tu nigdy nie zajrzy. To jedyny kanał, który trafia do nich i pomija
    # wszystkich pozostałych: gdyby ten sam tekst wsadzić do `data/notice.json`,
    # „zaktualizuj aplikację" zobaczyłoby też kilkaset osób, które właśnie to
    # zrobiły. Paczka dla przeglądarek i nowych telefonów zostaje nietknięta, więc
    # brzeg dalej podaje wszystkim te same bajty.
    stare = _load_notice("notice-stare-wersje.json")
    if stare:
        payload["notice"] = stare
        _ws_message = ('{"type":"state","data":'
                       + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                       + "}")


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
    t0 = time.monotonic()
    refresh_state()
    build_ms = round((time.monotonic() - t0) * 1000)
    broadcast_stats["build_ms"] = build_ms
    broadcast_stats["max_build_ms"] = max(broadcast_stats["max_build_ms"], build_ms)
    # najpierw krótki sygnał: dociera od razu, nie czeka na rozesłanie pełnego stanu
    await broadcast_tick()
    if not _ws_clients:
        return
    message = _ws_message
    clients = list(_ws_clients)
    t1 = time.monotonic()
    for i in range(0, len(clients), 500):
        for dead in await asyncio.gather(*(_send(ws, message) for ws in clients[i:i + 500])):
            if dead is not None:
                _ws_clients.discard(dead)
    ms = (time.monotonic() - t1) * 1000
    broadcast_stats.update(count=broadcast_stats["count"] + 1, clients=len(clients),
                           frame_bytes=len(message.encode()),
                           bytes=broadcast_stats["bytes"] + len(clients) * len(message.encode()),
                           last_ms=round(ms), max_ms=max(broadcast_stats["max_ms"], round(ms)),
                           sum_ms=broadcast_stats["sum_ms"] + ms)


async def state_loop():
    """Wynik maleje z wiekiem sygnałów także bez nowych zdarzeń."""
    while True:
        try:
            refresh_state()
        except Exception as e:
            log.warning("stan: %s", e)
        await asyncio.sleep(3)


async def broadcast_tick() -> None:
    """Klientom w trybie sygnału wysyłamy samą informację, że stan się zmienił."""
    clients = list(_ws_tick_clients)
    if not clients:
        return
    tick = _ws_tick
    t0 = time.monotonic()
    for i in range(0, len(clients), 1000):
        for dead in await asyncio.gather(*(_send(ws, tick) for ws in clients[i:i + 1000])):
            if dead is not None:
                _ws_tick_clients.discard(dead)
    ms = (time.monotonic() - t0) * 1000
    broadcast_stats.update(tick_clients=len(clients), tick_last_ms=round(ms),
                           tick_max_ms=max(broadcast_stats["tick_max_ms"], round(ms)),
                           tick_sum_ms=broadcast_stats["tick_sum_ms"] + ms,
                           tick_count=broadcast_stats["tick_count"] + 1)


async def shed_websockets(fraction: float) -> None:
    """Pod presją pamięci zamyka część połączeń (najpierw te najstarsze w zbiorze).
    Klient dostaje 1013 i przechodzi na odpytywanie gotowego /api/state."""
    # najpierw klienci z pełnym stanem: to oni kosztują najwięcej
    victims = list(_ws_clients)[: int(len(_ws_clients) * fraction)]
    for ws in victims:
        _ws_clients.discard(ws)
    tick_victims = list(_ws_tick_clients)[: int(len(_ws_tick_clients) * fraction)]
    for ws in tick_victims:
        _ws_tick_clients.discard(ws)
    await asyncio.gather(*(_close(ws) for ws in victims + tick_victims))


async def _close(ws: WebSocket) -> None:
    try:
        await asyncio.wait_for(ws.close(code=1013), 2)
    except Exception:
        pass


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    tick_mode = ws.query_params.get("v") == "2"
    # Reader nie ma skąd brać ramek (stan liczy writer), więc grzecznie odmawia
    # kodem 1013 — starsze wersje aplikacji przechodzą wtedy na odpytywanie.
    busy = (not config.IS_WRITER
            or len(_ws_clients) + len(_ws_tick_clients) >= WS_MAX_CLIENTS
            or load_guard.refuse_websocket())
    try:
        await ws.accept()
    except Exception:
        return
    if busy:
        # 1013 = „spróbuj później”; klient przechodzi na odpytywanie /api/state.
        # Najpierw accept(): zamknięcie przed nim uvicorn zamienia na HTTP 403, klient
        # nie widzi 1013 i ponawia co kilka sekund (17.09.2026: ~230 prób/s przez 2 h).
        load_guard.status["ws_refused"] += 1
        await _close(ws)
        return
    pool = _ws_tick_clients if tick_mode else _ws_clients
    pool.add(ws)
    ws_life["accepted"] += 1
    opened = time.monotonic()
    try:
        if not _ws_message:
            refresh_state()
        # pierwszy stan zawsze w całości — klient ma dane od razu, bez dodatkowego zapytania
        await ws.send_text(_ws_message)
        while True:
            # klient nic nie wysyła; każda wiadomość od niego to nadużycie (audyt 16.09)
            await ws.receive_text()
            await _close(ws)
            break
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        pool.discard(ws)
        lived = time.monotonic() - opened
        ws_life["closed"] += 1
        ws_life["sum_s"] += lived
        if lived < 30:
            ws_life["short_30s"] += 1
        elif lived < 300:
            ws_life["short_5min"] += 1


# ── REST API ─────────────────────────────────────────────────────────────────
NIC_NOWEGO = b'{"unchanged":true}'
_wersja_readera = ("", "")        # (etag paczki, wersja stanu) — parsowanie raz na zmianę


def _wersja_stanu() -> str:
    """Wersja stanu dla klienta (`fusion.ts`).

    Writer zna ją z liczenia. Reader niczego nie liczy, więc czyta ją z gotowych
    bajtów — raz na nową paczkę, nie raz na zapytanie. Bez tego reader odsyłałby
    pełny stan każdemu pytającemu i cały zysk z odpytywania by przepadł.
    """
    global _wersja_readera
    if config.IS_WRITER:
        return _state_ts
    blob = public_cache.get("state")
    if blob is None:
        return ""
    if _wersja_readera[0] != blob.etag:
        try:
            ts = json.loads(blob.raw).get("fusion", {}).get("ts")
        except (ValueError, AttributeError):
            ts = None
        _wersja_readera = (blob.etag, str(ts or ""))
    return _wersja_readera[1]


@app.get("/api/state")
async def api_state(request: Request, v: str | None = None):
    """Stan mapy albo krótkie „nic nowego", gdy klient ma już tę wersję.

    Znacznik wersji (`v`) to `fusion.ts` z ostatnio pobranego stanu. Można byłoby
    użyć samego ETagu i odpowiedzi 304, ale aplikacja na telefonie przepuszcza
    zapytania przez warstwę natywną Capacitora (CapacitorHttp omija CORS) i ta
    gubi semantykę zapytań warunkowych — 20.09.2026 na emulatorze co kilkadziesiąt
    sekund migał komunikat „brak połączenia", choć dane płynęły. Zwykłe 200 z
    dwudziestoma bajtami treści działa tak samo na każdym kliencie, a Cloudflare
    cache'uje je pod kluczem z `v`: wszyscy pytają o tę samą wersję, więc to jeden
    wpis w pamięci brzegu, nie jeden na użytkownika.
    """
    if public_cache.get("state") is None and config.IS_WRITER:
        refresh_state()
    if v and v == _wersja_stanu():
        return Response(NIC_NOWEGO, media_type="application/json",
                        headers={"Cache-Control": "public, max-age=2, s-maxage=2, "
                                                  "stale-while-revalidate=30"})
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
    hours = max(1, min(int(hours), 12))       # hours=10**10 dawało OverflowError (audyt 16.09)
    if at is None:
        return {"times": await asyncio.to_thread(db.snapshot_times, hours), "hours": hours}
    # liczenie historii w wątku: losowe `at` omija cache i blokowało pętlę z kolektorami
    return await asyncio.to_thread(_history_at, at, hours)


def _history_at(at: str, hours: int) -> dict:
    times = db.snapshot_times(hours)
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
    # …i z przeniesieniem od sąsiadów, jak stan na żywo (audyt A11/C10)
    per_voiv = fusion.apply_spillover(fusion.accumulate(sigs, ref), ref)
    scores = {v: round(st["score"], 1) for v, st in per_voiv.items() if st["score"] > 0}
    annotated = [sig for st in per_voiv.values() for sig in st["signals"]]
    annotated.sort(key=lambda s: s["ts"], reverse=True)
    return {"times": times, "at": at, "snapshot": snap,
            "signals": annotated, "scores": scores}


@app.get("/api/history/timeline")
async def api_timeline(request: Request):
    """Oś czasu suwaka historii (najwyższy wynik w kraju dla każdej migawki).
    Gotowa odpowiedź z public_cache, odświeżana co minutę."""
    if public_cache.get("timeline") is None and config.IS_WRITER:
        await public_cache.rebuild("timeline", public_cache.build_timeline)
    return public_cache.respond(request, "timeline")


@app.get("/api/history/bundle")
async def api_history_bundle(request: Request):
    """Cała historia 12 h w JEDNYM pobraniu: migawki + surowe sygnały z okna.
    Klient przewija suwak lokalnie. Paczka jest składana w tle co minutę
    i podawana jako gotowe, skompresowane bajty (public_cache) — składanie przy
    każdym wejściu zabiło serwer 13.09.2026 o 04:54."""
    if public_cache.get("bundle") is None and config.IS_WRITER:
        await public_cache.rebuild("bundle", public_cache.build_bundle_bytes)
    return public_cache.respond(request, "bundle")


@app.get("/api/adsb/watch")
async def api_adsb_watch(hours: int = 12):
    """Small read-only journal; independent of the large snapshot bundle."""
    return {"events": db.adsb_watch_events(max(1, min(hours, 12)))}


def _is_local(request: Request) -> bool:
    """Zapytanie z samego serwera (curl po SSH, watchdog), a nie z internetu.

    Tunel Cloudflare też łączy się z 127.0.0.1, ale zawsze dokleja CF-Connecting-IP —
    po tym nagłówku odróżniamy ruch publiczny (klient nie może go usunąć)."""
    host = request.client.host if request.client else ""
    return host in ("127.0.0.1", "::1") and "cf-connecting-ip" not in request.headers


@app.get("/api/health")
async def api_health(request: Request):
    """Publicznie tylko {"ok": true} — aplikacja sprawdza sam kod odpowiedzi.

    Audyt bezpieczeństwa 16.09.2026: pełny stan (błędy kolektorów, RAM, liczba
    połączeń, kopie zapasowe) ułatwiał rozpoznanie i zgranie ataku z przeciążeniem.
    Szczegóły są dostępne tylko z samego serwera: curl http://127.0.0.1:40141/api/health."""
    if not _is_local(request):
        return JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})
    if config.ROLE == "reader":
        # Reader nie ma kolektorów — bierze ich stan z pliku writera i dokłada swój.
        writer = blob_store.wczytaj_health() or {}
        wiek = blob_store.wiek_s("state")
        return {**writer, "rola": "reader",
                "reader": {"load_guard": load_guard.status,
                           "public_cache": public_cache.status,
                           "blob_store": blob_store.status,
                           "wiek_stanu_s": None if wiek is None else round(wiek, 1)}}
    return _health_payload()


def _health_payload() -> dict:
    return {
        "rola": config.ROLE,
        "neptun": neptun.status, "adsb": adsb.status, "pansa": pansa.status,
        "rcb": rcb.status, "rso": rso.status, "rss": rss_media.status["feeds"],
        "neighbours": neighbours.status,
        "official_alerts": official_alerts.status,
        "ro_shadow": ro_shadow.status,
        "by_media_shadow": by_media_shadow.status,
        "mapa_ua_shadow": mapa_ua_shadow.status,
        "by_entry_shadow": by_entry_shadow.status,
        "request_limits": request_limits.status,
        "notify": {"ntfy": config.NTFY_ENABLED and bool(config.NTFY_TOPIC),
                   "telegram": config.TELEGRAM_ENABLED,
                   "webpush": config.WEBPUSH_ENABLED,
                   # cicha awaria wysyłki do aplikacji nie może być niewidoczna
                   "fcm": notify.fcm_status},
        "progression_shadow": escalation_shadow.status,
        "rcb_reference": rcb_reference.status,
        "public_cache": {**public_cache.status, "ws_clients": len(_ws_clients),
                         "ws_tick": len(_ws_tick_clients), "ws_max": WS_MAX_CLIENTS},
        "load_guard": load_guard.status,
        "ws_life": dict(ws_life, avg_s=round(ws_life["sum_s"] / ws_life["closed"])
                        if ws_life["closed"] else 0),
        "broadcast": dict(broadcast_stats,
                          avg_ms=round(broadcast_stats["sum_ms"] / broadcast_stats["count"], 1)
                          if broadcast_stats["count"] else 0,
                          mb_total=round(broadcast_stats["bytes"] / 1048576, 1),
                          tick_avg_ms=round(broadcast_stats["tick_sum_ms"] / broadcast_stats["tick_count"], 1)
                          if broadcast_stats["tick_count"] else 0),
        "backup": _backup_status(),
        "critical": monitoring.critical_check(),
        "tasks": monitoring.supervisor,
        "heartbeat": monitoring.public_heartbeat(),
    }


@app.get("/api/health/critical")
async def api_health_critical(request: Request):
    """Dla monitoringu zewnętrznego: 503, gdy alarm może nie dotrzeć.

    Osobny adres, bo /api/health sprawdza aplikacja przy starcie — kod 503 tam
    przełączyłby wszystkich użytkowników na tryb awaryjny. Publicznie tylko ok
    poszczególnych kontroli, bez treści błędów (audyt 16.09.2026)."""
    result = monitoring.critical_check()
    if not _is_local(request):
        result = {"ok": result["ok"], "at": result.get("at"),
                  "checks": {k: {"ok": v.get("ok")} for k, v in result["checks"].items()}}
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
    if public_cache.get("zones") is None and config.IS_WRITER:
        await public_cache.rebuild("zones", _zones_payload, in_thread=False)
    return public_cache.respond(request, "zones")


def _zones_payload() -> dict:
    return {"zones": pansa.zones_geojson(), "events": pansa.zone_events()}


NAJNOWSZA_PACZKA = "https://github.com/cukierrro/Straznik/releases/latest/download/Straznik.apk"


@app.get("/pobierz")
async def pobierz():
    """Krótki adres do ręcznej instalacji: straznik.eu/pobierz.

    Stare wersje nie potrafią pokazać klikalnego odnośnika — ich pasek komunikatu to
    sam tekst, a jedyny przycisk w okienku aktualizacji uruchamia wbudowany aktualizator,
    który na Androidzie 9 i 10 odrzucał każdą paczkę (naprawione w 1.7.64). Tym ludziom
    zostaje wpisanie adresu w przeglądarce, więc ma być krótki i do zapamiętania.

    Przekierowanie, nie plik: 24 MB idzie z GitHuba, nie przez nasz tunel, a adres zawsze
    wskazuje najnowsze wydanie. Bez cache, żeby po nowym wydaniu nie prowadził do starego.
    """
    return RedirectResponse(NAJNOWSZA_PACZKA, status_code=302,
                            headers={"Cache-Control": "no-store"})


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
    if (db.count_push_subs() >= config.PUSH_SUBS_MAX
            and not db.push_sub_exists(clean_sub.get("endpoint", ""))):
        log.warning("Web Push: limit %d subskrypcji — nowa odrzucona", config.PUSH_SUBS_MAX)
        return JSONResponse({"error": "subscription limit"}, status_code=503)
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
    if not config.IS_WRITER:
        # READER: nie zbiera, nie liczy, nie alarmuje. Podaje gotowe bajty, które
        # writer odkłada do pamięci współdzielonej. Jedyne zadanie własne to
        # bezpiecznik obciążenia — reader też może dostać falę zapytań.
        monitoring.start("load_guard", lambda: load_guard.monitor(shed_websockets))
        log.info("Strażnik wystartował jako READER — bez kolektorów i bez powiadomień")
        return
    if config.PROBA:
        log.warning("TRYB PRÓBY — bez kolektorów i bez powiadomień (kopia bazy)")
    else:
        notify.init_vapid()
        notify.init_fcm()
        fusion.on_level_change = notify.notify_level
    fusion.on_state_change = broadcast_state
    # Każde zadanie pod nadzorcą: wyjątek nie zatrzymuje go na zawsze (audyt D2).
    jobs = {
        "neptun": neptun.run, "rss": rss_media.run, "rcb_govpl": rcb.run, "rso": rso.run,
        "adsb": adsb.run, "pansa": pansa.run, "neighbours": neighbours.run,
        "official_alerts": official_alerts.run, "ro_shadow": ro_shadow.run,
        "by_media_shadow": by_media_shadow.run,
        "mapa_ua_shadow": mapa_ua_shadow.run,
        "snapshots": snapshot_loop,
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
    if config.PROBA:
        # zostają tylko zadania liczące i składające bajty — nic nie wychodzi na świat
        zostaw = {"snapshots", "levels", "state", "heartbeat", "load_guard",
                  "cache_bundle", "cache_timeline", "cache_zones"}
        jobs = {k: v for k, v in jobs.items() if k in zostaw}
    if config.ROLE == "writer":
        # stan kolektorów wędruje do readera tą samą drogą co dane mapy
        jobs["health_blob"] = health_blob_loop
    for name, factory in jobs.items():
        monitoring.start(name, factory)
    log.info("Strażnik wystartował (rola: %s) — kolektory uruchomione", config.ROLE)


async def health_blob_loop():
    """Writer odkłada swój stan zdrowia dla readera (ten sam plik w RAM)."""
    while True:
        try:
            blob_store.zapisz_health(_health_payload())
        except Exception as e:                        # noqa: BLE001
            log.warning("health blob: %s", e)
        await asyncio.sleep(5)


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


def _track_age_min(t: dict, now: float | None = None) -> int | None:
    """Ile minut temu źródło potwierdziło ten obiekt (None, gdy nie wiadomo)."""
    from datetime import datetime
    seen = t.get("confirmedAt") or t.get("updatedAt")
    if not seen:
        return None
    try:
        ts = datetime.fromisoformat(str(seen).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None
    return max(0, round(((now or time.time()) - ts) / 60))


async def snapshot_loop():
    """Migawka pozycji co SNAPSHOT_INTERVAL_S (60 s) — materiał do przeglądania 12 h wstecz.

    Krok 2 min dawał w historii widoczne skoki obiektów (decyzja usera 14.09.2026).
    Historię rysuje jeden serwer dla wszystkich (paczka budowana raz w public_cache),
    więc gęstsze migawki nie mnożą pracy per użytkownik."""
    await asyncio.sleep(45)      # poczekaj, aż kolektory się zapełnią
    while True:
        started = time.monotonic()
        try:
            threats = [
                {**{k: t.get(k) for k in ("id", "type", "lat", "lon", "heading",
                                       "confidenceLevel", "uncertaintyKm", "region",
                                       "locality", "sourceCount", "destination",
                                       "positionQuality", "areaOnly",
                                       "straznik_position",
                                       # alarm ogólnokrajowy → komunikat w historii
                                       "straznik_national",
                                       # pl_assessment: bez tego karta w historii
                                       # pokazywała „? km" (dist liczony live, ale
                                       # nie persystowany do migawki)
                                       "pl_assessment")},
                 "source_metadata": source_metadata(t),
                 # Wiek meldunku w tamtej chwili (18.09.2026). Migawka nie ma
                 # confirmedAt, więc bez tego historia nie wiedziała, jak stary
                 # był obiekt — ikony rysowały się bez wygaszania, a warstwa
                 # poświaty dostawała null zamiast liczby. Minuty zamiast znacznika
                 # czasu: kilka bajtów na obiekt zamiast kilkudziesięciu.
                 "age_min": _track_age_min(t)}
                for t in neptun.tracks.values() if t.get("lat") is not None]
            aircraft = adsb.current_aircraft
            # 12 h do paczki historii bez source_metadata: to ponad połowa bajtów
            # migawki, a klient ma positionQuality na wierzchu. Dzięki temu migawki
            # co minutę ważą tyle, co wcześniej co dwie. Pełny zapis idzie do archiwum.
            db.add_snapshot({"threats": [{k: v for k, v in t.items() if k != "source_metadata"}
                                         for t in threats],
                             "aircraft": aircraft})
            # G1: pełna migawka na 30 dni w osobnym, skompresowanym archiwum
            await asyncio.to_thread(alert_log.archive_snapshot,
                                    {"threats": threats, "aircraft": aircraft})
        except Exception as e:
            log.warning("snapshot błąd: %s", e)
        await asyncio.sleep(max(1.0, config.SNAPSHOT_INTERVAL_S - (time.monotonic() - started)))


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


# Paczki map Groty — około 2 GB, poza katalogiem repozytorium.
#
# Kusiłoby położyć je w `frontend/`, bo wtedy nie trzeba nic montować. Ale ten
# katalog jest kopią roboczą gita na serwerze: dwa gigabajty nieznanych plików
# śmieciłyby w `git status`, a jedno nieuważne `git clean -fd` przy wdrożeniu
# skasowałoby je wszystkie. Leżą więc osobno i są montowane wprost.
#
# Montowane tylko, gdy katalog istnieje — na maszynie bez paczek (i w testach)
# nic się nie zmienia.
if config.GROTA_PACZKI_DIR.is_dir():
    app.mount("/grota/paczki",
              StaticFiles(directory=config.GROTA_PACZKI_DIR),
              name="grota-paczki")
    log.info("Paczki map Groty podawane z %s", config.GROTA_PACZKI_DIR)

# statyka frontendu (montowana na końcu, żeby nie przykryć /api i /ws)
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
