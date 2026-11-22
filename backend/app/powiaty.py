# -*- coding: utf-8 -*-
"""Alarmy powiatowe — etap 2 (decyzje usera 18.11.2026).

Serwer liczy poziom każdego z 380 powiatów tą samą fuzją co województwa
(`fusion.accumulate`: limity klas, wygaszanie wiekiem, odwołania, fala, `red_key`)
i przygotowuje wysyłkę na tematy `pow_<TERYT>` + `pow_<TERYT>_krytyczne`. Wysyłka
jest za wyłącznikiem config.POWIATY_WYSYLKA (domyślnie WYŁĄCZONA): wtedy każda
decyzja trafia tylko do dziennika `alert_log_pow` jako „dziennik”.

Tor województw zostaje bez zmian: stare wersje aplikacji i strona (Web Push) dalej
dostają `voiv_*` z dzisiejszą punktacją. Ten moduł nie czyta ani nie pisze poziomów
województw, ich dziennika ani ich cooldownu.

Przeniesienie sygnału na powiat — jak sprawdzony tryb cienia (cien_powiaty.py,
od 23.10.2026, 380 powiatów od 18.11.2026):
  * NEPTUN: punkty × m(odl. obiektu od powiatu) / m(odl. od województwa) (_dist_mult),
    czas dolotu PRĘDKOŚCIĄ z meldunku: geo.eta_minutes(km, speed_kmh, zapas). Proporcja
    eta × km/km0 dawała przy samej granicy ~700 km/h (17.11.2026 09:35, całe podkarpackie
    czerwone); bez prędkości ETA nie zgadujemy (zostaje bezpiecznik odległości).
  * alarm obwodu UA: config.ua_alert_weight(odległość obwodu od powiatu);
  * Alert RCB/RSO: tylko powiaty z listy (gov.pl, potem treść RSO), bez listy całe
    województwo;
  * pozostałe: punkty województwa × krzywa głębokości powiatu od granicy UA/BY/RU.
Próg żółtego 2,5 (kalibracja 18.11.2026), czerwony 4,0 i klucz. Podtrzymanie 10 min,
cisza powtórki 60 min, ponowienie czerwonego — te same mechanizmy co województwa,
pod kluczami `pow:<TERYT>`.

Geometria: PRG GUGiK (powiaty_prg.json, scripts/build_powiaty_prg.py).
"""
import asyncio
import hashlib
import json
import logging
import math
import re
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from . import config, db, fusion, ponowienie

log = logging.getLogger("powiaty")

PLIK = Path(__file__).with_name("powiaty_prg.json")
PL = ZoneInfo("Europe/Warsaw")
_ORDER = ["none", "elevated", "high"]

WOJ_KOD = {"dolnośląskie": "02", "kujawsko-pomorskie": "04", "lubelskie": "06", "lubuskie": "08",
           "łódzkie": "10", "małopolskie": "12", "mazowieckie": "14", "opolskie": "16",
           "podkarpackie": "18", "podlaskie": "20", "pomorskie": "22", "śląskie": "24",
           "świętokrzyskie": "26", "warmińsko-mazurskie": "28", "wielkopolskie": "30",
           "zachodniopomorskie": "32"}

# wysyłka (ustawia main.startup poza trybem próby): async def (terc, data, test) -> bool
on_send = None

# stan na żywo: publiczny słownik do /api/state i licznik czasu
status = {"enabled": config.POWIATY_LICZENIE, "wysylka": config.powiaty_wysylka_wlaczona(),
          "most": config.POWIATY_MOST, "tematy": config.tematy_aplikacji(),
          "ms": None, "ms_max": None, "przeliczen": 0, "sygnalow": 0, "kopii": 0,
          "aktywnych": 0, "at": None, "error": None}
_publiczne: dict[str, dict] = {}
_ponizej: dict[str, float] = {}     # punkty powiatów bez poziomu (0 < pkt < próg) — pigułka w aplikacji
_sygnaly: dict[str, dict] = {}      # rozbicie punktów powiatów na sygnały — panel Sygnały (1.8.12)
SYGNALY_MAX = 8                     # tyle sygnałów na powiat; resztę zliczamy
_poziomy: dict[str, str] | None = None
_sesja_od: str | None = None
_inflight: set[tuple] = set()


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).replace("ł", "l").strip()


def krzywa(c, x: float) -> float:
    if x <= c[0][0]:
        return c[0][1]
    for (a, wa), (b, wb) in zip(c, c[1:]):
        if x <= b:
            return wa + (wb - wa) * (x - a) / (b - a)
    return c[-1][1]


# ── geometria ──────────────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def geometria() -> dict:
    g = json.loads(PLIK.read_text(encoding="utf-8"))
    woj_pow: dict[str, list[str]] = {}
    sl: dict[tuple, str] = {}
    for t, p in g["powiaty"].items():
        woj_pow.setdefault(p["woj"], []).append(t)
        n = fold(p["name"])
        sl[(t[:2], n[len("powiat "):] if n.startswith("powiat ") else n)] = t
    g["woj_pow"] = woj_pow
    g["slownik"] = sl
    return g


