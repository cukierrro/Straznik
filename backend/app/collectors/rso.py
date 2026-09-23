"""Warstwa 2e — oficjalne alerty RCB przez RSO (Regionalny System Ostrzegania).

Dlaczego osobno od `rcb.py`: tamten scrapuje ARTYKUŁY z gov.pl/web/rcb, a realne
„Alert RCB" (SMS/SPO) to broadcasty RSO — nie wpisy na stronie. Podczas ataku
20.08.2026 ludzie dostali oficjalny alert RCB, a Strażnik go nie widział, bo
scraper gov.pl go nie łapie. RSO agreguje te broadcasty i wystawia je publicznie
w JSON (bez tokenu) przez TVP: `komunikaty.tvp.pl/komunikatyxml/...`.

RSO niesie MNÓSTWO komunikatów niezwiązanych z zagrożeniem powietrznym (burze
IMGW, poziomy wód, drogi). Dlatego filtr jest wąski: komunikat musi być
POCHODZENIA RCB (prefiks „UWAGA! UWAGA! UWAGA!" / „Alert RCB" / „SPO-") ORAZ mieć
kontekst POWIETRZNY (atak powietrzny, dron, rakieta, naruszenie przestrzeni…).
Komunikat „zakończenie / odwołanie" nie alarmuje, ale jest zapisywany jako
`rso_clear` (0 pkt): fuzja gasi nim odwołany alert i artykuły, które go potem
tylko opisują. RSO potrafi zmienić istniejący wpis W MIEJSCU (ten sam id, nowa
treść), więc odwołanie rozpoznajemy także po zmianie wpisu — zawsze po TREŚCI.
"""
import asyncio
import hashlib
import logging
import time
import unicodedata

import httpx

from .. import config, fusion, rcb_reference, stealth

log = logging.getLogger("rso")
status = {"ok": False, "last": None, "error": None, "active": 0}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Komunikat musi POCHODZIĆ od RCB — to odsiewa IMGW/drogi/wodę, które też są w RSO.
RSO_ORIGIN = ("alert rcb", "uwaga! uwaga! uwaga", "uwaga!uwaga!uwaga",
              "spo-", "rcb/", " rcb ", "(rcb", "rcb ")
# …i mieć kontekst POWIETRZNY (RCB alarmuje też o powodziach, upałach itp.).
RSO_AIR = ("powietrzn", "z powietrza", "dron", "bezzałogow", "bezzalogow", "bsp",
           "shahed", "geran", "rakiet", "pocisk", "nalot", "ostrzał", "ostrzal",
           "obiekt lataj", "naruszenie przestrzeni", "myśliwc", "mysliwc",
           "obrony powietrzn", "obiekt powietrzn")
# Nie alarmujemy na komunikat KOŃCZĄCY zagrożenie / odwołanie.
RSO_END = ("zakończył", "zakonczyl", "zakończen", "zakonczen",
           # „Alert RCB zakończony" nie pasował do form powyżej i przechodził jako
           # nowy alarm; tak samo „zagrożenie minęło" (test 12.09.2026)
           "zakończon", "zakonczon", "odwoł", "odwol",
           "brak zagroż", "brak zagroz", "zniesion", "sytuacja opanowan",
           "zagrożenie minęł", "zagrozenie minel", "niebezpieczeństwo minęł",
           "niebezpieczenstwo minel")
# …ale te zwroty opisują alert WCIĄŻ OBOWIĄZUJĄCY i nie mogą go wyłączyć.
RSO_CONTINUES = ("do odwołania", "do odwolania", "do czasu odwołania",
                 "do czasu odwolania", "do czasu zakończenia", "do czasu zakonczenia",
                 "aż do odwołania", "az do odwolania")

_seen: set[str] = set()
_bootstrap = False


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).replace("ł", "l")


def _is_rcb_air_alert(text: str, headline: str | None = None) -> bool:
    """Czy to alert RCB o zagrożeniu z powietrza.

    Znaczniki KOŃCA zagrożenia szukamy wyłącznie w tytule i skrócie. Szukane w
    całej treści odrzucały prawdziwe alerty, bo sam alert często zawiera zwrot
    „obowiązuje do odwołania" albo „do czasu zakończenia" (audyt 11.09.2026).
    """
    t = (text or "").lower()
    head = (headline if headline is not None else text or "").lower()
    for cont in RSO_CONTINUES:      # zwroty TRWAJĄCEGO alertu, nie jego końca
        head = head.replace(cont, " ")
    if any(w in head for w in RSO_END):
        return False
    return any(o in t for o in RSO_ORIGIN) and any(a in t for a in RSO_AIR)


