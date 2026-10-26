# -*- coding: utf-8 -*-
"""Audyt słownika w OBIE strony (warunek wdrożenia 23.10.2026: 0 i 0), prawda z TERYT SIMC.
  1. CUDZE województwo: każda nazwa z SIMC zawierająca słowo słownika, w mianowniku,
     dopełniaczu i miejscowniku — dopasowanie nie może dać województwa spoza oczekiwanych.
  2. ZGUBIONE: każda forma każdej miejscowości z haseł, przymiotnika województwa, krainy
     i powiatu musi dać swoje województwo (chyba że reguła czyni ją neutralną).
Reguły rozstrzygania (jawne, opis w app/slownik_woj.py): kraina/województwo → jego
województwo; miejscowość z listy haseł wygrywa z niewymienioną o tej samej formie; dwa miasta
o tej samej nazwie → neutralne; forma o dwóch znaczeniach albo słowo pospolite → neutralne;
„Pod Chełmem” itp. (przyimek + miasto) czytamy jak „koło Chełma”.
23.10.2026 sprawdzono też, że żaden z 274 tytułów mediów z punktami (od 12.09) nie stracił
trafienia — na danych produkcyjnych, których nie trzymamy w repozytorium.
Uruchomienie (najpierw buduj.py):  py scripts/slownik_woj/audyt.py <dane>
Kod wyjścia 1, gdy którakolwiek liczba błędów > 0."""
import contextlib
import io
import runpy
import sys
from pathlib import Path

TU = Path(__file__).resolve().parent


class _Cicho(io.StringIO):
    def reconfigure(self, **_k):
        pass


with contextlib.redirect_stdout(_Cicho()):
    G = runpy.run_path(str(TU / "buduj.py"))
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(TU.parents[1] / "backend"))
from app import slownik_woj                      # noqa: E402

F = slownik_woj._slownik()[0]
fold, TOK, PRZYIMKI = slownik_woj.fold, slownik_woj.TOK, slownik_woj.PRZYIMKI
odmiany_nazwy, IDX, SIMC = G["odmiany_nazwy"], G["IDX"], G["SIMC"]


def klucz(s):
    return " ".join(TOK.findall(fold(s)))


def wynik(forma):
    return set(slownik_woj.wojewodztwa(f"Drony nad {forma}"))


def oczekiwane(forma, prawdziwe):
    k = klucz(forma)
    if " " in k and k.split()[0] in PRZYIMKI:          # „Pod Chełmem” = koło Chełma
        k = k.split(" ", 1)[1]
    if k in F:
        return {F[k][0]} - {None}
    return set(prawdziwe)


# ── 1. cudze województwo ─────────────────────────────────────────────────────
slowa = {w for fr in F for w in fr.split()} | {c for fr in F for w in fr.split() for c in w.split("-")}
cudze, sprawdzone = [], 0
for nazwa, wojs in SIMC.items():
    tk = klucz(nazwa).split()
    if not any(w in slowa or any(c in slowa for c in w.split("-")) for w in tk):
        continue
    formy = {nazwa}
    if " " in nazwa or "-" in nazwa:
        formy |= odmiany_nazwy(nazwa)
    else:
        formy |= {f for f, tag, _ in IDX.get(nazwa, []) if ":sg:" in tag and (":gen" in tag or ":loc" in tag)}
    for f in formy:
        sprawdzone += 1
        zle = wynik(f) - oczekiwane(f, wojs)
        if zle:
            cudze.append((nazwa, f, sorted(wojs), sorted(zle)))
print(f"1. CUDZE województwo: {len(cudze)} na {sprawdzone} sprawdzonych form ({len(SIMC)} nazw w SIMC)")
for c in cudze[:40]:
    print("   ", c)

# ── 2. zgubione ──────────────────────────────────────────────────────────────
zgub, ile = [], 0


def sprawdz(forma, voiv, skad):
    global ile
    ile += 1
    k = klucz(forma)
    if k in F and F[k][0] is None:
        return                                          # neutralna z reguły — świadomie
    if voiv not in wynik(forma):
        zgub.append((skad, forma, voiv))


for voiv, ns in G["MIASTA"].items():
    for n in ns:
        for f in odmiany_nazwy(n):
            sprawdz(f, voiv, "miejscowość z haseł")
for voiv, przym in G["PRZYM"].items():
    for p in przym:
        przedrostek, baza = (p.split("-")[0] + "-", p.split("-")[1]) if p not in IDX and "-" in p else ("", p)
        for forma, tag, _k in IDX[baza]:
            if tag.startswith("adj") and tag.split(":")[-1] == "pos":
                sprawdz(przedrostek + forma, voiv, "przymiotnik województwa")
    for kr in G["KRAINY"][voiv]:
        for f in odmiany_nazwy(kr):
            sprawdz(f, voiv, "kraina")
    for f in odmiany_nazwy("województwo " + voiv):
        sprawdz(f, voiv, "województwo X")
for n, wojs in G["powiaty_woj"].items():
    if len(wojs) == 1:
        for f in odmiany_nazwy(n):
            sprawdz(f, next(iter(wojs)), "powiat")
print(f"\n2. ZGUBIONE: {len(zgub)} na {ile} sprawdzonych form")
for z in zgub[:60]:
    print("   ", z)
sys.exit(1 if cudze or zgub else 0)
