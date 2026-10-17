# -*- coding: utf-8 -*-
"""Stare odwołanie wiszące w RSO nie wycisza nowych alertów (zgłoszenie #12, 10.10.2026).

10.10.2026 w RSO cały dzień wisiało poranne odwołanie dla lubelskiego (23404919,
06:55, valid_to 23:59), a wieczorem przyszły nowe alerty: 23406262 lubelskie 18:35
(valid_to do północy NASTĘPNEGO dnia) i 23406263 podkarpackie 18:40. Na produkcji
oba dostały po 1,5 pkt — test pilnuje, żeby tak zostało, przy różnych odstępach.

Uruchomienie:  py scripts/test_rso_odwolanie_1010.py
"""
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import config, fusion  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


def sig(sid, ts, event_type, voiv, points, details):
    return {"id": sid, "ts": ts, "source": "rcb", "event_type": event_type,
            "voivodeship": voiv, "points": points, "title": "Alert RCB (RSO)", "details": details}


# Prawdziwe wpisy z 10.10.2026 (czasy RSO lokalne, sygnały w UTC). issued_rso = created_at
# z RSO: alert pojawił się 45 s po swoim valid_from — w tym oknie odwołanie innego
# wpisu gasiło go przed poprawką fusion._issued_at (17.10.2026).
odwolanie = sig(4730, "2026-10-10T04:56:00+00:00", "rso_clear", "lubelskie", 0.0,
                {"rso_id": "23404919", "clear": True, "cleared_at": "2026-10-10T04:55:26+00:00"})
lub = sig(4913, "2026-10-10T16:36:00+00:00", "rso_alert", "lubelskie", 1.5,
          {"rso_id": "23406262", "valid_from": "2026-10-10 18:35:00",
           "valid_to": "2026-10-11 23:59:00", "rcb_level": 1,
           "issued_rso": "2026-10-10 18:35:45"})
podk = sig(4919, "2026-10-10T16:42:00+00:00", "rso_alert", "podkarpackie", 1.5,
           {"rso_id": "23406263", "valid_from": "2026-10-10 18:39:00",
            "valid_to": "2026-10-10 20:59:00", "rcb_level": 1,
            "issued_rso": "2026-10-10 18:40:48"})
REF = datetime(2026, 10, 10, 16, 45, tzinfo=timezone.utc)

print("1. sekwencja z 10.10")
st = fusion.accumulate([odwolanie, lub, podk], REF)
ok(abs(st["lubelskie"]["score"] - 1.5) < 0.05, f"lubelskie: poranne odwołanie nie gasi alertu z 18:35 ({st['lubelskie']['score']:.2f})")
ok(abs(st["podkarpackie"]["score"] - 1.5) < 0.05, f"podkarpackie: odwołanie z innego woj. nie gasi ({st['podkarpackie']['score']:.2f})")

print("2. różne odstępy między starym odwołaniem a nowym alertem")
for minut in (1, 5, 30, 120, 600):
    t_odw = REF - timedelta(minutes=9) - timedelta(minutes=minut)
    odw = {**odwolanie, "ts": t_odw.isoformat(timespec="seconds"),
           "details": {**odwolanie["details"], "cleared_at": t_odw.isoformat(timespec="seconds")}}
    s = fusion.accumulate([odw, lub], REF)["lubelskie"]["score"]
    ok(abs(s - 1.5) < 0.05, f"odwołanie {minut} min PRZED alertem nie gasi go ({s:.2f})")

print("3. odwrotnie: odwołanie PO alercie gasi go")
for minut in (1, 5, 30):
    t_odw = datetime(2026, 10, 10, 16, 36, tzinfo=timezone.utc) + timedelta(minutes=minut)
    odw = {**odwolanie, "ts": (t_odw + timedelta(seconds=30)).isoformat(timespec="seconds"),
           "details": {**odwolanie["details"], "rso_id": "23406262",
                       "cleared_at": t_odw.isoformat(timespec="seconds")}}
    ref = t_odw + timedelta(minutes=2)
    s = fusion.accumulate([lub, odw], ref)["lubelskie"]["score"]
    ok(s == 0.0, f"odwołanie {minut} min PO alercie gasi go ({s:.2f})")

print("3a. bez issued_rso (sygnały sprzed 17.10) zachowanie jak dawniej")
stary = {**lub, "details": {k: v for k, v in lub["details"].items() if k != "issued_rso"}}
t_odw = datetime(2026, 10, 10, 16, 35, 20, tzinfo=timezone.utc)
odw = {**odwolanie, "ts": t_odw.isoformat(timespec="seconds"),
       "details": {**odwolanie["details"], "cleared_at": t_odw.isoformat(timespec="seconds")}}
ok(fusion.accumulate([odw, stary], REF)["lubelskie"]["score"] == 0.0,
   "sam valid_from: odwołanie z 18:35:20 gasi alert z valid_from 18:35 (dawne zachowanie)")
ok(abs(fusion.accumulate([odw, lub], REF)["lubelskie"]["score"] - 1.5) < 0.05,
   "z issued_rso 18:35:45: to samo odwołanie już go nie gasi")

print("4. długie valid_to nie trzyma punktów ponad okno fuzji")
pozno = REF + timedelta(minutes=config.FUSION_WINDOW_MIN + 15)
s = fusion.accumulate([odwolanie, lub], pozno)["lubelskie"]["score"]
ok(s == 0.0, f"po {config.FUSION_WINDOW_MIN + 15} min alert z valid_to do jutra ma 0 pkt ({s:.2f})")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - stare odwołanie nie wycisza nowych alertów (#12)")
