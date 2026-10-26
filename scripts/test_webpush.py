"""Offline regression checks for Web Push validation and failure cleanup."""
import asyncio
import base64
import sqlite3
import sys
import types
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

# The check exercises only the Web Push helpers.  Keep it runnable in the
# bundled offline Python even when optional backend networking packages are
# not installed there.
try:
    import httpx  # noqa: F401
except ImportError:
    sys.modules["httpx"] = types.SimpleNamespace()
try:
    import truststore  # noqa: F401
except ImportError:
    sys.modules["truststore"] = types.SimpleNamespace(inject_into_ssl=lambda: None)
try:
    import dotenv  # noqa: F401
except ImportError:
    sys.modules["dotenv"] = types.SimpleNamespace(load_dotenv=lambda *args, **kwargs: None)

from app import db, notify  # noqa: E402


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def subscription(endpoint="https://fcm.googleapis.com/wp/abc"):
    return {"endpoint": endpoint, "expirationTime": None,
            "keys": {"p256dh": b64(b"\x04" + b"p" * 64),
                     "auth": b64(b"a" * 16)}}


class Response:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text
        self.reason = "test"


class PushError(Exception):
    def __init__(self, status):
        super().__init__(f"HTTP {status}")
        self.response = Response(status)


def install_fake(sender):
    return patch.dict(sys.modules, {"pywebpush": types.SimpleNamespace(
        webpush=sender, WebPushException=PushError)})


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    print("PASS", name)


def check_pool_and_connection_reuse(good):
    """10.10.2026: 08.10 Web Push szedł 26 min (DNS przy każdej wysyłce, 6 wątków
    wspólnej puli), na co dzień ~16/s. Pilnujemy puli, połączenia i ponowienia."""
    import threading
    import time
    import requests

    sessions = []

    def remember(**kwargs):
        sessions.append(kwargs.get("requests_session"))
        return Response(201)

    notify._webpush_local.__dict__.clear()
    with install_fake(remember):
        notify._send_webpush_sync(good, "{}")
        notify._send_webpush_sync(good, "{}")
    check("session passed to pywebpush", sessions[0] is not None)
    check("same thread reuses one connection", sessions[0] is sessions[1])

    calls = []

    def dropped_once(**kwargs):
        calls.append(kwargs.get("requests_session"))
        if len(calls) == 1:
            raise requests.exceptions.ConnectionError("Connection aborted.")
        return Response(201)

    with install_fake(dropped_once):
        result = notify._send_webpush_sync(good, "{}")
    check("dropped keep-alive connection retried once",
          result["status"] == "sent" and len(calls) == 2)
    check("retry uses a fresh connection", calls[0] is not calls[1])

    calls.clear()

    def too_slow(**kwargs):
        calls.append(1)
        raise requests.exceptions.ReadTimeout("read timed out")

    with install_fake(too_slow):
        result = notify._send_webpush_sync(good, "{}")
    check("timeout not retried", result["status"] == "error" and len(calls) == 1)

    threads, lock = set(), threading.Lock()
    rownolegle = {"teraz": 0, "szczyt": 0}

    def slow_send(sub, payload):
        with lock:
            threads.add(threading.current_thread().name)
            rownolegle["teraz"] += 1
            rownolegle["szczyt"] = max(rownolegle["szczyt"], rownolegle["teraz"])
        time.sleep(0.2)
        with lock:
            rownolegle["teraz"] -= 1
        return {"status": "sent", "ref": "x", "http": 201}

    subs = [good] * 64
    with (patch.object(notify.db, "all_push_subs", return_value=subs),
          patch.object(notify, "_send_webpush_sync", side_effect=slow_send)):
        started = time.monotonic()
        sent = asyncio.run(notify.send_webpush("lubelskie", "title", "body", "elevated"))
        took = time.monotonic() - started
    check("dedicated webpush pool, not the default executor",
          threads and all(name.startswith("webpush") for name in threads))
    # 64 x 0,2 s: przy 6 wątkach wspólnej puli > 2 s, przy 32 ~0,4 s. Liczymy szczyt jednoczesnych
    # wysyłek, nie czas zegarowy — 26.10.2026 przy obciążonym komputerze ten sam kod dawał 0,4 s
    # albo 2,9 s i test padał co drugi raz, choć pula miała 32 wątki.
    check(f"more than 6 sends in parallel (peak {rownolegle['szczyt']}, {took:.2f} s for 64)",
          sent == 64 and rownolegle["szczyt"] > 6)


