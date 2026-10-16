# -*- coding: utf-8 -*-
"""Podniesienie stopnia alertu RCB W MIEJSCU nie może przepaść (16.10.2026).

Noc 15/16.10.2026: wpis RSO 23420577 (lubelskie) przyszedł o 00:00 jako „sytuacja jest
monitorowana” (poziom 1). O 01:06 RSO podmieniło treść pod tym samym id na „Zagrożenie
atakiem z powietrza. Znajdź bezpieczne miejsce” (poziom 3; SMS do ludzi poszedł 01:02).
Kolektor znał już klucz `rso:23420577:lubelskie`, więc poziomu 3 nie zapisał — 4,5 pkt
i klucz czerwonego przepadły, treść została tylko w dzienniku obserwacji.

Uruchomienie:  py scripts/test_rso_podniesienie.py
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
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


LUB = {"3": {"id": "3", "name": "Lubelskie", "slug_name": "lubelskie"}}
# Prawdziwe wersje wpisu 23420577 z dziennika obserwacji (15/16.10.2026).
MONITOR = {
    "id": 23420577, "title": "ALERT RCB ", "rso_alarm": "2", "provinces": LUB,
    "shortcut": "UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. "
                "W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.",
    "content": "UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. "
               "W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.",
    "valid_from": "2026-10-15 23:59:00", "valid_to": "2026-10-16 23:59:00",
    "updated_at": "2026-10-16 00:00:22",
}
SCHRONIENIE = {
    **MONITOR,
    "shortcut": "UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce.\n"
                "Stosuj się do poleceń służb. Oczekuj dalszych komunikatów.",
    "content": "UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce. "
               "Stosuj się do poleceń służb. Oczekuj dalszych komunikatów. dotyczy powiatów : "
               "włodawski, łęczyński, świdnicki, Chełm, chełmski, krasnostawski.",
    "updated_at": "2026-10-16 01:06:24",
}
ODWOLANIE = {
    **MONITOR,
    "shortcut": "UWAGA! Odwołano zagrożenie atakiem z powietrza. Brak zagrożenia na terenie Polski.",
    "content": "UWAGA! Odwołano zagrożenie atakiem z powietrza. Brak zagrożenia na terenie Polski. "
               "Dotyczy powiatów: włodawski, łęczyński, świdnicki, Chełm, chełmski, krasnostawski.",
    "updated_at": "2026-10-16 01:28:13",
}

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
rso.stealth = types.SimpleNamespace(record=lambda *_a, **_k: None)
rso._still_active = lambda _it: True
rso._bootstrap = True

print("1. kolektor: ten sam id, wyższy stopień")
asyncio.run(rso._check(FakeClient([MONITOR])))
ok([(z["event_type"], z["details"]["rcb_level"]) for z in zapisane] == [("rso_alert", 1)],
   "00:00: alert poziomu 1")
ok(zapisane[0]["dedup_key"] == "rso:23420577:lubelskie",
   "poziom 1 ma dotychczasowy klucz (trwające alerty nie wejdą drugi raz po wdrożeniu)")
asyncio.run(rso._check(FakeClient([MONITOR])))
ok(len(zapisane) == 1, "ta sama treść w kolejnym cyklu nie dubluje alertu")
asyncio.run(rso._check(FakeClient([SCHRONIENIE])))
ok(len(zapisane) == 2, "01:06: podniesienie stopnia w miejscu ZAPISANE")
if len(zapisane) == 2:
    trzy = zapisane[1]
    ok(trzy["details"]["rcb_level"] == 3, f"poziom 3 ({trzy['details']['rcb_level']})")
    ok(trzy["points"] == config.RCB_LEVEL_POINTS[3], f"{config.RCB_LEVEL_POINTS[3]} pkt")
    ok(trzy["dedup_key"] == "rso:23420577:lubelskie:L3", f"osobny klucz ({trzy['dedup_key']})")
asyncio.run(rso._check(FakeClient([SCHRONIENIE])))
ok(len(zapisane) == 2, "poziom 3 w kolejnym cyklu nie dubluje")
asyncio.run(rso._check(FakeClient([ODWOLANIE])))
ok([z["event_type"] for z in zapisane][-1] == "rso_clear", "01:28: odwołanie zapisane jak dotąd")

print("2. fuzja: nowszy poziom 3 daje czerwony bez obiektów")


def sig(sid, ts, event_type, points, details):
    return {"id": sid, "ts": ts, "source": "rcb", "event_type": event_type,
            "voivodeship": "lubelskie", "points": points, "title": "Alert RCB (RSO)", "details": details}


jeden = sig(1, "2026-10-15T22:01:56+00:00", "rso_alert", 1.5,
            {"rso_id": "23420577", "valid_from": "2026-10-15 23:59:00", "rcb_level": 1})
trzy_s = sig(2, "2026-10-15T23:07:16+00:00", "rso_alert", 4.5,
             {"rso_id": "23420577", "valid_from": "2026-10-15 23:59:00", "rcb_level": 3})
ref = datetime(2026, 10, 15, 23, 8, tzinfo=timezone.utc)
lub = fusion.accumulate([jeden, trzy_s], ref)["lubelskie"]
ok(abs(lub["score"] - 4.5) < 0.05, f"alerty się nie sumują, liczy się nowszy: {lub['score']:.2f}")
klucz = fusion.red_key(lub["signals"], ref)
ok((klucz or {}).get("powod") == "rcb3", f"klucz czerwonego z alertu poziomu 3 ({klucz})")
odw = sig(3, "2026-10-15T23:29:25+00:00", "rso_clear", 0.0,
          {"rso_id": "23420577", "clear": True, "cleared_at": "2026-10-15T23:28:13+00:00"})
lub = fusion.accumulate([jeden, trzy_s, odw], datetime(2026, 10, 15, 23, 30, tzinfo=timezone.utc))["lubelskie"]
ok(lub["score"] == 0.0, "odwołanie gasi obie wersje wpisu")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - podniesienie stopnia alertu RCB w miejscu")
