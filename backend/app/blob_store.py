"""Przekazywanie gotowego stanu między procesem liczącym a podającym.

Rozbicie na dwie usługi (audyt Mikrusa 20.09.2026, punkt 11): `writer` zbiera dane,
liczy punktację i wysyła alarmy, a `reader` tylko podaje gotowe bajty telefonom.
Sens jest jeden: zawieszona obsługa połączeń nie może opóźniać alarmu, bo to jedyna
rzecz w tej aplikacji, która musi zdążyć.

Stan wędruje przez plik w pamięci (`/dev/shm`, czyli RAM — nie dysk), podmieniany
ATOMOWO: writer pisze do pliku tymczasowego i robi `rename`, więc reader widzi albo
starą wersję, albo nową, nigdy uciętej. Nie ma tu Redisa ani gniazda, bo nie ma
czego synchronizować — to jedna wartość nadpisywana w kółko.

Reader trzyma ostatnio wczytane bajty i sprawdza tylko czas modyfikacji pliku;
przy niezmienionym stanie kosztuje to jedno `stat` na zapytanie.
"""
import gzip
import json
import os
import time
from pathlib import Path

from . import config

KATALOG = Path(os.getenv("STRAZNIK_BLOB_DIR", "/dev/shm/straznik"))
_cache: dict[str, tuple[float, dict]] = {}     # nazwa -> (mtime, dane)
status = {"writes": 0, "reads": 0, "error": None, "dir": str(KATALOG)}


def gotowy() -> bool:
    return KATALOG.exists()


def _sciezka(name: str) -> Path:
    return KATALOG / f"{name}.blob"


def zapisz(name: str, raw: bytes, gz: bytes, etag: str) -> None:
    """Writer: nowa wersja gotowych bajtów. Podmiana atomowa (tmp + rename)."""
    try:
        KATALOG.mkdir(parents=True, exist_ok=True)
        docelowy = _sciezka(name)
        tmp = docelowy.with_suffix(".tmp")
        naglowek = json.dumps({"etag": etag, "raw": len(raw), "gz": len(gz),
                               "built": time.time()}, ensure_ascii=False).encode()
        # format: długość nagłówka (8 bajtów, dziesiętnie) + nagłówek + surowe + gzip
        with open(tmp, "wb") as f:
            f.write(b"%08d" % len(naglowek))
            f.write(naglowek)
            f.write(b"%08d" % len(raw))
            f.write(raw)
            f.write(gz)
        os.replace(tmp, docelowy)
        status["writes"] += 1
        status["error"] = None
    except Exception as exc:                    # noqa: BLE001
        status["error"] = repr(exc)[:200]


def wczytaj(name: str) -> dict | None:
    """Reader: bajty z pamięci, jeśli plik się nie zmienił; inaczej wczytanie."""
    p = _sciezka(name)
    try:
        mtime = p.stat().st_mtime
    except OSError:
        return None
    zapamietane = _cache.get(name)
    if zapamietane and zapamietane[0] == mtime:
        return zapamietane[1]
    try:
        dane = p.read_bytes()
        dl_nag = int(dane[:8])
        naglowek = json.loads(dane[8:8 + dl_nag])
        reszta = dane[8 + dl_nag:]
        dl_raw = int(reszta[:8])
        raw = reszta[8:8 + dl_raw]
        gz = reszta[8 + dl_raw:]
        wynik = {"raw": raw, "gz": gz, "etag": naglowek["etag"], "built": naglowek["built"]}
        _cache[name] = (mtime, wynik)
        status["reads"] += 1
        status["error"] = None
        return wynik
    except Exception as exc:                    # noqa: BLE001
        status["error"] = repr(exc)[:200]
        return None


def zapisz_health(payload: dict) -> None:
    """Stan kolektorów writera — reader dokłada go do własnego /api/health."""
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    zapisz("health", raw, gzip.compress(raw, compresslevel=1), str(time.time()))


def wczytaj_health() -> dict | None:
    blob = wczytaj("health")
    if not blob:
        return None
    try:
        return json.loads(blob["raw"])
    except ValueError:
        return None


def wiek_s(name: str = "state") -> float | None:
    """Ile sekund temu writer odświeżył ten blob (None, gdy go nie ma)."""
    blob = wczytaj(name)
    return None if not blob else max(0.0, time.time() - blob["built"])


ROLA = config.ROLE
