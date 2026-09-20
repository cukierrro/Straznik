"""Gotowe odpowiedzi publicznego API — składane w tle, podawane jako bajty.

13.09.2026 o 04:54:50 jądro zabiło usługę za przekroczenie 400 MB (OOM). Szczyt
ruchu to 2700 zapytań na minutę i ponad 3300 adresów w 40 minut, a każde
wejście składało od nowa 12-godzinną historię (8,4 MB JSON) i liczyło stan fuzji.
Kilkadziesiąt takich zapytań naraz wystarczyło do zabicia procesu.

Teraz każda publiczna odpowiedź powstaje RAZ: w tle, co kilka sekund albo minutę.
Od razu jest zserializowana, skompresowana gzipem i opatrzona ETagiem. Zapytanie
tylko oddaje gotowe bajty — koszt nie rośnie z liczbą użytkowników, a pamięć nie
rośnie z liczbą równoległych zapytań. Nagłówki Cache-Control pozwalają Cloudflare
trzymać te same bajty na brzegu sieci.
"""
import asyncio
import gzip
import hashlib
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import Request
from fastapi.responses import Response

from . import config, db, fusion

log = logging.getLogger("public_cache")


@dataclass
class Blob:
    raw: bytes
    gz: bytes
    etag: str
    built: float


_blobs: dict[str, Blob] = {}
_building: dict[str, asyncio.Task] = {}
status = {"builds": {}, "errors": {}}

# (max-age dla przeglądarki, s-maxage dla Cloudflare) w sekundach
CACHE_POLICY = {
    "state": (2, 2),
    "bundle": (30, 60),
    "timeline": (30, 60),
    "zones": (30, 60),
}


def make_blob(payload: bytes | str | dict | list) -> Blob:
    if isinstance(payload, (dict, list)):
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    elif isinstance(payload, str):
        raw = payload.encode()
    else:
        raw = payload
    etag = '"' + hashlib.blake2b(raw, digest_size=10).hexdigest() + '"'
    return Blob(raw=raw, gz=gzip.compress(raw, compresslevel=6), etag=etag, built=time.time())


def put(name: str, blob: Blob) -> None:
    _blobs[name] = blob
    status["builds"][name] = {"at": round(blob.built), "raw": len(blob.raw), "gz": len(blob.gz)}
    # writer oddaje gotowe bajty czytającym procesom (plik w RAM, podmiana atomowa)
    if config.ROLE == "writer":
        from . import blob_store
        blob_store.zapisz(name, blob.raw, blob.gz, blob.etag)


def get(name: str) -> Blob | None:
    if config.ROLE == "reader":
        from . import blob_store
        dane = blob_store.wczytaj(name)
        if dane is None:
            return None
        gotowy = _blobs.get(name)
        if gotowy is not None and gotowy.etag == dane["etag"]:
            return gotowy                      # ten sam stan — bez ponownego składania
        blob = Blob(raw=dane["raw"], gz=dane["gz"], etag=dane["etag"], built=dane["built"])
        _blobs[name] = blob
        return blob
    return _blobs.get(name)


def respond(request: Request, name: str) -> Response:
    blob = get(name)          # nie `_blobs`: na readerze paczka leży w pamięci współdzielonej
    if blob is None:
        return Response(b'{"error":"warming up"}', status_code=503, media_type="application/json",
                        headers={"Retry-After": "3", "Cache-Control": "no-store"})
    max_age, s_maxage = CACHE_POLICY.get(name, (2, 2))
    headers = {
        "Cache-Control": f"public, max-age={max_age}, s-maxage={s_maxage}, "
                         f"stale-while-revalidate={max(30, s_maxage)}",
        "ETag": blob.etag,
        "Vary": "Accept-Encoding",
    }
    if request.headers.get("if-none-match") == blob.etag:
        return Response(status_code=304, headers=headers)
    if "gzip" in request.headers.get("accept-encoding", ""):
        headers["Content-Encoding"] = "gzip"
        return Response(blob.gz, media_type="application/json", headers=headers)
    return Response(blob.raw, media_type="application/json", headers=headers)


