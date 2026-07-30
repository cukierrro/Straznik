"""Kanały powiadomień: ntfy, Telegram, Web Push (VAPID). Wszystkie best-effort."""
import asyncio
import json
import logging

import httpx

from . import config, db
from .fusion import LEVEL_LABELS

log = logging.getLogger("notify")

_vapid: dict | None = None


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
    try:
        webpush(
            subscription_info=sub,
            data=payload,
            vapid_private_key=_vapid["private_key"],
            vapid_claims={"sub": config.VAPID_CONTACT},
        )
    except WebPushException as e:
        if e.response is not None and e.response.status_code in (404, 410):
            db.remove_push_sub(sub.get("endpoint", ""))
        else:
            log.warning("webpush błąd: %s", e)


async def send_webpush(title: str, body: str, level: str):
    if not (config.WEBPUSH_ENABLED and _vapid):
        return
    payload = json.dumps({"title": title, "body": body, "level": level}, ensure_ascii=False)
    subs = db.all_push_subs()
    if subs:
        await asyncio.gather(
            *[asyncio.to_thread(_send_webpush_sync, s, payload) for s in subs],
            return_exceptions=True)


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
    title = f"{label}: woj. {voiv} ({score} pkt)"
    body = (f"Suma sygnałów z ostatnich {config.FUSION_WINDOW_MIN} min: {score} pkt\n"
            f"{breakdown_text(signals)}\n"
            f"NIEOFICJALNE źródło dodatkowe — w razie realnego zagrożenia "
            f"kieruj się syrenami/RCB/RSO.")
    ntfy_prio = "urgent" if level == "high" else "default"
    await asyncio.gather(
        send_ntfy(title, body, ntfy_prio),
        send_telegram(f"{'🚨' if level == 'high' else '⚠️'} {title}\n{body}"),
        send_webpush(title, body, level),
        return_exceptions=True,
    )
