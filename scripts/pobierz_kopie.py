# -*- coding: utf-8 -*-
"""Pobiera kopie zapasowe Strażnika z VPS na ten komputer (Harmonogram zadań Windows).

Kopia tylko na VPS nie chroni przed awarią dysku ani utratą serwera. Zadanie
„Straznik - kopie zapasowe” uruchamia ten skrypt codziennie i przy logowaniu;
pobiera brakujące pliki i usuwa lokalnie te, których VPS już nie trzyma
(przechowywanie warstwowe liczy scripts/backup_vps.py).

Bezpiecznik: jeśli na VPS nie ma ani jednej kopii (np. serwer padł albo katalog
zniknął), niczego lokalnie nie usuwamy.

Kopie zawierają sekrety (.env, klucze VAPID i FCM) — katalog docelowy jest tylko
na tym komputerze i nie może trafić do repozytorium.

Użycie:  py scripts/pobierz_kopie.py [katalog]
"""
import io
import json
import re
import sys
import time
from pathlib import Path

import paramiko

ENV = Path(r"C:\Users\PC\Desktop\ZSP6 pliki\ZSP6_pliki_link\api\.env")
HOST, PORT, USER = "robert154.mikrus.xyz", 10154, "root"
REMOTE = "/var/backups/straznik"
LOCAL = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Documents" / "Straznik-kopie"
LOG = LOCAL / "pobieranie.log"


def log(msg: str):
    LOCAL.mkdir(parents=True, exist_ok=True)
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line)
    with io.open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def password() -> str:
    for line in io.open(ENV, encoding="utf-8", errors="ignore"):
        m = re.match(r"\s*VPS_PASSWORD\s*=\s*(.+?)\s*$", line)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    raise SystemExit("brak VPS_PASSWORD w .env")


def main() -> int:
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=password(), timeout=30)
    sftp = cli.open_sftp()
    try:
        remote = {a.filename: a.st_size for a in sftp.listdir_attr(REMOTE)
                  if a.filename.startswith("straznik-") and a.filename.endswith(".tar.zst")}
    except FileNotFoundError:
        remote = {}
    LOCAL.mkdir(parents=True, exist_ok=True)
    local = {p.name: p.stat().st_size for p in LOCAL.glob("straznik-*.tar.zst")}
    got = 0
    for name, size in sorted(remote.items()):
        if local.get(name) == size:
            continue
        part = LOCAL / (name + ".part")
        sftp.get(f"{REMOTE}/{name}", str(part))
        if part.stat().st_size != size:
            part.unlink(missing_ok=True)
            log(f"BŁĄD: niepełne pobranie {name}")
            continue
        part.replace(LOCAL / name)
        got += 1
    removed = 0
    if remote:
        for name in local:
            if name not in remote:
                (LOCAL / name).unlink(missing_ok=True)
                removed += 1
    status = {}
    try:
        with sftp.open("/opt/straznik/backend/data/backup_status.json") as f:
            status = json.loads(f.read().decode("utf-8"))
    except OSError:
        pass
    sftp.close()
    cli.close()
    if not remote:
        log("UWAGA: na VPS nie ma żadnej kopii — lokalnych nie ruszam")
        return 1
    log(f"OK: pobrano {got}, usunięto {removed}, lokalnie {len(remote)} kopii; "
        f"ostatnia na VPS: {status.get('file')} ok={status.get('ok')}")
    return 0 if status.get("ok", True) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log(f"BŁĄD: {exc!r}")
        sys.exit(1)