class StaticCacheHeaders:
    """Cache dla plików statycznych (czysty ASGI, bez buforowania odpowiedzi).

    Audyt Mikrusa 20.09.2026: origin nie wysyłał żadnego `Cache-Control` na
    `app.js`, `style.css`, obrazki i czcionki. Cloudflare cache'ował je po swojemu
    (widać HIT), ale PRZEGLĄDARKA dostawała odpowiedź bez wskazówki i przy każdym
    otwarciu pytała serwer ponownie.

    Adres z `?v=` niesie wersję wydania — taki plik nigdy nie zmienia treści pod
    tym samym adresem, więc może leżeć w pamięci telefonu rok („immutable"). Plik
    bez wersji (np. ikona z manifestu) dostaje dobę i pozwolenie na użycie starej
    kopii w tle. `sw.js` NIE może być cache'owany długo — to on decyduje o
    aktualizacji reszty.
    """

    LONG = b"public, max-age=31536000, immutable"
    SHORT = b"public, max-age=86400, stale-while-revalidate=604800"
    NONE = b"no-cache"
    EXT = (".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".woff2",
           ".json", ".geojson", ".ico", ".webmanifest")

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        sciezka = scope.get("path", "")
        if not sciezka.endswith(self.EXT):
            return await self.app(scope, receive, send)
        if sciezka.endswith("sw.js"):
            wartosc = self.NONE
        else:
            wartosc = self.LONG if b"v=" in scope.get("query_string", b"") else self.SHORT

        async def wyslij(message):
            if message["type"] == "http.response.start":
                naglowki = [(k, v) for k, v in message.get("headers", [])
                            if k.lower() != b"cache-control"]
                naglowki.append((b"cache-control", wartosc))
                message = {**message, "headers": naglowki}
            await send(message)

        await self.app(scope, receive, wyslij)


