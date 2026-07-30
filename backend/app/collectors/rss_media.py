"""Warstwa 2c — media regionalne (RSS) per województwo.

Najsilniejszy pojedynczy sygnał potwierdzający (+2 pkt): relacja z ziemi.
Dopasowanie: słowo kluczowe alarmowe + (feed przypisany do województwa albo
nazwa województwa/miasta w tytule). Wykluczamy ćwiczenia/testy syren.
"""
import asyncio
import calendar
import hashlib
import logging
import time

import feedparser
import httpx

from .. import config, fusion
from ..textmatch import match_keywords

log = logging.getLogger("rss")

status = {"feeds": {}}  # url -> {"ok": bool, "last": ts, "error": str}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

MAX_AGE_S = 45 * 60   # ignoruj wpisy starsze niż 45 min (stare newsy ≠ sygnał "teraz")


def _match_keywords(text: str) -> list[str]:
    return match_keywords(text, config.ALERT_CRITICAL_KEYWORDS,
                          config.ALERT_AIR_KEYWORDS, config.ALERT_EVENT_KEYWORDS,
                          config.EXCLUDE_KEYWORDS)


def _match_voiv(text: str) -> str | None:
    tl = text.lower()
    for voiv, keys in config.VOIV_KEYWORDS.items():
        if any(k in tl for k in keys):
            return voiv
    return None


async def _check_feed(client: httpx.AsyncClient, url: str, default_voiv: str | None):
    st = status["feeds"].setdefault(url, {})
    try:
        r = await client.get(url, headers={"User-Agent": UA}, follow_redirects=True)
        r.raise_for_status()
        parsed = feedparser.parse(r.content)
        st.update(ok=True, last=time.time(), error=None)
    except Exception as e:
        st.update(ok=False, error=str(e))
        return

    now = time.time()
    for entry in parsed.entries[:30]:
        title = entry.get("title", "")
        summary = entry.get("summary", "") or entry.get("description", "")
        text = f"{title} {summary}"
        # wiek wpisu
        t = entry.get("published_parsed") or entry.get("updated_parsed")
        if t and now - calendar.timegm(t) > MAX_AGE_S:
            continue
        hits = _match_keywords(text)
        if not hits:
            continue
        voiv = _match_voiv(text) or default_voiv
        if not voiv:
            continue
        link = entry.get("link", "")
        dedup = "media:" + hashlib.sha1((link or title).encode()).hexdigest()[:16]
        await fusion.ingest(
            source="media", event_type="media_keywords", voivodeship=voiv,
            points=config.POINTS["media_keywords"],
            title=f"Media: „{title[:120]}”",
            details={"link": link, "keywords": hits, "feed": url},
            dedup_key=dedup,
        )


async def _check_baltic_feed(client: httpx.AsyncClient, url: str, country: str):
    """Media LT/LV/EE: incydent powietrzny u bałtyckich sąsiadów ⇒ +1 pkt
    dla podlaskiego i warmińsko-mazurskiego (kontekst, nie potwierdzenie)."""
    st = status["feeds"].setdefault(url, {})
    try:
        r = await client.get(url, headers={"User-Agent": UA}, follow_redirects=True)
        r.raise_for_status()
        parsed = feedparser.parse(r.content)
        st.update(ok=True, last=time.time(), error=None)
    except Exception as e:
        st.update(ok=False, error=str(e))
        return
    now = time.time()
    for entry in parsed.entries[:30]:
        title = entry.get("title", "")
        text = f"{title} {entry.get('summary', '')}".lower()
        t = entry.get("published_parsed") or entry.get("updated_parsed")
        if t and now - calendar.timegm(t) > MAX_AGE_S:
            continue
        hits = match_keywords(text, config.BALTIC_CRITICAL_KEYWORDS,
                              config.BALTIC_AIR_KEYWORDS, config.BALTIC_EVENT_KEYWORDS,
                              config.BALTIC_EXCLUDE_KEYWORDS)
        if not hits:
            continue
        link = entry.get("link", "")
        h = hashlib.sha1((link or title).encode()).hexdigest()[:16]
        for voiv in config.BALTIC_TARGET_VOIVS:
            await fusion.ingest(
                source="media", event_type="baltic_context", voivodeship=voiv,
                points=config.POINTS["baltic_context"],
                title=f"Media {country}: „{title[:110]}”",
                details={"link": link, "keywords": hits, "country": country},
                dedup_key=f"baltic:{h}:{voiv}",
            )


async def run():
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await asyncio.gather(
                *[_check_feed(client, url, voiv) for url, voiv in config.RSS_FEEDS],
                *[_check_baltic_feed(client, url, c) for url, c in config.BALTIC_FEEDS],
                return_exceptions=True,
            )
            await asyncio.sleep(config.RSS_INTERVAL)
