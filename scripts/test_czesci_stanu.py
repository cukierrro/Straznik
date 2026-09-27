# -*- coding: utf-8 -*-
"""Stan podawany w dwóch częściach (27.09.2026).

Pomiar na produkcji: przez 3 minuty backend wypuścił 11 ticków, w nich `neptun`
i `fusion` zmieniły się 11 razy, `adsb` cztery razy, a `health` ani razu. Klient
dostawał więc 2,4 KB `adsb`+`health` przy każdym ticku, w dwóch trzecich
przypadków bez powodu. Od tej zmiany `/api/state` umie oddać sam rdzeń
(`part=main`, z odciskiem `aux_v`) albo same wolne sekcje (`part=aux`).

Czego pilnuje ten test:

1. Odpowiedź BEZ parametrów jest nietknięta — biorą ją wydania sprzed zmiany
   i widżet Androida. Nie ma w niej nawet `aux_v`.
2. `main` + `aux` składa się dokładnie w pełny stan. To jest warunek, od którego
   zależy poprawność mapy i alarmu: gdyby scalenie gubiło sekcję, telefon
   pokazałby niepełny obraz i nikt by tego nie zauważył.
3. `aux_v` zmienia się wtedy i tylko wtedy, gdy zmieni się część pomocnicza —
   inaczej klient albo pobierałby ją bez potrzeby, albo przegapiłby zmianę.
4. Skrót „nic nowego" działa na obu ścieżkach.
5. Klient trzyma stałą kolejność parametrów w adresie. Cloudflare cache'uje po
   całym adresie, więc `?v=X&part=main` i `?part=main&v=X` to dwa różne wpisy na
   brzegu — rozsypanie klucza obciążyłoby origin, czyli dałoby skutek odwrotny
   do celu tej zmiany.

Uruchomienie: py scripts/test_czesci_stanu.py
"""
import json
import sys
import tempfile
from urllib.parse import quote
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
warnings.filterwarnings("ignore")

from app import config, db  # noqa: E402

tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)   # Windows trzyma plik SQLite
config.DB_PATH = Path(tmp.name) / "test.db"
db.init()

from app import main, public_cache  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

client = TestClient(main.app)
bledy = []


def sprawdz(warunek, opis):
    if not warunek:
        bledy.append(opis)
    print(("  OK   " if warunek else "  BŁĄD ") + opis)


main.refresh_state()

pelny = client.get("/api/state").json()
glowna = client.get("/api/state?part=main").json()
pomoc = client.get("/api/state?part=aux").json()

# ── 1. stare klienty dostają dokładnie to co dotąd ───────────────────────────
sprawdz("adsb" in pelny and "health" in pelny,
        "odpowiedź bez parametrów nadal ma adsb i health")
sprawdz("aux_v" not in pelny,
        "odpowiedź bez parametrów nie ma aux_v — dla starych wydań nic się nie zmienia")

# ── 2. podział jest rozłączny i zupełny ──────────────────────────────────────
sprawdz(sorted(pomoc) == sorted(main.AUX_SEKCJE),
        f"część pomocnicza to dokładnie {', '.join(main.AUX_SEKCJE)}")
sprawdz(all(k not in glowna for k in main.AUX_SEKCJE),
        "część główna nie powtarza sekcji pomocniczych")
zlozony = {**glowna, **pomoc}
zlozony.pop("aux_v", None)
sprawdz(zlozony == pelny,
        "główna + pomocnicza daje dokładnie pełny stan (bez gubienia sekcji)")

# ── 3. odcisk części pomocniczej ─────────────────────────────────────────────
sprawdz(isinstance(glowna.get("aux_v"), str) and glowna["aux_v"],
        "część główna niesie aux_v")
odcisk_1 = glowna["aux_v"]
main._publikuj_czesci(json.loads(json.dumps(pelny)))          # ten sam stan jeszcze raz
sprawdz(client.get("/api/state?part=main").json()["aux_v"] == odcisk_1,
        "aux_v nie zmienia się, gdy część pomocnicza jest ta sama")
inny = json.loads(json.dumps(pelny))
inny["adsb"] = {"aircraft": [{"hex": "TEST00"}], "counts": {}, "baselines": {}, "trails": {}}
main._publikuj_czesci(inny)
sprawdz(client.get("/api/state?part=main").json()["aux_v"] != odcisk_1,
        "aux_v zmienia się, gdy zmieni się część pomocnicza")

# ── 4. „nic nowego" na obu ścieżkach ─────────────────────────────────────────
main.refresh_state()
# Wersja MUSI być zakodowana w adresie: `fusion.ts` zawiera `+` strefy czasowej,
# a w części zapytania `+` znaczy spację. Niezakodowany znacznik nigdy się nie
# dopasuje i serwer po cichu oddaje pełny stan zamiast osiemnastu bajtów —
# strata jest niewidoczna, bo wszystko działa, tylko drożej.
wersja = quote(client.get("/api/state?part=main").json()["fusion"]["ts"], safe="")
sprawdz(client.get(f"/api/state?part=main&v={wersja}").json() == {"unchanged": True},
        "part=main z bieżącą wersją oddaje „nic nowego”")
sprawdz(client.get(f"/api/state?v={wersja}").json() == {"unchanged": True},
        "stara ścieżka z wersją nadal oddaje „nic nowego”")
surowa = client.get("/api/state?part=main&v=" + client.get("/api/state?part=main").json()["fusion"]["ts"])
sprawdz("fusion" in surowa.json(),
        "niezakodowana wersja nie udaje „nic nowego” — oddaje stan")
sprawdz("fusion" in client.get("/api/state?part=main&v=cokolwiek").json(),
        "nieznana wersja zwraca część główną, a nie pustkę")

# ── 5. klient nie rozsypuje klucza cache na brzegu ───────────────────────────
app_js = (ROOT / "frontend" / "app.js").read_text(encoding="utf-8")
sprawdz('"/api/state?part=main"' in app_js,
        "klient pyta o część główną pod stałym, kanonicznym adresem")
sprawdz('"&v=" + encodeURIComponent(pollVer)' in app_js,
        "wersja dopisywana ZAWSZE po part= — jedna kolejność parametrów, jeden klucz cache")
sprawdz('"/api/state?part=aux"' in app_js and "part=aux&v=" not in app_js,
        "część pomocnicza pobierana bez wersji — na brzegu leży pod jednym kluczem")
sprawdz("state_main" in (ROOT / "backend" / "app" / "public_cache.py").read_text(encoding="utf-8"),
        "nowe paczki mają własną politykę cache")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - stan w dwóch częściach, stare klienty nietknięte, klucz cache stabilny")
