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
