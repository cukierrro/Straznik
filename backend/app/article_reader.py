"""Czytanie całego artykułu przed przyznaniem punktów za media.

Tytuł i zajawka z RSS nie wystarczają. 13.09.2026 artykuły o porannych syrenach
(„W sześciu powiatach zawyły syreny", „Atak dronów kilkaset metrów od granicy")
wychodziły godzinami po zdarzeniu i dostawały punkty, jakby działo się to teraz.
Pierwszy akapit mówił wprost: „Przed świtem… przed godziną 4 rano".

Zasada (decyzja użytkownika z 13.09.2026):
  • artykuł przeczytany i opisujący coś świeżego → normalne punkty,
  • artykuł przeczytany, ale o zdarzeniu sprzed ponad godziny → 0 pkt i etykieta,
  • artykułu nie da się przeczytać → 0 pkt, zostaje w panelu z linkiem.

Google News przekierowuje każdy link na stronę zgody Google na pliki cookie,
której NIE akceptujemy. Zamiast tego szukamy tego samego tytułu w kanale RSS
redakcji, którą Google podaje jako źródło, i czytamy artykuł u niej.
"""
import html
import logging
import re
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import asyncio
import ipaddress
import socket

import feedparser
import httpx

log = logging.getLogger("article")

WARSAW = ZoneInfo("Europe/Warsaw")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CACHE_S = 3 * 3600           # ten sam artykuł wraca w każdym obiegu RSS
FEED_CACHE_S = 10 * 60
MAX_BYTES = 2_500_000
PAST_AFTER_MIN = 60           # zdarzenie starsze niż okno fuzji to relacja, nie meldunek
PUBLISHER_FEED_PATHS = ("/feed/", "/rss", "/rss.xml", "/feed", "/rss/", "/feed.xml")

_cache: dict[str, tuple[float, dict]] = {}
_feed_cache: dict[str, tuple[float, list]] = {}
status = {"read": 0, "past": 0, "unreadable": 0, "last_error": None}


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower()).replace("ł", "l")
    return "".join(c for c in s if not unicodedata.combining(c))


def _title_key(title: str, publisher: str = "") -> str:
    t = title or ""
    if publisher and t.endswith(" - " + publisher):
        t = t[: -len(publisher) - 3]
    t = re.sub(r"\s+-\s+[^-]{2,60}$", "", t) if not publisher else t
    return " ".join(re.findall(r"[a-z0-9]+", _fold(t)))


def _similar(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    wa, wb = set(a.split()), set(b.split())
    return len(wa & wb) / max(1, min(len(wa), len(wb))) >= 0.8


# ── wyciąganie treści ────────────────────────────────────────────────────────
_CONTENT_CLASS = re.compile(
    r"(?is)<(div|section|article)[^>]+class=\"[^\"]*(entry-content|post-content|article-body|"
    r"article__body|articleBody|td-post-content|single-content|news-content|article-content|"
    r"content-text|art-text|text-content)[^\"]*\"[^>]*>")
_BOILERPLATE = ("cookie", "polityka prywatnosci", "wyrazam zgode", "newsletter", "czytaj tez",
                "czytaj takze", "zobacz tez", "wszelkie prawa", "subskryb")


def extract(page: str) -> tuple[list[str], str | None]:
    """Akapity treści i czas publikacji z metadanych strony."""
    # Tylko znaczniki z GODZINĄ i najpóźniejszy z nich: lublin112.pl ma jako
    # pierwsze „datePublished" datę założenia portalu (2013-02-09), przez co
    # godziny z treści porównywały się z 2013 rokiem.
    stamps = []
    for pat in (r'article:published_time"\s+content="([^"]+)"',
                r'"datePublished"\s*:\s*"([^"]+)"',
                r'<time[^>]+datetime="([^"]+)"'):
        stamps += [s for s in re.findall(pat, page) if "T" in s]
    published = max(stamps) if stamps else None
    clean = re.sub(r"(?is)<(script|style|noscript|nav|footer|aside|form)[^>]*>.*?</\1>", " ", page)

    def paragraphs(body: str) -> list[str]:
        out = []
        for raw in re.findall(r"(?is)<p[^>]*>(.*?)</p>", body):
            text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw))).strip()
            if len(text) >= 40 and not any(b in _fold(text) for b in _BOILERPLATE):
                out.append(text)
            if len(out) >= 25:
                break
        return out

    # Najpierw kontener treści; gdy trafi na pusty (np. listę powiązanych
    # artykułów u dołu strony), cała strona.
    m = _CONTENT_CLASS.search(clean)
    paras = paragraphs(clean[m.start():]) if m else []
    if len(paras) < 2:
        paras = paragraphs(clean)
    return paras, published


