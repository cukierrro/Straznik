"""Telegram LRT (kanał rosyjskojęzyczny) — alarmy powietrzne na Litwie. TRYB CIENIA.

Noc 10/11.11.2026: czerwony alarm w Druskienikach i Łoździejach (22:45 UTC, tuż przy
Polsce), a potem w okręgu Mariampol (23:19), Strażnik przegapił w całości. 15min.lt
odpowiadał 403, a LRT zmieniał tylko tytuł jednego żywego artykułu. Ten kanał
podał oba alarmy w tej samej minucie, w której ogłosiło je NKVC. Z niego korzysta
też oropavojus.lt („LT-Alert (LRT Telegram)”).

Decyzja usera 11.11.2026: tydzień obserwacji BEZ PUNKTÓW. Kolektor tylko zapisuje
do dziennika obserwacji (`stealth`, rodzaj `lt_telegram`): kiedy wpis się ukazał,
kiedy go zobaczyliśmy, co ogłasza (alarm / odwołanie, poziom, okręgi, czy przy
granicy z Polską). Po tygodniu porównanie z mediami bałtyckimi — dopiero wtedy
decyzja, czy i jak punktować. Nic stąd nie trafia do fuzji ani do powiadomień.

Czytamy publiczny podgląd kanału (t.me/s/…), ten sam, który widzi każdy w
przeglądarce. Treść wpisu traktujemy jak niezaufany tekst: tylko klasyfikacja
słowami kluczowymi, nic nie jest wykonywane ani wstawiane jako HTML.
"""
import asyncio
import html
import logging
import re
import time
from datetime import datetime

import httpx

from .. import config, stealth

log = logging.getLogger("telegram_lt")

UA = "Mozilla/5.0 (compatible; StraznikBot/1.0; obserwacja kanalu publicznego)"
status = {"ok": False, "last": None, "error": None, "mode": "shadow",
          "enabled": config.LT_TELEGRAM_ENABLED, "url": config.LT_TELEGRAM_URL,
          "last_post": None, "observed": []}

