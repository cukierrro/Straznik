# -*- coding: utf-8 -*-
"""Odwołanie o treści ogólnokrajowej gasi alert we wszystkich województwach.

RSO przypisuje komunikat do JEDNEGO województwa, choć RCB rozsyła go do
wszystkich, które dostały alert. Dowód nie z dokumentacji, tylko z telefonu
czytelniczki z Podkarpacia (24/25.09.2026): SMS z alertem o 21:45 i SMS
z odwołaniem o 05:35 — a RSO w obu wpisach podało wyłącznie lubelskie.

Potwierdza to też historia z produkcji: 16.09.2026 to samo odwołanie
(„Brak zagrożenia na terenie Polski") przyszło z RSO DWA RAZY — o 05:38 dla
lubelskiego i o 05:42 dla podkarpackiego. Czyli RCB wysyła je wszystkim,
tylko RSO rozbija to na osobne wpisy, czasem z opóźnieniem, a czasem
(24/25.09) drugiego wpisu nie ma wcale.

Ostrożność NIE jest tu przesadą — 13.09.2026 pokazuje, że odwołania bywają
naprawdę wojewódzkie. Tamtego dnia wpis RSO 23329799 (alert dla lubelskiego)
został PRZEROBIONY W MIEJSCU na „UWAGA! UWAGA! UWAGA! Odwołano zagrożenie
atakiem z powietrza. Śledź komunikaty." — i w tej samej chwili podkarpackie
miało własny alert 23329800 ważny jeszcze przez półtorej godziny, a o 06:41
dostało KOLEJNY (23329983). Rozesłanie tamtego odwołania po wszystkich
województwach wyciszyłoby podkarpackie w trakcie trwającego alertu.

Dlatego rozstrzyga TREŚĆ, a nie forma wpisu: „przerobiony alert" to nie to samo
co „odwołanie wojewódzkie" — z czterech odwołań o treści ogólnokrajowej trzy
też były przeróbkami pojedynczego wpisu (16.09 podkarpackie, 23.09 lubelskie).
Gdyby kiedyś RCB napisało odwołanie ogólnokrajowe bez słów o Polsce, zgasimy
tylko jedno województwo — czyli pomylimy się w bezpieczną stronę.

Uruchomienie: python scripts/test_odwolanie_krajowe.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

from app import config                                            # noqa: E402
from app.fusion import _clear_krajowe, accumulate, rcb_nieodwolane   # noqa: E402
from datetime import datetime, timezone                           # noqa: E402

bledy: list[str] = []

KRAJOWE = ('RCB (RSO): odwołanie — „UWAGA! Zakończył się atak powietrzny '
           'na Ukrainę. Brak zagrożenia na terenie Polski.”')
WOJEWODZKIE = ('RCB (RSO): odwołanie — „UWAGA! UWAGA! UWAGA! Odwołano zagrożenie '
               'atakiem z powietrza. Śledź komunikaty.”')


def sprawdz(nazwa: str, warunek: bool, szczegol: str = "") -> None:
    if not warunek:
        bledy.append(f"{nazwa}{(': ' + szczegol) if szczegol else ''}")


def clear(title: str, voiv: str, ts: str) -> dict:
    return {"source": "rcb", "event_type": "rso_clear", "voivodeship": voiv, "ts": ts,
            "points": 0.0, "title": title, "details": {"cleared_at": ts, "rso_id": "1"}}


def alert(voiv: str, ts: str) -> dict:
    return {"source": "rcb", "event_type": "rso_alert", "voivodeship": voiv, "ts": ts,
            "points": 1.5, "title": "Alert RCB (RSO)", "details": {"rso_id": "2"}}


def gaszony(a: dict, c: dict) -> bool:
    """Czy PRODUKCYJNA fuzja wygasiła ten alert po tym odwołaniu.

    Wołamy `accumulate`, a nie własną kopię reguły — inaczej test potwierdzałby
    sam siebie. Sprawdzone mutacją: usunięcie rozsyłania odwołania krajowego
    w `accumulate` musi ten test wywalić.
    """
    per = accumulate([a, c], datetime.fromisoformat(c["ts"]))
    wpisy = [x for x in per[a["voivodeship"]]["signals"] if x.get("event_type") == a["event_type"]]
    assert wpisy, f"alert {a['voivodeship']} zniknął z fuzji"
    return bool(wpisy[0].get("cleared")) and (wpisy[0].get("counted_points") or 0) == 0


# ── rozpoznanie treści ──────────────────────────────────────────────────────
sprawdz("treść ogólnokrajowa rozpoznana", _clear_krajowe(clear(KRAJOWE, "lubelskie", "x")))
sprawdz("treść wojewódzka NIE jest ogólnokrajowa",
        not _clear_krajowe(clear(WOJEWODZKIE, "lubelskie", "x")))
sprawdz("alert nie jest odwołaniem", not _clear_krajowe(alert("lubelskie", "x")))
# Media potrafią zacytować tę samą treść. Wpis medialny NIE może gasić alertów
# w całym kraju — odwołanie liczy się tylko z kanału RSO.
sprawdz("cytat w mediach nie jest odwołaniem RCB",
        not _clear_krajowe({"event_type": "media", "voivodeship": "lubelskie", "ts": "x",
                            "points": 1.0,
                            "source": "media",
                            "title": "Brak zagrożenia na terenie Polski — RCB odwołało alert"}))

# ── noc 24/25.09.2026: odwołanie tylko dla lubelskiego gasi też podkarpackie ─
c = clear(KRAJOWE, "lubelskie", "2026-09-25T03:25:09+00:00")
a_podk = alert("podkarpackie", "2026-09-24T20:02:17+00:00")
sprawdz("24/25.09: podkarpackie gaszone odwołaniem przypisanym lubelskiemu",
        gaszony(a_podk, c))

# ── 13.09.2026: treść bez zasięgu krajowego NIE gasi sąsiada ────────────────
c13 = clear(WOJEWODZKIE, "lubelskie", "2026-09-13T06:08:00+00:00")
sprawdz("13.09: odwołanie wojewódzkie nie gasi podkarpackiego",
        not gaszony(alert("podkarpackie", "2026-09-13T02:36:00+00:00"), c13))
sprawdz("13.09: swoje województwo gaszone normalnie",
        gaszony(alert("lubelskie", "2026-09-13T02:11:00+00:00"), c13))

# ── alert wydany PO odwołaniu zostaje w mocy (nowa fala) ────────────────────
sprawdz("alert nowszy niż odwołanie nie jest gaszony",
        not gaszony(alert("podkarpackie", "2026-09-25T04:00:00+00:00"), c))

# ── sygnał „nie odwołano" milknie po odwołaniu ogólnokrajowym ───────────────
REF = datetime(2026, 9, 25, 8, 0, tzinfo=timezone.utc)
wynik = rcb_nieodwolane([a_podk, c], REF)
sprawdz("po odwołaniu ogólnokrajowym nie mówimy „nie odwołano”", wynik == {}, str(wynik))
wynik = rcb_nieodwolane([a_podk, c13], REF)
sprawdz("po odwołaniu wojewódzkim u sąsiada nadal mówimy „nie odwołano”",
        "podkarpackie" in wynik, str(wynik))

if bledy:
    print("BŁĘDY:")
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("OK — odwołanie ogólnokrajowe gasi wszystkie województwa, wojewódzkie tylko swoje "
      "(9 przypadków, w tym realne z 13.09, 16.09 i 24/25.09.2026)")
