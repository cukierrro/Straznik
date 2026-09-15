"""Rumunia — tryb cienia: czy media podają alarm RO-ALERT dość szybko? Bez punktów i mapy.

Decyzja usera 15.09.2026: Rumunia ma być podświetlana tylko wtedy, gdy źródło mówi
o alarmie TERAZ, a nie o zdarzeniu sprzed 30 min–3 h. RO-ALERT nie ma publicznego
API (idzie tylko przez sieć komórkową), MApN publikuje komunikat po fakcie, ale z
dokładnymi godzinami („la ora 03.18 a fost transmis un mesaj RO-Alert”, „Alerta
aeriană a încetat la ora 5.18”). Zbieramy więc dwie rzeczy do stealth.obs:

  ro_alert_media     — tytuł medialny o alarmie: publikacja, pierwsze zobaczenie,
                       faza (start / clear / retro) i godziny z treści,
  ro_alert_reference — komunikat MApN z godzinami RO-ALERT i końca alarmu.

Po kilku zdarzeniach porównujemy: ile minut po RO-ALERT pojawia się pierwszy
artykuł „start”. Włączenie podświetlenia dopiero po tym pomiarze.
"""
import asyncio
import calendar
import hashlib
import html
import logging
import re
import time
import unicodedata
from datetime import datetime

import feedparser
import httpx

from .. import config, stealth

log = logging.getLogger("ro_shadow")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
MAPN_LIST = "https://www.mapn.ro/cpresa/index.php"

status = {"feeds": {}, "mapn": {"ok": None, "last": None, "error": None},
          "observed": [], "references": []}
_seen_links: set[str] = set()
_seen_mapn: set[str] = set()


def fold(text: str) -> str:
    """Małe litery bez znaków diakrytycznych (ș/ş → s, ă → a)."""
    t = unicodedata.normalize("NFKD", html.unescape(text or "").lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def _any(text: str, words) -> list[str]:
    return [w for w in words if w in text]


def classify(title: str, summary: str = "") -> dict | None:
    """Faza doniesienia albo None, gdy to nie jest informacja o alarmie w Rumunii."""
    t = fold(title)
    full = f"{t} {fold(re.sub(r'<[^>]+>', ' ', summary or ''))}"
    if _any(t, config.RO_SHADOW_DENY):
        return None
    ro_alert = _any(t, config.RO_SHADOW_ALERT_WORDS)
    drone_here = bool(_any(t, config.RO_SHADOW_DRONE_WORDS)
                      and _any(t, config.RO_SHADOW_PLACE_WORDS))
    if not (ro_alert or drone_here):
        return None
    if _any(t, config.RO_SHADOW_CLEAR_WORDS):
        phase = "clear"
    elif _any(full, config.RO_SHADOW_RETRO_WORDS):
        phase = "retro"
    else:
        phase = "start"
    return {"phase": phase, "hits": ro_alert + _any(t, config.RO_SHADOW_DRONE_WORDS)
            + _any(t, config.RO_SHADOW_PLACE_WORDS),
            "times": re.findall(r"\b(?:ora|orei|la)\s+(\d{1,2}[.:]\d{2})", full)[:6]}


def mapn_times(text: str) -> dict | None:
    """Godziny z komunikatu MApN: kolejne RO-ALERT i koniec alarmu."""
    t = fold(text)
    if "ro-alert" not in t:
        return None
    alerts, end = [], None
    for sent in re.split(r"(?<=[.!?])\s+(?=[A-ZĂÂÎȘȚ])", html.unescape(text)):
        s = fold(sent)
        # „în jurul orei 04.20” to wykrycie celu, nie wysłanie RO-ALERT — pomijamy
        hours = [m.group(2) for m in re.finditer(r"(\bin jurul\s+)?\bor(?:a|ei)\s+(\d{1,2}[.:]\d{2})", s)
                 if not m.group(1)]
        if "ro-alert" in s:
            alerts += hours
        if ("a incetat" in s or "s-a incheiat" in s) and hours:
            end = hours[-1]
    return {"ro_alert_at": alerts[:6], "end_at": end}


async def _feed(client: httpx.AsyncClient, url: str, bootstrapped: bool) -> None:
    st = status["feeds"].setdefault(url, {})
    try:
        r = await client.get(url, headers={"User-Agent": UA}, follow_redirects=True)
        r.raise_for_status()
    except Exception as exc:
        st.update(ok=False, error=repr(exc))
        return
    parsed = feedparser.parse(r.content)
    now = time.time()
    st.update(ok=bool(parsed.entries), last=now, error=None if parsed.entries else "brak wpisów")
    for e in parsed.entries[:60]:
        link = e.get("link") or ""
        title = html.unescape(e.get("title") or "").strip()
        key = hashlib.sha1((link or title).encode()).hexdigest()[:16]
        if key in _seen_links:
            continue
        _seen_links.add(key)
        c = classify(title, e.get("summary") or "")
        if not c:
            continue
        pp = e.get("published_parsed") or e.get("updated_parsed")
        pub = calendar.timegm(pp) if pp else None
        data = {**c, "title": title[:200], "link": link, "feed": url,
                "published": stealth._iso(pub) if pub else None, "seen": stealth._iso(now),
                "lag_min": round((now - pub) / 60, 1) if pub else None,
                # pierwszy obieg po starcie: „seen” to chwila restartu, a nie odkrycia
                # (stealth.record ignoruje wpis, który już jest w bazie)
                "backlog": not bootstrapped}
        stealth.record("ro_alert_media", key, data, ts=pub or now)
        status["observed"] = ([data] + status["observed"])[:20]
        log.info("RO cień: %s lag=%s min „%s”", c["phase"], data["lag_min"], title[:120])


async def _mapn(client: httpx.AsyncClient) -> None:
    st = status["mapn"]
    try:
        r = await client.get(MAPN_LIST, headers={"User-Agent": UA}, follow_redirects=True)
        r.raise_for_status()
        items = re.findall(r'href="(https://www\.mapn\.ro/cpresa/(\d+)_[^"]*)"[^>]*>\s*([^<]*?)\s*,\s*din\s+'
                           r'(\d{2}\.\d{2}\.\d{4})', r.text)
        st.update(ok=True, last=time.time(), error=None)
    except Exception as exc:
        st.update(ok=False, error=repr(exc))
        return
    for url, num, title, date in items[:10]:
        if num in _seen_mapn:
            continue
        _seen_mapn.add(num)
        try:
            page = await client.get(url, headers={"User-Agent": UA}, follow_redirects=True)
            text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", page.text))
        except Exception as exc:
            log.warning("MApN %s: %r", url, exc)
            continue
        times = mapn_times(text)
        if not times:
            continue
        data = {**times, "date": date, "title": html.unescape(title)[:120], "url": url,
                "seen": stealth._iso(time.time())}
        stealth.record("ro_alert_reference", num, data)
        status["references"] = ([data] + status["references"])[:10]
        log.info("RO cień MApN %s: RO-ALERT %s, koniec %s", date, times["ro_alert_at"], times["end_at"])


async def run():
    bootstrapped = False
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await asyncio.gather(*(_feed(client, u, bootstrapped) for u in config.RO_SHADOW_FEEDS),
                                 _mapn(client))
            bootstrapped = True
            await asyncio.sleep(config.RO_SHADOW_INTERVAL)
