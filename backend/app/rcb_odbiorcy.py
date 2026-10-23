# -*- coding: utf-8 -*-
"""Ścisły odczyt odbiorców alertu RCB z wpisu gov.pl — województwa, a w nich powiaty.

NIEPODŁĄCZONE do kolektora (23.10.2026, decyzja usera: „wzorzec identyfikujący w 100%
województwo — to tylko do testów póki co”). Kolektor nadal używa rcb.wojewodztwa_alertu.

Zasada usera: najpierw województwo z nagłówka listy, dopiero potem powiaty, i tylko
w obrębie tego województwa. W odróżnieniu od wojewodztwa_alertu nic tu nie zgadujemy:
  * województwo musi być DOKŁADNIE jedną z 16 nazw w dopełniaczu („lubelskiego”),
  * każdy powiat musi należeć do województwa, pod którym stoi (TERYT TERC),
  * każdy inny układ zdania → None (nie rozpoznano), a nie „najlepsze trafienie”.
Obsługiwane układy (wszystkie widziane na gov.pl przy alertach z powietrza, 17.09–23.10.2026):
  „na terenie woj. podkarpackiego i lubelskiego”
  „na terenie województwa lubelskiego” / „województw lubelskiego, podkarpackiego”
  „na terenie województwa lubelskiego (powiaty: puławski, opolski, …)”
  „na terenie powiatów: włodawskiego, …, Chełm, …, woj. lubelskie”
  „na terenie części województwa: - lubelskiego - powiaty: włodawski, Chełm, …
                                   - podkarpackiego - powiaty: …”
Literówka w nazwie powiatu (23.10 rano: „ubieszowski”) też daje None — nie zgadujemy.
Wynik: {województwo: [powiaty] albo None, gdy alert objął całe województwo}.
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from . import config


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower().replace("ł", "l"))
    return "".join(c for c in s if not unicodedata.combining(c))


DOPELNIACZ = {_fold(v + "go"): v for v in config.VOIVODESHIPS}   # lubelskie → lubelskiego
MIANOWNIK = {_fold(v): v for v in config.VOIVODESHIPS}
KOTWICA_RE = re.compile(r"na terenie\s+(?:czesci\s+)?(?:wojewodztwa|wojewodztw|woj\.?)\s*:?\s*")
# „na terenie powiatów: włodawskiego, …, Chełm, …, woj. lubelskie.” (16.10 i 20.10.2026) —
# tu województwo stoi NA KOŃCU, w mianowniku; nadal ono wyznacza, gdzie szukamy powiatów
POWIATY_NAJPIERW_RE = re.compile(r"na terenie\s+powiatow\s*:[\s:]*(.*?),?\s+woj\.?\s*([a-z-]+)\s*$")
NAWIAS_RE = re.compile(r"^([a-z-]+)\s*\(\s*powiat\w*\s*:\s*([^)]*)\)\s*$")
SEP_RE = re.compile(r"(?:^|\s)-\s+")
LISTA_RE = re.compile(r"\s*,\s*|\s+i\s+|\s+oraz\s+")
POWIATY_RE = re.compile(r"powiat\w*\s*:\s*(.*)$")


@lru_cache(maxsize=1)
def _powiaty() -> dict[str, set[str]]:
    dane = json.loads((Path(__file__).with_name("powiaty_terc.json")).read_text(encoding="utf-8"))
    return {v: {_fold(p) for p in ps} for v, ps in dane["powiaty"].items()}


def _tekst(blok: str) -> str:
    t = _fold(re.sub(r"<[^>]+>", " ", blok)).replace("–", "-")
    # „woj.” — kropka skrótu nie kończy zdania
    return re.sub(r"(?<![a-z])woj\.", "woj", re.sub(r"\s+", " ", t))


def _do_konca_zdania(reszta: str) -> str:
    # kropka (nazwy powiatów i województw nie mają kropek), separator bloku albo podpis
    return re.split(r"\.|-{5,}| z szacunkiem", reszta, maxsplit=1)[0].strip(" :")


def _powiaty_z_listy(lista: str, voiv: str, dopelniacz: bool = False) -> list[str] | None:
    out = []
    for p in (x.strip() for x in LISTA_RE.split(lista)):
        if not p:
            continue
        if dopelniacz and p not in _powiaty()[voiv] and p.endswith("kiego"):
            p = p[:-3]                                         # włodawskiego → włodawski
        if p not in _powiaty()[voiv]:
            return None            # powiat spoza województwa z nagłówka (albo literówka) — nie zgadujemy
        out.append(p)
    return out or None


def odbiorcy(blok: str) -> dict[str, list[str] | None] | None:
    t = _tekst(blok)
    m = KOTWICA_RE.search(t)
    if not m:
        m2 = re.search(r"na terenie\s+powiatow\s*:", t)
        if not m2:
            return None
        p = POWIATY_NAJPIERW_RE.match(_do_konca_zdania(t[m2.start():]))
        if not p or p.group(2) not in MIANOWNIK:
            return None
        voiv = MIANOWNIK[p.group(2)]
        lista = _powiaty_z_listy(p.group(1), voiv, dopelniacz=True)
        return {voiv: lista} if lista else None
    zd = _do_konca_zdania(t[m.end():])
    out: dict[str, list[str] | None] = {}
    if zd.startswith("-"):
        biezace = None
        for kawalek in (k.strip() for k in SEP_RE.split(zd)):
            if not kawalek:
                continue
            if kawalek in DOPELNIACZ:
                biezace = DOPELNIACZ[kawalek]
                if biezace in out:
                    return None
                out[biezace] = None
                continue
            m = POWIATY_RE.match(kawalek)
            if not m or biezace is None or out[biezace] is not None:
                return None
            lista = _powiaty_z_listy(m.group(1), biezace)
            if lista is None:
                return None
            out[biezace] = lista
        return out or None
    n = NAWIAS_RE.match(zd)
    if n:                                     # „województwa lubelskiego (powiaty: …)” (21.09.2026)
        if n.group(1) not in DOPELNIACZ:
            return None
        voiv = DOPELNIACZ[n.group(1)]
        lista = _powiaty_z_listy(n.group(2), voiv)
        return {voiv: lista} if lista else None
    for kawalek in LISTA_RE.split(zd):
        if kawalek not in DOPELNIACZ:
            return None
        out[DOPELNIACZ[kawalek]] = None
    return out or None
