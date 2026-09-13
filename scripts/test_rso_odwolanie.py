# -*- coding: utf-8 -*-
"""Odwołanie alertu RCB/RSO gasi alert i artykuły, które go potem opisują.

13.09.2026: wpis RSO 23329799 (lubelskie, wydany 04:09) został o 04:58
zmieniony W MIEJSCU na „Odwołano zagrożenie atakiem z powietrza" (rso_alarm 2).
Kolektor znał już jego id i zmiany nie zauważył. O 07:39 i 07:44 Kurier Lubelski
opisał poranne syreny i oba artykuły dostały po 1,5 pkt.

Uruchomienie:  py scripts/test_rso_odwolanie.py
"""
import asyncio
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import config, fusion  # noqa: E402
from app.collectors import rso  # noqa: E402
from app.textmatch import classify_level  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


# ── wpisy RSO z 13.09.2026 (skrócone do pól, które czyta kolektor) ─────────
ODWOLANY = {
    "id": 23329799, "title": "ALERT RCB",
    "shortcut": "UWAGA! UWAGA! UWAGA! Odwołano zagrożenie atakiem z powietrza. Śledź komunikaty.",
    "content": "UWAGA! UWAGA! UWAGA! Odwołano zagrożenie atakiem z powietrza. Śledź komunikaty.",
    "rso_alarm": "2", "valid_from": "2026-09-13 04:09:00", "valid_to": "2026-09-13 23:59:00",
    "created_at": "2026-09-13 04:11:06", "updated_at": "2026-09-13 04:58:13",
    "provinces": {"3": {"id": "3", "name": "Lubelskie", "slug_name": "lubelskie"}},
}
ALERT = {
    "id": 23329983, "title": "ALERT RCB-ZAGROŻENIE Z POWIETRZA",
    "shortcut": "Rosyjski atak powietrzny na terenie Ukrainy.",
    "content": "UWAGA! UWAGA! UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. "
               "Sytuacja jest monitorowana. W przestrzeni RP operuje polskie lotnictwo.",
    "rso_alarm": "1", "valid_from": "2026-09-13 06:41:00", "valid_to": "2026-09-13 09:00:00",
    "created_at": "2026-09-13 06:42:00", "updated_at": "2026-09-13 06:42:13",
    "provinces": {"9": {"id": "9", "name": "Podkarpackie", "slug_name": "podkarpackie"}},
}

print("1. rozpoznanie odwołania")
ok(rso._is_rcb_air_cancellation(ODWOLANY), "wpis 23329799 po edycji to odwołanie")
ok(not rso._is_rcb_air_cancellation(ALERT), "wpis 23329983 to alert, nie odwołanie")
bez_pola = {**ODWOLANY, "rso_alarm": ""}
ok(rso._is_rcb_air_cancellation(bez_pola), "bez rso_alarm rozpoznaje po tytule")
trwa = {**ALERT, "rso_alarm": "", "shortcut": "Alert obowiązuje do odwołania."}
ok(not rso._is_rcb_air_cancellation(trwa), "„do odwołania” to trwający alert")

print("2. kolektor zapisuje odwołanie wpisu, który już znał")
zapisane = []


async def fake_ingest(**kw):
    zapisane.append(kw)
    return True


class FakeResp:
    def __init__(self, items): self.items = items
    def raise_for_status(self): pass
    def json(self): return {"newses": self.items}


class FakeClient:
    def __init__(self, items): self.items = items
    async def get(self, *_a, **_k): return FakeResp(self.items)


rso.fusion = types.SimpleNamespace(ingest=fake_ingest, db=fusion.db)
rso.rcb_reference = types.SimpleNamespace(
    capture=lambda **_k: None,
    normalize_source_time=__import__("app.rcb_reference", fromlist=["x"]).normalize_source_time)
