"""ADS-B na serwerze pyta wyłącznie adsb.lol — bez zapasu adsb.fi.

Historia: 16.10.2026 naprawiliśmy zapas adsb.fi dla kół bałtyckich (inna ścieżka
geograficzna, lista pod `aircraft`). 26.10.2026 przegląd podstaw korzystania
z cudzych danych pokazał, że warunki opendata.adsb.fi pozwalają tylko na
„personal, non-commercial use” i zakazują licencjonowania danych, a adsb.lol
udostępnia dane na ODbL — mieszanie obu list w jednej warstwie i w publicznym
/api/state nie dawało się pogodzić. Decyzja usera z 26.10: zapasy ADS-B usunąć.

Czego pilnuje ten test (offline, na odpowiedziach w kształcie z 16.10.2026):
  * adres kół: adsb.lol `/v2/point/{lat}/{lon}/{r}`,
  * adsb.lol działa → tylko adsb.lol, jedno zapytanie na koło, lista spod `ac`,
    filtr wojskowy przepuszcza tylko F-16,
  * adsb.lol pada → ŻADEN inny host nie jest odpytywany, koła są puste,
    a status kół mówi o błędzie adsb.lol (nie udaje „ok”),
  * lista /v2/mil: przy dawnej wartości ADSB_PROVIDER=adsb.fi w .env serwer
    i tak pyta tylko adsb.lol,
  * tryb bez serwera ma test bliźniaczy: scripts/test_adsb_bez_zapasu.cjs.

Uruchomienie: py -3 scripts/test_adsb_bez_zapasu.py
"""
from pathlib import Path
import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import config
from app.collectors import adsb
from app.collectors.adsb import BALTIC_GEO_POINTS, MIL_ENDPOINTS, _fetch_baltic_geo, _fetch_mil, _geo_url

TURECKI = {"hex": "4b8452", "flight": "TUAF123 ", "t": "F16", "lat": 55.9,
           "lon": 23.1, "alt_baro": 31000}
CYWILNY = {"hex": "48ae22", "flight": "LOT281  ", "t": "B38M", "lat": 56.1,
           "lon": 24.0, "alt_baro": 36000}
ODP_LOL = {"ac": [TURECKI, CYWILNY], "msg": "No error", "now": 1792172236000, "total": 2}


class Odp:
    def __init__(self, url, kod, dane):
        self.url, self.status_code, self._dane = url, kod, dane

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code} {self.url}")

    def json(self):
        return self._dane


class Klient:
    """Udaje adsb.lol; każdy inny host odpowiada, ale nie powinien być pytany."""

    def __init__(self, lol_dziala=True):
        self.lol_dziala, self.adresy = lol_dziala, []

    async def get(self, url, headers=None):
        self.adresy.append(url)
        assert headers and "Mozilla" in headers.get("User-Agent", ""), "brak UA przeglądarki"
        if url.startswith("https://api.adsb.lol/"):
            return Odp(url, 200 if self.lol_dziala else 503, ODP_LOL)
        return Odp(url, 200, {"ac": [TURECKI], "aircraft": [TURECKI]})


bledy = []


def sprawdz(warunek, opis):
    print(("OK  " if warunek else "BŁĄD") + " " + opis)
    if not warunek:
        bledy.append(opis)


sprawdz(list(MIL_ENDPOINTS) == ["adsb.lol"], f"jedyny dostawca to adsb.lol ({list(MIL_ENDPOINTS)})")
sprawdz(_geo_url("adsb.lol", 55.5, 24.0, 220) == "https://api.adsb.lol/v2/point/55.5/24.0/220",
        "adsb.lol: /v2/point/{lat}/{lon}/{r}")

k = Klient(lol_dziala=True)
wynik = asyncio.run(_fetch_baltic_geo(k, "adsb.lol"))
sprawdz(len(k.adresy) == len(BALTIC_GEO_POINTS) and all(a.startswith("https://api.adsb.lol/") for a in k.adresy),
        "adsb.lol działa → tylko adsb.lol, jedno zapytanie na koło")
sprawdz([a["hex"] for a in wynik] == [TURECKI["hex"]],
        "adsb.lol: lista spod `ac`, filtr wojskowy przepuszcza tylko F-16")
sprawdz(all(a.get("_straznik_detection") == "baltic_geo" for a in wynik),
        "wykrycie oznaczone jako baltic_geo")

k = Klient(lol_dziala=False)
wynik = asyncio.run(_fetch_baltic_geo(k, "adsb.lol"))
obce = [a for a in k.adresy if not a.startswith("https://api.adsb.lol/")]
sprawdz(obce == [], f"adsb.lol pada → żaden inny host nie jest pytany ({obce})")
sprawdz(wynik == [], "adsb.lol pada → koła puste")
st = adsb.status["baltic_geo"]
sprawdz(st.get("ok") is False and "adsb.lol" in str(st.get("error")),
        f"status kół mówi o błędzie adsb.lol ({st})")

dawny = config.ADSB_PROVIDER
try:
    config.ADSB_PROVIDER = "adsb.fi"          # wartość z .env sprzed 26.10.2026
    k = Klient(lol_dziala=True)
    lista = asyncio.run(_fetch_mil(k))
    sprawdz(k.adresy == ["https://api.adsb.lol/v2/mil"],
            f"ADSB_PROVIDER=adsb.fi → pytamy tylko adsb.lol ({k.adresy})")
    sprawdz(lista is not None and len(lista) == 2, "lista /v2/mil z adsb.lol wraca w całości")
    k = Klient(lol_dziala=False)
    lista = asyncio.run(_fetch_mil(k))
    sprawdz(lista is None and adsb.status.get("ok") is False,
            "adsb.lol pada → brak listy i status ok=False (bez zapasu)")
finally:
    config.ADSB_PROVIDER = dawny

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nWszystko OK")
