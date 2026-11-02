"""Ponowienie czerwonego alarmu przy realnym zbliżeniu (decyzja usera 2.11.2026, 1.8.06).

Syrena gra najdłużej 15 minut, a czerwony trzyma się dłużej (około 34 min z samej
konstrukcji reguł). Przez ten czas zwykle nie dzieje się nic nowego: w 30 z 40 sesji
po 15. minucie nie przyszedł żaden sygnał. Alarm wraca więc tylko, gdy:

* pojawi się dokładna pozycja do 30 km od granicy, z wysoką wiarygodnością i co
  najmniej 2 zgłoszeniami, która jest nowa (co najmniej 5 km od punktów już znanych
  w tej sesji, bo NEPTUN stawia pinezki miejscowości i ten sam punkt wraca pod nowym
  numerem toru) albo o co najmniej 10 km bliższa niż dotąd; odstęp 15 min, limit 2;
* albo RCB wyda alert co najmniej 2. stopnia: zawsze, poza odstępem i limitem.

Przeliczenie 2.08-2.11: 5 dodatkowych alarmów na 92 dni (1 w nocy) i 2 od RCB. Nowy tor
sam w sobie (11 alarmów, 4 bez niczego do 30 km) ani wzrost punktów nie budzą, bo to
pinezki i narastanie sumy, a nie zbliżenie. Tylko tryb z serwerem: stan jest w pamięci
procesu. Po restarcie sesja rusza od nowa i bieżące punkty uznaje za znane, więc restart
nie wywoła alarmu, a co najwyżej przeoczy ponowienie.
"""
import logging
import math
from datetime import datetime, timedelta

from . import config

log = logging.getLogger("ponowienie")

INF = float("inf")
_sesje: dict[str, dict] = {}


def _km(a: tuple, b: tuple) -> float:
    return math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * math.cos(math.radians(a[0])))


def _nowa_sesja(teraz: datetime) -> dict:
    return {"ost": teraz, "n": 0, "min_p": INF, "km_tor": {}, "punkty": [], "rcb": set()}


def _pochlon(s: dict, obiekty: list[dict], rcb: tuple) -> None:
    """To, co pojawiło się w czasie syreny, jest już znane: ktoś to właśnie usłyszał."""
    for o in obiekty:
        km = o["km"]
        if km is None:
            continue
        s["km_tor"][o["tor"]] = min(s["km_tor"].get(o["tor"], INF), km)
        if not o["rejon"]:
            s["min_p"] = min(s["min_p"], km)
        if km <= config.RED_PONOWIENIE_KM and o["wsp"]:
            s["punkty"].append(o["wsp"])
    if rcb[0] >= config.RED_PONOWIENIE_RCB_STOPIEN:
        s["rcb"].add(rcb[1])


def _wybierz(s: dict, obiekty: list[dict]) -> dict | None:
    limit_km = config.RED_PONOWIENIE_KM
    dobre = [o for o in obiekty if o["km"] is not None and o["km"] <= limit_km and not o["rejon"]
             and o["jakosc"] == "high" and (o["zgloszenia"] or 0) >= config.RED_PONOWIENIE_MIN_ZGLOSZEN]
    nowe = [o for o in dobre if s["km_tor"].get(o["tor"], INF) > limit_km
            and all(not o["wsp"] or _km(o["wsp"], p) >= config.RED_PONOWIENIE_NOWY_PUNKT_KM for p in s["punkty"])]
    bliższe = [o for o in dobre if o["km"] <= s["min_p"] - config.RED_PONOWIENIE_BLIZEJ_KM]
    kandydaci = nowe or bliższe
    return min(kandydaci, key=lambda o: o["km"]) if kandydaci else None


def krok(voiv: str, obiekty: list[dict], rcb: tuple, teraz: datetime) -> dict | None:
    """Jedna ocena przy trwającym czerwonym. Zwraca powód ponowienia albo None.

    `obiekty` to sygnały, które same dałyby klucz czerwonego (`fusion.red_key`),
    `rcb` to (stopień, id) bieżącego alertu RCB.
    """
    s = _sesje.get(voiv)
    if s is None:                  # restart procesu albo cisza po powrocie na czerwony
        s = _sesje[voiv] = _nowa_sesja(teraz)
        _pochlon(s, obiekty, rcb)
        return None
    if rcb[0] >= config.RED_PONOWIENIE_RCB_STOPIEN and rcb[1] not in s["rcb"]:
        s["ost"] = teraz
        _pochlon(s, obiekty, rcb)
        return {"rodzaj": "rcb", "stopien": rcb[0]}
    if teraz - s["ost"] < timedelta(minutes=config.RED_PONOWIENIE_ODSTEP_MIN):
        _pochlon(s, obiekty, rcb)
        return None
    if s["n"] >= config.RED_PONOWIENIE_LIMIT:
        return None
    o = _wybierz(s, obiekty)
    if o is None:
        return None
    s["n"] += 1
    s["ost"] = teraz
    _pochlon(s, obiekty, rcb)
    return {"rodzaj": "obiekt", "km": o["km"], "tor": o["tor"]}


def rozpocznij(voiv: str, obiekty: list[dict], rcb: tuple, teraz: datetime) -> None:
    """Czerwony właśnie poszedł do ludzi."""
    s = _sesje[voiv] = _nowa_sesja(teraz)
    _pochlon(s, obiekty, rcb)


def zakoncz(voiv: str) -> None:
    _sesje.pop(voiv, None)
