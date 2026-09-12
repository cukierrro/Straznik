"""Metadane najnowszego APK z GitHub Releases, z cache i awaryjnym zapasem na dysku.

GitHub bez tokenu daje 60 zapytań na godzinę NA ADRES IP, a VPS współdzieli adres z
innymi. Dlatego:
  * sukces jest trzymany w pamięci 15 min i zapisywany na dysk,
  * po błędzie przez 5 min w ogóle nie pytamy GitHuba (inaczej każdy telefon dokładałby
    się do wyczerpanego limitu),
  * gdy GitHub odmawia, oddajemy OSTATNIE ZNANE metadane z flagą `stale` zamiast 503 —
    numer wersji sprzed kwadransa jest dla użytkownika wart więcej niż „nie udało się
    sprawdzić”. Suma SHA-256 pochodzi z tego samego, podpisanego wydania, więc
    weryfikacja pobranego pliku w aplikacji działa tak samo.
Ustawienie `GITHUB_TOKEN` (dowolny token tylko do odczytu) podnosi limit do 5000/h.
"""
import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path

import httpx

from . import config

log = logging.getLogger(__name__)

LATEST_URL = "https://api.github.com/repos/cukierrro/Straznik/releases/latest"
CACHE_SECONDS = 15 * 60
FAILURE_BACKOFF_S = 5 * 60
STORE_PATH = Path(config.DATA_DIR) / "app_version.json"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()

_cache: dict = {"at": 0.0, "data": None, "failed_at": 0.0}
_lock = asyncio.Lock()


def _change_items(body: str) -> list[str]:
    """Krótkie, tekstowe punkty do pokazania w małym oknie aktualizacji."""
    clean = body.replace("<!-- critical-update -->", "")
    items: list[str] = []
    for raw in clean.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("<!--"):
            continue
        line = re.sub(r"^(?:[-*+]|•|\d+[.)])\s+", "", line)
        line = re.sub(r"!\[[^]]*]\([^)]*\)", "", line)
        line = re.sub(r"\[([^]]+)]\([^)]*\)", r"\1", line)
        line = re.sub(r"[*_`~]", "", line).strip()
        if line and line not in items:
            items.append(line[:180])
        if len(items) == 3:
            break
    return items


def _release_data(release: dict) -> dict:
    asset = next((a for a in release.get("assets", [])
                  if a.get("name") == "Straznik.apk"), None)
    if not asset:
        raise ValueError("W najnowszym wydaniu brakuje Straznik.apk")
    digest = str(asset.get("digest") or "")
    if not digest.startswith("sha256:") or len(digest) != 71:
        raise ValueError("Wydanie nie ma sumy SHA-256")
    body = str(release.get("body") or "")
    changes = _change_items(body)
    return {
        "version": str(release.get("tag_name") or "").removeprefix("v"),
        "tag": release.get("tag_name"),
        "url": asset.get("browser_download_url"),
        "sha256": digest.split(":", 1)[1].lower(),
        "size": int(asset.get("size") or 0),
        "critical": "<!-- critical-update -->" in body.lower(),
        "notes": body.replace("<!-- critical-update -->", "").strip()[:2000],
        "changes": changes,
        "publishedAt": release.get("published_at"),
    }


def _load_store() -> None:
    """Ostatnie znane metadane przeżywają restart usługi."""
    try:
        raw = json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return
    data, at = raw.get("data"), float(raw.get("at") or 0)
    if isinstance(data, dict) and data.get("version") and data.get("sha256"):
        # `at` z dysku traktujemy jako przeterminowane: pierwszy request odświeży
        # dane z GitHuba, ale gdyby się nie udało, mamy czym odpowiedzieć.
        _cache["data"] = data
        _cache["at"] = 0.0
        log.info("Metadane aktualizacji wczytane z dysku: %s (zapis %.0f)",
                 data.get("version"), at)


def _save_store(data: dict, at: float) -> None:
    try:
        STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STORE_PATH.write_text(json.dumps({"at": at, "data": data}, ensure_ascii=False),
                              encoding="utf-8")
    except Exception as exc:
        log.warning("Nie zapisano metadanych aktualizacji: %r", exc)


def _stale(data: dict) -> dict:
    return {**data, "stale": True}


async def _fetch() -> dict:
    headers = {"Accept": "application/vnd.github+json",
               "User-Agent": "Straznik-Update-Metadata"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        response = await client.get(LATEST_URL, headers=headers)
        response.raise_for_status()
    return _release_data(response.json())


async def latest() -> dict:
    now = time.time()
    if _cache["data"] and now - _cache["at"] < CACHE_SECONDS:
        return _cache["data"]
    async with _lock:
        now = time.time()
        if _cache["data"] and now - _cache["at"] < CACHE_SECONDS:
            return _cache["data"]
        if now - _cache["failed_at"] < FAILURE_BACKOFF_S:
            if _cache["data"]:
                return _stale(_cache["data"])
            raise RuntimeError("GitHub niedostępny — trwa przerwa po błędzie")
        try:
            data = await _fetch()
        except Exception as exc:
            _cache["failed_at"] = now
            log.warning("GitHub nie oddał metadanych wydania: %r", exc)
            if _cache["data"]:
                return _stale(_cache["data"])
            raise
        _cache.update(at=now, data=data, failed_at=0.0)
        _save_store(data, now)
        return data


_load_store()
