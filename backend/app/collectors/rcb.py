"""Warstwa 2d — komunikaty RCB (gov.pl/web/rcb), scraping listy aktualności.

gov.pl nie wystawia działającego RSS dla RCB (przekierowanie na portal główny),
więc parsujemy HTML listy wpisów. Przypisanie województwa: po słowach
kluczowych w tytule; jeśli brak — sygnał ogólnokrajowy trafia do województw
priorytetowych.
"""
import asyncio
import hashlib
import logging
import re
import time

import httpx

from .. import config, fusion
from ..textmatch import match_keywords

log = logging.getLogger("rcb")
status = {"ok": False, "last": None, "error": None}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# linki artykułów RCB: <a href="/web/rcb/tytul-wpisu">...>tytuł<...</a>
LINK_RE = re.compile(
    r'href="(/web/rcb/[a-z0-9-]{8,})"[^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")

_seen_bootstrap = False


def _match_voivs(text: str) -> list[str]:
    tl = text.lower()
    out = [v for v, keys in config.VOIV_KEYWORDS.items() if any(k in tl for k in keys)]
    return out or list(config.PRIORITY_VOIVODESHIPS)


async def _check(client: httpx.AsyncClient):
    global _seen_bootstrap
    try:
        r = await client.get(config.RCB_URL, headers={"User-Agent": UA},
                             follow_redirects=True)
        r.raise_for_status()
        status.update(ok=True, last=time.time(), error=None)
    except Exception as e:
        status.update(ok=False, error=str(e))
        return

    found = []
    for href, raw_title in LINK_RE.findall(r.text):
        title = TAG_RE.sub(" ", raw_title)
        title = re.sub(r"\s+", " ", title).strip()
        if not title or len(title) < 8:
            continue
        found.append((href, title))

    for href, title in found[:20]:
        # ta sama reguła co media: słowo krytyczne albo para obiekt+zdarzenie
        if not match_keywords(title, config.ALERT_CRITICAL_KEYWORDS,
                              config.ALERT_AIR_KEYWORDS, config.ALERT_EVENT_KEYWORDS,
                              config.EXCLUDE_KEYWORDS):
            continue
        dedup = "rcb:" + hashlib.sha1(href.encode()).hexdigest()[:16]
        if _seen_bootstrap:
            for voiv in _match_voivs(title):
                await fusion.ingest(
                    source="rcb", event_type="rcb_alert", voivodeship=voiv,
                    points=config.POINTS["rcb_alert"],
                    title=f"RCB: „{title[:120]}”",
                    details={"url": f"https://www.gov.pl{href}"},
                    dedup_key=f"{dedup}:{voiv}",
                )
        else:
            # pierwszy przebieg: zapisz istniejące wpisy bez punktów,
            # żeby stare komunikaty nie generowały fałszywego alarmu na starcie
            for voiv in _match_voivs(title):
                fusion.db.add_signal(
                    "rcb", "rcb_alert_seen", voiv, 0.0,
                    f"RCB (istniejący przy starcie): „{title[:120]}”",
                    {"url": f"https://www.gov.pl{href}"}, f"{dedup}:{voiv}")
    _seen_bootstrap = True


async def run():
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await _check(client)
            await asyncio.sleep(config.RCB_INTERVAL)