def _is_rcb_air_cancellation(it: dict) -> bool:
    """Odwołanie zagrożenia z powietrza od RCB.

    Rozpoznajemy WYŁĄCZNIE po treści (tytuł i skrót). 13.09.2026 wpis 23329799 dla
    lubelskiego zmienił się o 04:58 na „Odwołano zagrożenie atakiem z powietrza",
    a Strażnik liczył go dalej.

    Pole `rso_alarm` NIE oznacza odwołania (błędne założenie z 13.09): to stopień
    ostrzeżenia. 21.09.2026 aktywny Alert RCB 23354051 dla lubelskiego („Sytuacja jest
    monitorowana… Oczekuj dalszych komunikatów”, ważny 21:34–23:59) miał `rso_alarm` = 2
    i został wzięty za odwołanie — artykuły o nim zgasły, a alert nie dał punktów.
    W tym samym czasie `rso_alarm` = 2 miały burze, wezbrania rzek i „woda niezdatna
    do spożycia”, a 13.09 odwołanie miało 2, a alert 1.
    """
    text = f"{it.get('title','')} {it.get('shortcut','')} {it.get('content','')}".lower()
    if not (any(o in text for o in RSO_ORIGIN) and any(a in text for a in RSO_AIR)):
        return False
    head = f"{it.get('title','')} {it.get('shortcut','')}".lower()
    for cont in RSO_CONTINUES:
        head = head.replace(cont, " ")
    return any(w in head for w in RSO_END)


# slug_name z RSO (bez „ł"/diakrytyków?) → nasze nazwy województw
_VOIV_BY_FOLD = {_fold(v): v for v in config.VOIVODESHIPS}


def _voivs_for(item: dict) -> list[str]:
    out = []
    prov = item.get("provinces") or {}
    if isinstance(prov, dict):
        for p in prov.values():
            v = _VOIV_BY_FOLD.get(_fold((p or {}).get("slug_name") or (p or {}).get("name")))
            if v and v not in out:
                out.append(v)
    # brak przypisania → cała ściana wschodnia (alert ogólnokrajowy dotyczy nas)
    return out or list(config.PRIORITY_VOIVODESHIPS)


BOOTSTRAP_FRESH_MIN = 60


def _issued_recently(item: dict, minutes: int = BOOTSTRAP_FRESH_MIN) -> bool:
    """Czy alert wydano w ostatnich `minutes`. `valid_from` jest w czasie lokalnym
    PL bez strefy, więc porównujemy z lokalnym „teraz" (jak w `_still_active`)."""
    vf = item.get("valid_from")
    if not vf:
        return False
    try:
        from datetime import datetime, timedelta, timezone
        start = datetime.strptime(str(vf)[:19], "%Y-%m-%d %H:%M:%S")
        now_pl = (datetime.now(timezone.utc) + timedelta(hours=2)).replace(tzinfo=None)
        return start >= now_pl - timedelta(minutes=minutes)
    except Exception:
        return False


def _still_active(item: dict) -> bool:
    """Pomija komunikaty wygasłe. valid_to jest w czasie lokalnym PL (bez strefy),
    porównujemy z przybliżonym „teraz" lokalnym (UTC+2, lato) z zapasem."""
    vt = item.get("valid_to")
    if not vt:
        return True
    try:
        from datetime import datetime, timezone, timedelta
        end = datetime.strptime(str(vt)[:19], "%Y-%m-%d %H:%M:%S")
        now_pl = datetime.now(timezone.utc) + timedelta(hours=2)   # CEST, przybliżenie
        return end.replace(tzinfo=None) >= now_pl.replace(tzinfo=None) - timedelta(hours=1)
    except Exception:
        return True


# 14.09.2026 dwa razy (16:36, 18:01 UTC) TVP przekierowało zapytanie na własną
# stronę błędu (302 → /StatusCode/400 → 404), a kilka sekund później odpowiadało
# normalnie. Jedna ponowna próba łapie takie potknięcie w tym samym cyklu.
FETCH_RETRY_DELAY_S = 5


def rcb_level(text: str) -> int:
    """Poziom alertu RCB z jego treści: 1 informacja, 2 czujność, 3 szukaj schronienia.

    RCB rozdzieliło komunikaty 17.09.2026 (potwierdzone na gov.pl/web/rcb i w Sejmie).
    Liczba „UWAGA!" NIE rozstrzyga — alerty poziomu 1 też mają potrójne „UWAGA!".
    """
    t = (text or "").lower()
    for poziom in (3, 2):
        if any(m in t for m in config.RCB_LEVEL_MARKERS[poziom]):
            return poziom
    return 1


async def _fetch(client: httpx.AsyncClient):
    for attempt in (1, 2):
        try:
            r = await client.get(config.RSO_URL, headers={"User-Agent": UA},
                                 follow_redirects=True)
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt == 2:
                raise
            await asyncio.sleep(FETCH_RETRY_DELAY_S)


