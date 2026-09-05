"""Metadane najnowszego APK z GitHub Releases, z krótkim cache po stronie VPS."""
import asyncio
import re
import time

import httpx

LATEST_URL = "https://api.github.com/repos/cukierrro/Straznik/releases/latest"
CACHE_SECONDS = 15 * 60
_cache: dict = {"at": 0.0, "data": None}
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


async def latest() -> dict:
    now = time.time()
    if _cache["data"] and now - _cache["at"] < CACHE_SECONDS:
        return _cache["data"]
    async with _lock:
        now = time.time()
        if _cache["data"] and now - _cache["at"] < CACHE_SECONDS:
            return _cache["data"]
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(
                LATEST_URL,
                headers={"Accept": "application/vnd.github+json",
                         "User-Agent": "Straznik-Update-Metadata"},
            )
            response.raise_for_status()
        data = _release_data(response.json())
        _cache.update(at=now, data=data)
        return data