class PageCacheHeaders:
    """Nagłówki cache dla strony głównej (czysty ASGI, bez buforowania odpowiedzi).

    Strona to kilkadziesiąt KB, ale przy fali wejść z Facebooka każde wejście
    szło do VPS. Cloudflare trzyma ją 60 s; przeglądarka zawsze sprawdza na nowo
    (max-age=0), więc nowe wydanie strony dociera najpóźniej po minucie."""

    PATHS = ("/", "/index.html")
    VALUE = b"public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    # Granice obwodów, województw i krajów (do 1,1 MB) szły z VPS przy każdym
    # wejściu na stronę (13.09.2026). Zmieniają się tylko przy wdrożeniu, więc
    # Cloudflare trzyma je godzinę, a przeglądarka 10 minut. Cloudflare pomija przy
    # nich ?v= (sprawdzone 14.09.2026), więc zmienione dane = nowa nazwa pliku
    # (np. kraje-v2.geojson), inaczej nowa wersja dojdzie dopiero po godzinie.
    GEO_VALUE = b"public, max-age=600, s-maxage=3600, stale-while-revalidate=86400"

    def __init__(self, app):
        self.app = app

    def _value(self, path: str) -> bytes | None:
        if path in self.PATHS:
            return self.VALUE
        if path.startswith("/assets/") and path.endswith(".geojson"):
            return self.GEO_VALUE
        return None

    async def __call__(self, scope, receive, send):
        value = self._value(scope.get("path", "")) if scope["type"] == "http" else None
        if value is None:
            return await self.app(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start" and message.get("status") == 200:
                headers = [(k, v) for k, v in message.get("headers", [])
                           if k.lower() != b"cache-control"]
                headers.append((b"cache-control", value))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


# ── składanie ciężkich odpowiedzi (w wątku, poza pętlą zdarzeń) ──────────────
def build_bundle_bytes(hours: int = 12) -> bytes:
    """Pełna historia sklejana z tekstu migawek zapisanego w bazie.

    Migawka jest w bazie gotowym JSON-em; rozpakowanie 360 migawek do obiektów
    Pythona i ponowne spakowanie kosztowało ~10× ich rozmiaru w pamięci.
    Doklejamy tylko pole "ts" na początku każdego obiektu."""
    rows = db.snapshot_rows(hours)
    parts = []
    for ts, payload in rows:
        body = payload.strip()
        inner = body[1:-1].strip() if body.startswith("{") and body.endswith("}") else ""
        parts.append('{"ts":' + json.dumps(ts) + ("," + inner if inner else "") + "}")
    signals = []
    if rows:
        start = (datetime.fromisoformat(rows[0][0])
                 - timedelta(minutes=config.FUSION_WINDOW_MIN)).isoformat(timespec="seconds")
        signals = db.signals_between(start, rows[-1][0])
        # Alarmy obwodów UA trwające w chwili pierwszej migawki zaczęły się wcześniej —
        # klient potrzebuje ich startu, żeby liczyć je w historii (wariant B2).
        long_start = (datetime.fromisoformat(rows[0][0]) - timedelta(
            minutes=config.FUSION_WINDOW_MIN + config.UA_ALERT_MAX_MIN)).isoformat(timespec="seconds")
        seen = {s["id"] for s in signals}
        signals += [s for s in db.events_since_between(long_start, start, ("ua_alert_border",
                                                                          "ua_alert_end"))
                    if s["id"] not in seen]
    head = json.dumps({"hours": hours, "window_min": config.FUSION_WINDOW_MIN},
                      ensure_ascii=False, separators=(",", ":"))[:-1]
    tail = json.dumps({"signals": signals, "adsb_watch_events": db.adsb_watch_events(hours)},
                      ensure_ascii=False, separators=(",", ":"))[1:]
    return (head + ',"snaps":[' + ",".join(parts) + "]," + tail).encode()


_timeline_points: dict[str, dict] = {}


def build_timeline(hours: int = 12) -> dict:
    """Oś czasu suwaka: najwyższy wynik w kraju dla każdej migawki.

    Punkty przeszłe się nie zmieniają, więc liczymy tylko nowe migawki — wcześniej
    każde wejście liczyło fuzję 360 razy od nowa."""
    times = db.snapshot_times(hours)
    if not times:
        return {"points": []}
    missing = [ts for ts in times if ts not in _timeline_points]
    if missing:
        # trwające alarmy obwodów UA sięgają dalej niż okno (fusion.active_ua_alerts)
        start = (datetime.fromisoformat(missing[0])
                 - timedelta(minutes=config.FUSION_WINDOW_MIN + config.UA_ALERT_MAX_MIN)
                 ).isoformat(timespec="seconds")
        parsed = []
        for s in db.signals_between(start, missing[-1]):
            try:
                parsed.append((datetime.fromisoformat(s["ts"]), s))
            except Exception:
                continue
        for ts in missing:
            t = datetime.fromisoformat(ts)
            window_start = t - timedelta(minutes=config.FUSION_WINDOW_MIN)
            win = [s for sig_t, s in parsed if window_start <= sig_t <= t]
            win += fusion.active_ua_alerts(
                [s for sig_t, s in parsed if sig_t <= t
                 and s.get("event_type") in ("ua_alert_border", "ua_alert_end")], t)
            # z przeniesieniem od sąsiadów, jak stan na żywo (audyt A11/C10)
            per_voiv = fusion.apply_spillover(fusion.accumulate(win, t), t)
            scores = {v: st["score"] for v, st in per_voiv.items() if st["score"] > 0}
            best = max(scores.values()) if scores else 0.0
            _timeline_points[ts] = {"ts": ts, "score": round(best, 1),
                                    "voiv": max(scores, key=scores.get) if scores else None,
                                    "level": fusion.level_for(best)}
    keep = set(times)
    for ts in [k for k in _timeline_points if k not in keep]:
        del _timeline_points[ts]
    return {"points": [_timeline_points[ts] for ts in times]}


async def rebuild(name: str, builder, in_thread: bool = True) -> Blob | None:
    """Jedno składanie naraz na nazwę; kolejni wołający czekają na ten sam wynik."""
    task = _building.get(name)
    if task is None or task.done():
        async def run():
            t0 = time.time()
            try:
                payload = await asyncio.to_thread(builder) if in_thread else builder()
                blob = make_blob(payload)
                put(name, blob)
                status["builds"][name]["took_ms"] = round((time.time() - t0) * 1000)
                status["errors"].pop(name, None)
                return blob
            except Exception as exc:          # stary blob zostaje w obiegu
                status["errors"][name] = repr(exc)[:300]
                log.warning("składanie %s: %r", name, exc)
                return _blobs.get(name)
        task = asyncio.create_task(run())
        _building[name] = task
    return await task


async def refresh_loop(name: str, builder, every_s: float, in_thread: bool = True):
    while True:
        await rebuild(name, builder, in_thread)
        await asyncio.sleep(every_s)