# ── ocena: świeże zdarzenie czy relacja z wcześniejszego ─────────────────────
_ONGOING = ("nadal trwa", "wciaz trwa", "trwa alarm", "trwa operowanie", "w tej chwili",
            "przed chwila", "wlasnie teraz", "na biezaco", "relacja na zywo")
_NIGHT = ("w nocy", "noca", "przed switem", "nad ranem", "o swicie", "w nocy z", "w srodku nocy")
_WEEKDAYS = {"w poniedzialek": 0, "we wtorek": 1, "w srode": 2, "w czwartek": 3,
             "w piatek": 4, "w sobote": 5, "w niedziele": 6}
# Godzina zdarzenia w treści: „o godz. 4.19", „godzinie 4", „o 4:30", „około 4:30",
# „przed 4 rano". Samo „4.19" bez słowa przed nim pomijamy — to zbyt często data.
_HOUR = re.compile(
    r"(?:\bgodz(?:ina|iny|inie|\.)?\s*"
    r"|\bo\s+(?=\d{1,2}[:.]\d{2})"
    r"|\bokolo\s+(?=\d{1,2}[:.]\d{2})"
    r"|\bok\.\s*(?=\d{1,2}[:.]\d{2})"
    r"|\bprzed\s+(?=\d{1,2}\s+rano)"
    r"|\bpo\s+(?=\d{1,2}[:.]\d{2}))"
    r"(\d{1,2})(?:[:.](\d{2}))?\b")


def assess(paras: list[str], published: datetime, now: datetime | None = None) -> tuple[str, str]:
    """("fresh" | "past", powód). `published` i `now` są strefowe."""
    lead = _fold(" ".join(paras))[:1500]
    pub = published.astimezone(WARSAW)
    if any(k in lead for k in _ONGOING):
        return "fresh", "treść mówi o trwającym zdarzeniu"
    if "wczoraj" in lead:
        return "past", "treść opisuje wczorajsze zdarzenie"
    for phrase, wd in _WEEKDAYS.items():
        if re.search(rf"\b{phrase}\b", lead) and wd != pub.weekday():
            return "past", f"treść opisuje zdarzenie z innego dnia („{phrase}”)"
    for m in _HOUR.finditer(lead):
        h, mi = int(m.group(1)), int(m.group(2) or 0)
        if h > 23 or mi > 59:
            continue
        event = pub.replace(hour=h, minute=mi, second=0, microsecond=0)
        if event > pub + timedelta(minutes=15):
            continue          # godzina z przyszłości to zapowiedź, nie czas zdarzenia
        age = (pub - event).total_seconds() / 60
        if age > PAST_AFTER_MIN:
            return "past", f"zdarzenie ok. godz. {h}:{mi:02d}, artykuł z {pub:%H:%M}"
        return "fresh", f"zdarzenie ok. godz. {h}:{mi:02d}"
    if any(k in lead for k in _NIGHT) and pub.hour >= 8:
        return "past", f"treść opisuje noc lub świt, artykuł z {pub:%H:%M}"
    if re.search(r"\b(dzis|dzisiaj)?\s*rano\b", lead) and pub.hour >= 11:
        return "past", f"treść opisuje poranek, artykuł z {pub:%H:%M}"
    return "fresh", "brak śladów wcześniejszego zdarzenia w treści"


