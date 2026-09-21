#!/usr/bin/env python3
"""Kopia zapasowa Strażnika na VPS — co 6 h z cron (/etc/cron.d/straznik-backup).

Do 13.09.2026 nie było żadnej kopii: awaria dysku kasowała historię sygnałów od
2 sierpnia, subskrypcje powiadomień i klucze VAPID (bez nich wszystkie
subskrypcje przeglądarek przestają działać i każdy musiałby zapisać się od nowa).

Co wchodzi do kopii:
  * straznik.db — spójna kopia przez API backup SQLite (baza działa w trybie WAL,
    zwykłe skopiowanie pliku w trakcie zapisu dałoby uszkodzoną bazę),
  * vapid.json, fcm-service-account.json, .env — sekrety potrzebne do odtworzenia,
  * pliki stanu: pansa_seen.json, zones_since.json, official_alerts_seen.json, notice.json,
  * plik usługi systemd.

Przechowywanie (warstwowe, liczone od najnowszej kopii):
  * wszystkie z ostatnich 48 h (co 6 h),
  * jedna na dzień przez 30 dni,
  * jedna na tydzień przez 90 dni,
  * jedna na miesiąc przez 365 dni.

Sekrety (audyt bezpieczeństwa 16.09.2026): vapid.json, fcm-service-account.json,
.env i plik usługi trafiają do kopii jako `sekrety.tar.gpg`, zaszyfrowane kluczem
publicznym z /opt/straznik/kopie-klucz-publiczny.asc. Klucz prywatny jest tylko u
autora (nie na VPS), więc ani przejęta kopia na komputerze, ani kopia pobrana z
serwera nie daje klucza FCM, którym da się wysłać fałszywy alarm. Baza i pliki stanu
zostają nieszyfrowane — da się je odtworzyć bez klucza. Brak pliku klucza publicznego
= sekrety jawnym tekstem jak dotąd i `secrets_encrypted: false` w statusie.

Każda kopia jest sprawdzana (PRAGMA integrity_check) przed spakowaniem. Wynik
trafia do data/backup_status.json — pokazuje go /api/health (tylko z serwera).

Uruchomienie ręczne:  python3 /opt/straznik/scripts/backup_vps.py
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/opt/straznik")
DATA = ROOT / "backend" / "data"
DEST = Path(os.getenv("STRAZNIK_BACKUP_DIR", "/var/backups/straznik"))
STATUS = Path(os.getenv("STRAZNIK_BACKUP_STATUS", str(DATA / "backup_status.json")))
FILES = ["pansa_seen.json", "zones_since.json", "official_alerts_seen.json", "notice.json"]


def _sekrety() -> list[tuple[Path, str]]:
    """Pliki, bez których nie da się postawić Strażnika od zera.

    Do 20.09.2026 był tu jeden plik usługi. Po rozbiciu na writera i readera serwer
    to już układ: dwie usługi, nakładka z rolą, tunel z kierowaniem po ścieżkach i jego
    poświadczenia — bez nich odtworzona baza leży na maszynie, do której nikt nie
    trafi, bo domena nie wie, dokąd kierować. Odtwarzanie ma być przepisaniem plików,
    a nie odtwarzaniem z pamięci, jak to było składane.

    Wszystko to trafia do zaszyfrowanej części: poświadczenia tunelu pozwalają
    podszyć się pod straznik.eu, a klucz FCM — wysłać fałszywy alarm na wszystkie
    telefony. Nazwy w archiwum są spłaszczone, więc muszą być rozróżnialne.
    """
    pary: list[tuple[Path, str]] = []

    def dodaj(sciezka: Path, nazwa: str | None = None) -> None:
        if sciezka.exists():
            pary.append((sciezka, nazwa or sciezka.name))

    dodaj(DATA / "vapid.json")
    dodaj(DATA / "fcm-service-account.json")
    dodaj(ROOT / "backend" / ".env")
    for usluga in ("straznik.service", "straznik-reader.service", "straznik-tunnel.service",
                   "straznik-watchdog.service", "straznik-watchdog.timer"):
        dodaj(Path("/etc/systemd/system") / usluga)
    for nakladka in sorted(Path("/etc/systemd/system/straznik.service.d").glob("*.conf")):
        dodaj(nakladka, "straznik.service.d--" + nakladka.name)
    dodaj(Path("/etc/cloudflared-straznik/config.yml"), "cloudflared-config.yml")
    for pos in sorted(Path("/root/.cloudflared").glob("*.json")):
        dodaj(pos, "cloudflared-poswiadczenia-" + pos.name)
    dodaj(Path("/etc/cron.d/straznik-backup"), "cron-straznik-backup")
    return pary

RECIPIENT = Path(os.getenv("STRAZNIK_BACKUP_RECIPIENT", str(ROOT / "kopie-klucz-publiczny.asc")))
PREFIX = "straznik-"
SUFFIX = ".tar.zst"


def stamp_of(name: str) -> datetime | None:
    try:
        return datetime.strptime(name[len(PREFIX):-len(SUFFIX)], "%Y%m%d-%H%M").replace(
            tzinfo=timezone.utc)
    except ValueError:
        return None


def keep_set(names: list[str], now: datetime) -> set[str]:
    """Które kopie zostają. Z każdego koszyka (dzień/tydzień/miesiąc) — najnowsza."""
    dated = sorted(((stamp_of(n), n) for n in names if stamp_of(n)), reverse=True)
    keep, seen = set(), set()
    for ts, name in dated:
        age_h = (now - ts).total_seconds() / 3600
        if age_h <= 48:
            keep.add(name)
            continue
        # Warstwę wyznacza WIEK kopii. Druga kopia z tego samego dnia nie może
        # „przeskoczyć” do wolnego koszyka tygodniowego — tak wychodziło 36 dziennych.
        if age_h <= 30 * 24:
            bucket = ts.strftime("d%Y%m%d")
        elif age_h <= 90 * 24:
            bucket = "w%d-%02d" % ts.isocalendar()[:2]
        elif age_h <= 365 * 24:
            bucket = ts.strftime("m%Y%m")
        else:
            continue
        if bucket not in seen:
            seen.add(bucket)
            keep.add(name)
    return keep


def write_status(**fields):
    try:
        STATUS.write_text(json.dumps(fields, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def main() -> int:
    t0 = time.time()
    now = datetime.now(timezone.utc)
    DEST.mkdir(parents=True, exist_ok=True)
    os.chmod(DEST, 0o700)
    name = f"{PREFIX}{now:%Y%m%d-%H%M}{SUFFIX}"
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "straznik"
        work.mkdir()
        src = sqlite3.connect(f"file:{DATA / 'straznik.db'}?mode=ro", uri=True)
        dst = sqlite3.connect(work / "straznik.db")
        src.backup(dst)
        src.close()
        check = dst.execute("PRAGMA integrity_check").fetchone()[0]
        counts = {t: dst.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in ("signals", "push_subs", "snapshots", "notif_log")}
        dst.close()
        if check != "ok":
            write_status(ok=False, at=now.isoformat(), error=f"integrity_check: {check}")
            print("BŁĄD: kopia bazy nie przeszła integrity_check:", check, file=sys.stderr)
            return 1
        # Dziennik stealth (E3): osobna baza, ta sama spójna kopia przez API backup.
        if (DATA / "obserwacje.db").exists():
            src = sqlite3.connect(f"file:{DATA / 'obserwacje.db'}?mode=ro", uri=True)
            dst = sqlite3.connect(work / "obserwacje.db")
            src.backup(dst)
            src.close()
            dst.close()
        for f in FILES:
            if (DATA / f).exists():
                shutil.copy2(DATA / f, work / f)
        secrets = _sekrety()
        encrypted = RECIPIENT.exists()
        if encrypted:
            plain = Path(tmp) / "sekrety.tar"
            with tarfile.open(plain, "w") as tar:
                for sciezka, nazwa in secrets:
                    tar.add(sciezka, arcname=nazwa)
            gnupg_home = Path(tmp) / "gnupg"
            gnupg_home.mkdir(mode=0o700)
            subprocess.run(["gpg", "--homedir", str(gnupg_home), "--batch", "--yes", "--quiet",
                            "--trust-model", "always", "--recipient-file", str(RECIPIENT),
                            "--output", str(work / "sekrety.tar.gpg"), "--encrypt", str(plain)],
                           check=True)
            plain.unlink()
        else:
            for sciezka, nazwa in secrets:
                shutil.copy2(sciezka, work / nazwa)
        (work / "MANIFEST.json").write_text(json.dumps(
            {"created": now.isoformat(), "counts": counts, "secrets_encrypted": encrypted,
             "files": sorted(x.name for x in work.iterdir())}, ensure_ascii=False, indent=1),
            encoding="utf-8")
        tar_path = Path(tmp) / "kopia.tar"
        with tarfile.open(tar_path, "w") as tar:
            tar.add(work, arcname="straznik")
        partial = DEST / (name + ".part")
        subprocess.run(["zstd", "-q", "-19", "-T0", "-f", str(tar_path), "-o", str(partial)],
                       check=True)
        os.chmod(partial, 0o600)
        partial.replace(DEST / name)

    names = [p.name for p in DEST.glob(f"{PREFIX}*{SUFFIX}")]
    keep = keep_set(names, now)
    removed = 0
    for n in names:
        if n not in keep:
            (DEST / n).unlink(missing_ok=True)
            removed += 1
    size = (DEST / name).stat().st_size
    write_status(ok=True, at=now.isoformat(), file=name, size=size, counts=counts,
                 secrets_encrypted=encrypted,
                 kept=len(keep), removed=removed, took_s=round(time.time() - t0, 1))
    print(f"OK {name} {size / 1048576:.1f} MB, zostaje {len(keep)}, usunięto {removed}, "
          f"{counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
