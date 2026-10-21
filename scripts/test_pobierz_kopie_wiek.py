# -*- coding: utf-8 -*-
"""Limit wieku kopii na tym komputerze (scripts/pobierz_kopie.py), 21.10.2026.

Polityka prywatności obiecuje, że kopie zapasowe (z subskrypcjami powiadomień
w przeglądarce) leżą najwyżej 12 miesięcy. Lustro na PC kasuje to, czego nie ma
na VPS, ale gdy VPS zniknie, bezpiecznik niczego nie rusza — stąd twardy limit
wieku. Pilnujemy, żeby usuwał WYŁĄCZNIE stare kopie Strażnika z katalogu kopii:
nic innego w katalogu, nic w podkatalogach, nic bez czytelnej daty w nazwie.

Uruchomienie:  py scripts/test_pobierz_kopie_wiek.py
"""
import importlib.util
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
spec = importlib.util.spec_from_file_location(
    "pobierz_kopie", Path(__file__).resolve().parent / "pobierz_kopie.py")
k = importlib.util.module_from_spec(spec)
spec.loader.exec_module(k)

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


now = datetime(2027, 10, 21, 12, 0, tzinfo=timezone.utc)

ok(k.MAX_WIEK_DNI == 365, "limit to 365 dni, jak w polityce i w backup_vps.py")

# ── za_stare(): sama lista nazw ──
ok(k.za_stare(["straznik-20261020-1217.tar.zst"], now) == ["straznik-20261020-1217.tar.zst"],
   "kopia sprzed 366 dni jest za stara")
ok(k.za_stare(["straznik-20261022-0017.tar.zst"], now) == [],
   "kopia sprzed 364 dni zostaje")
ok(k.za_stare(["straznik-zly.tar.zst", "straznik-2026-10-01.tar.zst"], now) == [],
   "nazwa bez czytelnej daty nie jest usuwana")
ok(k.za_stare(["xxxxxxxxx20200101-0000xxxxxxxx", "Straznik-20200101-0000.tar.zst",
               "straznik-20200101-0000.tar.zst.part", "straznik-20200101-0000.zip"], now) == [],
   "inne przedrostki, rozszerzenia i pliki .part nie są kopiami")

# ── usun_za_stare(): prawdziwe pliki w katalogu tymczasowym ──
with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    k.LOCAL, k.LOG = d, d / "pobieranie.log"
    stara, nowa = d / "straznik-20250101-0017.tar.zst", d / "straznik-20271020-1817.tar.zst"
    obce = [d / "notatki.txt", d / "straznik-zly.tar.zst", d / "Straznik-20200101-0000.tar.zst",
            d / "straznik-20200101-0000.tar.zst.part", d / "inna-20200101-0000.tar.zst"]
    for p in [stara, nowa, *obce]:
        p.write_bytes(b"x")
    pod = d / "archiwum"
    pod.mkdir()
    w_podkatalogu = pod / "straznik-20200101-0000.tar.zst"
    w_podkatalogu.write_bytes(b"x")
    katalog_jak_kopia = d / "straznik-20200102-0000.tar.zst.d"
    katalog_jak_kopia.mkdir()
    katalog_z_nazwa_kopii = d / "straznik-20200103-0000.tar.zst"
    katalog_z_nazwa_kopii.mkdir()

    usunieto = k.usun_za_stare(now)
    ok(usunieto == 1 and not stara.exists(), "stara kopia usunięta")
    ok(nowa.exists(), "świeża kopia została")
    ok(all(p.exists() for p in obce), "inne pliki w katalogu nietknięte")
    ok(w_podkatalogu.exists(), "podkatalogi nietknięte")
    ok(katalog_jak_kopia.is_dir() and katalog_z_nazwa_kopii.is_dir(),
       "katalog nazwany jak kopia nie jest usuwany")
    ok("Limit wieku 365 dni: usunięto 1" in k.LOG.read_text(encoding="utf-8"), "wpis w dzienniku")

# limit działa przed połączeniem z VPS, więc także przy zadziałaniu bezpiecznika
src = (Path(__file__).resolve().parent / "pobierz_kopie.py").read_text(encoding="utf-8")
main = src[src.index("def main()"):]
ok(main.index("usun_za_stare(") < main.index("vps_ssh.connect()"),
   "limit wieku liczony przed łączeniem z VPS (działa także, gdy VPS zniknął)")

print()
print("BŁĘDY: " + str(len(bledy)) if bledy else "Wszystko OK")
sys.exit(1 if bledy else 0)
