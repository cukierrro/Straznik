# -*- coding: utf-8 -*-
"""Nadzorca usług na VPS (scripts/watchdog_vps.sh) — karencja po starcie i odstęp prób.

20.11.2026, po wymianie dysku u Mikrusa: start writera trwał 3 min 20 s, a dwa przebiegi
timera w tej samej sekundzie policzyły się jako „dwa razy z rzędu” — restart dokładnie
w chwili „startup complete”. Test uruchamia prawdziwy skrypt z podstawionymi
systemctl / curl / date / logger (nic nie dotyka systemu).

Uruchomienie:  py scripts/test_watchdog_vps.py
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
SKRYPT = Path(__file__).resolve().parent / "watchdog_vps.sh"
SH = shutil.which("sh") or shutil.which("bash")
bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


if not SH:
    print("BLAD brak powłoki sh/bash — test nie może sprawdzić nadzorcy")
    sys.exit(1)

tmp = Path(tempfile.mkdtemp(prefix="wd_"))
BIN, STAN, LOG = tmp / "bin", tmp / "run", tmp / "log.txt"
BIN.mkdir()
STAN.mkdir()
ATRAPY = {
    "systemctl": 'case "$1" in\n  is-active) exit 0;;\n  show) echo "START";;\n'
                 '  restart) echo "RESTART $2" >> "$WD_LOG";;\nesac\n',
    "date": 'if [ "$1" = "-d" ]; then echo "$WD_START"; else echo "$WD_NOW"; fi\n',
    "curl": 'exit "$WD_CURL"\n',
    "logger": 'echo "$*" >> "$WD_LOG"\n',
}
for nazwa, tresc in ATRAPY.items():
    p = BIN / nazwa
    p.write_text("#!/bin/sh\n" + tresc, encoding="utf-8", newline="\n")
    p.chmod(0o755)


def przebieg(teraz, start, curl_ok):
    env = dict(os.environ, PATH=f"{BIN}{os.pathsep}{os.environ.get('PATH', '')}",
               WD_NOW=str(teraz), WD_START=str(start), WD_CURL="0" if curl_ok else "7",
               WD_LOG=str(LOG), STRAZNIK_WATCHDOG_DIR=str(STAN))
    r = subprocess.run([SH, str(SKRYPT)], env=env, capture_output=True, text=True, timeout=60)
    return r.returncode


def restarty():
    return LOG.read_text(encoding="utf-8").splitlines().count("RESTART straznik") if LOG.exists() else 0


def stan():
    p = STAN / "straznik-watchdog.straznik"
    return p.read_text(encoding="utf-8").strip() if p.exists() else None


def od_nowa():
    for p in STAN.iterdir():
        p.unlink()
    if LOG.exists():
        LOG.unlink()


print("1. Karencja po starcie: 5 min (było 2)")
od_nowa()
START = 1_000_000
ok(przebieg(START + 200, START, False) == 0 and restarty() == 0 and stan() is None,
   "3 min 20 s po starcie nie liczy błędu (noc 20.11: wtedy dopiero kończył się start)")
przebieg(START + 280, START, False)
ok(restarty() == 0, "4 min 40 s — nadal karencja")

print("\n2. Dwa przebiegi w tej samej sekundzie to JEDNA próba")
od_nowa()
T = START + 1000
przebieg(T, START, False)
ok(stan() == f"1 {T}", f"pierwszy błąd zapisany z czasem ({stan()})")
przebieg(T, START, False)
ok(restarty() == 0, "drugi przebieg w tej samej sekundzie nie restartuje")
przebieg(T + 30, START, False)
ok(restarty() == 0, "30 s później też nie (odstęp < 45 s)")
przebieg(T + 60, START, False)
ok(restarty() == 1, "minutę później drugi błąd — restart (zawieszona usługa nadal łapana)")
ok(stan() is None, "po restarcie licznik wyzerowany")

print("\n3. Odpowiedź usługi zeruje licznik")
od_nowa()
przebieg(T, START, False)
przebieg(T + 60, START, True)
ok(stan() is None, "udane zapytanie kasuje stan")
przebieg(T + 120, START, False)
ok(restarty() == 0, "pojedynczy błąd po powrocie nie restartuje")

print("\n4. Stary zapis licznika (sama liczba, sprzed 20.11)")
od_nowa()
(STAN / "straznik-watchdog.straznik").write_text("1\n", encoding="utf-8", newline="\n")
przebieg(T, START, False)
ok(restarty() == 1, "„1” bez czasu liczy się jak wcześniejszy błąd — restart, jak dawniej")

shutil.rmtree(tmp, ignore_errors=True)
if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - nadzorca nie restartuje świeżo uruchomionej usługi ani dwa razy za jedną próbę")
