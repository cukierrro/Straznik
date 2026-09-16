"""Białoruś — media na uchodźstwie w trybie cienia (16.09.2026). Bez punktów i mapy.

Decyzja usera: Zerkalo, Nasza Niwa i Biełsat (bez Nexty). Hajun nie działa od 02.2025,
a NEPTUN kończy śledzenie na granicy, więc sprawdzamy, czy te redakcje piszą o dronach
nad Białorusią dość szybko, żeby coś wnieść. Pomiar 12.09 i 14.09 dał opóźnienia
godzinne — stąd najpierw sam zapis:

  by_media — wpis o dronie/obiekcie nad Białorusią: źródło, publikacja, pierwsze
             zobaczenie, tagi (miejscowości, zachód: Brześć/Grodno, Polska, Litwa,
             relacja po fakcie), tekst.

Czytamy RSS i publiczne podglądy kanałów Telegram (t.me/s/…) — bez logowania, bez
bota, bez kontaktu z kimkolwiek na Białorusi (sprawa Hajuna: zgłaszający trafili do
więzień). Po kilku atakach porównamy czasy z wlotami z NEPTUN-a (kind „by_entry”)
i z alarmami w Polsce; punkty (jak Bałtyk 0,3–0,5) tylko, gdy źródło okaże się szybsze.
"""
import asyncio
import calendar
import hashlib
import html
import logging
import re
import time
from datetime import datetime

import feedparser
import httpx

from .. import config, stealth

log = logging.getLogger("by_media_shadow")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

status = {"sources": {}, "observed": []}
_seen: set[str] = set()


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text or "")).lower().replace("ё", "е")


def _hits(text: str, words) -> list[str]:
    return [w for w in words if w in text]


def classify(text: str) -> dict | None:
    """Tagi wpisu albo None, gdy to nie jest wiadomość o obiekcie w powietrzu nad Białorusią.

    Dron i Białoruś (miejscowość albo „nad/w Białorusi…”) muszą być w tym samym zdaniu:
    stopka Zerkalo („Попробуйте эту, из Беларуси — с VPN”) doklejała Białoruś do każdego
    wpisu o dronach nad Kijowem czy Saratowem."""
    t = _norm(text)
    if _hits(t, config.BY_SHADOW_DENY):
        return None
    drone, places, belarus = set(), set(), set()
    for part in re.split(r"(?<=[.!?…])\s+|\n+", html.unescape(text or "")):
        sent = _norm(part)
        d = _hits(sent, config.BY_SHADOW_DRONE_WORDS)
        if not d:
            continue
        pl = _hits(sent, config.BY_SHADOW_PLACES)
        by = _hits(sent, config.BY_SHADOW_BELARUS_WORDS)
        if pl or by:
            drone.update(d); places.update(pl); belarus.update(by)
    if not drone:
        return None
    return {"drone": sorted(drone), "places": sorted(places), "belarus": sorted(belarus),
            "west": bool(places & set(config.BY_SHADOW_WEST_PLACES)),
            "poland": bool(_hits(t, config.BY_SHADOW_POLAND_WORDS)),
            "lithuania": bool(_hits(t, config.BY_SHADOW_LITHUANIA_WORDS)),
            "retro": _hits(t, config.BY_SHADOW_RETRO_WORDS)}


def parse_telegram(page: str) -> list[dict]:
    """Wpisy z publicznego podglądu kanału: {post, text, published}."""
    out = []
    for block in page.split("tgme_widget_message_wrap")[1:]:
        post = re.search(r'data-post="([\w-]+/\d+)"', block)
        body = re.search(r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', block, re.S)
        when = re.findall(r'<time datetime="([^"]+)"', block)
        if not (post and body and when):
            continue
        text = re.sub(r"<br\s*/?>", "\n", body.group(1))
        text = html.unescape(re.sub(r"<[^>]+>", "", text)).strip()
        try:
            published = datetime.fromisoformat(when[-1]).timestamp()
        except ValueError:
            published = None
        out.append({"post": post.group(1), "text": text, "published": published})
    return out


def _store(source: str, key: str, text: str, link: str, pub: float | None,
           now: float, bootstrapped: bool) -> None:
    if key in _seen:
        return
    _seen.add(key)
    c = classify(text)
    if not c:
        return
    data = {**c, "source": source, "text": text[:600], "link": link,
            "published": stealth._iso(pub) if pub else None, "seen": stealth._iso(now),
            "lag_min": round((now - pub) / 60, 1) if pub else None,
            # pierwszy obieg po starcie: „seen” to restart, a nie chwila odkrycia
            "backlog": not bootstrapped}
    if stealth.record("by_media", key, data, ts=pub or now):
        status["observed"] = ([data] + status["observed"])[:20]
        log.info("BY media cień: %s lag=%s min zach=%s „%s”", source, data["lag_min"],
                 c["west"], text[:120].replace("\n", " "))


async def _telegram(client: httpx.AsyncClient, channel: str, bootstrapped: bool) -> None:
    st = status["sources"].setdefault(f"tg:{channel}", {})
    try:
        r = await client.get(f"https://t.me/s/{channel}", headers={"User-Agent": UA})
        r.raise_for_status()
        posts = parse_telegram(r.text)
    except Exception as exc:                      # noqa: BLE001
        st.update(ok=False, error=repr(exc)[:200])
        return
    now = time.time()
    st.update(ok=bool(posts), last=now, error=None if posts else "brak wpisów")
    for p in posts:
        _store(f"tg:{channel}", f"tg:{p['post']}", p["text"], f"https://t.me/{p['post']}",
               p["published"], now, bootstrapped)


async def _rss(client: httpx.AsyncClient, url: str, bootstrapped: bool) -> None:
    st = status["sources"].setdefault(url, {})
    try:
        r = await client.get(url, headers={"User-Agent": UA}, follow_redirects=True)
        r.raise_for_status()
    except Exception as exc:                      # noqa: BLE001
        st.update(ok=False, error=repr(exc)[:200])
        return
    parsed = feedparser.parse(r.content)
    now = time.time()
    st.update(ok=bool(parsed.entries), last=now, error=None if parsed.entries else "brak wpisów")
    for e in parsed.entries[:60]:
        link = e.get("link") or ""
        title = html.unescape(e.get("title") or "").strip()
        summary = re.sub(r"<[^>]+>", " ", e.get("summary") or "")
        pp = e.get("published_parsed") or e.get("updated_parsed")
        _store(url, "rss:" + hashlib.sha1((link or title).encode()).hexdigest()[:16],
               f"{title}\n{summary}", link, calendar.timegm(pp) if pp else None, now, bootstrapped)


async def run():
    bootstrapped = False
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await asyncio.gather(
                *(_telegram(client, c, bootstrapped) for c in config.BY_SHADOW_TELEGRAM),
                *(_rss(client, u, bootstrapped) for u in config.BY_SHADOW_FEEDS))
            bootstrapped = True
            if len(_seen) > 20000:
                _seen.clear()          # wpisy i tak są w bazie (INSERT OR IGNORE)
            await asyncio.sleep(config.BY_SHADOW_INTERVAL)
