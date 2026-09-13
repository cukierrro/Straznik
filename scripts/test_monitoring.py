# -*- coding: utf-8 -*-
"""Audyt D2/C8, D1, E4, D8: nadzorca zadań, prawdziwe „ok", blokada testów, zły rekord.

Uruchomienie:  py scripts/test_monitoring.py
"""
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import config, monitoring, notify                         # noqa: E402
from app.collectors import neptun, rso                             # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. D2: świeżość zamiast samej flagi ok")
now = time.time()
sprawdz(monitoring.fresh({"ok": True, "last": now - 60}, 60, now=now), "sukces sprzed minuty = ok")
sprawdz(not monitoring.fresh({"ok": True, "last": now - 400}, 60, now=now),
        "ok=True, ale sukces sprzed 7 min = nie ok (zatrzymana pętla)")
sprawdz(not monitoring.fresh({"ok": False, "last": now - 10}, 60, now=now), "błąd = nie ok")
sprawdz(not monitoring.fresh({"ok": True, "last": None}, 60, now=now), "brak sukcesu = nie ok")

print("2. D2: RSO zielone dopiero po przeczytaniu odpowiedzi")


class _Resp:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


class _Client:
    def __init__(self, payload):
        self.payload = payload

    async def get(self, *a, **k):
        return _Resp(self.payload)


rso.status.update(ok=True, last=now, error=None)
asyncio.run(rso._check(_Client(["to", "nie", "jest", "słownik"])))
sprawdz(rso.status["ok"] is False and "format" in (rso.status["error"] or ""),
        f"zmieniony format odpowiedzi gasi diodę ({rso.status['error']})")
rso.status.update(ok=False, last=None)
rso._bootstrap = True
asyncio.run(rso._check(_Client({"newses": [None, {"id": 1, "title": "Prognoza pogody"}]})))
sprawdz(rso.status["ok"] is True and rso.status.get("item_errors") == 1,
        "jeden dziwny wpis nie blokuje reszty, dioda zielona, błąd policzony")

print("3. D2: nadzorca wznawia zadanie po wyjątku")
_orig_sleep = asyncio.sleep


async def _fast_sleep(delay, *a, **k):
    await _orig_sleep(0)

calls = {"n": 0}


async def _flaky():
    calls["n"] += 1
    if calls["n"] < 3:
        raise RuntimeError("awaria")
    await _orig_sleep(3600)


async def _run_supervisor():
    asyncio.sleep = _fast_sleep
    try:
        monitoring.start("proba", _flaky)
        for _ in range(50):
            await _orig_sleep(0)
            if calls["n"] >= 3:
                break
        monitoring.tasks["proba"].cancel()
    finally:
        asyncio.sleep = _orig_sleep

asyncio.run(_run_supervisor())
sprawdz(calls["n"] == 3 and monitoring.supervisor["proba"]["restarts"] == 2,
        f"dwa wyjątki = dwa wznowienia, zadanie działa dalej ({monitoring.supervisor.get('proba')})")

print("4. D1: stan krytyczny")
neptun.status["last_msg"] = time.time()
rso.status.update(ok=True, last=time.time(), error=None)
notify.fcm_status.update(ready=True, last_ok_at=time.time(), last_error_at=None)
config.FCM_ENABLED = True
config.PRODUCTION = True
sprawdz(monitoring.critical_check()["ok"], "wszystko świeże = ok")
rso.status["last"] = time.time() - 600
c = monitoring.critical_check()
sprawdz(not c["ok"] and not c["checks"]["rso"]["ok"], "RSO sprzed 10 min = alarm dla autora")
rso.status["last"] = time.time()
notify.fcm_status["last_error_at"] = time.time() + 1
sprawdz(not monitoring.critical_check()["checks"]["fcm"]["ok"], "ostatnia wysyłka FCM nieudana = nie ok")
notify.fcm_status["last_error_at"] = None
config.PRODUCTION = False
sprawdz(not monitoring.critical_check()["ok"], "serwer bez STRAZNIK_ENV=production = nie ok")
config.PRODUCTION = True