rso._still_active = lambda _it: True
rso._bootstrap = True
alert_przed = {**ODWOLANY, "rso_alarm": "1", "updated_at": "2026-09-13 04:11:06",
               "shortcut": "UWAGA! UWAGA! UWAGA! Rosyjski atak powietrzny na terenie Ukrainy.",
               "content": "UWAGA! UWAGA! UWAGA! Rosyjski atak powietrzny na terenie Ukrainy."}
asyncio.run(rso._check(FakeClient([alert_przed])))
ok([z["event_type"] for z in zapisane] == ["rso_alert"], "pierwszy obieg: alert")
asyncio.run(rso._check(FakeClient([ODWOLANY])))
ok([z["event_type"] for z in zapisane] == ["rso_alert", "rso_clear"],
   "ten sam id po edycji: odwołanie zapisane")
clear = zapisane[-1]
ok(clear["points"] == 0.0 and clear["voivodeship"] == "lubelskie", "odwołanie ma 0 pkt")
ok(clear["details"]["cleared_at"] == "2026-09-13T02:58:13+00:00",
   f"czas odwołania z RSO w UTC: {clear['details']['cleared_at']}")
asyncio.run(rso._check(FakeClient([ODWOLANY])))
ok(len(zapisane) == 2, "kolejny obieg nie dubluje odwołania")

print("3. fuzja gasi odwołany alert, ale nie nowszy")


def sig(sid, ts, source, event_type, voiv, points, title, details=None):
    return {"id": sid, "ts": ts, "source": source, "event_type": event_type,
            "voivodeship": voiv, "points": points, "title": title, "details": details or {}}


alert_lub = sig(1, "2026-09-13T02:11:10+00:00", "rcb", "rso_alert", "lubelskie", 2.0,
                "Alert RCB (RSO): „UWAGA! Rosyjski atak powietrzny”",
                {"rso_id": "23329799", "valid_from": "2026-09-13 04:09:00"})
odw = sig(2, "2026-09-13T02:58:40+00:00", "rcb", "rso_clear", "lubelskie", 0.0,
          "RCB (RSO): odwołanie", {"rso_id": "23329799", "cleared_at": "2026-09-13T02:58:13+00:00"})
ref = datetime(2026, 9, 13, 3, 0, tzinfo=timezone.utc)
lub = fusion.accumulate([alert_lub], ref)["lubelskie"]
ok(lub["score"] > 0.5, f"bez odwołania alert nadal się liczy ({lub['score']:.2f})")
lub = fusion.accumulate([alert_lub, odw], ref)["lubelskie"]
ok(lub["score"] == 0.0, "po odwołaniu 0 pkt")
ok(lub["signals"][0].get("official_clear") == "alert", "alert widoczny z oznaczeniem odwołania")

inny_odw = {**odw, "details": {"rso_id": "999", "cleared_at": "2026-09-13T02:58:13+00:00"}}
nowszy = sig(3, "2026-09-13T03:01:00+00:00", "rcb", "rso_alert", "lubelskie", 2.0,
             "Alert RCB (RSO): nowy", {"rso_id": "23330001", "valid_from": "2026-09-13 05:00:00"})
lub = fusion.accumulate([alert_lub, inny_odw, nowszy], ref)["lubelskie"]
pkt = {x["id"]: x["counted_points"] for x in lub["signals"]}
ok(pkt == {1: 0.0, 3: 2.0}, f"odwołanie wydane później gasi starszy alert, nowszy zostaje {pkt}")

print("4. artykuły po odwołaniu")
syreny = sig(10, "2026-09-13T05:39:57+00:00", "media", "media_keywords", "lubelskie", 1.5,
             "Media: „Alarm powietrzny na Lubelszczyźnie. W sześciu powiatach zawyły syreny - Kurier Lubelski”")
