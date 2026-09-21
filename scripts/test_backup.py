# -*- coding: utf-8 -*-
"""Reguły przechowywania kopii zapasowych (scripts/backup_vps.py).

Uruchomienie:  py scripts/test_backup.py
"""
import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
spec = importlib.util.spec_from_file_location(
    "backup_vps", Path(__file__).resolve().parent / "backup_vps.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


now = datetime(2026, 9, 13, 18, 17, tzinfo=timezone.utc)
# symulacja: kopia co 6 h przez 400 dni
names = [f"straznik-{now - timedelta(hours=6 * i):%Y%m%d-%H%M}.tar.zst" for i in range(400 * 4)]
keep = b.keep_set(names, now)
ages = sorted((now - b.stamp_of(n)).total_seconds() / 86400 for n in keep)

ok(all(n in keep for n in names[:9]), "ostatnie 48 h: wszystkie 9 kopii zostają")
ok(sum(1 for a in ages if 2 < a <= 30) in (28, 29), f"dzienne 2–30 dni: {sum(1 for a in ages if 2 < a <= 30)}")
ok(8 <= sum(1 for a in ages if 30 < a <= 90) <= 10, f"tygodniowe 30–90 dni: {sum(1 for a in ages if 30 < a <= 90)}")
ok(9 <= sum(1 for a in ages if 90 < a <= 365) <= 10, f"miesięczne 90–365 dni: {sum(1 for a in ages if 90 < a <= 365)}")
ok(max(ages) <= 365, f"nic starszego niż rok ({max(ages):.0f} dni)")
ok(55 <= len(keep) <= 62, f"łącznie {len(keep)} kopii (przy kilku MB każda — kilkaset MB)")
ok(b.stamp_of("straznik-zly.tar.zst") is None and "obcy.txt" not in b.keep_set(["obcy.txt"], now),
   "obce pliki nie są liczone")
ok(b.keep_set(names[:1], now) == {names[0]}, "pojedyncza kopia zostaje")

# Sekrety tylko w sekrety.tar.gpg, gdy jest klucz publiczny (audyt 16.09.2026; próba na VPS 17.09).
# Od 20.09.2026 to cały układ serwera, nie jeden plik usługi: po rozbiciu na writera i
# readera sama baza nie wystarcza — bez usług, nakładek i tunelu nikt by do niej nie trafił.
# `_sekrety()` bierze tylko pliki, które istnieją; tu udajemy serwer, żeby sprawdzić listę.
from unittest import mock
with mock.patch.object(Path, "exists", lambda self: True),      mock.patch.object(Path, "glob", lambda self, wzor: [self / ("przyklad" + wzor.lstrip("*"))]):
    secret_names = {nazwa for _, nazwa in b._sekrety()}
oczekiwane = {"vapid.json", "fcm-service-account.json", ".env",
              "straznik.service", "straznik-reader.service", "straznik-tunnel.service",
              "straznik-watchdog.service", "straznik-watchdog.timer",
              "straznik.service.d--przyklad.conf", "cloudflared-config.yml",
              "cloudflared-poswiadczenia-przyklad.json", "cron-straznik-backup"}
ok(secret_names == oczekiwane and not secret_names & set(b.FILES),
   "w zaszyfrowanej paczce cały układ serwera: klucze, .env, obie usługi, nakładki, tunel, dozorca, harmonogram")
if secret_names != oczekiwane:
    print("   brakuje:", sorted(oczekiwane - secret_names), "| nadmiarowe:", sorted(secret_names - oczekiwane))
src = (Path(__file__).resolve().parent / "backup_vps.py").read_text(encoding="utf-8")
ok('"--recipient-file", str(RECIPIENT)' in src and '"sekrety.tar.gpg"' in src and "plain.unlink()" in src,
   "sekrety szyfrowane kluczem publicznym, jawny tar usuwany przed spakowaniem")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - przechowywanie kopii zapasowych")