def powiaty() -> dict[str, dict]:
    return geometria()["powiaty"]


def klucz(terc: str) -> str:
    """Klucz regionu w fuzji (pole `voivodeship` kopii sygnału)."""
    return f"P{terc}"


def nazwa_krotka(terc: str) -> str:
    """„powiat dębicki” albo samo „Lublin” dla miasta na prawach powiatu."""
    n = powiaty()[terc]["name"]
    reszta = n[len("powiat "):] if n.startswith("powiat ") else n
    return reszta if reszta[:1].isupper() else n


def _do_km(lon: float, lat: float) -> tuple[float, float]:
    g = geometria()
    return (lon - g["lon0"]) * g["kx"], (lat - g["lat0"]) * g["ky"]


def _odc(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    qx, qy = ax + t * dx - px, ay + t * dy - py
    return qx * qx + qy * qy


def odl_km(px: float, py: float, p: dict) -> float:
    """Odległość punktu od powiatu (0 w środku): parzystość przecięć + najbliższy odcinek.
    Dalej niż 320 km w osi od prostokąta powiatu — 999 (poza zasięgiem krzywych)."""
    x0, y0, x1, y1 = p["bbox"]
    if max(x0 - px, 0, px - x1) > 320 or max(y0 - py, 0, py - y1) > 320:
        return 999.0
    w = False
    best = float("inf")
    for ring in p["rings"]:
        for (ax, ay), (bx, by) in zip(ring, ring[1:]):
            if (ay > py) != (by > py) and px < ax + (py - ay) * (bx - ax) / (by - ay):
                w = not w
            d = _odc(px, py, ax, ay, bx, by)
            if d < best:
                best = d
    return 0.0 if w else math.sqrt(best)


_ODL_CACHE: dict[tuple, dict[str, float]] = {}
_ODL_CACHE_MAX = 5000


def odleglosci(lat: float, lon: float) -> dict[str, float]:
    """Odległości punktu od wszystkich powiatów (tylko < 999 km). Punkty z meldunków
    wracają w kolejnych przeliczeniach — liczymy każdy raz."""
    k = (round(lat, 4), round(lon, 4))
    wynik = _ODL_CACHE.get(k)
    if wynik is None:
        if len(_ODL_CACHE) >= _ODL_CACHE_MAX:
            _ODL_CACHE.clear()
        px, py = _do_km(lon, lat)
        wynik = {}
        for t, p in powiaty().items():
            d = odl_km(px, py, p)
            if d < 999:
                wynik[t] = d
        _ODL_CACHE[k] = wynik
    return wynik


# ── listy powiatów Alertu RCB ──────────────────────────────────────────────────
_NAGLOWEK = re.compile(r"\b([A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ-]{4,}(?:KIEGO|SKIEGO))\s*:", re.U)
_DOPELNIACZ = {fold(v) + "go": k for v, k in WOJ_KOD.items()}     # lubelskiego → 06


def powiaty_z_tresci(tekst: str, woj_kody: list[str]) -> set[str]:
    """Powiaty (TERYT) z treści komunikatu RSO. Formy (24.09–23.10.2026):
      „… województw: LUBELSKIEGO: puławski, …, Lublin, … PODKARPACKIEGO: … wysłano Alert RCB …”
      „… Dotyczy powiatów: hrubieszowski, Zamość, …” (województwo z pola `provinces`)
    Ten sam przymiotnik bywa w kilku województwach — rozstrzyga nagłówek listy."""
    sl = geometria()["slownik"]
    t = re.sub(r"\s+", " ", tekst or "")
    t = re.split(r"\bwysłano\b", t.split(" o treści:")[0])[0]
    odc, wynik = [], set()
    nag = list(_NAGLOWEK.finditer(t))
    for i, m in enumerate(nag):
        kod = _DOPELNIACZ.get(fold(m.group(1)))
        if kod:
            odc.append((kod, t[m.end():nag[i + 1].start() if i + 1 < len(nag) else len(t)]))
    m = re.search(r"Dotyczy powiatów:\s*(.*)$", t)
    if m:
        odc += [(w, m.group(1)) for w in woj_kody]
    for kod, lista in odc:
        for tok in lista.split(","):
            terc = sl.get((kod, fold(tok.strip().strip("."))))
            if terc:
                wynik.add(terc)
    return wynik


_zapisane: set[str] = set()


def zapisz_rso(it: dict) -> None:
    """Wpis RSO (alert albo odwołanie) → lista powiatów z jego treści, każda nowa wersja.
    Wołane z kolektora RSO; błąd nie może mu przeszkodzić (kolektor łapie wyjątki)."""
    tresc = it.get("content") or ""
    rso_id = str(it.get("id") or "")
    if not rso_id or not tresc or getattr(db, "_conn", None) is None:
        return
    k = "rso:" + hashlib.sha1(f"{rso_id}|{tresc}".encode()).hexdigest()[:20]
    if k in _zapisane:
        return
    kody = {fold(v): k for v, k in WOJ_KOD.items()}
    prov = it.get("provinces") or {}
    woj = [kody[fold(p.get("name", ""))] for p in (prov.values() if isinstance(prov, dict) else prov)
           if isinstance(p, dict) and fold(p.get("name", "")) in kody]
    lista = powiaty_z_tresci(tresc, woj)
    if lista:
        db.add_rcb_lista_pow(k, db.now_iso(), "rso", rso_id, None, sorted(lista), False)
    _zapisane.add(k)


_GODZINA_RE = re.compile(r"aktualizacja\s*!?\s*[—–-]?\s*(\d{1,2}:\d{2})", re.I)


def zapisz_govpl(href: str, tekst: str, teraz: datetime | None = None) -> int:
    """Artykuł RCB z gov.pl (dzisiejszy) → listy powiatów każdego bloku, ściśle
    (app/rcb_odbiorcy.py). Czas bloku z „Aktualizacja — HH:MM”, a bez niego chwila
    pierwszego odczytu. Zwraca liczbę nowych wpisów."""
    from . import rcb_odbiorcy
    from .collectors import rcb
    teraz = teraz or datetime.now(timezone.utc)
    m = rcb.DATA_RE.search(tekst)
    if not m or getattr(db, "_conn", None) is None:
        return 0
    dzien = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))).date()
    sl = geometria()["slownik"]
    nowe = 0
    for blok in rcb.BLOK_SEP.split(tekst):
        akt = list(rcb.AKTUALIZACJA_RE.finditer(blok))
        g = _GODZINA_RE.search(blok[akt[-1].start():]) if akt else None
        if akt:
            blok = blok[akt[-1].start():]
        cytaty = rcb.CYTAT_RE.findall(blok)
        if not cytaty:
            continue
        tresc = max(cytaty, key=len).strip()
        if not any(a in rcb._fold(tresc) for a in rcb.AIR_FOLD):
            continue
        odb = rcb_odbiorcy.odbiorcy(blok)
        if not odb:
            continue                     # układ nierozpoznany ściśle — bez listy
        godz = g.group(1) if g else None
        k = "gov:" + hashlib.sha1(f"{href}|{godz}|{tresc}".encode()).hexdigest()[:20]
        if k in _zapisane:
            continue
        if godz:
            hh, mm = map(int, godz.split(":"))
            ts = datetime(dzien.year, dzien.month, dzien.day, hh, mm, tzinfo=PL).astimezone(timezone.utc)
        else:
            ts = teraz
        odw = rcb._czy_odwolanie(tresc)
        for voiv, nazwy in odb.items():
            kod = WOJ_KOD.get(voiv)
            terc = None if nazwy is None else sorted(sl[(kod, n)] for n in nazwy if (kod, n) in sl)
            if db.add_rcb_lista_pow(f"{k}:{kod}", ts.isoformat(timespec="seconds"), "govpl",
                                    None, voiv, terc, odw):
                nowe += 1
        _zapisane.add(k)
    return nowe


