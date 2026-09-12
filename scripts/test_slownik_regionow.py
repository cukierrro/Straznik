# -*- coding: utf-8 -*-
"""Kontrola słownika nazw regionów: kolizje ze słowami pospolitymi i między sobą.

Powód istnienia: 12.09.2026 ogólnopolski komunikat wojskowy trafił do
wielkopolskiego, bo „rozpoznania" zawiera „poznan". Słownik ma dziś kilkaset
haseł i takich pułapek nie da się wyłapać wzrokiem. Ten test sprawdza:

  1. żadne hasło nie trafia w typowe słowo z tekstów o zagrożeniu powietrznym,
  2. to samo hasło nie należy do dwóch województw naraz,
  3. hasło zawarte w haśle innego województwa ma tam sens tylko wtedy, gdy jest
     KRÓTSZE (wtedy rozstrzyga reguła najdłuższego trafienia),
  4. każde województwo ma sensowną liczbę haseł,
  5. backend i silnik wbudowany mają identyczne słowniki i listy wetujące.

Uruchomienie:  py scripts/test_slownik_regionow.py
"""
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app import config                                            # noqa: E402
from app.collectors import rss_media                              # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    if not warunek:
        bledy.append(opis)
    return warunek


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("ł", "l")


# ── 1. słowa, które w tekstach o zagrożeniu padają stale ────────────────────
# Każde z nich MUSI przejść bez przypisania do województwa.
KORPUS = """
rozpoznania rozpoznanie rozpoznano rozpoznawcze rozpoznawczy rozpoznawczego
na swiecie swiat swiecie swiata swiatowej belkot belkotu topole topola topoli
policja policyjny policzek policzki wszystkim wielu tych
ostrzalem operowanie lotnictwa dowodztwo przestrzeni powietrznej naruszenie
dronow rakiet obrony powietrznej systemy radiolokacyjnego dzialalnosci
operacyjnej komunikacie podano zostalo mieszkancow terenie wojewodztw
poludniowo wschodniej granicy panstwa alarm syreny wybuch eksplozja szczatki
wojsko sily zbrojne mysliwce mig pisze napisz zapisz rynek rynna rynkowy
pila pily kolo kolem turek turcji buk bukiet reda rumianek zary zar
laska laskawy lasku nisko nizej helem helu hel gazu
sluzby prokuratura ewakuacja zagrozenie bezpieczenstwo policjanci strazacy
marki marek ząbki zabki zebow zielonka zielonki warka warki zator zatoru
zatory gniew gniewu gniewem lapy lapa jawor jawory susz suszy suszarka
wolowina ryki ryku ryk syren zaryczaly potok oplata oplaty kwiecie
"""


def hasla_w(tekst: str):
    """Które województwa rozpoznaje matcher w podanym tekście."""
    return rss_media._match_voivs(tekst)


print("1. slowa pospolite nie moga trafiac w zadne wojewodztwo")
for slowo in KORPUS.split():
    got = hasla_w(slowo)
    if got:
        bledy.append(f"slowo pospolite '{slowo}' -> {got}")
print(f"   sprawdzono {len(KORPUS.split())} slow, kolizji: "
      f"{len([b for b in bledy if 'slowo pospolite' in b])}")

print("2. jedno haslo = jedno wojewodztwo")
wystapienia = {}
for woj, hasla in config.VOIV_KEYWORDS.items():
    for h in hasla:
        wystapienia.setdefault(fold(h), []).append(woj)
for h, woje in wystapienia.items():
    sprawdz(len(set(woje)) == 1, f"haslo '{h}' nalezy do {sorted(set(woje))}")
print(f"   hasel lacznie: {sum(len(v) for v in config.VOIV_KEYWORDS.values())},"
      f" unikalnych: {len(wystapienia)}")

print("3. haslo zawarte w hasle innego wojewodztwa musi byc od niego krotsze")
# Dluzsze haslo wygrywa w _match_voivs, wiec zawieranie jest bezpieczne tylko
# w te strone: „podlask" (podlaskie) w „radzyn podlask" (lubelskie) jest OK,
# bo dluzsze trafienie przykrywa krotsze.
for woj_a, hasla_a in config.VOIV_KEYWORDS.items():
    for a in hasla_a:
        fa = fold(a)
        for woj_b, hasla_b in config.VOIV_KEYWORDS.items():
            if woj_a == woj_b:
                continue
            for b in hasla_b:
                fb = fold(b)
                if fa == fb or fa not in fb:
                    continue
                sprawdz(len(fa) < len(fb),
                        f"'{a}' ({woj_a}) w '{b}' ({woj_b}) nie jest krotsze")

print("4. kazde wojewodztwo ma sensowny slownik")
for woj, hasla in sorted(config.VOIV_KEYWORDS.items()):
    ile = len(hasla)
    ok = sprawdz(ile >= 12, f"{woj} ma tylko {ile} hasel")
    print(f"   {'OK ' if ok else 'MALO'} {woj:<22} {ile:>3}")