print("5. E4: test nigdy na prawdziwe tematy")
sprawdz(notify.fcm_topic("lubelskie") == "voiv_lubelskie", "produkcja: voiv_lubelskie")
sprawdz(notify.fcm_topic("lubelskie", test=True) == "test_voiv_lubelskie", "test: test_voiv_lubelskie")
config.PRODUCTION = False
sprawdz(notify.fcm_topic("lubelskie") == "test_voiv_lubelskie", "kopia lokalna: zawsze test_")
config.PRODUCTION = True

wyslane = {"fcm": [], "web": 0, "log": 0}


async def _fcm(voiv, level, score, reasons, test=False):
    wyslane["fcm"].append((voiv, test))
    return True


async def _web(*a, **k):
    wyslane["web"] += 1
    return 1


async def _nic(*a, **k):
    return None

notify.send_fcm = _fcm
notify.send_webpush = _web
notify.send_ntfy = _nic
notify.send_telegram = _nic
notify.db.last_notif = lambda *a: None
notify.db.log_notif = lambda *a: wyslane.__setitem__("log", wyslane["log"] + 1)

testowy = [{"source": "test", "event_type": "test", "points": 2.0, "title": "Sygnał testowy",
            "details": {"test": True}, "counted_points": 2.0}]
prawdziwy = [{"source": "rcb", "event_type": "rso_alert", "points": 2.0, "title": "Alert RCB",
              "details": {}, "counted_points": 2.0}]
asyncio.run(notify.notify_level("lubelskie", "elevated", 2.0, testowy))
sprawdz(wyslane["fcm"] == [("lubelskie", True)] and wyslane["web"] == 0 and wyslane["log"] == 0,
        f"sygnał testowy: tylko temat testowy, bez Web Push i cooldownu ({wyslane})")
wyslane.update(fcm=[], web=0, log=0)
asyncio.run(notify.notify_level("lubelskie", "elevated", 2.0, prawdziwy + testowy))
sprawdz(wyslane["fcm"] == [("lubelskie", True)] and wyslane["web"] == 0,
        "prawdziwy + testowy = nadal test (test nie może podbić prawdziwego alarmu)")
wyslane.update(fcm=[], web=0, log=0)
asyncio.run(notify.notify_level("lubelskie", "elevated", 2.0, prawdziwy))
sprawdz(wyslane["fcm"] == [("lubelskie", False)] and wyslane["web"] == 1 and wyslane["log"] == 1,
        "prawdziwy alarm na produkcji: prawdziwy temat, Web Push i dziennik")
wyslane.update(fcm=[], web=0, log=0)
config.PRODUCTION = False
asyncio.run(notify.notify_level("lubelskie", "high", 4.0, prawdziwy))
sprawdz(wyslane["fcm"] == [("lubelskie", True)] and wyslane["web"] == 0,
        "kopia lokalna nie dotyka prawdziwych odbiorców nawet przy prawdziwym sygnale")
config.PRODUCTION = True

print("6. D8: zepsuty rekord NEPTUN nie zatrzymuje reszty")
_orig_eval, _orig_signal = neptun._evaluate, neptun._maybe_signal


def _eval(t):
    if t.get("id") == "zly":
        return float(t["count"]) and t      # „dużo" → ValueError
    return t


async def _signal(t):
    return None

neptun._evaluate, neptun._maybe_signal = _eval, _signal
neptun.status["bad_records"] = 0
neptun.tracks.clear()
asyncio.run(neptun._handle_threats([{"id": "zly", "count": "dużo"}, {"id": "dobry"}],
                                   replace=True))
sprawdz("dobry" in neptun.tracks and "zly" not in neptun.tracks, "dobry rekord przetworzony, zły pominięty")
sprawdz(neptun.status["bad_records"] == 1 and neptun.status["last_bad"]["id"] == "zly",
        "zły rekord policzony w statusie")
asyncio.run(neptun._dispatch({"type": "upsert", "data": {"id": "zly", "count": "x"}}, time.time()))
sprawdz(neptun.status["bad_records"] == 2, "ramka upsert z błędem też nie rzuca wyjątku")
neptun._evaluate, neptun._maybe_signal = _orig_eval, _orig_signal

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - nadzorca, świeżość, stan krytyczny, blokada testów i zły rekord NEPTUN")
