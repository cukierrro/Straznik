# -*- coding: utf-8 -*-
"""Wpisuje HEALTHCHECK_PING_URL do .env na VPS i sprawdza, czy serwer pinguje.

Uruchamiasz SAM w swoim terminalu (adres pingu to sekret — nie wklejaj go do czatu):

    py scripts\\ustaw_healthcheck.py

Skrypt pyta o adres bez wyświetlania go, przekazuje go na VPS przez standardowe
wejście (nie trafia do listy procesów ani do logów), podmienia wiersz w
/opt/straznik/backend/.env z zachowaniem właściciela i uprawnień (root:straznik 640),
restartuje usługę tylko wtedy, gdy nie trwa alarm, i czeka na pierwszy ping.
Pusty adres = wyłączenie pingowania.
"""
import getpass
import io
import json
import re
import sys
import time
from pathlib import Path

import paramiko

ENV = Path(r"C:\Users\PC\Desktop\ZSP6 pliki\ZSP6_pliki_link\api\.env")
HOST, PORT, USER = "robert154.mikrus.xyz", 10154, "root"

REMOTE_WRITE = r'''
import re, sys
path = "/opt/straznik/backend/.env"
url = sys.stdin.read().strip()
with open(path, "r+", encoding="utf-8") as f:      # r+ zachowuje właściciela i uprawnienia
    text = f.read()
    line = "HEALTHCHECK_PING_URL=" + url
    if re.search(r"(?m)^HEALTHCHECK_PING_URL=.*$", text):
        text = re.sub(r"(?m)^HEALTHCHECK_PING_URL=.*$", lambda m: line, text)
    else:
        text = text.rstrip("\n") + "\n" + line + "\n"
    f.seek(0); f.write(text); f.truncate()
print("zapisano")
'''


def password() -> str:
    for line in io.open(ENV, encoding="utf-8", errors="ignore"):
        m = re.match(r"\s*VPS_PASSWORD\s*=\s*(.+?)\s*$", line)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    raise SystemExit("brak VPS_PASSWORD w .env")


def main() -> int:
    url = getpass.getpass("Wklej adres pingu z Healthchecks.io (nie będzie widoczny) i Enter: ").strip()
    if url and not re.fullmatch(r"https://hc-ping\.com/[A-Za-z0-9/_-]+", url):
        print("To nie wygląda na adres pingu (powinien zaczynać się od https://hc-ping.com/). Przerywam.")
        return 1

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=password(), timeout=30)

    def run(cmd: str, stdin_text: str | None = None, timeout: int = 60) -> str:
        i, o, e = cli.exec_command(cmd, timeout=timeout)
        if stdin_text is not None:
            i.write(stdin_text)
            i.channel.shutdown_write()
        return o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")

    levels = run("curl -s http://127.0.0.1:40141/api/state | python3 -c "
                 "\"import sys,json;d=json.load(sys.stdin)['fusion']['voivodeships'];"
                 "print(sorted({v['level'] for v in d.values()}))\"").strip()
    if levels != "['none']":
        print(f"Trwa podwyższony poziom ({levels}) — nie restartuję usługi. Spróbuj później.")
        return 1

    print(run("python3 -c " + "'" + REMOTE_WRITE.replace("'", "'\\''") + "'", stdin_text=url).strip())
    print(run("stat -c '%a %U:%G' /opt/straznik/backend/.env").strip(), "(powinno być 640 root:straznik)")
    run("systemctl restart straznik")
    print("Usługa zrestartowana, czekam na pierwszy ping (do 3 min)...")

    for _ in range(36):
        time.sleep(5)
        raw = run("curl -s -m 5 http://127.0.0.1:40141/api/health")
        try:
            hb = json.loads(raw).get("heartbeat") or {}
        except ValueError:
            continue
        if not url and hb.get("enabled") is False:
            print("Pingowanie wyłączone.")
            return 0
        if hb.get("last_ok_ping"):
            print(f"OK: serwer wysłał ping o {hb['last_ok_ping']} UTC. W Healthchecks.io status zmieni się na „up”.")
            return 0
        if hb.get("error"):
            print(f"Błąd pingu: {hb['error']} (sprawdź adres).")
    print("Brak pingu po 3 minutach — sprawdź /api/health/critical (ping idzie tylko, gdy wszystko jest zielone).")
    cli.close()
    return 1


if __name__ == "__main__":
    sys.exit(main())
