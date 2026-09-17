# -*- coding: utf-8 -*-
"""Połączenie SSH z VPS Strażnika: tylko klucz i przypięty klucz hosta (audyt 16/17.09.2026).

Wcześniej skrypty logowały się na roota hasłem z pliku .env innego projektu i
przyjmowały dowolny klucz hosta (AutoAddPolicy). Teraz:
- klucz prywatny ~/.ssh/straznik_vps (albo STRAZNIK_VPS_KEY), bez agenta i bez hasła,
- klucz hosta musi zgadzać się z ~/.ssh/known_hosts (RejectPolicy) — podmieniony
  serwer albo atak MITM kończy się błędem zamiast wysłaniem poleceń.
"""
import os
from pathlib import Path

import paramiko

HOST = os.getenv("STRAZNIK_VPS_HOST", "robert154.mikrus.xyz")
PORT = int(os.getenv("STRAZNIK_VPS_PORT", "10154"))
USER = os.getenv("STRAZNIK_VPS_USER", "root")
KEY = Path(os.getenv("STRAZNIK_VPS_KEY", str(Path.home() / ".ssh" / "straznik_vps")))
KNOWN_HOSTS = Path.home() / ".ssh" / "known_hosts"


def connect(timeout: int = 30) -> paramiko.SSHClient:
    if not KEY.exists():
        raise SystemExit(f"brak klucza SSH {KEY} (ustaw STRAZNIK_VPS_KEY)")
    cli = paramiko.SSHClient()
    cli.load_host_keys(str(KNOWN_HOSTS))
    cli.set_missing_host_key_policy(paramiko.RejectPolicy())
    cli.connect(HOST, port=PORT, username=USER, key_filename=str(KEY),
                allow_agent=False, look_for_keys=False, timeout=timeout)
    return cli
