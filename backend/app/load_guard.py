"""Bezpiecznik pamięci i kolejka wejść — strona może zwolnić, alarmy nie mogą.

13.09.2026 o 04:54:50 jądro zabiło usługę za przekroczenie limitu pamięci
w szczycie ruchu. Zabity proces to nie tylko strona: to także kolektory, fuzja
i wysyłka powiadomień. Dlatego pamięć pilnujemy SAMI, zanim zrobi to jądro:

* co 2 s czytamy /proc/meminfo (RAM całego VPS) i /proc/self/status (RSS procesu),
* poziom 1 — VPS ≥ 80% RAM albo proces ≥ SHED_RSS_MB: nie przyjmujemy nowych
  WebSocketów, zamykamy część istniejących (klient przechodzi na odpytywanie
  gotowego /api/state), dynamiczne zapytania dostają 503 z Retry-After,
* poziom 2 — VPS ≥ 90% albo proces ≥ 1,1 × SHED_RSS_MB: działa już tylko to,
  co jest gotowymi bajtami (stan, historia, strefy, wersja aplikacji, push),
* niezależnie od pamięci: najwyżej MAX_INFLIGHT zapytań naraz; kolejne czekają
  w kolejce do QUEUE_WAIT_S, a potem dostają 503 zamiast rosnąć w pamięci,
* opóźnienie pętli zdarzeń (17.09.2026): to jeden proces na jednym rdzeniu —
  gdy pętla nie nadąża, spóźniają się też kolektory i powiadomienia. Wtedy nie
  przyjmujemy NOWYCH WebSocketów (klient odpytuje gotowy /api/state z Cloudflare).

Kolektory, fuzja, pętla poziomów i powiadomienia nie przechodzą przez żadną
z tych bramek — działają w tle, niezależnie od ruchu na stronie.
"""
import asyncio
import logging
import os
import time

log = logging.getLogger("load_guard")

SHED_SYS_PCT = float(os.getenv("SHED_SYS_PCT", "80"))
SHED_SYS_PCT_HARD = float(os.getenv("SHED_SYS_PCT_HARD", "90"))
# 17.09.2026: usługa ma 3 GB (scripts/systemd/straznik-memory.conf); poziom 2 = 2860 MB,
# poniżej MemoryHigh 2900 MB, więc bezpiecznik działa, zanim jądro zacznie dławić proces
SHED_RSS_MB = float(os.getenv("SHED_RSS_MB", "2600"))
MAX_INFLIGHT = int(os.getenv("MAX_INFLIGHT", "600"))
QUEUE_WAIT_S = float(os.getenv("QUEUE_WAIT_S", "4"))
# opóźnienie pętli: odmowa nowych WebSocketów dopiero przy TRWAŁYM przeciążeniu
# (LAG_SAMPLES próbek z rzędu ≥ LAG_REFUSE_S, czyli kilkanaście sekund), powrót po
# LAG_CLEAR_SAMPLES spokojnych próbkach poniżej LAG_CLEAR_S.
# 17.09.2026: pierwsza wersja (2 próbki ≥ 0,5 s) łapała zwykłe zacięcia 0,5–1,3 s co
# kilka minut przy rozsyłaniu stanu do ~3000 połączeń — telefon łączący się akurat
# wtedy dostawał 1013 i przez 1–2 min pokazywał „duży ruch” (508 odmów w 26 min).
LAG_REFUSE_S = float(os.getenv("WS_LAG_REFUSE_S", "1.0"))
LAG_SAMPLES = int(os.getenv("WS_LAG_SAMPLES", "4"))
LAG_CLEAR_S = float(os.getenv("WS_LAG_CLEAR_S", "0.3"))
LAG_CLEAR_SAMPLES = int(os.getenv("WS_LAG_CLEAR_SAMPLES", "3"))

# gotowe bajty z public_cache — tanie nawet pod presją pamięci
CHEAP_PATHS = ("/api/state", "/api/history/bundle", "/api/history/timeline", "/api/zones",
               "/api/app-version", "/api/push/", "/api/health", "/api/health/critical")

status = {"level": 0, "sys_pct": None, "rss_mb": None, "inflight": 0, "queued": 0,
          "shed_total": 0, "since": None, "loop_lag_ms": 0, "lag_high": False,
          "ws_refused": 0, "lag_spikes": 0, "lag_max_ms": 0}
_lag_over = 0
_lag_calm = 0
_slots = asyncio.Semaphore(MAX_INFLIGHT)


