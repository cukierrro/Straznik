# -*- coding: utf-8 -*-
"""Poprawki z audytu bezpieczeństwa (16.09.2026).

1. Treść POST ponad 16 KB → 413, także bez Content-Length (chunked).
2. Zapis subskrypcji Web Push: najwyżej 60 na 10 min z jednego adresu → 429.
3. Górny limit liczby subskrypcji (PUSH_SUBS_MAX); odświeżenie istniejącej dalej działa.
4. Nagłówki bezpieczeństwa na każdej odpowiedzi.
5. all_push_subs filtruje województwo w SQL bez mylenia „pomorskie” z „zachodniopomorskie”.
6. /api/history: `hours` przycięte do 1–12 (wcześniej OverflowError → 500).
7. FCM ma własną pulę wątków, Web Push ograniczoną współbieżność.
8. Frontend: esc zamienia apostrof, fragmenty HTML w opisie sygnału nie są
   rozpoznawane po treści („<b…”), liczby ADS-B idą przez Number.

Uruchomienie: py scripts/test_bezpieczenstwo.py
"""
import sys
import tempfile
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
warnings.filterwarnings("ignore")

from app import config, db, notify, request_limits  # noqa: E402

tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)   # Windows: SQLite trzyma plik
config.DATA_DIR = Path(tmp.name)
config.DB_PATH = Path(tmp.name) / "straznik.db"
db.init()

from starlette.testclient import TestClient  # noqa: E402
from app import main  # noqa: E402

client = TestClient(main.app)
bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


r = client.post("/api/push/subscribe", content=b"{" + b" " * 20000 + b"}",
                headers={"content-type": "application/json", "cf-connecting-ip": "198.51.100.1"})
sprawdz(r.status_code == 413, f"20 KB treści → 413 ({r.status_code})")


def chunks():
    for _ in range(40):
        yield b" " * 1024

r = client.post("/api/test-signal", content=chunks(), headers={"content-type": "application/json"})
sprawdz(r.status_code == 413, f"treść chunked bez Content-Length → 413 ({r.status_code})")
r = client.post("/api/test-signal", json={"voivodeship": "lubelskie"})
sprawdz(r.status_code == 404, f"mała treść przechodzi dalej (test-signal wyłączony → 404; {r.status_code})")

codes = [client.post("/api/push/subscribe", json={"endpoint": "x"},
                     headers={"cf-connecting-ip": "203.0.113.7"}).status_code for _ in range(request_limits.SUBSCRIBE_PER_IP + 1)]
sprawdz(codes[:-1] == [400] * request_limits.SUBSCRIBE_PER_IP and codes[-1] == 429, f"61. zapis z jednego IP → 429 ({codes[-3:]})")
other = client.post("/api/push/subscribe", json={"endpoint": "x"},
                    headers={"cf-connecting-ip": "203.0.113.8"}).status_code
sprawdz(other == 400, f"inny adres nie jest blokowany ({other})")

r = client.get("/api/nie-ma-takiego")
h = {k.lower(): v for k, v in r.headers.items()}
sprawdz(h.get("x-content-type-options") == "nosniff" and h.get("x-frame-options") == "SAMEORIGIN"
        and "max-age" in h.get("strict-transport-security", "") and h.get("referrer-policy"),
        f"nagłówki bezpieczeństwa ({ {k: h.get(k) for k in ('x-content-type-options', 'x-frame-options')} })")

KEYS = {"p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
        "auth": "tBHItJI5svbpez7KI4CCXg"}


def sub(n, voivs):
    return {"endpoint": f"https://fcm.googleapis.com/fcm/send/test{n}", "keys": KEYS, "voivodeships": voivs}

valid = notify.validate_push_subscription(sub(0, ["pomorskie"]))
sprawdz(valid, "przykładowa subskrypcja przechodzi walidację")
config.PUSH_SUBS_MAX = 2
request_limits._hits.clear()
c1 = client.post("/api/push/subscribe", json=sub(1, ["pomorskie"])).status_code
c2 = client.post("/api/push/subscribe", json=sub(2, ["zachodniopomorskie"])).status_code
c3 = client.post("/api/push/subscribe", json=sub(3, ["lubelskie"])).status_code
c1b = client.post("/api/push/subscribe", json=sub(1, ["pomorskie", "lubelskie"])).status_code
sprawdz((c1, c2, c3, c1b) == (200, 200, 503, 200),
        f"limit subskrypcji: nowa ponad limit 503, odświeżenie istniejącej 200 ({c1, c2, c3, c1b})")
pom = [s["endpoint"][-5:] for s in db.all_push_subs("pomorskie")]
zach = [s["endpoint"][-5:] for s in db.all_push_subs("zachodniopomorskie")]
sprawdz(pom == ["test1"] and zach == ["test2"] and len(db.all_push_subs()) == 2,
        f"filtr województwa w SQL ({pom}, {zach})")

r = client.get("/api/history", params={"hours": 10 ** 10})
sprawdz(r.status_code == 200 and r.json().get("hours") == 12, f"hours=10^10 → 12, bez 500 ({r.status_code})")

src = (ROOT / "backend" / "app" / "notify.py").read_text(encoding="utf-8")
sprawdz("run_in_executor(_fcm_pool, _send_fcm_sync" in src and "asyncio.Semaphore(WEBPUSH_CONCURRENCY)" in src,
        "FCM we własnej puli wątków, Web Push z ograniczoną współbieżnością")

app_js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
sprawdz('"\'": "&#39;"' in app_js, "esc zamienia apostrof")
sprawdz('x.startsWith("<b")' not in app_js and 'typeof x === "object" ? x.html : esc(x)' in app_js,
        "fragmenty HTML w opisie sygnału oznaczone typem, nie treścią")
sprawdz("${p.rssi} dBFS" not in app_js and "${+p.rssi} dBFS" in app_js, "rssi i msg/s jako liczby")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - limity zapytań, subskrypcji i nagłówki bezpieczeństwa")