ref = datetime(2026, 9, 13, 5, 46, tzinfo=timezone.utc)
lub = fusion.accumulate([syreny], ref)["lubelskie"]
ok(lub["score"] == 1.0, "bez odwołania artykuł liczy się (do limitu mediów 1,0)")
lub = fusion.accumulate([syreny, odw], ref)["lubelskie"]
ok(lub["score"] == 0.0 and lub["signals"][0].get("official_clear") == "after_clear",
   "07:39 po odwołaniu z 04:58: 0 pkt, oznaczone jako po odwołaniu")
nowy_alert = sig(11, "2026-09-13T05:20:00+00:00", "rcb", "rso_alert", "lubelskie", 2.0,
                 "Alert RCB (RSO): nowy", {"rso_id": "23330500", "valid_from": "2026-09-13 07:19:00"})
lub = fusion.accumulate([syreny, odw, nowy_alert], ref)["lubelskie"]
ok(lub["score"] == 3.0, "nowy alert po odwołaniu przywraca punkty artykułom")
dron = sig(12, "2026-09-13T05:39:57+00:00", "media", "media_keywords", "lubelskie", 1.5,
           "Media: „Szczątki drona znalezione w polu pod Chełmem”")
lub = fusion.accumulate([dron, odw], ref)["lubelskie"]
ok(lub["score"] == 1.0, "artykuł o nowym zdarzeniu (bez słów o alarmie) liczy się dalej")
# 13.09.2026: wyjątki na „znów" i wybuchy przepuściły ten tytuł i dały fałszywy
# żółty o 10:01 — drugiego włączenia syren nie było. Reguła jest znowu bez wyjątków.
ref_pozniej = datetime(2026, 9, 13, 5, 50, tzinfo=timezone.utc)
nowe = sig(14, "2026-09-13T05:45:00+00:00", "media", "media_keywords", "lubelskie", 1.5,
           "Media: „Na Lubelszczyźnie znów zawyły syreny alarmowe. Były zgłoszenia o wybuchach”")
lub = fusion.accumulate([nowe, odw], ref_pozniej)["lubelskie"]
ok(lub["score"] == 0.0 and lub["signals"][0].get("official_clear") == "after_clear",
   "„znów zawyły syreny… wybuchy” po odwołaniu to nadal echo")
pozno = {**syreny, "ts": "2026-09-13T09:30:00+00:00"}
lub = fusion.accumulate([pozno, odw], datetime(2026, 9, 13, 9, 35, tzinfo=timezone.utc))["lubelskie"]
ok(lub["score"] == 1.0, f"po {config.RSO_CLEAR_MEDIA_ECHO_MIN} min odwołanie przestaje działać")
wczesniej = {**syreny, "ts": "2026-09-13T02:30:00+00:00"}
lub = fusion.accumulate([wczesniej, odw], datetime(2026, 9, 13, 3, 0, tzinfo=timezone.utc))["lubelskie"]
ok(lub["score"] == 0.0, "artykuł sprzed odwołania gaśnie razem z alertem")
podk = sig(13, "2026-09-13T05:39:57+00:00", "media", "media_keywords", "podkarpackie", 1.5,
           "Media: „Zawyły syreny w Przemyślu”")
ok(fusion.accumulate([podk, odw], ref)["podkarpackie"]["score"] == 1.0,
   "odwołanie w lubelskim nie gasi innych województw")

print("5. podsumowania minionego alarmu")
lvl, _ = classify_level(
    "Niespokojny poranek na Lubelszczyźnie. W sześciu powiatach zawyły syreny, wojsko poderwało myśliwce",
    config.ALERT_CRITICAL_KEYWORDS, config.ALERT_AIR_KEYWORDS, config.ALERT_EVENT_KEYWORDS,
    config.EXCLUDE_KEYWORDS, config.SOFT_EXCLUDE_KEYWORDS)
ok(lvl != "critical", f"„Niespokojny poranek…” nie jest już meldunkiem krytycznym ({lvl})")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - odwołania RSO i artykuły po odwołaniu")
