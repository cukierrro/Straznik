# -*- coding: utf-8 -*-
"""Pobiera kopie zapasowe Strażnika z VPS na ten komputer (Harmonogram zadań Windows).

Kopia tylko na VPS nie chroni przed awarią dysku ani utratą serwera. Zadanie
„Straznik - kopie zapasowe” uruchamia ten skrypt codziennie i przy logowaniu;
pobiera brakujące pliki i usuwa lokalnie te, których VPS już nie trzyma
(przechowywanie warstwowe liczy scripts/backup_vps.py).

Bezpiecznik: jeśli na VPS nie ma ani jednej kopii (np. serwer padł albo katalog
zniknął), niczego lokalnie nie usuwamy na podstawie listy z VPS.

Twardy limit wieku (21.10.2026): kopie starsze niż MAX_WIEK_DNI usuwamy zawsze,
także przy zadziałaniu bezpiecznika. Polityka prywatności obiecuje, że kopie
(z subskrypcjami powiadomień w przeglądarce) leżą najwyżej 12 miesięcy — również
wtedy, gdyby serwer zniknął na dobre i lustro przestało się aktualizować.

Kopie zawierają sekrety (.env, klucze VAPID i FCM) — katalog docelowy jest tylko
na tym komputerze i nie może trafić do repozytorium.

Użycie:  py scripts/pobierz_kopie.py [katalog]
"""
import io
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

REMOTE = "/var/backups/straznik"
LOCAL = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Documents" / "Straznik-kopie"
LOG = LOCAL / "pobieranie.log"
MAX_WIEK_DNI = 365   # jak najstarsza warstwa w scripts/backup_vps.py i obietnica w polityce prywatności


def log(msg: str):
    LOCAL.mkdir(parents=True, exist_ok=True)
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line)
    with io.open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def za_stare(names, now: datetime) -> list[str]:
    """Kopie starsze niż MAX_WIEK_DNI, po dacie z nazwy straznik-RRRRMMDD-GGMM.tar.zst (UTC).
    Nazwa bez czytelnej daty nie jest usuwana — nie zgadujemy."""
    granica = now - timedelta(days=MAX_WIEK_DNI)
    stare = []
    for name in names:
        if not (name.startswith("straznik-") and name.endswith(".tar.zst")):
            continue
        try:
            ts = datetime.strptime(name[len("straznik-"):-len(".tar.zst")], "%Y%m%d-%H%M")
        except ValueError:
            continue
        if ts.replace(tzinfo=timezone.utc) < granica:
            stare.append(name)
    return sorted(stare)


def usun_za_stare(now: datetime) -> int:
    # tylko zwykłe pliki leżące bezpośrednio w LOCAL — żadnych podkatalogów ani skrótów
    pliki = [p.name for p in LOCAL.glob("straznik-*.tar.zst") if p.is_file() and not p.is_symlink()]
    stare = za_stare(pliki, now)
    for name in stare:
        (LOCAL / name).unlink(missing_ok=True)
    if stare:
        log(f"Limit wieku {MAX_WIEK_DNI} dni: usunięto {len(stare)} (najstarsza {stare[0]})")
    return len(stare)


def main() -> int:
    import vps_ssh   # tu, nie na górze — test za_stare() nie potrzebuje paramiko
    LOCAL.mkdir(parents=True, exist_ok=True)
    usun_za_stare(datetime.now(timezone.utc))
    cli = vps_ssh.connect()   # klucz + przypięty klucz hosta, bez hasła
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