class Listy:
    """Listy powiatów Alertu RCB w chwili `ref`: gov.pl ma pierwszeństwo, bo tylko tam
    widać, do których powiatów RCB naprawdę wysłało SMS; potem treść RSO."""

    def __init__(self, wpisy: list[dict]):
        self.gov = [w for w in wpisy if w["zrodlo"] == "govpl"]
        self.rso: dict[str, list[tuple[str, list[str]]]] = {}
        for w in wpisy:
            if w["zrodlo"] == "rso" and w["rso_id"] and w["powiaty"]:
                self.rso.setdefault(str(w["rso_id"]), []).append((w["ts"], w["powiaty"]))

    def z_gov(self, voiv: str, alert_ts: str, ref_iso: str) -> set[str] | None:
        try:
            od = (datetime.fromisoformat(alert_ts)
                  - timedelta(minutes=config.POWIATY_GOV_PRZED_MIN)).isoformat(timespec="seconds")
        except (TypeError, ValueError):
            return None
        for w in reversed(self.gov):
            if w["ts"] > ref_iso or w["ts"] < od or w["odwolanie"] or w["woj"] != voiv:
                continue
            if w["powiaty"] is None:
                return set(geometria()["woj_pow"].get(voiv, []))
            return set(w["powiaty"])
        return None

    def z_rso(self, rso_id, ref_iso: str) -> set[str] | None:
        wersje = self.rso.get(str(rso_id or ""))
        if not wersje:
            return None
        akt = [p for od, p in wersje if od <= ref_iso]
        return set(akt[-1] if akt else wersje[0][1])

    def dla(self, s: dict, ref_iso: str) -> set[str] | None:
        d = s.get("details") or {}
        return self.z_gov(s.get("voivodeship"), s.get("ts", ""), ref_iso) or self.z_rso(d.get("rso_id"), ref_iso)


