"""Dobowy budżet zapytań do adsb.lol: cała doba UTC pokryta, bez przekroczenia 500.

Log serwera z 23–26.10.2026: pierwsze 429 każdego dnia o 02:49–02:59 UTC, potem już tylko
429 do północy UTC (~1100 odrzuceń dziennie). adsb.lol liczy dobę UTC (x-ratelimit-reset
26.10 o 17:21 UTC wskazywał 00:00 UTC) i liczy także odrzucone zapytania. Warstwa samolotów
żyła więc ~3 godziny na dobę. Stały odstęp 173 s (499/dobę) nie ma zapasu: restart serwera
dokładał zapytanie, a po 429 przerwa była ucięta do godziny i co godzinę szło kolejne 429.

Czego pilnujemy (offline, z podstawionym zegarem):
  * przez całą dobę UTC wychodzi od 480 do ADSB_LIMIT_DOBA − ADSB_ZAPAS_DOBA zapytań,
    a najdłuższa przerwa między nimi to kilka minut — warstwa żyje do północy,
  * restart w połowie doby (licznik z pliku) nie przekracza puli i dalej rozkłada ją równo,
  * nowa doba UTC zeruje licznik,
  * nagłówek z pulą dobową (x-ratelimit-limit zaczyna się od 500) poprawia licznik,
    np. o zapytania z curl-a spoza procesu,
  * 429 z puli dobowej: przerwa do resetu podanego przez adsb.lol, bez cięcia do godziny,
  * 429 z limitu na sekundę: krótka przerwa,
  * pusta pula: pętla run() nie wysyła ani jednego zapytania i śpi do północy UTC.

Uruchomienie: py -3 scripts/test_adsb_budzet.py
"""
from pathlib import Path
import asyncio
import sys
import tempfile
import types

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import config  # noqa: E402

_tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
config.DATA_DIR = Path(_tmp.name)        # licznik budżetu ląduje w katalogu tymczasowym
from app.collectors import adsb  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


ZEGAR = {"t": 0.0}
adsb.time = types.SimpleNamespace(time=lambda: ZEGAR["t"])   # tylko w module adsb
DOBA0 = 1793059200.0                      # 2026-10-27 00:00:00 UTC
assert DOBA0 % 86400 == 0
PULA = config.ADSB_LIMIT_DOBA - config.ADSB_ZAPAS_DOBA


def zeruj():
    adsb._budzet.update(dzien=None, uzyte=0)
    adsb._przerwa_do = 0.0
    try:
        adsb._budzet_plik().unlink()
    except OSError:
        pass


class Odp:
    def __init__(self, kod, naglowki=None):
        self.status_code, self.headers = kod, naglowki or {}


def symuluj(od, do):
    """Pętla run() w skrócie: zapytanie, jeśli pula pozwala, potem sen o policzony odstęp."""
    t, wyslane = od, []
    while t < do:
        ZEGAR["t"] = t
        if adsb._zostalo(t) > 0:
            adsb._policz_zapytanie(Odp(200, {"x-ratelimit-limit": "4, 4;w=1, 60;w=60, 500;w=86400",
                                             "x-ratelimit-remaining": "3"}))
            wyslane.append(t)
        t += adsb._policz_odstep(t)
    return wyslane


print("1. Cała doba UTC")
zeruj()
w = symuluj(DOBA0, DOBA0 + 86400)
przerwy = [b - a for a, b in zip(w, w[1:])]
sprawdz(480 <= len(w) <= PULA, f"{len(w)} zapytań na dobę (pula {PULA}, limit {config.ADSB_LIMIT_DOBA})")
sprawdz(max(przerwy) <= 200, f"najdłuższa przerwa {max(przerwy):.0f} s — warstwa żyje całą dobę")
sprawdz(DOBA0 + 86400 - w[-1] <= 200, f"ostatnie zapytanie {DOBA0 + 86400 - w[-1]:.0f} s przed północą UTC")
sprawdz(min(przerwy) >= config.ADSB_INTERVAL, f"nigdy gęściej niż co {config.ADSB_INTERVAL} s")

print("\n2. Restart w połowie doby")
zeruj()
pierwsza = symuluj(DOBA0, DOBA0 + 43200)
adsb._budzet.update(dzien=None, uzyte=0)          # nowy proces: pamięć pusta…
adsb._budzet_wczytaj()                              # …licznik wraca z pliku
sprawdz(adsb._budzet["uzyte"] == len(pierwsza), f"licznik z pliku: {adsb._budzet['uzyte']}")
druga = symuluj(DOBA0 + 43200 + 7, DOBA0 + 86400)  # restart: pierwsze zapytanie od razu po starcie
sprawdz(len(pierwsza) + len(druga) <= PULA, f"razem {len(pierwsza) + len(druga)} ≤ {PULA}")

