# -*- coding: utf-8 -*-
"""Strefy PAŻP w migawkach historii (10.10.2026) — od kolektora do paczki.

Do 07.10 suwak rysował nad przeszłością BIEŻĄCE strefy, potem je ukrywał. Teraz
migawka niesie klucze aktywnych stref, a definicje (kształt, typ, pułapy) leżą
raz w tabeli zone_defs i trafiają do paczki historii. Test przechodzi całą drogę
na prawdziwej bazie w katalogu tymczasowym:

  * przed pierwszym odczytem PAŻP migawka mówi „nie wiemy” (None), nie „zero stref”,
  * klucz jest stały dla tej samej rezerwacji i inny dla nowej (rotacja o 06:00),
  * definicja nie niesie pól zależnych od chwili (since/atBoot/standing),
  * każdy klucz z migawki w paczce ma definicję w `zone_defs`,
  * definicje żyją dłużej niż 12 h historii (archiwum migawek ma 30 dni),
    ale stare są sprzątane.

Uruchomienie:  py scripts/test_strefy_migawki.py
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
from app import config, db                                          # noqa: E402

_tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
config.DB_PATH = Path(_tmp.name) / "straznik.db"
db.init()
from app import public_cache                                        # noqa: E402
from app.collectors import pansa                                    # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


KWADRAT = {"type": "Polygon", "coordinates": [[[22, 50], [23, 50], [23, 51], [22, 50]]]}
REZ = {"lowerAltitude": "GND", "upperAltitude": "F095",
       "startDate": "2026-10-08T06:00:00Z", "endDate": "2026-10-09T06:00:00Z"}


def strefa(designator, res=REZ, since=1_791_400_000, at_boot=False):
    key = pansa._zone_key(designator, "ADHOC", res, "ćwiczenia", KWADRAT)
    return {"feature": {"type": "Feature", "geometry": KWADRAT, "properties": {
        "key": key, "designator": designator, "type": "ADHOC", "voiv": "lubelskie",
        "lower": res["lowerAltitude"], "upper": res["upperAltitude"], "remarks": "ćwiczenia",
        "start": res["startDate"], "end": res["endDate"],
        "since": since, "atBoot": at_boot, "standing": False}}}


print("1. Przed pierwszym odczytem PAŻP: „nie wiemy”, nie „zero stref”")
pansa.status.pop("zones_shown", None)
pansa._zones_shown.clear()
lista, defs = pansa.zones_snapshot()
sprawdz(lista is None and defs == {}, "zones_snapshot() = (None, {}) przed pierwszym odczytem")

print("2. Klucz rezerwacji")
k1 = pansa._zone_key("EPR1", "ADHOC", REZ, "ćwiczenia", KWADRAT)
sprawdz(k1 == pansa._zone_key("EPR1", "ADHOC", dict(REZ), " ćwiczenia ", KWADRAT),
        "ta sama rezerwacja = ten sam klucz (także z białymi znakami w uwagach)")
jutro = {**REZ, "startDate": "2026-10-09T06:00:00Z", "endDate": "2026-10-10T06:00:00Z"}
sprawdz(k1 != pansa._zone_key("EPR1", "ADHOC", jutro, "ćwiczenia", KWADRAT),
        "rezerwacja na kolejną dobę = nowy klucz (rotacja o 06:00)")
sprawdz(k1 != pansa._zone_key("EPR1", "ADHOC", {**REZ, "upperAltitude": "F200"}, "ćwiczenia", KWADRAT),
        "inny pułap = nowy klucz")

print("3. Migawka i definicje")
pansa.status["zones_shown"] = 2
pansa._zones_shown.clear()
pansa._zones_shown.update({"EPR1": strefa("EPR1"), "EPR2": strefa("EPR2", jutro, at_boot=True)})
lista, defs = pansa.zones_snapshot()
sprawdz(len(lista) == 2 and all(len(x) == 3 for x in lista), "migawka: dwie pozycje [klucz, since, atBoot]")
sprawdz(any(x[2] is True for x in lista), "atBoot przechodzi do migawki")
sprawdz(all(not ({"since", "atBoot", "standing"} & set(d["properties"])) for d in defs.values()),
        "definicja bez pól zależnych od chwili")
sprawdz(all(d["geometry"] == KWADRAT for d in defs.values()), "definicja ma geometrię")

print("4. Od bazy do paczki historii")
db.save_zone_defs(defs)
db.add_snapshot({"threats": [], "aircraft": [], "zones": lista})
paczka = json.loads(public_cache.build_bundle_bytes(12))
migawki = paczka.get("snaps") or []
sprawdz(len(migawki) == 1 and migawki[0].get("zones") == lista, "migawka w paczce niesie klucze stref")
klucze = {z[0] for m in migawki for z in m.get("zones", [])}
sprawdz(klucze and klucze <= set(paczka.get("zone_defs", {})), "każdy klucz z migawki ma definicję w paczce")
sprawdz(paczka["zone_defs"][lista[0][0]]["properties"]["designator"] in ("EPR1", "EPR2"),
        "definicja z paczki ma oznaczenie strefy")

print("5. Retencja definicji")
sprawdz(db.ZONE_DEFS_KEEP_DAYS >= 30, "definicje żyją co najmniej tyle, co archiwum migawek (30 dni)")
with db._lock:
    db._conn.execute("UPDATE zone_defs SET last_seen='2000-01-01T00:00:00+00:00' WHERE key=?", (k1,))
    db._conn.commit()
db.save_zone_defs({"nowa": {"type": "Feature", "geometry": KWADRAT, "properties": {"key": "nowa"}}})
with db._lock:
    zostaly = {r[0] for r in db._conn.execute("SELECT key FROM zone_defs").fetchall()}
sprawdz(k1 not in zostaly and "nowa" in zostaly, "stara definicja sprzątnięta, nowa zapisana")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - strefy w migawkach, definicje w paczce historii")