# ── przeniesienie sygnałów na powiaty ──────────────────────────────────────────
def _tytul_neptun(d: dict, km: float, eta) -> str:
    from .collectors.neptun import threat_label_pl
    ile = f"{d['count']}× " if (d.get("count") or 1) > 1 else ""
    gdzie = "nad powiatem" if km <= 0.5 else f"ok. {round(km)} km od powiatu"
    return f"{ile}{threat_label_pl(d.get('type'))} {gdzie}" + (f", dolot ok. {eta} min" if eta is not None else "")


def _tytul_ua(tytul: str | None, km: float) -> str | None:
    """Tytuł alarmu obwodu UA względem POWIATU (22.11.2026). Kopia brała tytuł sygnału
    województwa, więc Przemyśl (podkarpackie) dostawał w powodach alarmu „(woj. lubelskie
    — 225 km)”. Nazwę obwodu zostawiamy z tytułu (jest już odmieniona)."""
    if not tytul:
        return None
    gdzie = "przy granicy powiatu" if km <= 0 else f"ok. {round(km)} km od powiatu"
    nowy = re.sub(r" \(woj\. [^)]*\)$", f" (Ukraina, {gdzie})", tytul)
    return nowy if nowy != tytul else None


def na_powiaty(s: dict, listy: Listy, ref_iso: str) -> list[dict]:
    """Kopie sygnału województwa na powiaty, z punktami przeliczonymi dla powiatu."""
    from . import geo
    from .collectors.neptun import _dist_mult
    d = s.get("details") or {}
    src, typ, voiv = s.get("source"), s.get("event_type"), s.get("voivodeship")
    pow_ = powiaty()
    out = []

    def kopia(terc, pts, title=None, **det):
        c = dict(s)
        c["voivodeship"] = klucz(terc)
        c["_woj"] = voiv
        c["points"] = round(pts, 3)
        if title:
            c["title"] = title
        if det:
            c["details"] = {**d, **det}
        out.append(c)

    if src == "neptun" and d.get("lat") is not None and d.get("lon") is not None:
        d0 = d.get("dist_km")
        m0 = _dist_mult(d0) if d0 is not None else 0
        if not m0:
            return out
        for t, dk in odleglosci(d["lat"], d["lon"]).items():
            m = _dist_mult(dk)
            if m <= 0:
                continue
            det = {"dist_km": round(dk, 1), "distance_display_km": round(dk, 1)}
            if d.get("eta_border_min") is not None and d.get("speed_kmh"):
                det["eta_border_min"] = geo.eta_minutes(
                    dk, d["speed_kmh"], d.get("eta_buffer_min", config.NEPTUN_ETA_BUFFER_MIN))
            elif d.get("eta_border_min") is not None:
                det["eta_border_min"] = None     # bez prędkości nie zgadujemy
            kopia(t, s["points"] * m / m0, _tytul_neptun(d, dk, det.get("eta_border_min")), **det)
        return out
    if src == "ua_alert":
        o = d.get("oblast")
        for t, p in pow_.items():
            km_ = p["obw"].get(o)
            if km_ is None:
                continue
            w = config.ua_alert_weight(km_)
            if w > 0 or typ == "ua_alert_end":
                kopia(t, config.POINTS["ua_alert_border"] * w if typ != "ua_alert_end" else 0,
                      _tytul_ua(s.get("title"), km_), distance_km=round(km_))
        return out
    woj_pow = geometria()["woj_pow"].get(voiv, [])
    if src == "rcb":
        if typ in ("rso_alert", "rcb_alert"):
            lista = listy.dla(s, ref_iso)
            for t in [t for t in (lista or woj_pow) if t in pow_]:
                kopia(t, s["points"], **({"lista_powiatow": True} if lista else {}))
            return out
        for t in woj_pow:
            kopia(t, s["points"])
        return out
    for t in woj_pow:
        kopia(t, s["points"] * krzywa(config.POWIATY_DEPTH_CURVE, pow_[t]["gleb"]))
    return out