# ── pobieranie ───────────────────────────────────────────────────────────────
# Adresy artykułów przychodzą z zewnątrz — z kanałów RSS i z Google News, gdzie
# link i adres wydawcy podaje obca strona. Dotąd serwer szedł za każdym z nich
# i za każdym przekierowaniem, więc dało się go skierować na 127.0.0.1 (nasze
# własne usługi) albo adresy sieci wewnętrznej. Audyt 26.09.2026.
MAX_PRZEKIEROWAN = 5


def _ip_publiczny(adres: str) -> bool:
    try:
        ip = ipaddress.ip_address(adres.split("%", 1)[0])     # „%eth0” przy IPv6 link-local
    except ValueError:
        return False
    return ip.is_global and not ip.is_multicast


async def _adres_dozwolony(url: str) -> bool:
    """Tylko http(s) i tylko do hostów, które rozwiązują się WYŁĄCZNIE do adresów
    publicznych — bez loopbacka, sieci prywatnych, link-local (w tym metadanych
    chmury 169.254.169.254) i adresów zarezerwowanych. Sprawdzane przed każdym
    skokiem przekierowania, bo publiczna strona może przekierować do środka."""
    try:
        u = httpx.URL(url)
    except Exception:  # noqa: BLE001 — każdy niepoprawny adres to po prostu „nie”
        return False
    if u.scheme not in ("http", "https") or not u.host or u.userinfo:
        return False
    port = u.port or (443 if u.scheme == "https" else 80)
    try:
        wyniki = await asyncio.get_running_loop().getaddrinfo(u.host, port, type=socket.SOCK_STREAM)
    except (OSError, UnicodeError):
        return False
    adresy = {w[4][0] for w in wyniki}
    return bool(adresy) and all(_ip_publiczny(a) for a in adresy)


async def _get(client: httpx.AsyncClient, url: str) -> httpx.Response | None:
    """GET z ręcznie obsłużonymi przekierowaniami i twardym limitem rozmiaru.

    Limit liczymy w trakcie pobierania, nie po nim — dotąd cała odpowiedź lądowała
    w pamięci i dopiero potem sprawdzaliśmy jej długość, więc złośliwy serwer mógł
    wcisnąć writerowi setki megabajtów (13.09 mieliśmy już awarię z braku pamięci).
    Zostaje świadome ograniczenie: adres rozwiązujemy przed połączeniem, a httpx
    rozwiązuje go jeszcze raz — przy podmianie DNS w tej chwili (DNS rebinding)
    sprawdzenie da się obejść. Skutek byłby ślepy (treść nie wraca do atakującego),
    więc na tym poprzestajemy."""
    try:
        for _ in range(MAX_PRZEKIEROWAN + 1):
            if not await _adres_dozwolony(url):
                status["last_error"] = f"odrzucony adres: {url[:120]}"
                log.info("artykuł: odrzucony adres %s", url[:200])
                return None
            async with client.stream("GET", url, headers={"User-Agent": UA},
                                     follow_redirects=False, timeout=12) as r:
                if r.is_redirect:
                    url = str(r.url.join(r.headers.get("location", "")))
                    continue
                if r.status_code != 200:
                    return None
                deklarowana = r.headers.get("content-length", "")
                if deklarowana.isdigit() and int(deklarowana) > MAX_BYTES:
                    return None
                tresc = bytearray()
                async for kawalek in r.aiter_bytes():
                    tresc += kawalek
                    if len(tresc) > MAX_BYTES:
                        return None
                # aiter_bytes oddaje treść już rozpakowaną (gzip/br), więc do nowej
                # odpowiedzi przenosimy tylko typ z kodowaniem znaków — nagłówek
                # content-encoding kazałby httpx rozpakować ją drugi raz.
                naglowki = {"content-type": r.headers["content-type"]} if "content-type" in r.headers else {}
                return httpx.Response(200, headers=naglowki, content=bytes(tresc), request=r.request)
        status["last_error"] = f"za dużo przekierowań: {url[:120]}"
        return None
    except Exception as e:  # noqa: BLE001 — jedna nieudana strona nie może zatrzymać obiegu
        status["last_error"] = repr(e)[:160]
        return None


