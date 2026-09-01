"""Oficjalne alarmy państw bałtyckich — etap instrumentacyjny, bez punktów.

Na początek monitorujemy lekką listę aktualności łotewskich sił zbrojnych.
Cell Broadcast nie ma publicznego API, ale NBS publikuje osobne komunikaty
rozpoczęcia i zakończenia zagrożenia. Zbieramy czas pojawienia się wpisu, fazę
i adres; po kilku realnych zdarzeniach porównamy opóźnienie z LSM/EE-ALARM.
"""
import asyncio
import html
import json
import logging
import os
import re
import time
from urllib.parse import urljoin

import httpx

from .. import config

log = logging.getLogger("official_alerts")

LV_NEWS = "https://www.mil.lv/lv/zinas"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
_SEEN_PATH = config.DATA_DIR / "official_alerts_seen.json"
_ALERT_WORDS = ("apdraudēj", "gaisa telp", "bezpilota", "dron")
_CLEAR_WORDS = ("noslēdzies", "beidzies", "atcelts", "beigušies")

status = {"ok": False, "last": None, "error": None, "observed": []}


def _load_seen() -> set[str]:
    try:
        return set(json.loads(_SEEN_PATH.read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError):
        return set()


def _save_seen(seen: set[str]) -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _SEEN_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(sorted(seen)[-500:], ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, _SEEN_PATH)


def _extract(html_text: str) -> list[tuple[str, str]]:
    """(url, tytuł) z listy wiadomości; bez ciężkiej zależności HTML parsera."""
    out, used = [], set()
    pattern = re.compile(
        r'<a\b[^>]*href=["\'](?P<href>(?:https://www\.mil\.lv)?/lv/zinas/[^"\'#?]+)'
        r'["\'][^>]*>(?P<title>[\s\S]*?)</a>', re.I)
    for m in pattern.finditer(html_text):
        href = urljoin(LV_NEWS, html.unescape(m.group("href")))
        title = re.sub(r"<[^>]+>", " ", m.group("title"))
        title = html.unescape(re.sub(r"\s+", " ", title)).strip()
        if href in used or not title:
            continue
        used.add(href)
        out.append((href, title))
    return out


def _phase(title: str) -> str | None:
    tl = title.lower()
    if not any(w in tl for w in _ALERT_WORDS):
        return None
    return "clear" if any(w in tl for w in _CLEAR_WORDS) else "start"


async def _tick(client: httpx.AsyncClient, seen: set[str], bootstrapped: bool) -> bool:
    try:
        r = await client.get(LV_NEWS, headers={"User-Agent": UA}, follow_redirects=True)
        r.raise_for_status()
        entries = _extract(r.text)
        now = time.time()
        status.update(ok=True, last=now, error=None)
        for href, title in entries:
            if href in seen:
                continue
            seen.add(href)
            phase = _phase(title)
            if bootstrapped and phase:
                item = {"ts": now, "country": "LV", "phase": phase,
                        "title": title[:180], "url": href}
                status["observed"] = ([item] + status["observed"])[:20]
                log.info("OFICJALNY LV nowy: faza=%s tytuł=%s url=%s",
                         phase, title, href)
        _save_seen(seen)
        return True
    except Exception as exc:
        status.update(ok=False, error=repr(exc))
        log.warning("Oficjalne alerty LV błąd: %r", exc)
        return bootstrapped


async def run():
    seen = _load_seen()
    bootstrapped = bool(seen)
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            bootstrapped = await _tick(client, seen, bootstrapped)
            await asyncio.sleep(config.OFFICIAL_ALERTS_INTERVAL)
