"""ADS-B mieści się w limicie adsb.lol (26.10.2026).

adsb.lol podaje w nagłówku `x-ratelimit-limit: 4, 4;w=1, 60;w=60, 500;w=86400` — najwyżej
500 zapytań na adres i dobę. Serwer pytał co minutę o /v2/mil i o dwa koła bałtyckie, czyli
~4300 razy na dobę; od co najmniej 20.10 około 1100 z 1440 cykli kończyło się 429, a warstwę
po cichu łatał zapas adsb.fi. Po usunięciu zapasu (warunki adsb.fi) warstwa samolotów
i dioda ADS-B w okienku źródeł gasły przez większość doby.

Decyzja usera z 26.10: pytać dokładnie tyle, ile pozwala limit, równo rozłożone — jedno
zapytanie co ADSB_INTERVAL sekund, w stałej kolejności ADSB_PLAN (lista, lista, koło).

Czego pilnujemy (offline, bez sieci):
  * dobowa liczba zapytań serwera to limit (od 495 do 500) i każdy krok to jedno zapytanie,
  * telefon w trybie awaryjnym też (każdy telefon ma własny adres),
  * 429 nie gasi `ok` od razu i wstrzymuje pytanie do czasu podanego przez adsb.lol,
  * w czasie przerwy nie idzie ŻADNE zapytanie,
  * koło bałtyckie ma swój krok, a pomiędzy pokazujemy jego ostatni wynik, ale nie
    dłużej niż przez jeden obieg planu.

Uruchomienie: py -3 scripts/test_adsb_limit.py
"""
from pathlib import Path
import asyncio
import re
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
import tempfile  # noqa: E402
from app import config, db  # noqa: E402
from app.collectors import adsb  # noqa: E402

_tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)        # próbki ADS-B lądują w bazie testowej, nie w prawdziwej
config.DATA_DIR = Path(_tmp.name)
config.DB_PATH = Path(_tmp.name) / "test.db"
db.init()

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


class Odp:
    def __init__(self, kod, dane=None, naglowki=None):
        self.status_code, self._dane, self.headers = kod, dane or {"ac": []}, naglowki or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._dane


class Klient:
    def __init__(self, odp):
        self.odp, self.adresy = odp, []

    async def get(self, url, headers=None):
        self.adresy.append(url)
        return self.odp(url)


def zeruj():
    adsb._przerwa_do = 0.0
    adsb._cykl = 0
    adsb._geo_cache.clear()
    adsb._awaria_do = 0.0


print("1. Dobowy budżet zapytań")
doba = 86400
serwer = doba / config.ADSB_INTERVAL
sprawdz(495 <= serwer <= config.ADSB_LIMIT_DOBA,
        f"serwer: {serwer:.1f} zapytań na dobę, co {config.ADSB_INTERVAL} s — równe limitowi {config.ADSB_LIMIT_DOBA}")
kola_w_planie = sorted(k for k in config.ADSB_PLAN if k.startswith("kolo"))
sprawdz(kola_w_planie == [f"kolo{i}" for i in range(len(adsb.BALTIC_GEO_POINTS))],
        f"plan obejmuje każde koło raz: {config.ADSB_PLAN}")
sprawdz(all(r <= 250 for _, _, r in adsb.BALTIC_GEO_POINTS), "promień koła w granicy API (≤ 250 NM)")
engine = (ROOT / "frontend" / "engine.js").read_text(encoding="utf-8")
m = re.search(r"every\(tickAdsb,\s*(\d+)\)", engine)
telefon = doba * 1000 / int(m.group(1)) if m else 1e9
sprawdz(495 <= telefon <= config.ADSB_LIMIT_DOBA, f"telefon w trybie awaryjnym: {telefon:.1f} zapytań na dobę")
z_kluczem = doba / config.ADSB_INTERVAL_KLUCZ
sprawdz(z_kluczem <= config.ADSB_LIMIT_DOBA_KLUCZ and z_kluczem * 31 <= 30000,
        f"z kluczem (27.10): {z_kluczem:.0f}/dobę, {z_kluczem * 31:.0f} w 31 dniach — w limicie ≥ 24 tys./mies. przy każdym zaokrągleniu")