def _fail(error: str) -> None:
    # fail_streak: kolejne nieudane cykle; monitoring.rso_fresh zgłasza awarię
    # dopiero od drugiego z rzędu, dioda i szczegóły pokazują błąd od razu
    streak = status.get("fail_streak", 0) + 1
    status.update(ok=False, error=error, fail_streak=streak)
    # 17.09.2026 RSO padało przy syrenach, a w dzienniku nie było śladu — monitoring
    # zgłaszał awarię, której nie dało się potem odtworzyć. Logujemy początek awarii
    # i co 10. nieudany cykl, bez zalewania dziennika co minutę.
    if streak in (1, 2) or streak % 10 == 0:
        log.warning("RSO: nieudany cykl %d z rzędu: %s", streak, error[:200])


def _recovered() -> None:
    streak = status.get("fail_streak", 0)
    if streak:
        log.warning("RSO: znów działa po %d nieudanych cyklach", streak)


async def _check(client: httpx.AsyncClient):
    try:
        data = await _fetch(client)
    except Exception as e:
        _fail(repr(e))
        return
    # D2 (audyt 11.09.2026): „ok" było ustawiane PRZED obróbką, więc zmieniony
    # format odpowiedzi albo błąd bazy zostawiał zieloną diodę przy martwym RSO.
    # Teraz zielone dopiero po przeczytaniu całej listy.
    try:
        items = data.get("newses") if isinstance(data, dict) else None
        if not isinstance(items, list):
            raise ValueError(f"nieoczekiwany format odpowiedzi RSO: {type(data).__name__}")
        await _process(items)
    except Exception as e:
        _fail(f"obróbka: {e!r}")
        log.exception("RSO: błąd obróbki odpowiedzi")
        return
    _recovered()
    status.update(ok=True, last=time.time(), error=None, fail_streak=0)


async def _process(items: list):
    global _bootstrap
    active = 0
    item_errors = 0
    for it in items:
        try:
            if await _process_item(it):
                active += 1
        except Exception as e:                    # noqa: BLE001
            # jeden dziwny wpis nie może zablokować pozostałych alertów
            item_errors += 1
            log.warning("RSO: pominięty wpis %r: %s",
                        it.get("id") if isinstance(it, dict) else it, e)
    status["active"] = active
    status["item_errors"] = item_errors
    _bootstrap = True


# Etap alertu RCB po treści — TYLKO do obserwacji (decyzja usera 16.09.2026). Zwroty
# z alertów 20.08–16.09.2026; nieznane brzmienie trafia do dziennika jako „unknown”,
# żeby wyłapać zmiany formatu, zanim etap wpłynie na punktację.
STAGE_CLEAR = ("zakończył się", "zakonczyl sie", "odwołano", "odwolano", "brak zagrożenia",
               "brak zagrozenia")
STAGE_ACTION = ("udaj się w bezpieczne miejsce", "udaj sie w bezpieczne miejsce",
                "zagrożenie atakiem z powietrza", "zagrozenie atakiem z powietrza", "schron",
                "ukryj się", "ukryj sie", "pozostań w domu", "pozostan w domu",
                "stosuj się do poleceń", "stosuj sie do polecen")
STAGE_MONITOR = ("sytuacja jest monitorowana", "operuje polskie lotnictwo", "śledź komunikaty",
                 "sledz komunikaty", "oczekuj dalszych komunikatów", "oczekuj dalszych komunikatow",
                 "zachowaj czujność", "zachowaj czujnosc", "trwa zmasowany")


def alert_stage(text: str, rso_alarm=None) -> str:
    """'clear' | 'action' (etap 2) | 'monitor' (etap 1) | 'unknown'."""
    t = (text or "").lower()
    # rso_alarm celowo pomijamy — to stopień ostrzeżenia, nie odwołanie (21.09.2026)
    if any(w in t for w in STAGE_CLEAR):
        return "clear"
    if any(w in t for w in STAGE_ACTION):
        return "action"
    if any(w in t for w in STAGE_MONITOR):
        return "monitor"
    return "unknown"


