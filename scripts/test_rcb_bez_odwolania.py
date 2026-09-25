# -*- coding: utf-8 -*-
"""Alert RCB obowiązuje do odwołania — mówimy o tym, dopóki odwołanie nie przyjdzie.

24/25.09.2026: RCB wydało alert dla podkarpackiego o 22:01, a odwołanie
opublikowało dopiero około 05:00 — siedem godzin później. Nasze sygnały wygasają
po oknie fuzji, więc przez większość nocy mapa wyglądała spokojnie, choć
oficjalnie alert stał. Użytkownik nie ma skąd tego wiedzieć.

Sygnał jest INFORMACYJNY, za zero punktów: Strażnik punktuje to, co widzi,
a tutaj nic nowego nie widzi — wie tylko, że odwołanie nie przyszło.

Uruchomienie: python scripts/test_rcb_bez_odwolania.py
"""
from __future__ import annotations

import pathlib
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

from app.fusion import rcb_nieodwolane  # noqa: E402

REF = datetime(2026, 9, 25, 3, 0, tzinfo=timezone.utc)      # 05:00 czasu polskiego
bledy: list[str] = []


def iso(godz: int, minut: int = 0, dzien: int = 24) -> str:
    return datetime(2026, 9, dzien, godz, minut, tzinfo=timezone.utc).isoformat(timespec="seconds")


def sygnal(typ: str, voiv: str, ts: str, punkty: float = 1.5) -> dict:
    return {"event_type": typ, "voivodeship": voiv, "ts": ts, "points": punkty}


def sprawdz(nazwa: str, warunek: bool, szczegol: str = "") -> None:
    if not warunek:
        bledy.append(f"{nazwa}{(': ' + szczegol) if szczegol else ''}")


# ── realny przebieg z 24/25.09.2026 ─────────────────────────────────────────
wynik = rcb_nieodwolane([sygnal("rcb_alert", "podkarpackie", iso(20, 2))], REF)
sprawdz("nieodwołany alert jest zgłoszony", "podkarpackie" in wynik, str(wynik))
if "podkarpackie" in wynik:
    sprawdz("liczymy czas od alertu", wynik["podkarpackie"]["minut"] == 418,
            str(wynik["podkarpackie"]["minut"]))

# ── odwołanie gasi komunikat ────────────────────────────────────────────────
wynik = rcb_nieodwolane([sygnal("rcb_alert", "podkarpackie", iso(20, 2)),
                         sygnal("rso_clear", "podkarpackie", iso(2, 58, dzien=25), 0.0)], REF)
sprawdz("po odwołaniu nic nie zgłaszamy", wynik == {}, str(wynik))

# ── odwołanie STARSZE od alertu nie gasi nowego alertu ──────────────────────
wynik = rcb_nieodwolane([sygnal("rso_clear", "podkarpackie", iso(18, 0), 0.0),
                         sygnal("rcb_alert", "podkarpackie", iso(20, 2))], REF)
sprawdz("stare odwołanie nie gasi nowszego alertu", "podkarpackie" in wynik, str(wynik))

# ── odwołanie w innym województwie nie gasi naszego ─────────────────────────
wynik = rcb_nieodwolane([sygnal("rcb_alert", "podkarpackie", iso(20, 2)),
                         sygnal("rso_clear", "lubelskie", iso(21, 0), 0.0)], REF)
sprawdz("odwołanie u sąsiada nie gasi podkarpackiego", "podkarpackie" in wynik, str(wynik))

# ── wpis bez punktów to nie alert (np. samo odniesienie z gov.pl) ───────────
wynik = rcb_nieodwolane([sygnal("rcb_govpl", "podkarpackie", iso(20, 2), 0.0)], REF)
sprawdz("sam wpis odniesienia nie jest alertem", wynik == {}, str(wynik))

# ── zdarzenia z przyszłości (odtwarzanie historii) pomijamy ─────────────────
wynik = rcb_nieodwolane([sygnal("rcb_alert", "podkarpackie", iso(4, 0, dzien=25))], REF)
sprawdz("alert późniejszy niż chwila odniesienia jest pomijany", wynik == {}, str(wynik))

# ── kilka alertów: liczy się najnowszy ──────────────────────────────────────
wynik = rcb_nieodwolane([sygnal("rcb_alert", "podkarpackie", iso(18, 0)),
                         sygnal("rso_alert", "podkarpackie", iso(20, 2))], REF)
sprawdz("bierzemy najnowszy alert", wynik.get("podkarpackie", {}).get("minut") == 418,
        str(wynik))

# ── okno pilnowania jest skończone ──────────────────────────────────────────
from app import config  # noqa: E402
sprawdz("okno pilnowania nie jest nieskończone",
        0 < config.RCB_NIEODWOLANY_MAX_MIN <= 24 * 60, str(config.RCB_NIEODWOLANY_MAX_MIN))

if bledy:
    print("BŁĘDY:")
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("OK — nieodwołany alert RCB zgłaszany do skutku, odwołanie go gasi (8 przypadków)")
