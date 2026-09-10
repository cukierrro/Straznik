"""Kanały powiadomień: ntfy, Telegram, Web Push (VAPID). Wszystkie best-effort."""
import asyncio
import base64
import hashlib
import json
import logging
from urllib.parse import urlparse

import httpx

from . import config, db
from .fusion import LEVEL_LABELS

log = logging.getLogger("notify")

_vapid: dict | None = None
_fcm_ready = False

_WEBPUSH_HOSTS = {"fcm.googleapis.com", "web.push.apple.com"}
_WEBPUSH_HOST_SUFFIXES = (".push.services.mozilla.com", ".notify.windows.com")


def init_fcm():
    """Inicjalizuje Firebase Admin SDK (raz), jeśli jest plik konta serwisowego."""
    global _fcm_ready
    if not config.FCM_ENABLED:
        return
    import os
    if not os.path.exists(config.FCM_CREDENTIALS_PATH):
        log.warning("FCM: brak pliku poświadczeń %s — push do aplikacji wyłączony",
                    config.FCM_CREDENTIALS_PATH)
        return
    try:
        import firebase_admin
        from firebase_admin import credentials
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(config.FCM_CREDENTIALS_PATH))
        _fcm_ready = True
        log.info("FCM zainicjalizowany")
    except Exception as e:
        log.warning("FCM init błąd: %s", e)


def _send_fcm_sync(topic: str, data: dict) -> str:
    from firebase_admin import messaging
    msg = messaging.Message(
        topic=topic,
        data=data,
        # wysoki priorytet: dociera od razu, przebija Doze; brak bloku `notification`,
        # bo powiadomienie (z pełnym ekranem dla czerwonego) buduje natywny
        # StraznikFcmService — wiadomości `data-only` trafiają do niego zawsze,
        # także przy zamkniętej aplikacji, i nie są przechwytywane przez system.
        android=messaging.AndroidConfig(priority="high"),
    )
    return messaging.send(msg)


async def send_fcm(voiv: str, level: str, score: float, reasons_text: str):
    if not (config.FCM_ENABLED and _fcm_ready):
        return
    topic = config.voiv_topic(voiv)
    data = {"voiv": voiv, "level": level, "score": str(score),
            "reasons": reasons_text or ""}
    try:
        mid = await asyncio.to_thread(_send_fcm_sync, topic, data)
        log.info("FCM → %s (%s pkt): %s", topic, score, mid)
    except Exception as e:
        log.warning("FCM błąd (%s): %s", topic, e)


def init_vapid():
    """Generuje (raz) i wczytuje klucze VAPID do Web Push."""
    global _vapid
    if not config.WEBPUSH_ENABLED:
        return
    if config.VAPID_PATH.exists():
        _vapid = json.loads(config.VAPID_PATH.read_text())
        return
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        import base64
        key = ec.generate_private_key(ec.SECP256R1())
        priv = key.private_numbers().private_value.to_bytes(32, "big")
        pub = key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
        _vapid = {"private_key": b64(priv), "public_key": b64(pub)}
        config.VAPID_PATH.write_text(json.dumps(_vapid))
        log.info("Wygenerowano nowe klucze VAPID")
    except Exception as e:
        log.warning("Nie udało się wygenerować VAPID: %s", e)


def vapid_public_key() -> str | None:
    return _vapid["public_key"] if _vapid else None


def _decode_webpush_key(value: str) -> bytes:
    if not isinstance(value, str) or not value:
        raise ValueError("missing Web Push key")
    padded = value + "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def validate_push_subscription(sub: dict) -> bool:
    """Accept only complete browser subscriptions before persisting them.

    Browsers use FCM, Mozilla, Apple and Windows push services.  Both the
    provider allow-list and structural key validation prevent arbitrary or
    corrupt public POSTs from poisoning the delivery queue or becoming SSRF
    targets during a later alarm.
    """
    if not isinstance(sub, dict):
        return False
    endpoint = sub.get("endpoint")
    if not isinstance(endpoint, str) or not endpoint.startswith("https://"):
        return False
    parsed = urlparse(endpoint)
    host = (parsed.hostname or "").lower()
    if (not host or len(endpoint) > 4096 or parsed.username or parsed.password
            or (host not in _WEBPUSH_HOSTS
                and not host.endswith(_WEBPUSH_HOST_SUFFIXES))):
        return False
    keys = sub.get("keys")
    if not isinstance(keys, dict):
        return False
    try:
        p256dh = _decode_webpush_key(keys.get("p256dh"))
        auth = _decode_webpush_key(keys.get("auth"))
    except (TypeError, ValueError, UnicodeError, base64.binascii.Error):
        return False
    return len(p256dh) == 65 and p256dh[:1] == b"\x04" and len(auth) == 16


def _push_ref(sub: dict) -> str:
    """Non-sensitive identifier suitable for logs."""
    endpoint = str(sub.get("endpoint") or "")
    host = urlparse(endpoint).hostname or "unknown"
    digest = hashlib.sha256(endpoint.encode()).hexdigest()[:12]
    return f"{host}#{digest}"