def check_fcm_logged_before_webpush():
    """Dziennik nie czeka na Web Push: 08.10 wiersz stał 26 min na „pending”."""
    records, cooldowns = [], []
    release = None
    seen_while_sending = {}

    async def scenario():
        nonlocal release
        release = asyncio.Event()

        async def fcm(*args, **kwargs):
            return True

        async def web(*args, **kwargs):
            await release.wait()
            return 5

        async def nothing(*args, **kwargs):
            return None

        with (patch.object(notify, "send_fcm", fcm), patch.object(notify, "send_webpush", web),
              patch.object(notify, "send_ntfy", nothing),
              patch.object(notify, "send_telegram", nothing),
              patch.object(notify.db, "log_notif", side_effect=lambda *a: cooldowns.append(a)),
              patch("app.alert_log.record_delivery",
                    side_effect=lambda i, d, x: records.append((d, dict(x))))):
            task = asyncio.create_task(notify._deliver_level("lubelskie", "elevated", 3.0, [], 7))
            for _ in range(50):
                await asyncio.sleep(0)
            seen_while_sending["records"] = list(records)
            seen_while_sending["cooldowns"] = list(cooldowns)
            release.set()
            await task

    asyncio.run(scenario())
    early = seen_while_sending["records"]
    check("FCM logged while Web Push still sending",
          len(early) == 1 and early[0][0] == "sent" and early[0][1].get("fcm") is True
          and early[0][1].get("webpush_sent") == "w toku")
    check("cooldown saved right after FCM", len(seen_while_sending["cooldowns"]) == 1)
    final = records[-1][1] if records else {}
    check("Web Push result appended with duration",
          final.get("webpush_sent") == 5 and isinstance(final.get("webpush_s"), float)
          and final.get("fcm") is True)
    check("cooldown saved once", len(cooldowns) == 1)


def main():
    notify._vapid = {"private_key": "test", "public_key": "test"}
    good = subscription()
    check("valid subscription", notify.validate_push_subscription(good))
    check("requires HTTPS", not notify.validate_push_subscription(subscription("http://bad.test/x")))
    check("rejects an arbitrary HTTPS host", not notify.validate_push_subscription(
        subscription("https://example.test/push")))
    check("requires complete keys", not notify.validate_push_subscription(
        {"endpoint": good["endpoint"], "keys": {}}))
    check("rejects wrong EC point", not notify.validate_push_subscription(
        {**good, "keys": {**good["keys"], "p256dh": b64(b"x" * 65)}}))

    def success(**kwargs):
        check("timeout set", kwargs.get("timeout") == 10)
        check("TTL set", kwargs.get("ttl") == 300)
        return Response(201)

    with install_fake(success), patch.object(notify.db, "remove_push_sub") as remove:
        result = notify._send_webpush_sync(good, "{}")
        check("success result", result["status"] == "sent")
        check("success retained", not remove.called)

    for status, expected in ((400, "invalid"), (404, "expired"), (410, "expired")):
        def fail(**kwargs):
            raise PushError(status)
        with install_fake(fail), patch.object(notify.db, "remove_push_sub") as remove:
            result = notify._send_webpush_sync(good, "{}")
            check(f"HTTP {status} classified", result["status"] == expected and not remove.called)

    def transient(**kwargs):
        raise PushError(503)
    with install_fake(transient), patch.object(notify.db, "remove_push_sub") as remove:
        result = notify._send_webpush_sync(good, "{}")
        check("HTTP 503 retained", result["status"] == "error" and not remove.called)

    with patch.object(notify.db, "all_push_subs", return_value=[]) as all_subs:
        asyncio.run(notify.send_webpush("lubelskie", "title", "body", "elevated"))
        check("subscriptions scoped to region", all_subs.call_args.args == ("lubelskie",))

    results = [
        {"status": "sent", "ref": "good", "http": 201},
        {"status": "invalid", "ref": "bad", "http": 400, "endpoint": "bad"},
    ]
    with (patch.object(notify.db, "all_push_subs", return_value=[good, good]),
          patch.object(notify, "_send_webpush_sync", side_effect=results),
          patch.object(notify.db, "remove_push_sub") as remove):
        asyncio.run(notify.send_webpush("lubelskie", "title", "body", "elevated"))
        check("isolated HTTP 400 removed after another success",
              remove.call_args.args == ("bad",))

    with (patch.object(notify.db, "all_push_subs", return_value=[good]),
          patch.object(notify, "_send_webpush_sync", return_value={
              "status": "invalid", "ref": "only", "http": 400, "endpoint": "only"}),
          patch.object(notify.db, "remove_push_sub") as remove):
        asyncio.run(notify.send_webpush("lubelskie", "title", "body", "elevated"))
        check("lone HTTP 400 retained as possible shared fault", not remove.called)

    check_pool_and_connection_reuse(good)
    check_fcm_logged_before_webpush()

    previous_conn = db._conn
    try:
        db._conn = sqlite3.connect(":memory:", check_same_thread=False)
        db._conn.executescript(db.SCHEMA)
        db.add_push_sub(subscription("https://fcm.googleapis.com/wp/a"),
                        ["lubelskie", "podkarpackie"])
        db.add_push_sub(subscription("https://fcm.googleapis.com/wp/b"), ["podlaskie"])
        # Simulate a pre-fix record: it remains stored, but is not broadcast
        # nationwide and will be upgraded when that browser next opens the app.
        legacy = subscription("https://fcm.googleapis.com/wp/legacy")
        db._conn.execute("insert into push_subs values (?,?,?)",
                         (legacy["endpoint"], __import__("json").dumps(legacy), "old"))
        db._conn.commit()
        check("Lubelskie gets only assigned subscription",
              len(db.all_push_subs("lubelskie")) == 1)
        check("Podlaskie gets only assigned subscription",
              len(db.all_push_subs("podlaskie")) == 1)
        check("legacy unscoped subscription suppressed",
              len(db.all_push_subs("mazowieckie")) == 0)
    finally:
        if db._conn is not None and db._conn is not previous_conn:
            db._conn.close()
        db._conn = previous_conn
    print("WEBPUSH_RESULT PASS NO_SEND")


if __name__ == "__main__":
    main()