print("\n2. 429 to przerwa, nie awaria")
zeruj()
adsb.status.update(ok=True, last=time.time() - 30, error=None)
k = Klient(lambda url: Odp(429, naglowki={"retry-after": "900"}))
wynik = asyncio.run(adsb._fetch_mil(k))
sprawdz(wynik is None and len(k.adresy) == 1, "jedno zapytanie, brak listy")
sprawdz(adsb.status["ok"] is True, "`ok` zostaje — o diodzie decyduje świeżość ostatniego sukcesu")
sprawdz("limit" in (adsb.status["error"] or ""), f"status mówi o limicie: {adsb.status['error']}")
sprawdz(850 <= adsb._przerwa_s() <= 900, f"przerwa wg Retry-After: {adsb._przerwa_s():.0f} s")
k2 = Klient(lambda url: Odp(200))
asyncio.run(adsb._tick(k2))
sprawdz(k2.adresy == [], "w czasie przerwy nie idzie żadne zapytanie")
from app import monitoring  # noqa: E402
sprawdz(monitoring.fresh(adsb.status, config.ADSB_INTERVAL, 300),
        "dioda świeci, dopóki ostatni sukces jest świeży")
sprawdz(not monitoring.fresh({**adsb.status, "last": time.time() - 4 * config.ADSB_INTERVAL},
                             config.ADSB_INTERVAL, 300),
        "dioda gaśnie, gdy sukcesu nie ma dłużej niż trzy cykle")

print("\n3. Jeden krok planu = jedno zapytanie; koło ma własny krok")
zeruj()
F16 = {"hex": "4b8452", "flight": "TUAF123", "t": "F16", "lat": 55.9, "lon": 23.1, "alt_baro": 31000}


def odp_ok(url):
    return Odp(200, {"ac": [F16]} if "/point/" in url else {"ac": []})


kroki = []
for _ in range(len(config.ADSB_PLAN) * 2):
    k = Klient(odp_ok)
    asyncio.run(adsb._tick(k))
    kroki.append(("kolo" if "/point/" in k.adresy[0] else "mil") if len(k.adresy) == 1 else f"{len(k.adresy)} zapytań")
oczekiwane = ["kolo" if x.startswith("kolo") else "mil" for x in config.ADSB_PLAN] * 2
sprawdz(kroki == oczekiwane, f"kolejne kroki: {kroki}")
sprawdz(any(a.get("hex") == "4b8452" for a in adsb.current_aircraft),
        "F-16 z koła widać w kroku listy, choć koło pytano wcześniej")
for c in adsb._geo_cache.values():
    c["t"] = time.time() - adsb._geo_max_wiek_s() - 1
adsb._cykl = 0
asyncio.run(adsb._tick(Klient(odp_ok)))
sprawdz(not any(a.get("hex") == "4b8452" for a in adsb.current_aircraft),
        "wynik koła starszy niż obieg planu znika z mapy")

print("\n5. Awaria adsb.lol inna niż limit → zapas, potem nowa próba (27.10.2026: każde /v2 → 400)")
zeruj()
adsb.status.update(ok=True, last=time.time() - 30, error=None)
wynik = asyncio.run(adsb._fetch_mil(Klient(lambda url: Odp(400))))
teraz = time.time()
sprawdz(wynik is None and adsb._przerwa_s() == 0, "400 nie jest limitem — bez przerwy z 429")
sprawdz(not adsb._lol_dostepny(teraz), "po 400 pętla bierze zapas zamiast adsb.lol")
sprawdz(adsb._lol_dostepny(teraz + config.ADSB_AWARIA_S + 1), f"po {config.ADSB_AWARIA_S} s znów próba adsb.lol")
zeruj()

print("\n6. Klucz adsb.lol w nagłówku x-api-key, gdy jest w .env")
class KlientN(Klient):
    async def get(self, url, headers=None):
        self.naglowki = headers or {}
        return await super().get(url, headers)
k = KlientN(lambda url: Odp(200))
przed = config.ADSBLOL_API_KEY
config.ADSBLOL_API_KEY = "sk-lol-test"
asyncio.run(adsb._get(k, "https://api.adsb.lol/v2/mil"))
sprawdz(k.naglowki.get("x-api-key") == "sk-lol-test", "z kluczem: nagłówek x-api-key wysłany")
config.ADSBLOL_API_KEY = ""
k = KlientN(lambda url: Odp(200))
asyncio.run(adsb._get(k, "https://api.adsb.lol/v2/mil"))
sprawdz("x-api-key" not in k.naglowki, "bez klucza: brak nagłówka")
config.ADSBLOL_API_KEY = przed
zeruj()

print("\n4. Własny adres, bez drugiej puli")
sprawdz(not config.ADSB_IPV4,
        "domyślnie bez wymuszania IPv4 — wspólna brama Mikrusa dałaby drugą pulę limitu (obejście)")

print()
print(f"BŁĘDY: {len(bledy)}" if bledy else "Wszystko OK")
sys.exit(1 if bledy else 0)