async def send_ntfy(title: str, body: str, priority: str):
    if not (config.NTFY_ENABLED and config.NTFY_TOPIC):
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(
                f"{config.NTFY_SERVER.rstrip('/')}/{config.NTFY_TOPIC}",
                content=body.encode(),
                headers={
                    "Title": title.encode("ascii", "backslashreplace").decode(),
                    "Priority": priority,   # default | high | urgent
                    "Tags": "rotating_light" if priority == "urgent" else "warning",
                },
            )
    except Exception as e:
        log.warning("ntfy błąd: %s", e)


async def send_telegram(text: str):
    if not (config.TELEGRAM_ENABLED and config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID):
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(
                f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": config.TELEGRAM_CHAT_ID, "text": text,
                      "disable_web_page_preview": True},
            )
    except Exception as e:
        log.warning("telegram błąd: %s", e)


def _send_webpush_sync(sub: dict, payload: str):
    from pywebpush import webpush, WebPushException
    ref = _push_ref(sub)
    try:
        response = webpush(
            subscription_info=sub,
            data=payload,
            vapid_private_key=_vapid["private_key"],
            vapid_claims={"sub": config.VAPID_CONTACT},
            timeout=10,
            ttl=300,
        )
        return {"status": "sent", "ref": ref,
                "http": getattr(response, "status_code", None)}
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        # 404/410 explicitly mean an expired endpoint.  A 400 may concern one
        # corrupt subscription, but it can also expose a shared request/VAPID
        # fault.  Defer deletion until the batch proves that other endpoints
        # accepted the same notification.
        if status in (400, 404, 410):
            return {"status": "expired" if status in (404, 410) else "invalid",
                    "ref": ref, "http": status, "endpoint": sub.get("endpoint", "")}
        else:
            log.warning("WebPush błąd %s (HTTP %s): %s", ref, status, e)
            return {"status": "error", "ref": ref, "http": status}
    except Exception as e:
        log.warning("WebPush błąd %s: %s", ref, e)
        return {"status": "error", "ref": ref, "http": None}


async def send_webpush(voiv: str, title: str, body: str, level: str):
    if not (config.WEBPUSH_ENABLED and _vapid):
        return
    payload = json.dumps({"title": title, "body": body, "level": level}, ensure_ascii=False)
    subs = db.all_push_subs(voiv)
    results = await asyncio.gather(
        *[asyncio.to_thread(_send_webpush_sync, s, payload) for s in subs],
        return_exceptions=True)
    sent = sum(isinstance(r, dict) and r.get("status") == "sent" for r in results)
    removable = [r for r in results if isinstance(r, dict)
                 and (r.get("status") == "expired"
                      or (r.get("status") == "invalid" and sent > 0))]
    for result in removable:
        db.remove_push_sub(result.get("endpoint", ""))
        log.info("WebPush usunięto niedziałającą subskrypcję %s (HTTP %s)",
                 result.get("ref"), result.get("http"))
    removed = len(removable)
    errors = len(results) - sent - removed
    log.info("WebPush %s: wysłano=%d, usunięto=%d, błędy=%d, razem=%d",
             voiv, sent, removed, errors, len(results))


async def notify_level(voiv: str, level: str, score: float, signals: list[dict]):
    """Wysyłka po przekroczeniu progu (rising edge) z cooldownem per woj./poziom."""
    from datetime import datetime, timedelta, timezone
    last = db.last_notif(voiv, level)
    if last:
        last_dt = datetime.fromisoformat(last)
        if datetime.now(timezone.utc) - last_dt < timedelta(minutes=config.NOTIFY_COOLDOWN_MIN):
            return
    db.log_notif(voiv, level)

    from .fusion import breakdown_text
    label = LEVEL_LABELS[level]
    reasons = breakdown_text(signals)
    eta_alarm = any((s.get("details") or {}).get("eta_alarm") for s in signals)
    eta_note = ("\nSzacunek czasu dolotu; dane źródłowe mogą być opóźnione o kilka minut."
                if eta_alarm else "")
    reasons_for_push = reasons + eta_note
    title = f"{label}: woj. {voiv} ({score} pkt)"
    body = (f"Suma sygnałów z ostatnich {config.FUSION_WINDOW_MIN} min: {score} pkt\n"
            f"{reasons_for_push}\n"
            f"NIEOFICJALNE źródło dodatkowe — w razie realnego zagrożenia "
            f"kieruj się syrenami/RCB/RSO.")
    ntfy_prio = "urgent" if level == "high" else "default"
    await asyncio.gather(
        send_ntfy(title, body, ntfy_prio),
        send_telegram(f"{'🚨' if level == 'high' else '⚠️'} {title}\n{body}"),
        send_webpush(voiv, title, body, level),
        send_fcm(voiv, level, score, reasons_for_push),
        return_exceptions=True,
    )
