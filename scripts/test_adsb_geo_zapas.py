"""Zapas adsb.fi dla kół bałtyckich musi naprawdę działać.

16.10.2026, przy analizie rozszerzenia ADS-B na BG/FI/NO: kod składał adres
`{base}/point/{lat}/{lon}/{r}` dla każdego dostawcy. adsb.fi odpowiada na to
400 — jego zapytanie geograficzne to `/api/v2/lat/{lat}/lon/{lon}/dist/{r}`,
a listę maszyn oddaje pod kluczem `aircraft`, nie `ac`. Przy awarii adsb.lol
koła bałtyckie (tureckie F-16 bez flagi „military”) wracały więc puste, bez
żadnego śladu poza `status["baltic_geo"]["error"]`.

Czego pilnuje ten test (offline, na odpowiedziach w kształcie zmierzonym tego dnia):
  * adresy obu dostawców,
  * adsb.lol działa → pytamy tylko adsb.lol, lista spod `ac`,
  * adsb.lol pada → adsb.fi właściwą ścieżką, lista spod `aircraft`,
    filtr wojskowy dalej działa, status mówi „adsb.fi”,
  * tryb bez serwera ma test bliźniaczy: scripts/test_adsb_geo_zapas.cjs.

Uruchomienie: py -3 scripts/test_adsb_geo_zapas.py
"""
from pathlib import Path
import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.collectors import adsb
from app.collectors.adsb import BALTIC_GEO_POINTS, _fetch_baltic_geo, _geo_url

TURECKI = {"hex": "4b8452", "flight": "TUAF123 ", "t": "F16", "lat": 55.9,
           "lon": 23.1, "alt_baro": 31000}
CYWILNY = {"hex": "48ae22", "flight": "LOT281  ", "t": "B38M", "lat": 56.1,
           "lon": 24.0, "alt_baro": 36000}
ODP_LOL = {"ac": [TURECKI, CYWILNY], "msg": "No error", "now": 1792172236000, "total": 2}
ODP_FI = {"now": 1792172236.001, "aircraft": [TURECKI, CYWILNY], "resultCount": 2}


class Odp:
    def __init__(self, url, kod, dane):
        self.url, self.status_code, self._dane = url, kod, dane

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code} {self.url}")

    def json(self):
        return self._dane


class Klient:
    """Udaje oba serwery tak, jak odpowiadały 16.10.2026."""

    def __init__(self, lol_dziala=True):
        self.lol_dziala, self.adresy = lol_dziala, []

    async def get(self, url, headers=None):
        self.adresy.append(url)
        assert headers and "Mozilla" in headers.get("User-Agent", ""), "brak UA przeglądarki"
        if url.startswith("https://api.adsb.lol/v2/point/"):
            return Odp(url, 200 if self.lol_dziala else 503, ODP_LOL)
        if url.startswith("https://opendata.adsb.fi/api/v2/point/"):
            return Odp(url, 400, None)       # tak naprawdę odpowiada adsb.fi
        if url.startswith("https://opendata.adsb.fi/api/v2/lat/"):
            return Odp(url, 200, ODP_FI)
        return Odp(url, 404, None)


bledy = []


def sprawdz(warunek, opis):
    print(("OK  " if warunek else "BŁĄD") + " " + opis)
    if not warunek:
        bledy.append(opis)


sprawdz(_geo_url("adsb.lol", 55.5, 24.0, 220) == "https://api.adsb.lol/v2/point/55.5/24.0/220",
        "adsb.lol: /v2/point/{lat}/{lon}/{r}")
sprawdz(_geo_url("adsb.fi", 55.5, 24.0, 220)
        == "https://opendata.adsb.fi/api/v2/lat/55.5/lon/24.0/dist/220",
        "adsb.fi: /api/v2/lat/{lat}/lon/{lon}/dist/{r}")

k = Klient(lol_dziala=True)
wynik = asyncio.run(_fetch_baltic_geo(k, "adsb.lol"))
sprawdz(len(k.adresy) == len(BALTIC_GEO_POINTS) and all("adsb.lol" in a for a in k.adresy),
        "adsb.lol działa → tylko adsb.lol, jedno zapytanie na koło")
sprawdz([a["hex"] for a in wynik] == [TURECKI["hex"]],
        "adsb.lol: lista spod `ac`, filtr wojskowy przepuszcza tylko F-16")

k = Klient(lol_dziala=False)
wynik = asyncio.run(_fetch_baltic_geo(k, "adsb.lol"))
fi = [a for a in k.adresy if "adsb.fi" in a]
sprawdz(len(fi) == len(BALTIC_GEO_POINTS) and all("/lat/" in a and "/point/" not in a for a in fi),
        "adsb.lol pada → adsb.fi właściwą ścieżką")
sprawdz([a["hex"] for a in wynik] == [TURECKI["hex"]],
        "adsb.fi: lista spod `aircraft`, zapas oddaje F-16")
sprawdz(all(a.get("_straznik_detection") == "baltic_geo" for a in wynik),
        "zapas oznacza wykrycie jako baltic_geo")
st = adsb.status["baltic_geo"]
sprawdz(st.get("ok") is True and st.get("provider") == "adsb.fi" and st.get("candidates") == 1,
        f"status kół mówi o adsb.fi ({st})")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nWszystko OK")
