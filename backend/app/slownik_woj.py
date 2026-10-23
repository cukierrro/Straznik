# -*- coding: utf-8 -*-
"""Rozpoznawanie województw w tekście po PEŁNYCH formach (23.10.2026, decyzja usera).

Do 23.10 słownik miał rdzenie („podlask”, „august”, „chełm”) i dopasowanie od początku
słowa. Audyt nazw z TERYT pokazał 1238 form, które dawały CUDZE województwo, m.in.:
  * „Biała Podlaska” → podlaskie (w alercie RCB dla lubelskiego — fałszywe żółte w podlaskim),
  * „Augustówka” → podlaskie (rdzeń Augustowa),
  * „świdnicki” (powiat w lubelskim) → dolnośląskie (Świdnica).
Teraz: frazy we wszystkich przypadkach z PoliMorf 0.6.7 (IPI PAN, BSD 2-clause), miejscowości
z TERYT SIMC (GUS), dopasowanie CAŁYCH słów i najdłuższej frazy. Dane: frontend/assets/
slownik-woj.json (generator i audyt w scripts/slownik_woj/). Audyt 23.10: 0 form z cudzym
województwem na 108 892 i 0 zgubionych na 4496; żaden z 274 tytułów mediów z punktami
nie stracił trafienia.

Rodzaje fraz: „r” region/przymiotnik województwa, „m” miejscowość, „p” powiat,
„x” fraza ochronna (wieloczłonowa nazwa z TERYT — przypisana do prawdziwego województwa
albo neutralna, gdy nazwa jest w kilku). Reguły rozstrzygania:
  * kraina/województwo → jego województwo (wieś „Mazowsze” nie zmienia znaczenia słowa),
  * miejscowość z listy haseł wygrywa z niewymienioną o tej samej formie,
  * dwa miasta o tej samej nazwie → neutralne (Józefów); wyjątki: Bolesławiec, Oleśnica, Olsztyn,
  * forma o dwóch znaczeniach z różnych województw → neutralna („Radomska”).
Lustro: frontend/engine.js (dopasujWojewodztwa).
"""
import json
import re
import unicodedata
from functools import lru_cache

from . import config

PLIK = config.BASE_DIR.parent / "frontend" / "assets" / "slownik-woj.json"
TOK = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
# fraza ochronna zaczynająca się od przyimka („Nad Zieloną” — nazwa wsi) nie może zjeść
# frazy miejscowości („nad Zieloną Górą”)
PRZYIMKI = frozenset({"nad", "pod", "przy", "w", "we", "z", "ze", "na", "do", "od", "k", "kolo"})


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower().replace("ł", "l"))
    return "".join(c for c in s if not unicodedata.combining(c))


@lru_cache(maxsize=1)
def _slownik():
    frazy = {k: tuple(v) for k, v in json.loads(PLIK.read_text(encoding="utf-8"))["frazy"].items()}
    return frazy, max(len(k.split()) for k in frazy)


def _kandydaci(toks):
    frazy, maxn = _slownik()
    out = []
    for i in range(len(toks)):
        for n in range(1, min(maxn, len(toks) - i) + 1):
            fr = " ".join(t[0] for t in toks[i:i + n])
            hit = frazy.get(fr)
            if hit is None:
                continue
            v, r = hit
            if r == "x" and toks[i][0] in PRZYIMKI:
                continue
            out.append((n, r != "x", i, v, r, fr))
    return out


def _wybierz(kand, toks):
    """Najdłuższa fraza w CAŁYM tekście; przy równej długości miejscowość/region/powiat przed
    frazą ochronną, potem od lewej. Frazy się nie nakładają."""
    kand.sort(key=lambda k: (-k[0], not k[1], k[2]))
    zajete, out = set(), []
    for n, _pr, i, v, r, fr in kand:
        if any(j in zajete for j in range(i, i + n)):
            continue
        zajete.update(range(i, i + n))
        out.append((toks[i][1], toks[i + n - 1][2], v, r, fr))
    return out, zajete


def trafienia(text: str):
    """(tekst złożony, [(start, koniec, województwo|None, rodzaj, fraza)]) w kolejności tekstu."""
    t = fold(text)
    toks = [(m.group(), m.start(), m.end()) for m in TOK.finditer(t)]
    out, zajete = _wybierz(_kandydaci(toks), toks)
    # słowo z łącznikiem, którego nie pokryła żadna fraza („Dorohusk-Jagodzin”) → po członach
    for i, (w, a, _b) in enumerate(toks):
        if "-" in w and i not in zajete:
            czesci, poz = [], a
            for cz in w.split("-"):
                czesci.append((cz, poz, poz + len(cz)))
                poz += len(cz) + 1
            out += _wybierz(_kandydaci(czesci), czesci)[0]
    out.sort()
    return t, out


def wojewodztwa(text: str, tylko_regiony: bool = False) -> list[str]:
    """Województwa wymienione w tekście, w kolejności wystąpienia (bez neutralnych).

    Reguła powiatu (21.10.2026, od 23.10 na całe zdanie): pojedynczy przymiotnik po
    „powiat…”/„powiatach” w tym samym zdaniu to nazwa POWIATU z listy („LUBELSKIEGO:
    puławski, opolski, …”), a nie dowód na województwo."""
    t, hits = trafienia(text)
    out: list[str] = []
    for s, _e, v, r, fr in hits:
        if v is None or (tylko_regiony and r != "r"):
            continue
        if r in ("r", "m") and " " not in fr:
            zdanie = re.split(r"[.!?]", t[:s])[-1]
            if "powiat" in zdanie or "powiec" in zdanie:
                continue
        if v not in out:
            out.append(v)
    return out
