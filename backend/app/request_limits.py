"""Limity zapytań i nagłówki bezpieczeństwa (audyt bezpieczeństwa 16.09.2026).

- Treść POST/PUT/PATCH najwyżej MAX_BODY_BYTES: FastAPI wczytywało i parsowało cały
  JSON przed wywołaniem funkcji (także wyłączonego /api/test-signal), a kilka
  równoległych zapytań po ~100 MB (limit Cloudflare) wystarczało, żeby proces
  przekroczył MemoryMax i razem z nim stanęły kolektory i powiadomienia.
- Zapis subskrypcji Web Push: najwyżej SUBSCRIBE_PER_IP na SUBSCRIBE_WINDOW_S z jednego
  adresu (CF-Connecting-IP). Zalew fałszywych subskrypcji opóźniał wysyłkę alarmu.
- Nagłówki: nosniff, Referrer-Policy, ochrona przed osadzaniem w cudzej ramce, HSTS.
Czysty ASGI, jak load_guard — bez buforowania odpowiedzi.
"""
import json
import time

from . import csp

MAX_BODY_BYTES = 16 * 1024
# 60, nie mniej: użytkownicy sieci komórkowych dzielą publiczny adres (CGNAT)
SUBSCRIBE_PER_IP = 60
SUBSCRIBE_WINDOW_S = 600
_BODY_METHODS = {"POST", "PUT", "PATCH"}
_RATE_PATHS = ("/api/push/subscribe",)

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"x-frame-options", b"SAMEORIGIN"),
    (b"strict-transport-security", b"max-age=31536000"),
]

status = {"body_rejected": 0, "rate_limited": 0}
_hits: dict[str, list[float]] = {}


def client_ip(scope) -> str:
    headers = dict(scope.get("headers") or [])
    ip = headers.get(b"cf-connecting-ip") or headers.get(b"x-forwarded-for", b"").split(b",")[0]
    if ip:
        return ip.decode("latin-1").strip()
    client = scope.get("client")
    return client[0] if client else "?"


def rate_limited(ip: str, now: float | None = None) -> bool:
    now = now or time.time()
    recent = [t for t in _hits.get(ip, []) if now - t < SUBSCRIBE_WINDOW_S]
    limited = len(recent) >= SUBSCRIBE_PER_IP
    if not limited:
        recent.append(now)
    _hits[ip] = recent
    if len(_hits) > 50_000:
        for k in [k for k, v in _hits.items() if not v or now - v[-1] >= SUBSCRIBE_WINDOW_S]:
            _hits.pop(k, None)
    return limited


async def _reject(send, code: int, message: str) -> None:
    body = json.dumps({"error": message}).encode()
    await send({"type": "http.response.start", "status": code,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode()),
                            *SECURITY_HEADERS]})
    await send({"type": "http.response.body", "body": body})


class RequestLimits:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                naglowki = list(message.get("headers", []))
                present = {k.lower() for k, _ in naglowki}
                naglowki += [h for h in SECURITY_HEADERS if h[0] not in present]
                # CSP tylko dla stron HTML — w JSON-ie i plikach nie ma czego chronić
                typ = next((v for k, v in naglowki if k.lower() == b"content-type"), b"")
                if typ.startswith(b"text/html"):
                    csp_h = csp.naglowek()
                    if csp_h and csp_h[0] not in present:
                        naglowki.append(csp_h)
                message["headers"] = naglowki
            await send(message)

        if scope.get("method") not in _BODY_METHODS:
            return await self.app(scope, receive, send_with_headers)

        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > MAX_BODY_BYTES):
            status["body_rejected"] += 1
            return await _reject(send, 413, "request body too large")
        if scope.get("path") in _RATE_PATHS and rate_limited(client_ip(scope)):
            status["rate_limited"] += 1
            return await _reject(send, 429, "too many requests")

        # Treść liczymy także bez Content-Length (chunked) i podajemy dalej z pamięci.
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                status["body_rejected"] += 1
                return await _reject(send, 413, "request body too large")
            chunks.append(chunk)
            if not message.get("more_body"):
                break
        body = b"".join(chunks)
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        return await self.app(scope, replay, send_with_headers)
