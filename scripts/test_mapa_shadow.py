# -*- coding: utf-8 -*-
"""mapa.ua w trybie cienia: co zapisujemy z ich zrzutu i jak liczymy pokrycie z NEPTUN-em.

Dane w teście odwzorowują prawdziwy zrzut z 18.09.2026, 20:16: obiekt świeży nad
Ukrainą, obiekt „aktywny" sprzed 77 minut zgeokodowany na Lwów (u nich to wciąż
cel przy granicy PL) oraz track NEPTUN-a, który powinien się z tym pierwszym
skleić. Sprawdzamy, że okno świeżości odcina duchy, że liczba wspólnych obiektów
liczy się po odległości i że nic z tego nie rusza punktacji.

Uruchomienie: py scripts/test_mapa_shadow.py
"""
import asyncio
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, stealth  # noqa: E402
from app.collectors import mapa_ua_shadow, neptun  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


TERAZ = time.time()


def obiekt(oid, lat, lon, wiek_min, status="active", **kw):
    ts = int(TERAZ - wiek_min * 60)
    o = {"id": oid, "kind": "drone_jet", "subkind": "drone_jet", "status": status,
         "lat": lat, "lon": lon, "heading": 300, "speed_kmh": 450, "amount": 1,
         "from_zone": "bryansk", "to_city": "kyiv", "title": "Реактивний БпЛА",
         "first_seen": ts, "last_seen": ts, "trail": [[lon, lat, ts]] * 28}
    o.update(kw)
    return o


ZRZUT = {
    "attack": {"id": 643, "status": "active", "total_objects": 342},
    "objects": [
        obiekt("swiezy", 50.45, 30.52, 3),                       # Kijów, meldunek 3 min temu
        obiekt("stary", 49.84, 24.03, 77, title="Реактивні БпЛА на Львове"),   # duch nad Lwowem
        obiekt("bezpozycji", None, None, 2),
        obiekt("zgubiony", 48.5, 35.0, 200, status="lost"),
    ],
}


class Odpowiedz:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


class Klient:
    def __init__(self, data):
        self._data = data
        self.wywolania = 0

    async def get(self, url, headers=None):
        self.wywolania += 1
        self.url = url
        self.headers = headers
        return Odpowiedz(self._data)


# Baza obserwacji w katalogu tymczasowym — test nie dotyka dziennika z produkcji.
stealth.DB_PATH = ROOT / "scripts" / "_test_obserwacje.db"
stealth.DB_PATH.unlink(missing_ok=True)
stealth._conn = None

neptun.tracks.clear()
neptun.tracks["trk_1"] = {"id": "trk_1", "type": "uav", "lat": 50.40, "lon": 30.60,
                          "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(TERAZ - 240))}
neptun.tracks["trk_daleko"] = {"id": "trk_daleko", "type": "kab", "lat": 49.99, "lon": 36.76,
                               "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(TERAZ - 300))}

klient = Klient(ZRZUT)
tick = asyncio.run(mapa_ua_shadow.once(klient))

print("1. Co bierzemy ze zrzutu")
sprawdz(tick["mapa_total"] == 4, "liczymy wszystkie obiekty zrzutu")
sprawdz(tick["mapa_fresh"] == 1, "świeży jest tylko meldunek z ostatnich 15 minut")
sprawdz(tick["mapa_active"] == 3, "ich „aktywne” to co innego niż świeże")
sprawdz(klient.url == config.MAPA_SHADOW_URL, "pytamy ich publiczne API")
sprawdz("Straznik" in (klient.headers or {}).get("User-Agent", ""), "przedstawiamy się w User-Agent")

print("2. Zestawienie z NEPTUN-em")
sprawdz(tick["wspolne"] == 1, "świeży obiekt skleja się z trackiem NEPTUN-a (≤25 km)")
sprawdz(tick["tylko_mapa"] == 0, "nic świeżego nie zostaje bez pary")
sprawdz(tick["tylko_neptun"] == 1, "track spod Charkowa nie ma odpowiednika u nich")
sprawdz(tick["neptun_total"] == 2, "liczymy tracki NEPTUN-a z pozycją")

print("3. Zapis do dziennika obserwacji")
rap = stealth.query("mapa_report", 10)
sprawdz(len(rap) == 1, "zapisany jeden meldunek — duchy i obiekty bez pozycji odpadają")
if rap:
    r = rap[0]
    sprawdz(r["nep_km"] is not None and r["nep_km"] < 25, "meldunek niesie odległość do NEPTUN-a")
    sprawdz(isinstance(r["dist_pl_km"], int) and r["dist_pl_km"] > 400,
            "meldunek niesie odległość od granicy PL")
    sprawdz(r["reports"] == 1, "obiekt widziany raz jest tak oznaczony")
ponownie = asyncio.run(mapa_ua_shadow.once(klient))
sprawdz(len(stealth.query("mapa_report", 10)) == 1, "ten sam meldunek nie dubluje się przy kolejnym zrzucie")
sprawdz(ponownie["nowych_meldunkow"] == 0, "drugi zrzut nie dopisuje nic nowego")
sprawdz(len(stealth.query("mapa_tick", 10)) >= 1, "podsumowanie zrzutu trafia do dziennika")

print("4. Tryb cienia to tylko pomiar")
zrodlo = (ROOT / "backend/app/collectors/mapa_ua_shadow.py").read_text(encoding="utf-8")
sprawdz("fusion" not in zrodlo and "notify" not in zrodlo,
        "kolektor nie dotyka punktacji ani powiadomień")
sprawdz("mapa_ua_shadow" not in (ROOT / "backend/app/fusion.py").read_text(encoding="utf-8"),
        "punktacja nie wie o mapa.ua")
sprawdz(config.MAPA_SHADOW_UNTIL.startswith("2026-09-22"),
        "okno pomiaru kończy się po poniedziałku")
mapa_ua_shadow.status["until"] = "2000-01-01T00:00:00+02:00"
config.MAPA_SHADOW_UNTIL = "2000-01-01T00:00:00+02:00"
sprawdz(mapa_ua_shadow._until_ts() < time.time(), "po terminie kolektor wie, że ma przestać")

if stealth._conn is not None:
    stealth._conn.close()
    stealth._conn = None
for sufiks in ("", "-wal", "-shm"):
    Path(str(stealth.DB_PATH) + sufiks).unlink(missing_ok=True)

print()
if bledy:
    print("BŁĘDY:", len(bledy))
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("OK: zrzut mapa.ua zapisany bez wpływu na punktację, pokrycie z NEPTUN-em policzone.")