def _bez_powtorzen(signals: list[dict]) -> list[dict]:
    """Ten sam meldunek NEPTUN-a w kilku województwach i ten sam alarm obwodu UA
    przypisany kilku województwom dają na powiecie to samo zdarzenie.

    NEPTUN: z meldunków tego samego obiektu w tej samej chwili i punkcie zostaje ten
    o największym „punkty / mnożnik odległości” — na każdym powiecie i tak wygrałby
    on (`neptun_winners` bierze największe punkty), a kopii jest 3–5 razy mniej.
    Alarm obwodu UA: na powiat przechodzi niezależnie od województwa, więc wystarczy
    jeden sygnał na (rodzaj, obwód, epizod) — inaczej dwa województwa liczyłyby go
    na powiecie podwójnie (do limitu klasy)."""
    from .collectors.neptun import _dist_mult
    neptun: dict[tuple, tuple[float, dict]] = {}
    ua: dict[tuple, dict] = {}
    out = []
    for s in signals:
        d = s.get("details") or {}
        if s.get("source") == "neptun" and d.get("lat") is not None and d.get("lon") is not None:
            m0 = _dist_mult(d["dist_km"]) if d.get("dist_km") is not None else 0
            if not m0:
                continue
            k = (d.get("physical_key") or d.get("track_id") or s.get("id"), s.get("ts"),
                 round(d["lat"], 4), round(d["lon"], 4))
            baza = (s.get("points") or 0) / m0
            if k not in neptun or baza > neptun[k][0]:
                neptun[k] = (baza, s)
            continue
        if s.get("source") == "ua_alert":
            k = (s.get("event_type"), d.get("oblast"), d.get("episode") or s.get("ts"))
            if k in ua:
                continue
            ua[k] = s
        out.append(s)
    return out + [s for _, s in neptun.values()]


def poziom(score: float) -> str:
    if score >= config.POWIATY_PROG_CZERWONY:
        return "high"
    if score >= config.POWIATY_PROG_ZOLTY:
        return "elevated"
    return "none"


def oblicz(signals: list[dict], ref: datetime, listy: Listy | None = None, *,
           officials_extra: list[dict] | None = None, lost=None) -> tuple[dict, dict]:
    """Stan powiatów w chwili `ref` z sygnałów województw (już z odwołaniami spoza okna
    i trwającymi alarmami obwodów — jak compute_state). Zwraca ({terc: stan}, liczniki).
    Stan: score, level (z kluczem czerwonego), red_key, signals, clear_at.
    Powiaty bez żadnego wkładu pomija (poziom „none”)."""
    listy = listy or Listy([])
    ref_iso = ref.isoformat(timespec="seconds")
    wejscie = _bez_powtorzen([s for s in signals if (s.get("ts") or "") <= ref_iso])
    kopie: list[dict] = []
    for s in wejscie:
        kopie += na_powiaty(s, listy, ref_iso)
    regiony = [klucz(t) for t in powiaty()]
    per = fusion.accumulate(kopie, ref, lost, officials_extra, regions=regiony)
    # odwołanie RCB/RSO zdejmuje podtrzymanie od razu (fusion.hold_level)
    clear: dict[str, str] = {}
    krajowe = ""
    for c in kopie:
        if c.get("event_type") == "rso_clear":
            if fusion._clear_krajowe(c):
                krajowe = max(krajowe, c.get("ts") or "")
            clear[c["voivodeship"]] = max(clear.get(c["voivodeship"], ""), c.get("ts") or "")
    wynik = {}
    for t in powiaty():
        st = per.get(klucz(t))
        if not st or not st["signals"]:
            continue
        # 22.11.2026 (prototyp panelu na odtworzeniu 20.11): fuzja składa tytuł fali
        # z klucza regionu, więc w powiecie wychodziło „od woj. P1809” — a tytuły idą
        # do powodów w powiadomieniu (notify.reasons_split). Odległość fali to tu
        # odległość od powiatu, którego nazwa i tak stoi w powiadomieniu jako miejsce.
        for x in st["signals"]:
            if x.get("event_type") == "neptun_wave" and x.get("title"):
                x["title"] = x["title"].replace(f" od woj. {klucz(t)} ", " od powiatu ")
        score = fusion.round1(st["score"])
        lvl = poziom(score)
        rk = fusion.red_key(st["signals"], ref) if lvl == "high" else None
        if lvl == "high" and not rk:
            lvl = "elevated"
        c = max(clear.get(klucz(t), ""), krajowe)
        wynik[t] = {"score": score, "level": lvl, "red_key": rk, "signals": st["signals"],
                    "clear_at": fusion._parse_ts(c).timestamp() if c else None}
    return wynik, {"sygnalow": len(wejscie), "kopii": len(kopie)}


def _stan_na_zywo() -> tuple[dict, dict]:
    """Odczyt bazy i przeliczenie — w wątku, poza pętlą zdarzeń."""
    ref = datetime.now(timezone.utc).replace(microsecond=0)
    signals = db.signals_since(config.FUSION_WINDOW_MIN)
    seen = {s.get("id") for s in signals}
    signals += [s for s in db.events_since(config.RSO_CLEAR_MEDIA_ECHO_MIN + config.FUSION_WINDOW_MIN,
                                           ("rso_clear",)) if s.get("id") not in seen]
    seen = {s.get("id") for s in signals}
    signals += [s for s in fusion.active_ua_alerts(db.events_since(
        config.UA_ALERT_MAX_MIN + config.FUSION_WINDOW_MIN, ("ua_alert_border", "ua_alert_end")), ref)
        if s.get("id") not in seen]
    oficjalne = db.events_since(config.RCB_MEDIA_ECHO_MIN + config.FUSION_WINDOW_MIN,
                                ("rso_alert", "rcb_alert"))
    listy = Listy(db.rcb_listy_pow_since((ref - timedelta(hours=26)).isoformat(timespec="seconds")))
    return oblicz(signals, ref, listy, officials_extra=oficjalne, lost=fusion.lost_provider)


