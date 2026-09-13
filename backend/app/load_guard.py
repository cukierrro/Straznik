"""Bezpiecznik pamięci i kolejka wejść — strona może zwolnić, alarmy nie mogą.

13.09.2026 o 04:54:50 jądro zabiło usługę za przekroczenie limitu pamięci
w szczycie ruchu. Zabity proces to nie tylko strona: to także kolektory, fuzja
i wysyłka powiadomień. Dlatego pamięć pilnujemy SAMI, zanim zrobi to jądro:

* co 2 s czytamy /proc/meminfo (RAM całego VPS) i /proc/self/status (RSS procesu),
* poziom 1 — VPS ≥ 70% RAM albo proces ≥ SHED_RSS_MB: nie przyjmujemy nowych
  WebSocketów, zamykamy część istniejących (klient przechodzi na odpytywanie
  gotowego /api/state), dynamiczne zapytania dostają 503 z Retry-After,
* poziom 2 — VPS ≥ 85% albo proces ≥ 1,1 × SHED_RSS_MB: działa już tylko to,
  co jest gotowymi bajtami (stan, historia, strefy, wersja aplikacji, push),
* niezależnie od pamięci: najwyżej MAX_INFLIGHT zapytań naraz; kolejne czekają
  w kolejce do QUEUE_WAIT_S, a potem dostają 503 zamiast rosnąć w pamięci.

Kolektory, fuzja, pętla poziomów i powiadomienia nie przechodzą przez żadną
z tych bramek — działają w tle, niezależnie od ruchu na stronie.
"""
import asyncio
import logging
import os
import time

log = logging.getLogger("load_guard")

SHED_SYS_PCT = float(os.getenv("SHED_SYS_PCT", "70"))
SHED_SYS_PCT_HARD = float(os.getenv("SHED_SYS_PCT_HARD", "85"))
SHED_RSS_MB = float(os.getenv("SHED_RSS_MB", "2200"))       # MemoryMax usługi: 2560 MB
MAX_INFLIGHT = int(os.getenv("MAX_INFLIGHT", "600"))
QUEUE_WAIT_S = float(os.getenv("QUEUE_WAIT_S", "4"))

# gotowe bajty z public_cache — tanie nawet pod presją pamięci
CHEAP_PATHS = ("/api/state", "/api/history/bundle", "/api/history/timeline", "/api/zones",
               "/api/app-version", "/api/push/", "/api/health")

status = {"level": 0, "sys_pct": None, "rss_mb": None, "inflight": 0, "queued": 0,
          "shed_total": 0, "since": None}
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
        await asyncio.sleep(2)


def refuse_websocket() -> bool:
    return status["level"] >= 1


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