print("5. przypadki, ktore MUSZA trafiac poprawnie")
PRZYPADKI = [
    ("wojskowy dron spadl obok domu na podlasiu", ["podlaskie"]),
    ("rakieta uderzyla w dom na lubelszczyznie", ["lubelskie"]),
    ("na podkarpaciu nie spadl zaden dron", ["podkarpackie"]),
    ("w bialej podlaskiej zawyly syreny", ["lubelskie"]),
    ("w radzyniu podlaskim slychac bylo wybuch", ["lubelskie"]),
    ("w bielsku podlaskim ogloszono alarm", ["podlaskie"]),
    ("w wysokiem mazowieckiem znaleziono szczatki", ["podlaskie"]),
    ("w sokolowie podlaskim zawyly syreny", ["mazowieckie"]),
    ("dron nad tomaszowem mazowieckim", ["łódzkie"]),
    ("dron nad tomaszowem lubelskim", ["lubelskie"]),
    ("alarm w krosnie odrzanskim", ["lubuskie"]),
    ("alarm w krosnie", ["podkarpackie"]),
    ("eksplozja w opolu lubelskim", ["lubelskie"]),
    ("eksplozja w opolu", ["opolskie"]),
    ("dron nad dolnym slaskiem", ["dolnośląskie"]),
    ("syreny na gornym slasku", ["śląskie"]),
    ("alarm na pomorzu zachodnim", ["zachodniopomorskie"]),
    ("drony nad pomorzem", ["pomorskie"]),
    ("rozpoznania radiolokacyjnego powrocily do dzialalnosci", []),
    ("naziemne systemy obrony powietrznej i rozpoznania", []),
]
for tekst, oczek in PRZYPADKI:
    got = hasla_w(tekst)
    ok = sprawdz(got == oczek, f"'{tekst[:46]}' -> {got}, oczekiwano {oczek}")
    print(f"   {'OK  ' if ok else 'BLAD'} {tekst[:50]:<52} -> {got}")

print("6. backend i silnik wbudowany maja te same listy")
ENGINE = ROOT / "frontend/engine.js"
js = f"""
const src = require('fs').readFileSync({json.dumps(str(ENGINE))}, 'utf8');
function tablica(nazwa) {{
  const i = src.indexOf('const ' + nazwa + ' = [');
  const j = src.indexOf('];', i);
  return eval(src.slice(i + ('const ' + nazwa + ' = ').length, j + 1));
}}
function slownik(nazwa) {{
  const i = src.indexOf('const ' + nazwa + ' = {{');
  const j = src.indexOf('}};', i);
  return eval('(' + src.slice(i + ('const ' + nazwa + ' = ').length, j + 1) + ')');
}}
console.log(JSON.stringify({{
  VOIV_KEYWORDS: slownik('VOIV_KEYWORDS'),
  EXCLUDE: tablica('EXCLUDE'), CRITICAL: tablica('CRITICAL'),
  AIR: tablica('AIR'), EVENT: tablica('EVENT'),
  MEDIA_CLEAR: tablica('MEDIA_CLEAR'), FOREIGN: tablica('FOREIGN_PLACES'),
  SOFT_EXCLUDE: tablica('SOFT_EXCLUDE'),
}}));
"""
try:
    out = subprocess.run([("node.exe" if sys.platform == "win32" else "node"), "-e", js],
                         capture_output=True, text=True, encoding="utf-8", timeout=60)
    silnik = json.loads(out.stdout)
except Exception as e:                       # noqa: BLE001
    silnik = None
    bledy.append(f"nie udalo sie odczytac list z engine.js: {e}")

if silnik:
    for nazwa, po_stronie_py in (
            ("VOIV_KEYWORDS", config.VOIV_KEYWORDS),
            ("EXCLUDE", config.EXCLUDE_KEYWORDS),
            ("CRITICAL", config.ALERT_CRITICAL_KEYWORDS),
            ("AIR", config.ALERT_AIR_KEYWORDS),
            ("EVENT", config.ALERT_EVENT_KEYWORDS),
            ("MEDIA_CLEAR", config.MEDIA_CLEAR_KEYWORDS),
            ("FOREIGN", config.FOREIGN_PLACE_MARKERS),
            ("SOFT_EXCLUDE", config.SOFT_EXCLUDE_KEYWORDS)):
        js_val = silnik[nazwa]
        if isinstance(po_stronie_py, dict):
            zgodne = {k: sorted(v) for k, v in js_val.items()} == \
                     {k: sorted(v) for k, v in po_stronie_py.items()}
        else:
            zgodne = sorted(js_val) == sorted(po_stronie_py)
        ok = sprawdz(zgodne, f"{nazwa}: engine.js != config.py")
        print(f"   {'OK  ' if ok else 'BLAD'} {nazwa:<14} "
              f"py={len(po_stronie_py)} js={len(js_val)}")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    for b in bledy[:40]:
        print(" -", b)
    sys.exit(1)
print("\nOK - slownik bez kolizji, obie strony zgodne")
