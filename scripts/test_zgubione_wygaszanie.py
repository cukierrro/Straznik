# -*- coding: utf-8 -*-
"""Obiekt zgubiony z feedu NEPTUN-a gaśnie szybciej — na żywo, na serwerze (11.10.2026).

11.10 lubelskie trzymało 1,7 pkt przez ~60 min po zniknięciu dronów z mapy (dron
88,4 km od granicy dał 1,22 pkt). Replay archiwum 13.09–11.10 (pamięć projektu
`zgubione-obiekty-wygaszanie`): pełna waga 15 min od zniknięcia, potem do zera
w 15 min, z wyjątkiem obiektów zgubionych ≤50 km od granicy — te same powiadomienia
i to samo wyprzedzenie RCB co wcześniej. Sprawdzamy:
  - fusion.lost_weight (progi, wyjątek, sygnał po zniknięciu),
  - accumulate z `lost` i bez (bez = jak dotąd, np. rekonstrukcja historii),
  - compute_state używa dostawcy tylko na żywo,
  - kolektor: snapshot bez obiektu i „remove” zapisują zniknięcie z odległością,
    powrót do feedu je kasuje, a fuzja zna dostawcę po imporcie kolektora.

Uruchomienie: py scripts/test_zgubione_wygaszanie.py
"""
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, fusion  # noqa: E402
from app.collectors import neptun  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


REF = datetime(2026, 10, 11, 8, 25, 16, tzinfo=timezone.utc)
M = 60


def ep(dt: datetime) -> float:
    return dt.timestamp()


print("1. lost_weight")
lost_at = ep(REF) - 20 * M
sig_ts = (REF - timedelta(minutes=34)).isoformat()
sprawdz(fusion.lost_weight(None, sig_ts, REF) == 1.0, "nieznany / śledzony — bez zmian")
sprawdz(fusion.lost_weight((ep(REF) - 15 * M, 100.0), sig_ts, REF) == 1.0, "15 min po zniknięciu — pełna waga")
sprawdz(abs(fusion.lost_weight((ep(REF) - 22.5 * M, 100.0), sig_ts, REF) - 0.5) < 1e-9, "22,5 min — połowa")
sprawdz(fusion.lost_weight((ep(REF) - 30 * M, 100.0), sig_ts, REF) == 0.0, "30 min — zero")
sprawdz(fusion.lost_weight((ep(REF) - 45 * M, 50.0), sig_ts, REF) == 1.0,
        "zgubiony 50 km od granicy — wyjątek, bez zmian")
sprawdz(fusion.lost_weight((ep(REF) - 45 * M, None), sig_ts, REF) == 0.0,
        "bez znanej odległości — bez wyjątku")
sprawdz(fusion.lost_weight((ep(REF) - 40 * M, 100.0), (REF - timedelta(minutes=10)).isoformat(), REF) == 1.0,
        "sygnał po zniknięciu — liczymy od sygnału")

print("2. accumulate: poranek 11.10, dron 88,4 km zgubiony o 07:52")
dron = {"id": 2, "ts": "2026-10-11T07:50:54+00:00", "source": "neptun", "event_type": "neptun_threat",
        "voivodeship": "lubelskie", "points": 1.22, "title": "Dron / BpSP kursem na granicę PL, 88.4 km",
        "details": {"type": "uav", "dist_km": 88.4, "track_id": "trk_1"}}
znikniecie = ep(datetime(2026, 10, 11, 7, 52, 16, tzinfo=timezone.utc))


def punkty(ref, lost):
    st = fusion.accumulate([dron], ref, lost)["lubelskie"]
    sig = st["signals"][0]
    return round(st["score"], 2), sig.get("lost_feed", False)


zgub = lambda tid: (znikniecie, 88.4) if tid == "trk_1" else None   # noqa: E731
t0800 = datetime(2026, 10, 11, 8, 0, 16, tzinfo=timezone.utc)
t0815 = datetime(2026, 10, 11, 8, 15, 16, tzinfo=timezone.utc)
sprawdz(punkty(t0800, zgub) == (1.22, False), f"08:00 pełna waga {punkty(t0800, zgub)}")
p15, l15 = punkty(t0815, zgub)
sprawdz(0 < p15 < 1.0 and l15, f"08:15 częściowo, oznaczony lost_feed ({p15}, {l15})")
sprawdz(punkty(REF, zgub)[0] == 0.0, f"08:25 zero ({punkty(REF, zgub)})")
dzis = punkty(REF, None)[0]
sprawdz(dzis > 0.9, f"bez dostawcy (historia, testy) jak dotąd: {dzis}")
blisko = lambda tid: (znikniecie, 12.5)   # noqa: E731
sprawdz(punkty(REF, blisko)[0] == dzis, "zgubiony 12,5 km od granicy — jak dotąd (08.10)")

print("3. compute_state: dostawca tylko na żywo")
src = (ROOT / "backend" / "app" / "fusion.py").read_text(encoding="utf-8")
sprawdz("accumulate(signals, ref, lost_provider if live else None)" in src,
        "na żywo z dostawcą, rekonstrukcja z `ref` bez niego")
sprawdz(fusion.lost_provider is neptun.zgubiony, "kolektor NEPTUN ustawia fusion.lost_provider")
st = fusion.compute_state([dron], REF)["voivodeships"]["lubelskie"]
sprawdz(st["score"] > 0.9, f"compute_state z `ref` (replay) nie gasi szybciej: {st['score']}")

print("4. kolektor: zniknięcie, odległość, powrót")
neptun._evaluate = lambda t: t


async def _nic(*a, **k):
    return None


neptun._maybe_signal = _nic
neptun._turnaway_shadow = lambda t: None
neptun.by_entry_shadow.observe = lambda t: None
neptun.by_entry_shadow.removed = lambda tid: None
fusion.on_state_change = None
neptun.tracks.clear()
neptun._zgubione.clear()
A = {"id": "trk_A", "pl_assessment": {"dist_km": 120.0}}
B = {"id": "trk_B", "pl_assessment": {"dist_km": 88.4}}
C = {"id": "trk_C", "pl_assessment": None}
asyncio.run(neptun._handle_threats([A, B, C], replace=True))
sprawdz(neptun.zgubiony("trk_B") is None, "obecny w feedzie — None")
sprawdz(neptun.zgubiony("trk_X") is None, "nieznany (np. sprzed restartu) — None")
asyncio.run(neptun._handle_threats([A], replace=True))
zb = neptun.zgubiony("trk_B")
sprawdz(zb is not None and zb[1] == 88.4, f"snapshot bez B — zgubiony z odległością {zb}")
zc = neptun.zgubiony("trk_C")
sprawdz(zc is not None and zc[1] is None, f"obiekt bez oceny PL — zgubiony bez odległości {zc}")
asyncio.run(neptun._handle_threats([B], replace=False))
sprawdz(neptun.zgubiony("trk_B") is None, "B wrócił (upsert) — już nie zgubiony")
asyncio.run(neptun._dispatch({"type": "remove", "data": {"id": "trk_A"}}, 0))
za = neptun.zgubiony("trk_A")
sprawdz(za is not None and za[1] == 120.0, f"„remove” — zgubiony {za}")
neptun._zgubione["stary"] = (1.0, 100.0)
neptun._zgub({"id": "trk_D", "pl_assessment": {"dist_km": 70}})
sprawdz("stary" not in neptun._zgubione, "wpisy starsze niż okno fuzji są sprzątane")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - zgubiony obiekt gaśnie po ~30 min, przy granicy jak dotąd")
