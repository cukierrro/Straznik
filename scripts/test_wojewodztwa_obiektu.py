# -*- coding: utf-8 -*-
"""Obiekt punktuje KAŻDE województwo w zasięgu, nie tylko najbliższe.

Zgłoszenie Małgorzaty Urbańskiej z 08.10.2026: podkarpackie nie dostawało
punktów za drony lecące w jego stronę. Sprawdzone i potwierdzone — województwo
brało się z NAJBLIŻSZEGO punktu konturu Polski, a kurs nie miał na nie wpływu.
Dron nad Lwowem lecący prosto na Przemyśl punktował lubelskie, bo granica
wybrzusza się na wschód pod Hrebennem (Lwów: 57 km do lubelskiego, 79 km do
podkarpackiego). Od 12.09 do 08.10: lubelskie 574 sygnały o dronach,
podkarpackie 18.

Uruchomienie: py scripts/test_wojewodztwa_obiektu.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, fusion, geo  # noqa: E402
from app.collectors import neptun  # noqa: E402

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


def sygnalizuj(track):
    """Przepuszcza obiekt przez tę samą drogę co na żywo."""
    ingested.clear()
    t = dict(track)
    t["pl_assessment"] = geo.assess_threat_outline_extent(
        t["lat"], t["lon"], t.get("heading"),
        config.NEPTUN_HEADING_TOLERANCE, config.NEPTUN_HEADING_SOFT_DEG)
    asyncio.run(neptun._maybe_signal(t))
    return {k["voivodeship"]: k for k in ingested
            if k.get("event_type") == "neptun_threat"}


# Dron nad Lwowem, kurs 270° — prosto na Przemyśl, czyli na PODKARPACKIE.
LWOW = {"id": "test-lwow", "type": "uav", "lat": 49.84, "lon": 24.03, "heading": 270,
        "confidenceLevel": "high", "sourceCount": 3, "lifecycle": "confirmed", "count": 1}

print("1. Dron nad Lwowem punktuje OBA przygraniczne województwa")
w = sygnalizuj(LWOW)
sprawdz("lubelskie" in w, "lubelskie dostaje punkty (najbliższy punkt granicy)")
sprawdz("podkarpackie" in w,
        "podkarpackie TEŻ dostaje punkty — to była zgłoszona dziura")
if "podkarpackie" in w:
    sprawdz(w["podkarpackie"]["points"] > 0, "punkty podkarpackiego są dodatnie")

print("2. Odległość liczona do TEGO województwa, nie do granicy państwa")
if "podkarpackie" in w and "lubelskie" in w:
    dl = w["lubelskie"]["details"]["dist_km"]
    dp = w["podkarpackie"]["details"]["dist_km"]
    sprawdz(abs(dp - geo.dist_to_voiv_km(49.84, 24.03, "podkarpackie")) < 0.5,
            f"odległość podkarpackiego ({dp} km) zgadza się z geometrią województwa")
    # Lwów leży PRAWIE RÓWNO od obu (57,2 i 57,3 km) — i właśnie dlatego dawne
    # zachowanie było nie do obrony: całość szła do lubelskiego, podkarpackie
    # miało zero przy tej samej odległości.
    sprawdz(abs(dl - dp) < 5,
            f"Lwów jest niemal równo oddalony od obu ({dl} / {dp} km)")

print("3. PUŁAPKA: czas dolotu też przeliczony na województwo")
# Klucz czerwonego czyta `eta_border_min`. Gdyby zostawić w nim czas do granicy
# PAŃSTWA, każde województwo dziedziczyłoby cudzą bliskość i dostawało klucz za
# obiekt lecący nie na nie. W przeliczeniu historii dawało to CZTERY czerwone
# naraz zamiast jednego (28.09.2026) — zanim błąd został złapany.
# Potrzebny punkt z WYRAŹNĄ różnicą odległości: Łuck na Wołyniu jest blisko
# lubelskiego i daleko od podkarpackiego.
LUCK = {**LWOW, "id": "test-luck", "lat": 50.75, "lon": 25.34}
wl = sygnalizuj(LUCK)
sprawdz("lubelskie" in wl and "podkarpackie" in wl,
        "Łuck punktuje oba województwa")
if "lubelskie" in wl and "podkarpackie" in wl:
    dl2 = wl["lubelskie"]["details"]["dist_km"]
    dp2 = wl["podkarpackie"]["details"]["dist_km"]
    el = wl["lubelskie"]["details"]["eta_border_min"]
    ep = wl["podkarpackie"]["details"]["eta_border_min"]
    sprawdz(dp2 > dl2 + 50, f"podkarpackie wyraźnie dalej: {dl2} km vs {dp2} km")
    sprawdz(el is not None and ep is not None, "oba mają czas dolotu")
    sprawdz(ep > el,
            f"dalsze województwo ma DŁUŻSZY czas dolotu ({el} min vs {ep} min)")
    sprawdz(wl["lubelskie"]["points"] > wl["podkarpackie"]["points"],
            "bliższe województwo dostaje WIĘCEJ punktów")

print("4. Dalekie województwa nie dostają nic")
sprawdz("zachodniopomorskie" not in w, "zachodniopomorskie bez punktów (>250 km)")
sprawdz("dolnośląskie" not in w, "dolnośląskie bez punktów (>250 km)")
sprawdz("pomorskie" not in w, "pomorskie bez punktów (>250 km)")

print("5. Przypisanie pierwotne jest oznaczone inaczej niż dodatkowe")
if "lubelskie" in w and "podkarpackie" in w:
    sprawdz(not w["lubelskie"]["details"].get("voiv_secondary"),
            "najbliższe województwo NIE jest oznaczone jako dodatkowe")
    sprawdz(w["podkarpackie"]["details"].get("voiv_secondary") is True,
            "dalsze województwo oznaczone `voiv_secondary` (do odróżnienia w audycie)")
    sprawdz(w["lubelskie"]["dedup_key"] != w["podkarpackie"]["dedup_key"],
            "klucze deduplikacji są różne — inaczej drugi wpis by przepadł")

print("6. Obiekt daleko od Polski nadal nie punktuje nikogo")
DALEKO = {**LWOW, "id": "test-daleko", "lat": 50.45, "lon": 30.52}   # Kijów
w2 = sygnalizuj(DALEKO)
sprawdz(not w2, f"Kijów (~690 km) nie punktuje żadnego województwa (dostał {len(w2)})")

print()
print("BŁĘDY: " + str(len(bledy)))
sys.exit(1 if bledy else 0)
