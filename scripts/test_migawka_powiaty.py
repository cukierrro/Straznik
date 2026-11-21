# -*- coding: utf-8 -*-
"""Migawka historii niesie powiaty z poziomem (mapa powiatów w historii, 1.8.10, 21.11.2026).

Pole `powiaty` jest ZAWSZE, także puste — klient odróżnia wtedy „żaden powiat nie miał
alarmu” od migawki sprzed tej zmiany (bez pola), dla której karta mówi, że zapisu nie ma.

Uruchomienie:  py scripts/test_migawka_powiaty.py
"""
import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import config, main, powiaty  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. Pole zawsze obecne")
powiaty._publiczne = {}
m = main.dopisz_powiaty({"threats": [], "aircraft": []})
ok(m.get("powiaty") == {}, "spokój — pusty słownik, nie brak pola")

print("\n2. Powiaty z poziomem trafiają do migawki")
powiaty._publiczne = {"0663": {"level": "high", "score": 5.2, "name": "powiat Lublin", "woj": "lubelskie"}}
m = main.dopisz_powiaty({"threats": [], "aircraft": []})
ok(m["powiaty"]["0663"]["level"] == "high", "Lublin czerwony w migawce")
powiaty._publiczne["0610"] = {"level": "elevated", "score": 2.4, "name": "powiat łęczyński", "woj": "lubelskie"}
ok("0610" not in m["powiaty"], "migawka to kopia — późniejsza zmiana stanu jej nie przepisuje")
ok(json.loads(json.dumps(m))["powiaty"]["0663"]["score"] == 5.2, "da się zapisać jako JSON (baza i paczka historii)")

print("\n3. Liczenie powiatów wyłączone")
stare = config.POWIATY_LICZENIE
config.POWIATY_LICZENIE = False
try:
    ok(main.dopisz_powiaty({})["powiaty"] == {}, "STRAZNIK_POWIATY=0 — pusty słownik")
finally:
    config.POWIATY_LICZENIE = stare

print("\n4. Pętla migawek używa tej funkcji dla bazy i archiwum")
zr = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
petla = zr[zr.index("async def snapshot_loop"):zr.index("async def progression_shadow_loop")]
ok("dopisz_powiaty(migawka)" in petla and "db.add_snapshot(migawka)" in petla
   and petla.index("dopisz_powiaty(migawka)") < petla.index("db.add_snapshot(migawka)"),
   "migawka 12 h dostaje powiaty PRZED zapisem")
ok("dopisz_powiaty({\"threats\": threats" in petla, "archiwum 30 dni też")

powiaty._publiczne = {}
if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - migawki historii niosą powiaty z poziomem")