# ── wiadomość ──────────────────────────────────────────────────────────────────
def naglowek(signals: list[dict]) -> str:
    """Pierwsza linia alarmu powiatu: co i jak blisko POWIATU (nie granicy)."""
    from . import notify
    licz = sorted([x for x in signals or [] if (x.get("counted_points") or 0) > 0],
                  key=lambda x: x.get("counted_points") or 0, reverse=True)
    if any(x.get("event_type") in ("rso_alert", "rcb_alert") for x in licz):
        return "Oficjalny Alert RCB dla powiatu"
    for x in licz:
        if x.get("source") == "neptun" and x.get("event_type") != "neptun_wave":
            return x.get("title") or notify.alarm_headline([x])
    return notify.alarm_headline(signals)


def klucz_zdarzenia(level: str, sesja_od: str | None) -> str:
    """Poziom + początek sesji alarmowej (pierwszy powiat ≥ żółty po ciszy w całym kraju).
    Wspólny dla wszystkich powiatów jednego zdarzenia: telefon z miejscami w kilku
    powiatach rozpozna, że to to samo — pierwsze dzwoni, kolejne tego samego poziomu
    w 10 min dopisują się bez dźwięku; wyższy poziom i ponowienie dzwonią."""
    return f"{level}|{sesja_od or ''}"


def wiadomosc(terc: str, level: str, st: dict, *, sesja_od: str | None,
              ponowienie_powod: dict | None = None, sent_at: datetime | None = None) -> dict:
    """Ładunek FCM (same napisy — FCM `data` przyjmuje tylko str)."""
    from . import notify
    p = powiaty()[terc]
    sent_at = sent_at or datetime.now(timezone.utc)
    signals = st.get("signals") or []
    head = naglowek(signals)
    tytul_glowny = head            # sygnał z nagłówka nie powtarza się w pierwszym powodzie
    if ponowienie_powod:
        head = notify.naglowek_ponowienia(ponowienie_powod, head)
    # 22.11.2026: powody od najmocniejszego i tylko te, które dały punkty. Kolejność
    # przyjścia sygnałów wypychała z trzech pokazywanych na telefonie linii rakiety
    # (+2,0), a zostawały alarmy obwodów za +0,0 (odtworzenie 20.11 05:35, Przemyśl).
    powody = sorted((s for s in signals if (s.get("counted_points") or 0) > 0),
                    key=lambda s: -(s.get("counted_points") or 0))
    reasons = notify.reasons_split([s for s in powody if s.get("title") != tytul_glowny] or powody)
    if any((s.get("details") or {}).get("eta_alarm") for s in signals):
        reasons += "\nSzacunek czasu dolotu; dane źródłowe mogą być opóźnione o kilka minut."
    nazwa = nazwa_krotka(terc)
    return {
        "typ": "pow", "pow": terc, "pow_nazwa": nazwa, "voiv": p["woj"],
        "miejsce": f"{nazwa}, woj. {p['woj']}",
        "level": level, "score": str(st.get("score", "")),
        "headline": head, "reasons": reasons,
        "sent_at": sent_at.isoformat(timespec="seconds"),
        "event_id": f"pow_{terc}|{level}|{int(sent_at.timestamp())}",
        "klucz_zdarzenia": klucz_zdarzenia(level, sesja_od),
        "sesja_od": sesja_od or "",
        "ponowienie": "1" if ponowienie_powod else "0",
    }


def wiadomosc_most(terc: str, voiv_data: dict) -> dict:
    """Alarm WOJEWÓDZTWA w formie alarmu powiatu — most wyłącznika awaryjnego
    (config.POWIATY_MOST). Poziom, punkty i powody z województwa; telefon na torze
    powiatów przyjmuje go jak każdy alarm powiatu. Klucz zdarzenia ma w sobie
    województwo i chwilę wysyłki, więc ten sam alarm z kilku powiatów jednego
    województwa telefon złączy (dzwoni raz), a alarmy dwóch województw — jak dotąd —
    zadzwonią osobno."""
    from . import config as _c
    p = powiaty()[terc]
    nazwa = nazwa_krotka(terc)
    level = voiv_data.get("level", "")
    sent = voiv_data.get("sent_at", "")
    try:
        ts = str(int(datetime.fromisoformat(sent).timestamp()))
    except (TypeError, ValueError):
        ts = sent
    return {**{k: voiv_data.get(k, "") for k in ("level", "score", "headline", "reasons", "sent_at")},
            "typ": "pow", "pow": terc, "pow_nazwa": nazwa, "voiv": p["woj"],
            "miejsce": f"{nazwa}, woj. {p['woj']}",
            "event_id": f"most|{voiv_data.get('event_id', '')}",
            "klucz_zdarzenia": f"{level}|{_c.voiv_topic(p['woj'])}|{ts}",
            "sesja_od": "", "ponowienie": voiv_data.get("ponowienie", "0"), "most": "1"}


