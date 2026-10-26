# -*- coding: utf-8 -*-
"""Formy jednowyrazowych miejscowości ze słownika, które są też formą słowa POSPOLITEGO
(lemat małą literą w PoliMorf): „tych” (ten / Tychy), „pile” (piła / Piła), „helu” (hel / Hel).
Wynik jest do PRZEJRZENIA: listę POSPOLITE w buduj.py uzupełnia się ręcznie (formy, które
w wiadomościach znaczą miasto, jak „Sosnowcu”, zostają przy mieście).
Uruchomienie: py -I pospolite.py <polimorf.tab> frontend/assets/slownik-woj.json <wyjście.json>"""
import json
import sys
import unicodedata

tab, slownik, dst = sys.argv[1:4]


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").lower().replace("ł", "l"))
    return "".join(c for c in s if not unicodedata.combining(c))


F = json.load(open(slownik, encoding="utf-8"))["frazy"]
kandydaci = {f for f, (v, r) in F.items() if r == "m" and " " not in f and "-" not in f}
out = {}
with open(tab, encoding="utf-8") as fh:
    for linia in fh:
        p = linia.rstrip("\n").split("\t")
        if len(p) < 3 or not p[1][:1].islower():
            continue
        f = fold(p[0])
        if f in kandydaci:
            out.setdefault(f, set()).add(p[1] + " " + p[2].split(":")[0])
json.dump({k: sorted(v) for k, v in sorted(out.items())}, open(dst, "w", encoding="utf-8"),
          ensure_ascii=False, indent=0)
print(len(kandydaci), "kandydatów,", len(out), "pospolitych")
