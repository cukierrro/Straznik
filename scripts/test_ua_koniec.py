# -*- coding: utf-8 -*-
"""Koniec i czas trwania alarmów obwodów UA — wariant B2 (13.09.2026).

  * pierwsze 30 min od prawdziwego początku (`since`) — pełna waga,
  * dalej, dopóki alarm trwa — połowa,
  * koniec alarmu (obwód znika z listy NEPTUN na 3 min przy działającym
    połączeniu) — od razu 0,
  * trwający alarm starszy niż okno fuzji nadal się liczy,
  * dawne sygnały bez epizodu liczą się po staremu.

Uruchomienie:  py scripts/test_ua_koniec.py
"""
import asyncio
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
sys.stdout.reconfigure(encoding="utf-8")

from app import config, fusion  # noqa: E402
from app.collectors import neptun  # noqa: E402

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


START = datetime(2026, 9, 13, 1, 0, tzinfo=timezone.utc)
EP = START.isoformat(timespec="seconds")
LWOW = "Львівська"


def start_sig(ts=START, episode=EP, sid=1):
    d = {"oblast": LWOW, "distance_km": 0}
    if episode:
        d["episode"] = episode
    return {"id": sid, "ts": ts.isoformat(timespec="seconds"), "source": "ua_alert",
            "event_type": "ua_alert_border", "voivodeship": "lubelskie", "points": 1.0,
            "title": "Alarm powietrzny w obwodzie lwowskim", "details": d}


def end_sig(at, episode=EP, sid=2):
    return {"id": sid, "ts": at.isoformat(timespec="seconds"), "source": "ua_alert",
            "event_type": "ua_alert_end", "voivodeship": "lubelskie", "points": 0.0,
            "title": "Koniec alarmu", "details": {"oblast": LWOW, "episode": episode,
                                                  "ended_at": at.isoformat(timespec="seconds")}}


def score(sigs, minutes):
    ref = START + timedelta(minutes=minutes)
    return fusion.accumulate(sigs, ref)["lubelskie"]["score"]


print("1. wariant B2 w fuzji")
ok(score([start_sig()], 10) == 1.0, "10 min: pełna waga 1,0")
ok(score([start_sig()], 45) == 0.5, "45 min, trwa: połowa 0,5 (dawniej 0,5 z zaniku, ale malejąca)")
ok(score([start_sig()], 150) == 0.5, "2,5 h, trwa: nadal 0,5 (dawniej 0)")
ok(score([start_sig(), end_sig(START + timedelta(minutes=10))], 12) == 0.0,
   "10-minutowy alarm po końcu: 0 (dawniej 1,0 przez kolejne 20 min)")
ok(score([start_sig(), end_sig(START + timedelta(minutes=100))], 90) == 0.5,
   "koniec w przyszłości względem chwili historii nie gasi wcześniej")
ok(score([start_sig(episode=None)], 45) == 0.5 and score([start_sig(episode=None)], 70) == 0.0,
   "dawny sygnał bez epizodu: stary zanik (45 min 0,5, 70 min 0)")
ok(score([start_sig()], 13 * 60) == 0.0, "bezpiecznik: epizod bez końca nie liczy się po 12 h")
st = fusion.accumulate([start_sig(), end_sig(START + timedelta(minutes=10))],
                       START + timedelta(minutes=12))["lubelskie"]["signals"][0]
ok(st.get("alert_ended", "").startswith("2026-09-13T01:10"), f"panel dostaje godzinę końca ({st.get('alert_ended')})")

print("2. trwający alarm spoza okna fuzji")
ref = START + timedelta(minutes=150)
old = start_sig()
ok(fusion.active_ua_alerts([old], ref) == [old], "start sprzed 2,5 h, bez końca: dołączony")
ok(fusion.active_ua_alerts([old, end_sig(START + timedelta(minutes=120))], ref) == [],
   "zakończony: nie dołączony")
ok(fusion.active_ua_alerts([start_sig(ts=ref - timedelta(minutes=5))], ref) == [],
   "świeży start jest już w oknie — nie dublujemy")
ok(fusion.active_ua_alerts([start_sig(episode=None)], ref) == [], "dawny bez epizodu: nie dołączony")

print("3. kolektor: początek, okres łaski, koniec")
zapis = []


async def fake_ingest(**kw):
    zapis.append(kw)


fusion.ingest = fake_ingest
neptun.status["connected"] = True
frame = {"raions": [{"oblast": "Львівська область", "level": "red", "since": "2026-09-13T01:00:12.5Z"},
                    {"oblast": "Львівська область", "level": "red", "since": "2026-09-13T00:58:03Z"},
                    {"oblast": "Донецька область", "level": "red", "since": "2026-09-12T00:00:00Z"}]}
T0 = 1789300000.0
asyncio.run(neptun._handle_alerts(frame, now=T0))
starts = [z for z in zapis if z["event_type"] == "ua_alert_border"]
ok({z["voivodeship"] for z in starts} == {"lubelskie", "podkarpackie"}, "start dla obu województw")
ok(starts[0]["details"]["episode"] == "2026-09-13T00:58:03+00:00", f"epizod od najwcześniejszego rejonu ({starts[0]['details']['episode']})")
ok(not any("Донецька" in str(z) for z in zapis), "obwody spoza listy ignorowane")

zapis.clear()
asyncio.run(neptun._handle_alerts(frame, now=T0 + 60))
ok(not zapis, "ta sama lista po minucie: nic nowego")
asyncio.run(neptun._handle_alerts({"raions": []}, now=T0 + 120))
ok(not zapis, "obwód zniknął: jeszcze bez końca (okres łaski)")
asyncio.run(neptun._handle_alerts(frame, now=T0 + 200))
ok(not zapis and LWOW in neptun._episodes, "wrócił w 80 s: ten sam epizod, bez końca i bez nowego startu")

asyncio.run(neptun._handle_alerts({"raions": []}, now=T0 + 300))
neptun.status["connected"] = False
asyncio.run(neptun._finish_ended(now=T0 + 600))
ok(not zapis, "brak połączenia: nie kończymy alarmu")
neptun.status["connected"] = True
asyncio.run(neptun._finish_ended(now=T0 + 600))
ends = [z for z in zapis if z["event_type"] == "ua_alert_end"]
ok(len(ends) == 2 and ends[0]["points"] == 0.0, "po 3 min nieobecności przy połączeniu: koniec dla obu województw")
ok(ends and ends[0]["details"]["ended_at"] == neptun._iso(T0 + 300), "godzina końca = chwila zniknięcia z listy")
ok(LWOW not in neptun._episodes, "epizod zamknięty")

print("4. restart w trakcie alarmu")
zapis.clear()
neptun._episodes.clear()
neptun._absent_since.clear()
restored_rows = [start_sig(episode="2026-09-13T00:58:03+00:00")]
neptun.db = types.SimpleNamespace(events_since=lambda *_a, **_k: restored_rows)
neptun.restore_episodes()
asyncio.run(neptun._handle_alerts(frame, now=T0 + 900))
ok(not any(z["event_type"] == "ua_alert_border" for z in zapis), "po restarcie trwający alarm nie dostaje drugiego startu")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - koniec i czas trwania alarmów obwodów UA")
