# -*- coding: utf-8 -*-
"""Zapas REST NEPTUN-a, gdy gniazdo leży (17.11.2026, zmasowany nalot).

Gniazdo /api/v1/stream dawało 503 wszystkim, REST za Cloudflare działał. Pilnujemy:
1. w czasie oczekiwania na gniazdo REST jest odpytywany co NEPTUN_REST_INTERVAL,
   a nie raz na próbę połączenia;
2. alarmy obwodów idą też z /api/v1/alerts, ale tylko gdy odpowiedź ma kształt
   ramki `alerts` — pusta/obca odpowiedź nie może zakończyć alarmów;
3. koniec alarmu przy leżącym gnieździe jest dozwolony tylko przy świeżym REST;
4. diody w /api/state biorą świeży REST pod uwagę.

Uruchomienie: py scripts/test_neptun_rest_zapas.py
"""
import asyncio
import sys
import time
import types
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.modules.setdefault("dotenv", types.SimpleNamespace(load_dotenv=lambda *a, **k: None))
from app import config                                     # noqa: E402
from app.collectors import neptun                          # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. odpytywanie REST przez cały czas oczekiwania")
wywolania = []


async def _udawany_odczyt():
    wywolania.append(time.monotonic())

oryg = neptun._rest_fallback_once
neptun._rest_fallback_once = _udawany_odczyt
config.NEPTUN_REST_INTERVAL = 0.05
asyncio.run(neptun._rest_poll_for(0.32))
sprawdz(6 <= len(wywolania) <= 9, f"0,32 s oczekiwania przy co 0,05 s = ok. 7 odczytów ({len(wywolania)})")
wywolania.clear()
asyncio.run(neptun._rest_poll_for(0))
sprawdz(len(wywolania) == 1, "krótkie oczekiwanie: dokładnie jeden odczyt (jak dawniej)")
neptun._rest_fallback_once = oryg
src = Path(neptun.__file__).read_text(encoding="utf-8")
petla = src.split("async def _ws_loop", 1)[1].split("\ndef ", 1)[0]
sprawdz("_rest_poll_for(wait)" in petla and "asyncio.sleep(wait)" not in petla,
        "pętla gniazda czeka przez _rest_poll_for, nie przez gołe sleep")

print("2. kształt odpowiedzi /api/v1/alerts")
sprawdz(neptun._alerts_payload_ok({"version": 1, "raions": []}), "ramka z listą rejonów (także pustą) — tak")
sprawdz(neptun._alerts_payload_ok({"oblasts": [{"name": "Львівська область"}]}), "ramka z listą obwodów — tak")
for zle in (None, {}, {"error": "busy"}, {"raions": None}, [], "503"):
    sprawdz(not neptun._alerts_payload_ok(zle), f"odrzucone: {zle!r}")
sprawdz("_alerts_payload_ok(data)" in src.split("async def _rest_fallback_once", 1)[1].split("async def _rest_poll_for", 1)[0],
        "odczyt REST sprawdza kształt przed _handle_alerts")

print("3. koniec alarmu tylko przy aktualnej liście")
zapis = []


async def fake_ingest(**kw):
    zapis.append(kw)

neptun.fusion.ingest = fake_ingest
neptun._episodes.clear(); neptun._absent_since.clear()
T0 = time.time()
neptun._episodes["Львівська"] = {"episode": "2026-11-17T05:00:00+00:00"}
neptun._absent_since["Львівська"] = T0 - 600
neptun.status.update(connected=False, rest_alerts_at=None, rest_threats_at=None)
asyncio.run(neptun._finish_ended(now=T0))
sprawdz(not zapis and "Львівська" in neptun._episodes, "gniazdo leży, REST brak: alarm trwa")
neptun.status["rest_alerts_at"] = T0 - config.NEPTUN_REST_FRESH_S - 5
asyncio.run(neptun._finish_ended(now=T0))
sprawdz(not zapis, "gniazdo leży, REST przeterminowany: alarm trwa")
neptun.status["rest_alerts_at"] = T0 - 5
asyncio.run(neptun._finish_ended(now=T0))
sprawdz(any(z["event_type"] == "ua_alert_end" for z in zapis), "gniazdo leży, świeży REST alarmów: koniec dozwolony")

print("4. diody")
neptun.status.update(connected=False, rest_threats_at=T0 - 5, rest_alerts_at=None)
sprawdz(neptun.threats_live(T0) and not neptun.alerts_live(T0), "świeże zagrożenia z REST ≠ świeże alarmy")
neptun.status.update(rest_threats_at=T0 - 600)
sprawdz(not neptun.threats_live(T0), "stary REST nie świeci na zielono")
neptun.status.update(connected=True)
sprawdz(neptun.threats_live(T0) and neptun.alerts_live(T0), "połączone gniazdo: obie zielone")
glowny = (Path(__file__).resolve().parents[1] / "backend" / "app" / "main.py").read_text(encoding="utf-8")
sprawdz('"neptun": neptun.threats_live()' in glowny and '"ua_alerts": neptun.alerts_live()' in glowny,
        "build_state używa threats_live/alerts_live")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - zapas REST NEPTUN-a")