# ── przejścia poziomów i wysyłka ───────────────────────────────────────────────
def _levels() -> dict[str, str]:
    global _poziomy
    if _poziomy is None:
        try:
            _poziomy = db.load_levels_pow()
        except Exception:                          # noqa: BLE001
            _poziomy = {}
    return _poziomy


def _zapisz(terc, old, new, st, decision, *, klucz_=None, powod=None) -> int | None:
    from . import alert_log
    p = powiaty()[terc]
    try:
        return db.add_alert_log_pow(
            terc=terc, nazwa=p["name"], woj=p["woj"], old_level=old, new_level=new,
            score=(st or {}).get("score"), decision=decision, klucz=klucz_, ponowienie=powod,
            composition=alert_log.composition((st or {}).get("signals") or []),
            version=alert_log.VERSION)
    except Exception as exc:                       # noqa: BLE001
        log.warning("dziennik powiatów (%s): %s", terc, exc)
        return None


def _powiadom(terc: str, old: str, level: str, st: dict, powod: dict | None = None) -> None:
    """Decyzja o powiadomieniu. Przy wyłączonej wysyłce — tylko dziennik („dziennik”),
    ale cisza powtórki i odstęp liczą się tak, jakby poszło (to samo zachowanie)."""
    from . import notify
    kl = klucz_zdarzenia(level, _sesja_od)
    last = db.last_notif_pow(terc, level)
    if last and not powod:
        if datetime.now(timezone.utc) - datetime.fromisoformat(last) < timedelta(minutes=config.NOTIFY_COOLDOWN_MIN):
            _zapisz(terc, old, level, st, "cooldown", klucz_=kl)
            return
    test = notify.is_test_alarm(st.get("signals")) or not config.PRODUCTION
    if not (config.powiaty_wysylka_wlaczona() and on_send):
        _zapisz(terc, old, level, st, "dziennik", klucz_=kl, powod=powod)
        db.log_notif_pow(terc, level)
        return
    log_id = _zapisz(terc, old, level, st, "pending", klucz_=kl, powod=powod)
    data = wiadomosc(terc, level, st, sesja_od=_sesja_od, ponowienie_powod=powod)
    asyncio.get_running_loop().create_task(_dostarcz(terc, level, data, log_id, test))


async def _dostarcz(terc: str, level: str, data: dict, log_id: int | None, test: bool) -> None:
    from . import notify
    k = (terc, level, data.get("ponowienie"))
    if k in _inflight:
        return
    _inflight.add(k)
    try:
        ok = await on_send(terc, data, test)
    except Exception as exc:                       # noqa: BLE001
        ok = repr(exc)[:200]
    finally:
        _inflight.discard(k)
    delivery = {"at": db.now_iso(), "fcm": ok, "fcm_topic": notify.fcm_topic_pow(terc, test),
                "klucz_zdarzenia": data.get("klucz_zdarzenia"), "ponowienie": data.get("ponowienie")}
    decision = ("test" if test else "sent") if ok is True else "undelivered"
    if log_id:
        try:
            db.update_alert_log_pow(log_id, decision, delivery)
        except Exception as exc:                   # noqa: BLE001
            log.warning("dziennik powiatów, doręczenie #%s: %s", log_id, exc)
    if ok is True and not test:
        db.log_notif_pow(terc, level)
    elif ok is not True:
        log.error("ALARM POWIATU NIEDOSTARCZONY: %s %s — %r", terc, level, ok)