_POST_RE = re.compile(r'data-post="([A-Za-z0-9_]+)/(\d+)"')
_TEXT_RE = re.compile(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', re.S)
_TIME_RE = re.compile(r'<time[^>]*datetime="([^"]+)"')
_TAG_RE = re.compile(r"<[^>]+>")

# Słowa po rosyjsku (kanał rosyjskojęzyczny) i na wszelki wypadek po litewsku.
_ALARM = ("тревог", "воздушной опасности", "уровень опасности",
          "в укрыти", "укрытие", "oro pavoj")
_ODWOLANIE = ("отмен", "атшаук", "atšauk", "atsauk", "тревога снята", "отбой")
_CZERWONY = ("красн", "raudon")
_ZOLTY = ("жёлт", "желт", "вероятн", "geltona", "tikėtin")
# Okręgi po rosyjsku — przymiotnik „-ский”, żeby „министр Робертас Каунас” nie był okręgiem.
_OKREGI = {
    "алитусск": "Alytaus", "мариямпольск": "Marijampolės", "вильнюсск": "Vilniaus",
    "утенск": "Utenos", "каунасск": "Kauno", "паневежск": "Panevėžio",
    "шяуляйск": "Šiaulių", "таурагск": "Tauragės", "тельшяйск": "Telšių",
    "клайпедск": "Klaipėdos",
}
# Gminy na granicy z Polską i okręgi, w których leżą.
_PRZY_POLSCE = {"друскининк": "Druskininkai", "лаздия": "Lazdijai", "калвари": "Kalvarija",
                "вилкавишк": "Vilkaviškis"}
_OKREGI_PRZY_POLSCE = {"Alytaus", "Marijampolės"}


def wpisy(strona: str) -> list[dict]:
    """Wpisy z publicznego podglądu kanału: id, czas publikacji (ISO), tekst."""
    out = []
    starty = [m for m in _POST_RE.finditer(strona)]
    for i, m in enumerate(starty):
        koniec = starty[i + 1].start() if i + 1 < len(starty) else len(strona)
        blok = strona[m.end():koniec]
        t = _TEXT_RE.search(blok)
        czas = _TIME_RE.search(blok)
        tekst = html.unescape(_TAG_RE.sub(" ", t.group(1))) if t else ""
        out.append({"kanal": m.group(1), "id": int(m.group(2)),
                    "czas": czas.group(1) if czas else None,
                    "tekst": re.sub(r"\s+", " ", tekst).strip()})
    return out


def klasyfikuj(tekst: str) -> dict:
    """Co ogłasza wpis: rodzaj (alarm / odwołanie / inne), poziom, okręgi, granica z PL."""
    t = tekst.lower()
    alarm = any(w in t for w in _ALARM)
    odwolanie = alarm and any(w in t for w in _ODWOLANIE)
    okregi = sorted({v for k, v in _OKREGI.items() if k in t})
    gminy = sorted({v for k, v in _PRZY_POLSCE.items() if k in t})
    poziom = None
    if alarm and not odwolanie:
        poziom = ("czerwony" if any(w in t for w in _CZERWONY)
                  else "zolty" if any(w in t for w in _ZOLTY) else "nieznany")
    # 22:53 UTC 10.11: „вероятный дрон сейчас летит в сторону польской границы” — bez słowa
    # „тревога”, a dla nas najważniejsze zdanie nocy. Osobny rodzaj, do analizy po tygodniu.
    ku_polsce = (not alarm and any(w in t for w in ("польск", "польш"))
                 and any(w in t for w in ("дрон", "объект", "бпла")))
    return {"rodzaj": ("odwolanie" if odwolanie else "alarm" if alarm
                       else "kierunek_pl" if ku_polsce else "inne"),
            "poziom": poziom, "okregi": okregi, "gminy_przy_pl": gminy,
            "przy_polsce": bool(ku_polsce or gminy or (set(okregi) & _OKREGI_PRZY_POLSCE))}


def _sekundy(iso: str | None) -> float | None:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() if iso else None
    except ValueError:
        return None


def przetworz(strona: str, widziane: set[int], start: bool, teraz: float) -> int:
    """Zapisuje nowe wpisy alarmowe do dziennika. Zwraca liczbę nowych zapisów."""
    nowe = 0
    for w in wpisy(strona):
        if w["id"] in widziane:
            continue
        widziane.add(w["id"])
        k = klasyfikuj(w["tekst"])
        if k["rodzaj"] == "inne":
            continue
        opublikowano = _sekundy(w["czas"])
        dane = {**k, "post": f'{w["kanal"]}/{w["id"]}', "opublikowano": w["czas"],
                "zobaczono": datetime.fromtimestamp(teraz).astimezone().isoformat(timespec="seconds"),
                # po starcie procesu opóźnienie nic nie mówi — wpis mógł wisieć od godzin
                "opoznienie_s": None if start or opublikowano is None else round(teraz - opublikowano),
                "przy_starcie": start, "tekst": w["tekst"][:400]}
        if stealth.record("lt_telegram", dane["post"], dane, ts=teraz):
            nowe += 1
            status["observed"] = ([{"post": dane["post"], "rodzaj": k["rodzaj"], "poziom": k["poziom"],
                                    "okregi": k["okregi"], "przy_polsce": k["przy_polsce"],
                                    "opublikowano": w["czas"]}] + status["observed"])[:20]
            if not start:
                log.info("TELEGRAM LT (cień): %s %s okręgi=%s przy PL=%s post=%s",
                         k["rodzaj"], k["poziom"] or "", ",".join(k["okregi"]) or "-",
                         k["przy_polsce"], dane["post"])
        status["last_post"] = dane["post"]
    return nowe


async def run():
    if not config.LT_TELEGRAM_ENABLED:
        status.update(enabled=False)
        while True:                       # nadzorca nie wznawia zadania co kilka sekund
            await asyncio.sleep(3600)
    widziane: set[int] = set()
    start = True
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        while True:
            try:
                r = await client.get(config.LT_TELEGRAM_URL, headers={"User-Agent": UA})
                r.raise_for_status()
                if "tgme_widget_message" not in r.text:
                    raise ValueError("strona bez wpisów kanału (zmiana formatu albo blokada)")
                przetworz(r.text, widziane, start, time.time())
                start = False
                status.update(ok=True, last=time.time(), error=None)
            except Exception as exc:              # noqa: BLE001
                status.update(ok=False, error=repr(exc)[:200])
                log.warning("Telegram LT: %r", exc)
            await asyncio.sleep(config.LT_TELEGRAM_INTERVAL)
