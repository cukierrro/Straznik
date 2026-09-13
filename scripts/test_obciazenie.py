# -*- coding: utf-8 -*-
"""Gotowe odpowiedzi i bezpiecznik pamięci (awaria 13.09.2026 o 04:54:50).

Serwer zabity przez OOM, bo każde wejście składało 12-godzinną historię od nowa.
Sprawdzamy, że:
  1. paczka historii sklejana z tekstu migawek jest identyczna z dawnym formatem,
  2. odpowiedź to gotowe bajty z gzipem, ETagiem i nagłówkami dla Cloudflare,
  3. bezpiecznik wchodzi na poziom 1 przy 70% RAM VPS i odrzuca dynamiczne API,
     a gotowe odpowiedzi nadal podaje.

Uruchomienie:  py scripts/test_obciazenie.py
"""
import asyncio
import gzip
import json
import sys
import tempfile
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
sys.stdout.reconfigure(encoding="utf-8")

from app import config, db  # noqa: E402

tmp = Path(tempfile.mkdtemp())
config.DB_PATH = tmp / "test.db"
db.init()
from app import load_guard, public_cache  # noqa: E402

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. paczka historii")
for i in range(3):
    db._conn.execute("INSERT INTO snapshots (ts, payload) VALUES (?,?)",
                     (f"2099-01-01T00:0{i}:00+00:00",
                      json.dumps({"threats": [{"id": i, "locality": "Łuck"}], "aircraft": []},
                                 ensure_ascii=False)))
db._conn.commit()
public_cache.db.snapshot_rows = lambda hours=12: db._conn.execute(
    "SELECT ts, payload FROM snapshots ORDER BY ts").fetchall()
db.adsb_watch_events = lambda hours=12: []
raw = public_cache.build_bundle_bytes()
nowy = json.loads(raw)
dawne = [{"ts": ts, **json.loads(p)} for ts, p in public_cache.db.snapshot_rows()]
ok(nowy["snaps"] == dawne, "migawki identyczne z dawnym all_snapshots")
ok(set(nowy) == {"hours", "window_min", "snaps", "signals", "adsb_watch_events"}, f"pola {sorted(nowy)}")

print("2. gotowe bajty")
blob = public_cache.make_blob(raw)
ok(gzip.decompress(blob.gz) == raw and blob.etag.startswith('"'), "gzip i ETag")
public_cache.put("bundle", blob)


class Req:
    def __init__(self, headers):
        self.headers = headers


r = public_cache.respond(Req({"accept-encoding": "gzip, br"}), "bundle")
ok(r.headers.get("content-encoding") == "gzip" and "s-maxage=60" in r.headers["cache-control"],
   f"nagłówki {dict(r.headers)}")
r304 = public_cache.respond(Req({"if-none-match": blob.etag}), "bundle")
ok(r304.status_code == 304, "ETag → 304 bez treści")
ok(public_cache.respond(Req({}), "nieznane").status_code == 503, "brak gotowej odpowiedzi → 503, nie liczenie")

print("3. bezpiecznik")
ok(load_guard.level_for(69, 500) == 0, "69% RAM VPS → normalnie")
ok(load_guard.level_for(70, 500) == 1, "70% RAM VPS → poziom 1")
ok(load_guard.level_for(40, 2300) == 1, "proces 2300 MB → poziom 1")
ok(load_guard.level_for(86, 500) == 2, "86% RAM VPS → poziom 2")
ok(load_guard._dynamic_api("/api/history") and load_guard._dynamic_api("/api/signals"),
   "dynamiczne API rozpoznane")
ok(not load_guard._dynamic_api("/api/state") and not load_guard._dynamic_api("/api/history/bundle")
   and not load_guard._dynamic_api("/api/push/subscribe"), "gotowe odpowiedzi i push przepuszczane")


async def middleware(path, level):
    load_guard.status["level"] = level
    sent = []

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})

    async def send(msg):
        sent.append(msg)

    await load_guard.GuardMiddleware(app)({"type": "http", "path": path}, None, send)
    return sent[0]["status"]


ok(asyncio.run(middleware("/api/history", 1)) == 503, "poziom 1: /api/history → 503")
ok(asyncio.run(middleware("/api/state", 2)) == 200, "poziom 2: /api/state nadal 200")
ok(asyncio.run(middleware("/app.js", 2)) == 200, "poziom 2: strona statyczna nadal 200")
load_guard.status["level"] = 0

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - gotowe odpowiedzi i bezpiecznik pamięci")