def _przejscia(wynik: dict, teraz: float | None = None) -> None:
    """Podtrzymanie, przejścia poziomów, dziennik i decyzje — jak fusion.reevaluate."""
    global _sesja_od, _publiczne, _ponizej, _sygnaly
    teraz = time.time() if teraz is None else teraz
    poziomy = _levels()
    nowe: dict[str, str] = {}
    for t in powiaty():
        st = wynik.get(t)
        lvl = st["level"] if st else "none"
        nowe[t] = fusion.hold_level(f"pow:{t}", lvl, teraz, st["clear_at"] if st else None)
    aktywne = {t: l for t, l in nowe.items() if l != "none"}
    if aktywne and _sesja_od is None:
        _sesja_od = datetime.fromtimestamp(teraz, timezone.utc).isoformat(timespec="seconds")
    elif not aktywne:
        _sesja_od = None
    for t, new in nowe.items():
        old = poziomy.get(t, "none")
        st = wynik.get(t) or {"score": 0.0, "signals": [], "level": "none"}
        if new == old:
            if new == "high" and config.RED_PONOWIENIE_WLACZONE:
                obiekty, rcb = fusion._dane_ponowienia(st)
                powod = ponowienie.krok(f"pow:{t}", obiekty, rcb, datetime.now(timezone.utc))
                if powod:
                    _powiadom(t, old, new, st, powod)
            continue
        if new != "high":
            ponowienie.zakoncz(f"pow:{t}")
        poziomy[t] = new
        try:
            db.save_level_pow(t, new)
        except Exception as exc:                   # noqa: BLE001
            log.warning("zapis poziomu powiatu %s: %s", t, exc)
        if _ORDER.index(new) < _ORDER.index(old):
            _zapisz(t, old, new, st, "falling", klucz_=klucz_zdarzenia(new, _sesja_od))
            continue
        last = db.last_notif_pow(t, new)
        if last:
            wiek = (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() / 60
            if wiek < config.ALERT_REPEAT_QUIET_MIN and not fusion._fresh_strong_signal(st["signals"], last):
                _zapisz(t, old, new, st, "quiet_repeat", klucz_=klucz_zdarzenia(new, _sesja_od))
                continue
        if new == "high":
            ponowienie.rozpocznij(f"pow:{t}", *fusion._dane_ponowienia(st), datetime.now(timezone.utc))
        _powiadom(t, old, new, st)
    p = powiaty()
    _publiczne = {t: {"level": l, "score": (wynik.get(t) or {}).get("score", 0.0),
                      "name": p[t]["name"], "woj": p[t]["woj"]}
                  for t, l in sorted(aktywne.items())}
    # 22.11.2026 (user): pigułka „mój region” pokazuje punkty powiatu także poniżej progu,
    # jak dotąd punkty województwa. Osobne pole, bo stare wersje aplikacji traktują wpis
    # w `powiaty` jak powiat z poziomem (mapa, alarm otwartej aplikacji).
    _ponizej = {t: st["score"] for t, st in sorted(wynik.items())
                if nowe.get(t) == "none" and (st.get("score") or 0) > 0}
    _sygnaly = {t: rozbicie(st) for t, st in sorted(wynik.items()) if (st.get("score") or 0) > 0}


def rozbicie(st: dict) -> dict:
    """Co daje powiatowi punkty: sygnały z wkładem, od najmocniejszego (1.8.12, panel
    Sygnały). Tylko tytuł i wkład — paczkę pobiera telefon dopiero po rozwinięciu
    powiatu, więc stała paczka /api/state się nie zmienia (pomiar na nalocie 20.11
    05:35: rozbicie w stałej paczce podwoiłoby ją z 9,8 do 19,5 KB gzip)."""
    lista = sorted((x for x in st.get("signals") or [] if (x.get("counted_points") or 0) > 0),
                   key=lambda x: -(x.get("counted_points") or 0))
    return {"s": [{"t": x.get("title") or "", "p": round(x.get("counted_points") or 0, 1)}
                  for x in lista[:SYGNALY_MAX]],
            "wiecej": max(0, len(lista) - SYGNALY_MAX)}


def publiczne() -> dict:
    """Rzadki słownik do /api/state: tylko powiaty z poziomem ≠ brak (zwykle pusty)."""
    return _publiczne


def punkty_ponizej() -> dict:
    """{TERYT: punkty} powiatów z punktami poniżej progu (bez poziomu) — do /api/state."""
    return _ponizej


def sygnaly_publiczne() -> dict:
    """{TERYT: {s: [{t, p}], wiecej}} — część stanu `state_pow` (na żądanie)."""
    return _sygnaly


async def przelicz() -> None:
    t0 = time.monotonic()
    wynik, licz = await asyncio.to_thread(_stan_na_zywo)
    ms = round((time.monotonic() - t0) * 1000)
    _przejscia(wynik)
    status.update(ms=ms, ms_max=max(ms, status["ms_max"] or 0), przeliczen=status["przeliczen"] + 1,
                  aktywnych=len(_publiczne), at=db.now_iso(), error=None, **licz)
    if ms > 3000:
        log.warning("powiaty: przeliczenie %d ms (%d sygnałów, %d kopii)", ms,
                    licz["sygnalow"], licz["kopii"])


_zdarzenie: asyncio.Event | None = None


def zglos() -> None:
    """Nowy sygnał / reewaluacja województw — przelicz powiaty przy najbliższej okazji."""
    if _zdarzenie is not None:
        _zdarzenie.set()


async def petla() -> None:
    """Przeliczenie po nowym sygnale (najczęściej co POWIATY_ODSTEP_S), a bez sygnałów
    co POWIATY_CO_S — wynik gaśnie z wiekiem sam."""
    global _zdarzenie
    _zdarzenie = asyncio.Event()
    await asyncio.sleep(25)
    while True:
        try:
            await przelicz()
        except Exception as e:                     # noqa: BLE001
            status["error"] = repr(e)[:200]
            log.warning("powiaty: %s", e)
        try:
            await asyncio.wait_for(_zdarzenie.wait(), timeout=config.POWIATY_CO_S)
        except asyncio.TimeoutError:
            pass
        _zdarzenie.clear()
        await asyncio.sleep(config.POWIATY_ODSTEP_S)