print("\n3. Nowa doba UTC zeruje licznik")
ZEGAR["t"] = DOBA0 + 86400 + 1
sprawdz(adsb._zostalo(ZEGAR["t"]) == PULA, f"po północy UTC znów {PULA} do wykorzystania")

print("\n4. Nagłówek puli dobowej poprawia licznik")
zeruj()
ZEGAR["t"] = DOBA0 + 3600
adsb._policz_zapytanie(Odp(200, {"x-ratelimit-limit": "500, 4;w=1, 60;w=60, 500;w=86400",
                                 "x-ratelimit-remaining": "37"}))
sprawdz(adsb._budzet["uzyte"] == 463, f"adsb.lol mówi, że zostało 37 → użyte {adsb._budzet['uzyte']}")
adsb._policz_zapytanie(Odp(200, {"x-ratelimit-limit": "4, 4;w=1", "x-ratelimit-remaining": "3"}))
sprawdz(adsb._budzet["uzyte"] == 464, "nagłówek limitu na sekundę nie rusza licznika dobowego")

print("\n5. 429 z puli dobowej: czekamy do resetu adsb.lol")
zeruj()
ZEGAR["t"] = DOBA0 + 62488                           # 17:21:28 UTC, jak pomiar 26.10
adsb._zapamietaj_limit(Odp(429, {"x-ratelimit-limit": "500, 4;w=1, 60;w=60, 500;w=86400",
                                 "x-ratelimit-remaining": "0", "x-ratelimit-reset": "23912"}))
sprawdz(adsb._przerwa_s() == 23912, f"przerwa {adsb._przerwa_s():.0f} s do północy UTC, nie 3600")
sprawdz(adsb._zostalo(ZEGAR["t"]) <= 0, "pula oznaczona jako pusta")

print("\n6. 429 z limitu na sekundę: krótka przerwa")
zeruj()
ZEGAR["t"] = DOBA0 + 1000
adsb._zapamietaj_limit(Odp(429, {"x-ratelimit-limit": "4, 4;w=1, 60;w=60, 500;w=86400",
                                 "x-ratelimit-reset": "1"}))
sprawdz(0 < adsb._przerwa_s() <= 1, f"przerwa {adsb._przerwa_s():.0f} s")
sprawdz(adsb._zostalo(ZEGAR["t"]) == PULA, "pula dobowa nietknięta")

print("\n7. Pusta pula: run() nie pyta")
zeruj()
ZEGAR["t"] = DOBA0 + 70000
adsb._budzet.update(dzien=adsb._dzien_utc(ZEGAR["t"]), uzyte=PULA)
adsb._budzet_zapisz()
wyslane, sny = [], []


class Koniec(Exception):
    pass


async def sen(s):
    sny.append(s)
    raise Koniec


class KlientRun:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, headers=None):
        wyslane.append(url)
        return Odp(200)


def obieg_run():
    wyslane.clear(); sny.clear()
    prawdziwy_sen, prawdziwy_klient = adsb.asyncio.sleep, adsb.httpx.AsyncClient
    adsb.asyncio.sleep, adsb.httpx.AsyncClient = sen, KlientRun
    try:
        asyncio.run(adsb.run())
    except Koniec:
        pass
    finally:
        adsb.asyncio.sleep, adsb.httpx.AsyncClient = prawdziwy_sen, prawdziwy_klient


# bez zapasu (ADSB_ZAPAS pusty albo brak klucza FlyItalyADSB)
zapas_przed = config.ADSB_ZAPAS
config.ADSB_ZAPAS = ""
obieg_run()
sprawdz(wyslane == [], f"bez zapasu: żadnego zapytania przy pustej puli ({wyslane})")
sprawdz(sny and abs(sny[0] - (86400 - 70000 + 5)) <= 1, f"bez zapasu: sen do północy UTC: {sny[0] if sny else None:.0f} s")
sprawdz(adsb.status.get("budzet", {}).get("uzyte") == PULA, f"status pokazuje budżet: {adsb.status.get('budzet')}")

print("\n8. Pusta pula z zapasem FlyItalyADSB (pisemna zgoda 27.10)")
klucz_przed = config.FLYITALY_API_KEY
config.FLYITALY_API_KEY = "fia_test"
config.ADSB_ZAPAS = "flyitaly"
obieg_run()
sprawdz(wyslane and all(u.startswith("https://api.flyitalyadsb.com/") for u in wyslane),
        f"pytamy tylko zapas, adsb.lol ani razu: {wyslane}")
sprawdz(adsb._budzet["uzyte"] == PULA, "zapytania do zapasu nie liczą się do puli adsb.lol")
sprawdz(sny and sny[0] == config.ADSB_ZAPAS_INTERVAL, f"zapas w swoim rytmie: {sny[0] if sny else None} s")
config.ADSB_ZAPAS = zapas_przed
config.FLYITALY_API_KEY = klucz_przed

print()
print(f"BŁĘDY: {len(bledy)}" if bledy else "Wszystko OK")
sys.exit(1 if bledy else 0)
