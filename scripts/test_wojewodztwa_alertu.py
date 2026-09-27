# -*- coding: utf-8 -*-
"""Odbiorcy alertu RCB — wszystkie 16 województw, nie tylko te ze wschodu.

Skąd ten test: 24/25.09.2026 przy alercie dla podkarpackiego i lubelskiego padło
pytanie, czy zasady zadziałałyby tak samo, gdyby alert dotyczył innych regionów.
Sprawdzenie wykazało dwie dziury, przez które alert mógł przepaść BEZ ŻADNEGO
PUNKTU i bez śladu w dzienniku:

  1. Kotwicą listy odbiorców było samo słowo „wysłany". RCB pisze jednak także
     „zostały wysłane" i „wysłano" — a liczby mnogiej używa właśnie wtedy, gdy
     alert idzie do KILKU województw. Wtedy parser nie znajdował ani jednego
     województwa i cały blok szedł do kosza.
  2. Zakres 260 znaków po kotwicy ucinał długie listy: 16 nazw w dopełniaczu to
     około 290 znaków, więc ostatnie województwo wypadało.

Test pilnuje obu rzeczy dla KAŻDEGO województwa, żeby „działa na podkarpackim"
nie znaczyło „działa”.

Uruchomienie: python scripts/test_wojewodztwa_alertu.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

from app import config                                    # noqa: E402
from app.collectors.rcb import wojewodztwa_alertu         # noqa: E402

bledy: list[str] = []


def dopelniacz(v: str) -> str:
    """„lubelskie" → „lubelskiego" (tak RCB wymienia odbiorców)."""
    return v[:-2] + "ego"


def sprawdz(nazwa: str, otrzymane, oczekiwane) -> None:
    if sorted(otrzymane) != sorted(oczekiwane):
        bledy.append(f"{nazwa}: {otrzymane} zamiast {oczekiwane}")


# ── 1. każde województwo z osobna, w zdaniu takim jak w artykule ────────────
for v in config.VOIVODESHIPS:
    zdanie = (f"Alert RCB o tej treści został wysłany do odbiorców "
              f"na terenie województwa {dopelniacz(v)}.")
    sprawdz(f"pojedynczo: {v}", wojewodztwa_alertu(zdanie), [v])

# ── 2. pary, w których jedna nazwa zawiera się w drugiej ────────────────────
# „opolskie" siedzi w „małopolskie" i „wielkopolskie", „śląskie" w „dolnośląskie",
# „pomorskie" w „kujawsko-pomorskie" i „zachodniopomorskie", „mazurskie" obok
# „mazowieckie". Dłuższa nazwa musi wygrać, a krótsza nie może zniknąć.
PARY = [
    ("opolskiego i małopolskiego", ["opolskie", "małopolskie"]),
    ("małopolskiego", ["małopolskie"]),
    ("opolskiego i wielkopolskiego", ["opolskie", "wielkopolskie"]),
    ("śląskiego i dolnośląskiego", ["śląskie", "dolnośląskie"]),
    ("dolnośląskiego", ["dolnośląskie"]),
    ("pomorskiego i zachodniopomorskiego", ["pomorskie", "zachodniopomorskie"]),
    ("kujawsko-pomorskiego", ["kujawsko-pomorskie"]),
    ("warmińsko-mazurskiego i mazowieckiego", ["warmińsko-mazurskie", "mazowieckie"]),
]
for frag, oczek in PARY:
    sprawdz(f"para: {frag}",
            wojewodztwa_alertu(f"Alert RCB został wysłany do odbiorców na terenie województw {frag}."),
            oczek)

# ── 3. formy czasownika, których RCB używa naprzemiennie ────────────────────
for czas in ("został wysłany do odbiorców", "zostały wysłane do odbiorców",
             "wysłano do odbiorców", "został przekazany do odbiorców"):
    sprawdz(f"czasownik: {czas}",
            wojewodztwa_alertu(f"Alert RCB o tej treści {czas} na terenie województwa podkarpackiego."),
            ["podkarpackie"])

# ── 4. lista wszystkich 16 nie może się urwać ───────────────────────────────
lista = ", ".join(dopelniacz(v) for v in config.VOIVODESHIPS)
sprawdz("cała Polska na liście",
        wojewodztwa_alertu(f"Alert RCB został wysłany do odbiorców na terenie województw {lista}."),
        list(config.VOIVODESHIPS))

# ── 5. czego dopasować NIE wolno ────────────────────────────────────────────
# Powiaty w nawiasie: „województwa lubelskiego (powiaty: puławski, opolski…)"
# dokładało woj. opolskie (usterka z 21.09.2026).
sprawdz("powiaty w nawiasie nie są województwami",
        wojewodztwa_alertu("Alert RCB został wysłany do odbiorców na terenie "
                           "województwa lubelskiego (powiaty: puławski, opolski, rycki)."),
        ["lubelskie"])
# Sam cytat bez zdania o wysyłce nie ma odbiorców — nie zgadujemy.
sprawdz("brak zdania o wysyłce = brak odbiorców",
        wojewodztwa_alertu("„UWAGA! Rosyjski atak powietrzny na terenie Ukrainy.”"), [])

# ── 6. realny blok z artykułu z 24.09.2026 ──────────────────────────────────
sprawdz("realny blok RCB z 24.09.2026",
        wojewodztwa_alertu(
            "„UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest "
            "monitorowana. W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych "
            "komunikatów.” Alert RCB o tej treści został wysłany do odbiorców na terenie "
            "woj. podkarpackiego i lubelskiego."),
        ["podkarpackie", "lubelskie"])

if bledy:
    print("BŁĘDY:")
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print(f"OK — odbiorcy alertu RCB rozpoznawani dla wszystkich {len(config.VOIVODESHIPS)} województw "
      f"({len(PARY)} par zagnieżdżonych nazw, 4 formy czasownika, pełna lista, 3 przypadki negatywne)")
