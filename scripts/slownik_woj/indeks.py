# -*- coding: utf-8 -*-
"""Indeks PoliMorf dla WSZYSTKICH słów z nazw, które słownik odmienia: miejscowości z TERYT SIMC
(także jednowyrazowe), powiaty, krainy, „powiat”, „województwo”. Dwa przebiegi:
1) lematy, których forma (małymi literami) jest takim słowem, 2) wszystkie formy tych lematów.
Uruchomienie: py -I indeks.py <polimorf.tab> <SIMC.csv> <powiaty.geojson> <dane>/indeks.json"""
import json
import re
import sys
from collections import defaultdict

tab, miejsc, pow_gj, dst = sys.argv[1:5]
slowa = {"powiat", "województwo", "ziemia", "półwysep", "helski", "zachodni", "dolny", "górny",
         "pomorski", "mazurski", "śląsk", "kujawy", "mazury", "warmia", "pomorze", "kaszuby",
         "trójmiasto", "podkarpacie", "podlasie", "mazowsze", "bieszczady", "lubelszczyzna",
         "opolszczyzna", "kielecczyzna", "suwalszczyzna", "wielkopolska", "małopolska", "lubuska",
         "dolnośląski", "lubelski", "lubuski", "łódzki", "małopolski", "mazowiecki", "opolski",
         "podkarpacki", "podlaski", "śląski", "świętokrzyski", "wielkopolski", "zachodniopomorski"}
if miejsc.endswith(".csv"):            # TERYT SIMC (GUS) — pełny rejestr miejscowości
    import csv
    for x in csv.DictReader(open(miejsc, encoding="utf-8-sig"), delimiter=";"):
        slowa |= {w.lower() for w in re.split(r"[\s-]+", x["NAZWA"]) if w}
else:
    for nazwa, *_ in json.load(open(miejsc, encoding="utf-8"))["m"]:
        slowa |= {w.lower() for w in re.split(r"[\s-]+", nazwa) if w}
for f in json.load(open(pow_gj, encoding="utf-8"))["features"]:
    slowa |= {w.lower() for w in re.split(r"[\s-]+", f["properties"]["name"]) if w}
lematy = set()
with open(tab, encoding="utf-8") as f:
    for line in f:
        p = line.split("\t", 3)
        if len(p) >= 3 and p[0].lower() in slowa:
            lematy.add(p[1].split(":")[0])
idx = defaultdict(list)
with open(tab, encoding="utf-8") as f:
    for line in f:
        p = line.rstrip("\n").split("\t")
        if len(p) >= 3:
            lem = p[1].split(":")[0]
            if lem in lematy:
                idx[lem].append((p[0], p[2], p[3] if len(p) > 3 else ""))
json.dump(idx, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
print("słów:", len(slowa), "lematów:", len(idx))
