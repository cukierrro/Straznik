# -*- coding: utf-8 -*-
"""G1/E9: dziennik decyzji o alarmach i archiwum migawek.

Uruchomienie:  py scripts/test_alert_log.py
"""
import asyncio
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
from app import config, db                                          # noqa: E402

_tmp = tempfile.TemporaryDirectory()
config.DB_PATH = Path(_tmp.name) / "straznik.db"
db.init()
from app import alert_log, fusion, notify                           # noqa: E402

alert_log.ARCHIVE_PATH = Path(_tmp.name) / "archiwum.db"

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


async def _fcm(voiv, level, score, reasons, test=False):
    return True


async def _web(*a, **k):
    return 3


async def _nic(*a, **k):
    return None

notify.send_fcm, notify.send_webpush = _fcm, _web
notify.send_ntfy = notify.send_telegram = _nic
config.PRODUCTION = True
fusion.on_level_change = notify.notify_level
fusion.on_state_change = None


async def poczekaj():
    for _ in range(20):
        await asyncio.sleep(0)


async def scenariusz():
    db.add_signal("rcb", "rso_alert", "lubelskie", 2.0, "Alert RCB (RSO): zagrożenie atakiem z powietrza",
                  {"rso_id": "23329799"}, "rso:23329799:lubelskie")
    await fusion.reevaluate()
    await poczekaj()

asyncio.run(scenariusz())

print("1. zmiana poziomu z doręczeniem")
wiersze = [w for w in db.alert_log_since(1) if w["voivodeship"] == "lubelskie"]
sprawdz(len(wiersze) == 1, f"jeden wpis dla lubelskiego ({len(wiersze)})")
w = wiersze[0] if wiersze else {}
sprawdz(w.get("old_level") == "none" and w.get("new_level") == "elevated", "none → elevated")
sprawdz(w.get("decision") == "sent", f"decyzja: sent ({w.get('decision')})")
sprawdz(w.get("rso_ids") == ["23329799"], "powiązany alert RSO")
sprawdz(any(c.get("source") == "rcb" and c.get("counted") == 2.0 and c.get("rso_id") == "23329799"
            for c in w.get("composition") or []), "skład punktów z RSO i punktami policzonymi")
sprawdz((w.get("delivery") or {}).get("fcm") is True and (w.get("delivery") or {}).get("webpush_sent") == 3,
        f"wynik doręczenia FCM i Web Push ({w.get('delivery')})")
sprawdz((w.get("delivery") or {}).get("fcm_topic") == "voiv_lubelskie", "prawdziwy temat na produkcji")
sprawdz(w.get("version"), "wersja kodu zapisana")

print("2. sąsiedzi (samo przeniesienie) nie dostają wysyłki")
sasiedzi = [w for w in db.alert_log_since(1) if w["voivodeship"] != "lubelskie"]
sprawdz(all(w["decision"] != "sent" for w in sasiedzi), "sąsiedzi bez wysyłki")

print("3. spadek i cisza powtórki są zapisane")
st = {"score": 0.4, "own_score": 0.4, "signals": []}
rid = alert_log.record_transition("lubelskie", "elevated", "none", st, "falling")
sprawdz(rid and db.alert_log_since(1)[-1]["decision"] == "falling", "spadek poziomu w dzienniku")

print("4. cooldown i test")


async def powtorz():
    lid = alert_log.record_transition("lubelskie", "none", "elevated", {"signals": []}, "pending")
    await notify.notify_level("lubelskie", "elevated", 2.0, [], log_id=lid)
    lid2 = alert_log.record_transition("podlaskie", "none", "elevated", {"signals": []}, "pending")
    await notify.notify_level("podlaskie", "elevated", 2.0,
                              [{"source": "test", "title": "t", "points": 2.0, "details": {"test": True}}],
                              log_id=lid2)
    return lid, lid2

lid, lid2 = asyncio.run(powtorz())
po_id = {w["id"]: w for w in db.alert_log_since(1)}
sprawdz(po_id[lid]["decision"] == "cooldown", f"drugi żółty w cooldownie ({po_id[lid]['decision']})")
sprawdz(po_id[lid2]["decision"] == "test" and po_id[lid2]["delivery"]["topic"] == "test_voiv_podlaskie",
        "test oznaczony i na temacie testowym")

print("5. archiwum migawek")
alert_log.archive_snapshot({"threats": [{"id": "a1", "lat": 51.2}], "aircraft": []},
                           ts="2026-09-13T05:00:00+00:00")
alert_log.archive_snapshot({"threats": [{"id": "a2", "lat": 51.3}], "aircraft": []},
                           ts="2026-09-13T05:02:00+00:00")
m = alert_log.archived_snapshot("2026-09-13T05:01:30+00:00")
sprawdz(m and m["ts"] == "2026-09-13T05:00:00+00:00" and m["threats"][0]["id"] == "a1",
        "najbliższa wcześniejsza migawka odczytana po kompresji")
sprawdz(alert_log.archived_snapshot("2026-09-13T04:00:00+00:00") is None, "brak migawki przed archiwum")

alert_log._conn and alert_log._conn.close()
db._conn.close()
if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - dziennik alarmów ze składem i doręczeniem, archiwum migawek")