def _record_text(it: dict, kind: str) -> None:
    """Każda NOWA wersja treści alertu RCB w RSO do dziennika (bez punktów).

    16.09.2026 (prośba usera): zanim treść alertu wpłynie na punktację („sytuacja
    monitorowana” vs „schroń się”), trzeba znać wszystkie warianty. RSO zmienia wpis
    w miejscu (ten sam id), a kanał TVP usuwa wygasłe alerty — bez tego zapisu pełna
    treść przepadała, zostawał tylko ucięty tytuł sygnału."""
    content = f"{it.get('title','')}\n{it.get('shortcut','')}\n{it.get('content','')}"
    digest = hashlib.sha1(content.encode()).hexdigest()[:12]
    stage = alert_stage(content, it.get("rso_alarm"))
    if stage == "unknown":
        log.warning("RSO: nierozpoznany etap alertu RCB (id %s): %s", it.get("id"),
                    content.replace("\n", " | ")[:200])
    stealth.record("rso_message", f"{it.get('id')}:{digest}", {
        "kind": kind, "stage": stage, "uwaga_count": content.upper().count("UWAGA"),
        "rso_id": it.get("id"), "rso_alarm": it.get("rso_alarm"),
        "title": (it.get("title") or "")[:300], "shortcut": (it.get("shortcut") or "")[:500],
        "content": (it.get("content") or "")[:2000],
        "valid_from": it.get("valid_from"), "valid_to": it.get("valid_to"),
        "created_at": it.get("created_at"), "updated_at": it.get("updated_at"),
        "provinces": [p.get("name") for p in (it.get("provinces") or {}).values()
                      if isinstance(p, dict)],
    })


async def _process_item(it: dict) -> bool:
    """Obsługuje jeden wpis RSO; True, gdy to aktywny alert powietrzny."""
    text = f"{it.get('title','')} {it.get('shortcut','')} {it.get('content','')}"
    headline = f"{it.get('title','')} {it.get('shortcut','')}"
    if _is_rcb_air_cancellation(it):
        _record_text(it, "clear")
        await _ingest_clear(it)
        return False
    if not _is_rcb_air_alert(text, headline):
        return False
    _record_text(it, "alert")
    mid = str(it.get("id"))
    if not _still_active(it):
        return True
    voivodeships = _voivs_for(it)
    reference_new = False
    for voiv in voivodeships:
        key = f"rso:{mid}:{voiv}"
        if key in _seen:
            continue
        if not _bootstrap and not _issued_recently(it):
            # Pierwszy przebieg: STARE alerty nie mają alarmować. Świeży alert
            # (patrz _issued_recently) musi jednak zadziałać normalnie — alert
            # wydany w czasie przestoju albo sekundę przed wdrożeniem dostawał
            # 0 pkt i ten sam klucz deduplikacji, więc przepadał na zawsze,
            # a RCB to jedyne źródło trafnych alarmów (audyt 11.09.2026).
            fusion.db.add_signal("rcb", "rso_alert_seen", voiv, 0.0,
                                 f"RCB/RSO (istniejący przy starcie): „{it.get('title','')[:110]}”",
                                 {"rso_id": mid}, key)
            _seen.add(key)   # dopiero po zapisie: błąd bazy = ponowna próba za minutę
            reference_new = True
            continue
        title = it.get("shortcut") or it.get("title") or "Alert RCB"
        poziom = rcb_level(f"{title} {it.get('description') or ''}")
        inserted = await fusion.ingest(
            source="rcb", event_type="rso_alert", voivodeship=voiv,
            points=config.RCB_LEVEL_POINTS[poziom],
            title=f"Alert RCB (RSO): „{title[:120]}”",
            details={"rso_id": mid, "valid_from": it.get("valid_from"),
                     "valid_to": it.get("valid_to"), "rcb_level": poziom},
            dedup_key=key,
        )
        _seen.add(key)
        reference_new = reference_new or inserted
    if reference_new:
        rcb_reference.capture(
            source="rso", source_event_id=mid,
            title=it.get("shortcut") or it.get("title") or "Alert RCB",
            voivodeships=voivodeships, source_time_raw=it.get("valid_from"),
            bootstrap=not _bootstrap,
        )
    return True


async def _ingest_clear(it: dict):
    """Zapis odwołania (0 pkt). Także przy pierwszym obiegu po starcie: odwołanie
    nie alarmuje, a bez niego alert sprzed restartu liczyłby się dalej. Fuzja
    porównuje czasy wydania, więc stare odwołanie nie gasi nowszego alertu."""
    if not _still_active(it):
        return
    mid = str(it.get("id"))
    stamp = it.get("updated_at") or it.get("created_at") or it.get("valid_from")
    cleared_at = rcb_reference.normalize_source_time(stamp)
    for voiv in _voivs_for(it):
        key = f"rso-clear:{mid}:{voiv}"
        if key in _seen:
            continue
        title = it.get("shortcut") or it.get("title") or "Odwołanie alertu RCB"
        await fusion.ingest(
            source="rcb", event_type="rso_clear", voivodeship=voiv, points=0.0,
            title=f"RCB (RSO): odwołanie — „{title[:120]}”",
            details={"rso_id": mid, "clear": True, "cleared_at": cleared_at,
                     "updated_at": it.get("updated_at")},
            dedup_key=key,
        )
        _seen.add(key)


async def run():
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            try:
                await _check(client)
            except Exception as e:                # noqa: BLE001
                _fail(f"pętla: {e!r}")
                log.exception("RSO: nieoczekiwany błąd cyklu")
            await asyncio.sleep(config.RSO_INTERVAL)
