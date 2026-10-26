# -*- coding: utf-8 -*-
"""Rdzeń hasła → nazwa miejscowości z TERYT SIMC w TYM SAMYM województwie: najpierw miasta (RM 96),
potem reszta; najkrótsza pasująca nazwa. Zastępuje dobór ze spisu OSM GROTY (brak Gdańska/Gdyni).
Hasła regionów i przymiotników województw (NIE) idą do słownika osobno.
Wynik (nazwy_hasel.json) jest w repozytorium; przebudowa tylko po zmianie VOIV_KEYWORDS.
Uruchomienie: py scripts/slownik_woj/nazwy_hasel.py <SIMC.csv>"""
import csv, json, sys, unicodedata
from collections import defaultdict
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
TU = Path(__file__).resolve().parent
sys.path.insert(0, str(TU.parents[1] / "backend"))
from app import config
NIE = ("dolnośląsk", "dolnoslask", "dolny śląsk", "dolnym śląsku", "dolnym śląskiem",
        "dolnego śląska", "dolnoślązak", "kujawsko", "kujawach", "kujawy", "lubelski",
        "lubelskie", "lubelskiem", "lubelszczy", "lubusk", "łódzk", "lodzk", "małopolsk",
        "malopolsk", "małopolsce", "mazowieck", "mazowsz", "opolsk", "śląsk opolsk",
        "śląsku opolsk", "śląska opolsk", "opolszczy", "podkarpack", "podkarpaci", "podlask",
        "podlasi", "woj. pomorsk", "pomorskiego", "pomorzu", "pomorza", "pomorze", "kaszub",
        "trójmiast", "półwysep hel", "śląski", "slaski", "śląsku", "śląska", "śląsk",
        "świętokrzysk", "swietokrzysk", "kielecczy", "warmińsko", "warminsko", "warmii",
        "warmia", "mazurach", "mazurskiego", "wielkopolsk", "wielkopolsce", "zachodniopomorsk",
        "pomorze zachodnie", "pomorzu zachodnim", "pomorza zachodniego", "zachodnim pomorzu",
        "zachodniego pomorza", "bieszczad", "medyka-sz", "warta k. sieradza")
def fold(s):
    s = unicodedata.normalize("NFD", (s or "").lower().replace("ł", "l"))
    return "".join(c for c in s if not unicodedata.combining(c))
WOJ_KOD = {"02": "dolnośląskie", "04": "kujawsko-pomorskie", "06": "lubelskie", "08": "lubuskie", "10": "łódzkie",
           "12": "małopolskie", "14": "mazowieckie", "16": "opolskie", "18": "podkarpackie", "20": "podlaskie",
           "22": "pomorskie", "24": "śląskie", "26": "świętokrzyskie", "28": "warmińsko-mazurskie",
           "30": "wielkopolskie", "32": "zachodniopomorskie"}
P = Path(sys.argv[1])
mj = defaultdict(lambda: defaultdict(set))
for x in csv.DictReader(open(P, encoding="utf-8-sig"), delimiter=";"):
    mj[WOJ_KOD[x["WOJ"]]]["m" if x["RM"] == "96" else "w"].add(x["NAZWA"])
wynik, brak = {}, []
for voiv, keys in config.VOIV_KEYWORDS.items():
    for k in keys:
        if k in NIE:
            continue
        kf = fold(k)
        slowa = kf.split()
        traf = None
        for typ in ("m", "w"):
            c = sorted({n for n in mj[voiv][typ] if fold(n).startswith(kf) or (
                len(slowa) > 1 and all(any(fold(s).startswith(w) for s in n.replace("-", " ").split()) for w in slowa)
                and fold(n).startswith(slowa[0]))}, key=len)
            if c:
                traf = c
                break
        if traf:
            wynik.setdefault(voiv, {}).setdefault(traf[0], []).append(k)
        else:
            brak.append((voiv, k))
(TU / "nazwy_hasel.json").write_text(json.dumps(wynik, ensure_ascii=False, indent=1), encoding="utf-8")
print("miejscowości:", sum(len(v) for v in wynik.values()), "bez trafienia:", len(brak))
print(brak)
print("pomorskie:", sorted(wynik.get("pomorskie", {})))