def _meminfo() -> tuple[float | None, float | None]:
    try:
        info = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, v = line.split(":", 1)
                info[k] = float(v.split()[0])
        sys_pct = 100.0 * (1 - info["MemAvailable"] / info["MemTotal"])
    except (OSError, KeyError, ValueError):
        sys_pct = None
    try:
        with open("/proc/self/status") as f:
            rss = next(float(l.split()[1]) / 1024 for l in f if l.startswith("VmRSS:"))
    except (OSError, StopIteration, ValueError):
        rss = None
    return sys_pct, rss


def level_for(sys_pct: float | None, rss_mb: float | None) -> int:
    sys_pct = sys_pct or 0.0
    rss_mb = rss_mb or 0.0
    if sys_pct >= SHED_SYS_PCT_HARD or rss_mb >= SHED_RSS_MB * 1.1:
        return 2
    if sys_pct >= SHED_SYS_PCT or rss_mb >= SHED_RSS_MB:
        return 1
    return 0


def update_lag(lag_s: float) -> bool:
    """Zapisuje opóźnienie pętli i zwraca, czy odmawiać nowych WebSocketów."""
    global _lag_over, _lag_calm
    ms = round(max(0.0, lag_s) * 1000)
    status["loop_lag_ms"] = ms
    status["lag_max_ms"] = max(status["lag_max_ms"], ms)
    if lag_s >= 0.5:
        status["lag_spikes"] += 1          # do obserwacji: ile zacięć bez odmawiania
    if lag_s >= LAG_REFUSE_S:
        _lag_over += 1
        _lag_calm = 0
        if _lag_over >= LAG_SAMPLES and not status["lag_high"]:
            status["lag_high"] = True
            log.warning("pętla zdarzeń nie nadąża od %d próbek (%.2f s) — nowe WebSockety odsyłane "
                        "na odpytywanie", _lag_over, lag_s)
        return status["lag_high"]
    _lag_over = 0
    if status["lag_high"]:
        _lag_calm = _lag_calm + 1 if lag_s < LAG_CLEAR_S else 0
        if _lag_calm >= LAG_CLEAR_SAMPLES:
            status["lag_high"] = False
            _lag_calm = 0
            log.warning("pętla zdarzeń nadąża (%.2f s) — WebSockety znów przyjmowane", lag_s)
    return status["lag_high"]


async def monitor(shed_websockets):
    """`shed_websockets(fraction)` zamyka część otwartych WebSocketów."""
    while True:
        sys_pct, rss = _meminfo()
        lvl = level_for(sys_pct, rss)
        prev = status["level"]
        status.update(sys_pct=round(sys_pct, 1) if sys_pct is not None else None,
                      rss_mb=round(rss) if rss is not None else None, level=lvl)
        if lvl != prev:
            status["since"] = time.time()
            log.warning("bezpiecznik pamięci: poziom %s → %s (VPS %s%%, proces %s MB)",
                        prev, lvl, status["sys_pct"], status["rss_mb"])
        if lvl >= 1:
            try:
                await shed_websockets(0.2 if lvl == 1 else 0.5)
            except Exception as e:
                log.warning("zamykanie WebSocketów: %s", e)
        before = time.monotonic()
        await asyncio.sleep(2)
        update_lag(time.monotonic() - before - 2)


def refuse_websocket() -> bool:
    return status["level"] >= 1 or status["lag_high"]


def _cheap(path: str) -> bool:
    return any(path == p or (p.endswith("/") and path.startswith(p)) for p in CHEAP_PATHS)


def _dynamic_api(path: str) -> bool:
    return path.startswith("/api/") and not _cheap(path)


class GuardMiddleware:
    """Czysty ASGI (bez BaseHTTPMiddleware), żeby nie buforować odpowiedzi."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        lvl = status["level"]
        if (lvl >= 1 and _dynamic_api(path)) or (lvl >= 2 and not _cheap(path)
                                                  and path.startswith("/api/")):
            status["shed_total"] += 1
            return await _unavailable(send, 10)
        status["queued"] += 1
        try:
            await asyncio.wait_for(_slots.acquire(), QUEUE_WAIT_S)
        except asyncio.TimeoutError:
            status["shed_total"] += 1
            return await _unavailable(send, 5)
        finally:
            status["queued"] -= 1
        status["inflight"] += 1
        try:
            await self.app(scope, receive, send)
        finally:
            status["inflight"] -= 1
            _slots.release()


async def _unavailable(send, retry_after: int):
    body = b'{"error":"busy","retry_after":%d}' % retry_after
    await send({"type": "http.response.start", "status": 503,
                "headers": [(b"content-type", b"application/json"),
                            (b"retry-after", str(retry_after).encode()),
                            (b"cache-control", b"no-store"),
                            (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})
