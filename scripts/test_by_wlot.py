# -*- coding: utf-8 -*-
"""Wlot na Białoruś w trybie cienia (16.09.2026) — backend/app/by_entry_shadow.py.

1. Pozycja NEPTUN-a wewnątrz obrysu Białorusi → jeden zapis „inside” na track,
   z odległością do Polski i szacowanym czasem dolotu.
2. Track, który znika tuż przy granicy (po stronie UA) z kursem na Białoruś →
   „vanished”; znikający daleko od granicy albo z kursem od Białorusi → nic.
3. NEPTUN (collectors/neptun.py) woła observe przy każdej aktualizacji i removed
   przy komunikacie remove oraz przy braku tracka w pełnym snapshocie.
4. Żadnych punktów: moduł nie woła fusion.ingest.

Uruchomienie: py scripts/test_by_wlot.py
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import by_entry_shadow as bes, fusion, stealth  # noqa: E402
from app.collectors import neptun  # noqa: E402

zapisy = []
stealth.record = lambda kind, key, data, ts=None: (zapisy.append((kind, key, data)) or True)
ingested = []


async def fake_ingest(**kw):
    ingested.append(kw)
    return True

fusion.ingest = fake_ingest
fusion.on_state_change = None
bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


sprawdz(bes.BY_RINGS and bes.in_belarus(52.44, 31.0) and not bes.in_belarus(50.45, 30.52)
        and not bes.in_belarus(52.23, 21.01), "obrys Białorusi: Homel tak, Kijów i Warszawa nie")

T0 = 1_800_000_000
# 1) dron z obwodu czernihowskiego wlatuje nad Białoruś (kurs z ruchu na północ)
bes.observe({"id": "trk_a", "type": "uav", "lat": 51.62, "lon": 30.62, "heading_movement": 350}, T0)
bes.observe({"id": "trk_a", "type": "uav", "lat": 51.95, "lon": 30.55, "heading_movement": 350}, T0 + 400)
bes.observe({"id": "trk_a", "type": "uav", "lat": 52.10, "lon": 30.50, "heading_movement": 350}, T0 + 800)
wew = [d for k, key, d in zapisy if d["phase"] == "inside"]
sprawdz(len(wew) == 1 and wew[0]["id"] == "trk_a", f"jeden zapis „inside” na track ({len(wew)})")
if wew:
    d = wew[0]
    sprawdz(d["heading_source"] == "measured" and d["came_from"]["lat"] == 51.62,
            f"kurs z ruchu i skąd przyleciał ({d['heading_source']}, {d['came_from']})")
    sprawdz(300 < d["dist_pl_km"] < 600 and d["eta_pl_min"] == round(d["dist_pl_km"] / 180 * 60),
            f"odległość do PL {d['dist_pl_km']} km, ETA {d['eta_pl_min']} min przy 180 km/h")
    sprawdz(d["toward_pl"] is False, "kurs na północ nie prowadzi na Polskę")

# 2) znika tuż przy granicy z kursem na Białoruś
zapisy.clear()
near = None
for lat in (51.40, 51.45, 51.50, 51.55):
    if not bes.in_belarus(lat, 30.62):
        n = bes.nearest_by_point(lat, 30.62)
        if n and n[0] < 20:
            near = lat
            break
sprawdz(near is not None, f"punkt testowy po stronie UA < 20 km od granicy ({near})")
bes.observe({"id": "trk_b", "type": "uav", "lat": near, "lon": 30.62, "heading": 320,
             "presumptiveCourse": True}, T0)
bes.removed("trk_b", T0 + 300)
zn = [d for k, key, d in zapisy if d["phase"] == "vanished"]
sprawdz(len(zn) == 1 and zn[0]["heading_source"] == "presumptive" and zn[0]["dist_by_km"] < 20,
        f"„vanished” przy granicy, kurs domniemany oznaczony ({zn[:1]})")

zapisy.clear()
bes.observe({"id": "trk_c", "type": "uav", "lat": near, "lon": 30.62, "heading_movement": 160}, T0)
bes.removed("trk_c", T0 + 300)
bes.observe({"id": "trk_d", "type": "uav", "lat": 50.45, "lon": 30.52, "heading_movement": 0}, T0)
bes.removed("trk_d", T0 + 300)
bes.removed("trk_nieznany", T0 + 300)
sprawdz(not zapisy, f"kurs od Białorusi, daleko od granicy i nieznany track — bez zapisu ({len(zapisy)})")

# 3) podpięcie w NEPTUN-ie: snapshot bez tracka = zniknięcie
zapisy.clear()
bes._last.clear()
bes._inside.clear()


async def neptun_flow():
    tr = {"id": "trk_e", "type": "uav", "lat": near, "lon": 30.62, "heading": 320,
          "confidenceLevel": "medium", "sourceCount": 1}
    await neptun._handle_threats([tr], replace=True)
    await neptun._handle_threats([], replace=True)
    await neptun._handle_threats([{"id": "trk_f", "type": "uav", "lat": 52.2, "lon": 29.9,
                                   "heading": 300, "confidenceLevel": "medium", "sourceCount": 1}],
                                 replace=False)
    await neptun._dispatch({"type": "remove", "data": {"id": "trk_f"}}, T0)

asyncio.run(neptun_flow())
fazy = sorted(d["phase"] + ":" + d["id"] for k, key, d in zapisy if k == "by_entry")
sprawdz(fazy == ["inside:trk_f", "vanished:trk_e"], f"NEPTUN woła observe i removed ({fazy})")
sprawdz(not any("by_entry" in str(kw) for kw in ingested), "wlot na Białoruś nie daje punktów")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - wlot na Białoruś zapisywany w trybie cienia, bez punktów")
