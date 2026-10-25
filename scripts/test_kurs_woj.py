# -*- coding: utf-8 -*-
"""Mała premia za kurs NA województwo i uczciwy napis przy województwie z najbliższą granicą.

Decyzja usera 25.10.2026 (wariant B15): punkty obiektu dzielimy wg odległości jak dotąd,
a kurs przesuwa do 15% punktów do województwa, w które celuje — bez zmiany sumy, bo dron
może zmienić kurs w każdej chwili. Przeliczenie 11–25.10: wejścia w żółty 137 → 136,
minuty ≥ żółty +0,2%, czerwone bez zmian.

Powód: 25.10 o 17:01 dron pod Tarnopolem z kursem 233° (na południowy zachód) był w lubelskim
opisany „kursem na granicę PL”, bo lubelskie ma tam najbliższą granicę, choć kurs go nie dotyka.

Przypadki są wspólne z test_kurs_woj.cjs (lustro w engine.js) — wynik zapisujemy do porównania.
Uruchomienie: py scripts/test_kurs_woj.py
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app import config, fusion  # noqa: E402
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


PRZYPADKI = json.loads((ROOT / "scripts" / "kurs_woj_przypadki.json").read_text(encoding="utf-8"))["przypadki"]


def sygnalizuj(track):
    ingested.clear()
    t = dict(track)
    neptun._evaluate(t)
    asyncio.run(neptun._maybe_signal(t))
    return t, {k["voivodeship"]: k for k in ingested if k.get("event_type") == "neptun_threat"}


wyniki = {}
for p in PRZYPADKI:
    t, w = sygnalizuj(p["track"])
    wyniki[p["nazwa"]] = {v: {"points": k["points"], "obok": bool(k["details"].get("kurs_obok_woj")),
                              "waga": k["details"].get("waga_kursu_woj")} for v, k in w.items()}

print("1. Dron pod Tarnopolem, kurs 233° (25.10 17:01)")
w = wyniki["tarnopol_233"]
sprawdz(w.get("lubelskie", {}).get("obok") is True, "lubelskie: kurs obok — napis „w odległości”")
_, sw = sygnalizuj(PRZYPADKI[0]["track"])
sprawdz("kursem na granicę" not in sw["lubelskie"]["title"] and "w odległości" in sw["lubelskie"]["title"],
        f"tytuł: {sw['lubelskie']['title'][:80]}")
sprawdz(sw["lubelskie"]["details"].get("voiv_secondary") is True,
        "znacznik voiv_secondary — starsze aplikacje pokażą „X km od woj.”, a nie „od granicy”")
sprawdz(w["podkarpackie"]["waga"] > 1.0 > w["lubelskie"]["waga"],
        f"podkarpackie (kurs bliżej) zyskuje, lubelskie oddaje: {w['podkarpackie']['waga']} / {w['lubelskie']['waga']}")

print("2. Suma punktów obiektu bez zmian (ważona punktami)")
for p in PRZYPADKI:
    t = dict(p["track"])
    neptun._evaluate(t)
    a = t["pl_assessment"]
    wagi = neptun.wagi_kursu_woj(t, a) if a and a.get("toward_pl") else {}
    if not wagi:
        continue
    baza = {}
    for v in wagi:
        d = a["dist_km"] if v == a["border_voiv"] else neptun.geo.dist_to_voiv_km(t["lat"], t["lon"], v)
        baza[v] = neptun.score_threat(t, d, a.get("course_factor", 1.0))
    przed, po = sum(baza.values()), sum(baza[v] * wagi[v] for v in wagi)
    # mnożniki zaokrąglone do 4 miejsc — dopuszczamy błąd zaokrąglenia, nie rzeczywisty przyrost
    sprawdz(abs(po - przed) <= 1e-3 * max(przed, 1), f"{p['nazwa']}: {przed:.3f} → {po:.3f}")
    sprawdz(max(wagi.values()) <= 1 + config.NEPTUN_KURS_WOJ_K + 1e-9 and min(wagi.values()) >= 1 - config.NEPTUN_KURS_WOJ_K - 1e-9,
            f"{p['nazwa']}: mnożniki w granicach ±{config.NEPTUN_KURS_WOJ_K:.0%}")

print("3. Bez kursu — nic się nie zmienia")
w = wyniki["bez_kursu"]
sprawdz(all(x["waga"] in (None, 1.0) for x in w.values()) and not any(x["obok"] for x in w.values()),
        "mnożnik 1, napis jak dotąd")

print("4. Kurs prosto na województwo z najbliższą granicą — napis bez zmian")
w = wyniki["lwow_300_na_lubelskie"]
sprawdz(w["lubelskie"]["obok"] is False, "lubelskie: „kursem na granicę PL”")
sprawdz(w["lubelskie"]["waga"] >= 1.0, f"lubelskie nie traci: {w['lubelskie']['waga']}")

print("5. Kurs domniemany — połowa premii")
t = dict(PRZYPADKI[1]["track"])
neptun._evaluate(t)
wagi = neptun.wagi_kursu_woj(t, t["pl_assessment"])
sprawdz(all(abs(x - 1) <= config.NEPTUN_KURS_WOJ_K / 2 + 1e-9 for x in wagi.values()), f"mnożniki ≤ ±7,5%: {wagi}")

print("6. Wzorzec wspólny z engine.js (kurs_woj_przypadki.json → oczekiwane)")
wzorzec = json.loads((ROOT / "scripts" / "kurs_woj_przypadki.json").read_text(encoding="utf-8"))["oczekiwane"]
for nazwa, oczek in wzorzec.items():
    teraz = {v: {"points": x["points"], "obok": x["obok"]} for v, x in wyniki[nazwa].items()}
    sprawdz(teraz == oczek, f"{nazwa}: {teraz}")
print()
print(f"BŁĘDY: {len(bledy)}" if bledy else "Wszystko OK")
sys.exit(1 if bledy else 0)
