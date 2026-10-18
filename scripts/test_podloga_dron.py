# -*- coding: utf-8 -*-
"""Podłoga dla dronów tuż przy granicy (decyzja usera 18.10.2026).

Noc 17/18.10: dron pod Rostaniem (obw. wołyński), 10,2 km od granicy, bez kursu,
2 zgłoszenia — 0,57 pkt; lubelskie 1,6–1,8 pkt, żółty dopiero o 02:03, a ok. 02:00
mieszkańcy Lublina słyszeli przelatujący obiekt. Teraz taki dron sam daje próg
żółtego w województwie przy granicy, ale dodatek z podłogi NIE przechodzi do
sąsiadów (bez tego podkarpackie dostawało żółte 01:33–02:18 od drona 130 km dalej).

Uruchomienie:  py scripts/test_podloga_dron.py
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
from app.collectors import neptun  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


# prawdziwy rekord z 17.10 23:26:54 UTC (trk_00277217), bez kursu
ROSTAN = {"id": "trk_test_rostan", "type": "uav", "lat": 51.59944, "lon": 23.70936,
          "confidenceLevel": "high", "sourceCount": 2, "lifecycle": "created",
          "positionQuality": "confirmed", "uncertaintyKm": 28, "region": "Волинська область"}

print("1. Kto dostaje podłogę")
ok(neptun.border_uav_floor(dict(ROSTAN), 10.2) == 2.0, "dron 10 km, 2 zgłoszenia, pozycja punktowa → 2,0")
ok(neptun.border_uav_floor({**ROSTAN, "sourceCount": 1}, 10.2) == 0.0,
   "jedno zgłoszenie to jeszcze nie potwierdzenie → bez podłogi")
ok(neptun.border_uav_floor(dict(ROSTAN), 30.0) == 2.0, "30 km — jeszcze tak")
ok(neptun.border_uav_floor(dict(ROSTAN), 30.5) == 0.0, "30,5 km — już nie")
ok(neptun.border_uav_floor({**ROSTAN, "type": "shahed"}, 12) == 2.0, "shahed też")
ok(neptun.border_uav_floor({**ROSTAN, "type": "recon"}, 12) == 0.0, "rozpoznanie nie")
ok(neptun.border_uav_floor({**ROSTAN, "positionQuality": "approx"}, 12) == 0.0,
   "pozycja rejonowa nie (to nie jest namiar przy granicy)")

print("\n2. Sygnał z kolektora (prawdziwa ścieżka _evaluate → _maybe_signal)")
wpisy = []


async def _ingest(**k):
    wpisy.append(k)
    return True


neptun.fusion.ingest = _ingest
t = neptun._evaluate(dict(ROSTAN))
asyncio.run(neptun._maybe_signal(t))
glowny = [w for w in wpisy if not w["details"].get("voiv_secondary")]
ok(len(glowny) == 1 and glowny[0]["voivodeship"] == "lubelskie", "przypisany do lubelskiego")
g = glowny[0] if glowny else {"points": 0, "details": {}, "title": ""}
ok(g["points"] == 2.0, f"punkty = próg żółtego ({g['points']})")
ok(abs(g["details"].get("bez_przeniesienia_pkt", 0) - (2.0 - 0.57)) < 0.02,
   f"zapisany dodatek z podłogi ({g['details'].get('bez_przeniesienia_pkt')})")
ok("[blisko granicy]" in g["title"], "tytuł mówi, skąd punkty")
ok(g["details"].get("course") == "unknown", "kurs nadal opisany jako nieznany")
drugorzedne = [w for w in wpisy if w["details"].get("voiv_secondary")]
ok(all(not w["details"].get("border_floor") for w in drugorzedne),
   "inne województwa w zasięgu nie dostają podłogi")

print("\n3. Bez kwalifikacji nic się nie zmienia")
wpisy.clear()
t1 = neptun._evaluate({**ROSTAN, "id": "trk_test_1zgl", "sourceCount": 1, "confidenceLevel": "medium"})
asyncio.run(neptun._maybe_signal(t1))
g1 = [w for w in wpisy if not w["details"].get("voiv_secondary")][0]
ok(g1["points"] < 1.0 and "bez_przeniesienia_pkt" not in g1["details"],
   f"jedno zgłoszenie: zwykła punktacja ({g1['points']})")

print("\n4. Fuzja: lubelskie żółte, sąsiad bez przelewu podłogi")
REF = datetime(2026, 10, 17, 23, 30, tzinfo=timezone.utc)


def sig(points, details):
    return {"id": 1, "ts": "2026-10-17T23:26:54+00:00", "source": "neptun",
            "event_type": "neptun_threat", "voivodeship": "lubelskie", "points": points,
            "title": "Dron", "details": {"track_id": "trk_x", "type": "uav", **details}}


z_podloga = sig(2.0, {"bez_przeniesienia_pkt": 1.43, "border_floor": True})
st = fusion.apply_spillover(fusion.accumulate([z_podloga], REF), REF)
ok(st["lubelskie"]["own_score"] >= config.THRESHOLD_ELEVATED,
   f"lubelskie sięga progu żółtego ({st['lubelskie']['own_score']})")
ok(fusion.alert_level(st["lubelskie"]["own_score"], st["lubelskie"]["score"]) == "elevated",
   "i budzi telefon (alert_level = elevated)")
sasiedzi = {v: s["score"] for v, s in st.items() if v != "lubelskie" and s["score"] > 0}
ok(not sasiedzi, f"podłoga nie przelewa się do sąsiadów ({sasiedzi})")

zwykly = sig(2.0, {})
st2 = fusion.apply_spillover(fusion.accumulate([zwykly], REF), REF)
ok(st2["podkarpackie"]["score"] > 0,
   "kontrola: zwykłe 2,0 pkt bez znacznika przelewa się jak dotąd "
   f"(podkarpackie {st2['podkarpackie']['score']})")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - dron tuż przy granicy sam ostrzega swoje województwo, bez przelewu do sąsiadów")