async def _feed_urls(client: httpx.AsyncClient, base: str) -> list[str]:
    """Kanały RSS redakcji: z nagłówka strony głównej, potem typowe adresy."""
    urls = []
    r = await _get(client, base + "/")
    if r is not None:
        for m in re.finditer(r'(?is)<link[^>]+type="application/(?:rss|atom)\+xml"[^>]*>',
                             r.text[:300_000]):
            href = re.search(r'href="([^"]+)"', m.group(0))
            if href:
                u = html.unescape(href.group(1))
                urls.append(u if u.startswith("http") else base + "/" + u.lstrip("/"))
    return urls[:4] + [base + p for p in PUBLISHER_FEED_PATHS]


async def _publisher_link(client: httpx.AsyncClient, title: str, publisher: str,
                          publisher_url: str) -> str | None:
    """Adres artykułu u redakcji, bez przechodzenia przez Google."""
    if not publisher_url or "google." in publisher_url:
        return None
    base = publisher_url.rstrip("/")
    key = _title_key(title, publisher)
    now = time.time()
    cached = _feed_cache.get(base)
    entries = cached[1] if cached and now - cached[0] < FEED_CACHE_S else None
    if entries is None:
        entries = []
        for feed_url in await _feed_urls(client, base):
            r = await _get(client, feed_url)
            if r is None:
                continue
            parsed = feedparser.parse(r.content)
            if parsed.entries:
                entries = [(e.get("title", ""), e.get("link", "")) for e in parsed.entries[:80]]
                break
        _feed_cache[base] = (now, entries)
    for t, link in entries:
        if link and _similar(key, _title_key(t)):
            return link
    return None


async def read_article(client: httpx.AsyncClient, link: str, title: str,
                       publisher: str = "", publisher_url: str = "",
                       feed_published: datetime | None = None) -> dict:
    """{"status": "fresh"|"past"|"unreadable", "url", "reason", "published"}."""
    now = time.time()
    hit = _cache.get(link)
    if hit and now - hit[0] < CACHE_S:
        return hit[1]
    url = link
    if "news.google.com" in (link or ""):
        url = await _publisher_link(client, title, publisher, publisher_url)
    result: dict
    if not url:
        result = {"status": "unreadable", "url": link,
                  "reason": "Google News bez dostępu do artykułu u redakcji"}
    else:
        r = await _get(client, url)
        paras, published_raw = extract(r.text) if r is not None else ([], None)
        if len(paras) < 2 or sum(len(p) for p in paras) < 250:
            result = {"status": "unreadable", "url": url,
                      "reason": "nie udało się pobrać treści artykułu"}
        else:
            # Data z RSS jest najpewniejsza; strona tylko wtedy, gdy kanał jej nie podał.
            published = feed_published
            if published is None:
                try:
                    published = datetime.fromisoformat(published_raw.replace("Z", "+00:00"))
                    if published.tzinfo is None:
                        published = published.replace(tzinfo=WARSAW)
                except Exception:
                    published = datetime.now(timezone.utc)
            verdict, reason = assess(paras, published)
            result = {"status": verdict, "url": url, "reason": reason,
                      "published": published.astimezone(timezone.utc).isoformat(timespec="seconds")}
    status["read" if result["status"] == "fresh" else result["status"]] += 1
    _cache[link] = (now, result)
    if len(_cache) > 500:
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:200]:
            _cache.pop(k, None)
    return result
