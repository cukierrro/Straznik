# -*- coding: utf-8 -*-
"""Słownik województw z PEŁNYMI FORMAMI (decyzja usera 23.10.2026): zamiast rdzeni
(„podlask” łapało „Biała Podlaska”, „august” — „Augustówka”) wszystkie odmiany przez
przypadki z PoliMorf 0.6.7 (BSD 2-clause, IPI PAN) i dopasowanie CAŁYCH słów
z pierwszeństwem najdłuższej frazy.

Wejście (katalog <dane>, patrz README.md): indeks.json (PoliMorf, z indeks.py), SIMC.csv
(TERYT SIMC, GUS), powiaty.geojson (OSM, ODbL); nazwy_hasel.json (hasła → miejscowości) leży
obok skryptu. Wyjście: frontend/assets/slownik-woj.json
  {"frazy": {"biala podlaska": ["lubelskie", "m"], "powiat opolski": [null, "p"], …}}
  rodzaj: "r" region/przymiotnik województwa, "m" miejscowość, "p" powiat, "x" ochronna.
Uruchomienie: py scripts/slownik_woj/buduj.py <dane>"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from itertools import product
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
TU = Path(__file__).resolve().parent
ROOT = TU.parents[1]
DANE = Path(sys.argv[1])
WYNIK = ROOT / "frontend" / "assets" / "slownik-woj.json"
sys.path.insert(0, str(ROOT / "backend"))
from app import config                          # noqa: E402

PRZYPADKI = ("nom", "gen", "dat", "acc", "inst", "loc")


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").lower().replace("ł", "l"))
    return "".join(c for c in s if not unicodedata.combining(c))


TOK = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def tokeny(s):
    return TOK.findall(fold(s))


IDX = json.loads((DANE / "indeks.json").read_text(encoding="utf-8"))
FORMA_ODCZYTY = defaultdict(list)      # forma → [(lemat, tag)]
for lem, fs in IDX.items():
    for forma, tag, kat in fs:
        FORMA_ODCZYTY[forma.lower()].append((lem, tag))


def _czesci(tag):
    p = tag.split(":")
    if len(p) < 4 or p[0] not in ("subst", "adj", "depr", "ppas", "pact"):
        return None
    return p[0], p[1], set(p[2].split(".")), set(p[3].split("."))


def odmiany_slowa(slowo, liczba_nazwy="sg", przymiotnik=False):
    """{przypadek: {formy}} dla słowa w mianowniku — w liczbie i rodzaju tego mianownika.
    przymiotnik=True: odczyt przymiotnikowy przed rzeczownikowym („Lubelskie” w „Opole
    Lubelskie” to przymiotnik, nie nazwa województwa jako rzeczownik — 23.10.2026)."""
    best = None
    for lem, tag in FORMA_ODCZYTY.get(slowo.lower(), []):
        c = _czesci(tag)
        if c and "nom" in c[2]:
            # liczba pojedyncza przed mnogą: „podkarpackie” to i sg:n, i pl — nazwy województw są w sg
            ocena = (przymiotnik and c[0] == "adj", lem.lower() == slowo.lower(), c[1] == liczba_nazwy,
                     lem == slowo, lem[:1].isupper() == slowo[:1].isupper(), c[0] == "subst")
            if best is None or ocena > best[0]:
                best = (ocena, lem, c)
    if best is None:
        return {k: {slowo} for k in PRZYPADKI}, False, liczba_nazwy, None
    _, lem, (pos, liczba, _, rodzaje) = best
    out = defaultdict(set)
    for forma, tag, _k in IDX[lem]:
        c = _czesci(tag)
        if not c or c[1] != liczba or not (c[3] & rodzaje) or (pos == "adj" and c[0] != "adj"):
            continue
        if pos == "adj" and len(tag.split(":")) > 4 and tag.split(":")[4] not in ("pos",):
            continue
        # wielka litera jak w nazwie (przymiotnik „Podlaska” → „Podlaskiej”, nie „podlaskiej” — po
        # złożeniu i tak bez znaczenia, ale formy pospolite z innym znaczeniem odsiewamy wyżej)
        for k in c[2] & set(PRZYPADKI):
            out[k].add(forma)
    if pos == "adj" and any(not out[k] for k in PRZYPADKI):
        # przymiotnik przy nazwie w liczbie mnogiej („Ustrzyki Dolne”): rodzaj z tagu nazwy
        # (p1/p2/n…) nie zawsze pasuje do tagu przymiotnika — bierzemy tę samą liczbę bez rodzaju
        for forma, tag, _k in IDX[lem]:
            c = _czesci(tag)
            if c and c[0] == "adj" and c[1] == liczba and tag.split(":")[-1] == "pos":
                for k in c[2] & set(PRZYPADKI):
                    if not out[k] or k in ("loc", "inst", "dat", "gen"):
                        out[k].add(forma)
    out["nom"].add(slowo)
    return out, True, liczba, pos


def odmiany_nazwy(nazwa):
    """Wszystkie formy nazwy (także wieloczłonowej) przez przypadki, złożone bez diakrytyków."""
    czesci = re.split(r"(\s+|-)", nazwa.strip())
    slowa = [c for c in czesci if c.strip() and c != "-"]
    sep = [c for c in czesci if not c.strip() or c == "-"]
    # pierwsze słowo (rzeczownik) wyznacza liczbę; przymiotniki ją przejmują („Ustrzyki Dolne” — pl)
    wstepne = [odmiany_slowa(s) for s in slowa]
    # liczbę wyznacza pierwszy RZECZOWNIK („Tarnowskie Góry” — Góry, pl), przymiotniki ją przejmują
    liczba = next((w[2] for w in wstepne if w[3] == "subst"), wstepne[0][2])
    od = []
    for i, (w, s) in enumerate(zip(wstepne, slowa)):
        if len(slowa) == 1:
            od.append(w[0])
            continue
        # w nazwie wieloczłonowej słowo, które ma odczyt przymiotnikowy, odmieniamy też jak
        # przymiotnik: „Opolu Lubelskim” (nie tylko „Lubelskiem”), „Wysokim Mazowieckim”,
        # „Górnym Śląsku”; pierwsze słowo zostaje także w odmianie rzeczownikowej („Rudzie Śląskiej”)
        przym, ok, _l, pos = odmiany_slowa(s, liczba, przymiotnik=True)
        if pos != "adj":
            od.append(w[0] if w[3] == "subst" else odmiany_slowa(s, liczba)[0])
        elif i == 0 and w[3] == "subst":
            od.append({k: w[0][k] | przym[k] for k in PRZYPADKI})
        else:
            od.append(przym)
    out = {" ".join(tokeny(nazwa))}
    for k in PRZYPADKI:
        for kombi in product(*[sorted(o[k]) or [s] for o, s in zip(od, slowa)]):
            txt = kombi[0]
            for s_, w in zip(sep, kombi[1:]):
                txt += ("-" if s_ == "-" else " ") + w
            out.add(" ".join(tokeny(txt)))
    # potoczny miejscownik na -em przy nazwach nijakich: „w Wysokiem Mazowieckiem”, „w Opolu Lubelskiem”
    if " " in nazwa.strip() and fold(nazwa).endswith("ie"):
        for f in list(out):
            if f.endswith("im"):
                out.add(" ".join(w[:-2] + "iem" if w.endswith("im") else w for w in f.split()))
    return out


# ── 1. regiony i przymiotniki województw (rodzaj „r”) ───────────────────────
PRZYM = {"dolnośląskie": ["dolnośląski"], "kujawsko-pomorskie": ["kujawsko-pomorski"],
         "lubelskie": ["lubelski"], "lubuskie": ["lubuski"], "łódzkie": ["łódzki"],
         "małopolskie": ["małopolski"], "mazowieckie": ["mazowiecki"], "opolskie": ["opolski"],
         "podkarpackie": ["podkarpacki"], "podlaskie": ["podlaski"], "pomorskie": [],
         "śląskie": ["śląski"], "świętokrzyskie": ["świętokrzyski"],
         "warmińsko-mazurskie": ["warmińsko-mazurski"], "wielkopolskie": ["wielkopolski"],
         "zachodniopomorskie": ["zachodniopomorski"]}
KRAINY = {"dolnośląskie": ["Dolny Śląsk"], "kujawsko-pomorskie": ["Kujawy"],
          "lubelskie": ["Lubelszczyzna"], "lubuskie": ["Ziemia Lubuska"], "łódzkie": [],
          "małopolskie": ["Małopolska"], "mazowieckie": ["Mazowsze"],
          "opolskie": ["Opolszczyzna", "Śląsk Opolski"], "podkarpackie": ["Podkarpacie", "Bieszczady"],
          "podlaskie": ["Podlasie", "Suwalszczyzna"],
          "pomorskie": ["Pomorze", "Kaszuby", "Trójmiasto", "Półwysep Helski"],
          "śląskie": ["Śląsk", "Górny Śląsk"], "świętokrzyskie": ["Kielecczyzna"],
          "warmińsko-mazurskie": ["Warmia", "Mazury"], "wielkopolskie": ["Wielkopolska"],
          "zachodniopomorskie": ["Pomorze Zachodnie", "Zachodnie Pomorze"]}
frazy = {}            # fraza → (voiv | None, rodzaj)
konflikty = defaultdict(set)


def dodaj(fraza, voiv, rodzaj, nadpisz=False):
    if not fraza:
        return
    stare = frazy.get(fraza)
    if stare is None or nadpisz:
        frazy[fraza] = (voiv, rodzaj)
    elif stare[0] != voiv:
        konflikty[fraza] |= {stare[0], voiv}


for voiv, przym in PRZYM.items():
    for p in przym:
        # „kujawsko-pomorski”, „warmińsko-mazurski” nie ma w PoliMorf — przedrostek + formy członu
        przedrostek, baza = (p.split("-")[0] + "-", p.split("-")[1]) if p not in IDX and "-" in p else ("", p)
        assert baza in IDX, p
        # wszystkie rodzaje i liczby przymiotnika (Lubelskie, lubelskiego, lubelską…)
        for forma, tag, _k in IDX[baza]:
            if tag.startswith("adj") and tag.split(":")[-1] == "pos":
                dodaj(fold(przedrostek + forma), voiv, "r")
        for rz in ("województwo", "woj."):
            for f in odmiany_nazwy("województwo " + voiv) if rz == "województwo" else []:
                dodaj(f, voiv, "r")
            dodaj(" ".join(tokeny(f"woj. {voiv}")), voiv, "r")
    for kr in KRAINY[voiv]:
        for f in odmiany_nazwy(kr):
            dodaj(f, voiv, "r")
# pomorskie: przymiotnik „pomorski” jest w nazwach trzech województw — tylko pełne frazy
for f in odmiany_nazwy("województwo pomorskie"):
    dodaj(f, "pomorskie", "r")
dodaj("woj pomorskie", "pomorskie", "r")
dodaj("pomorskiego", "pomorskie", "r")
dodaj("pomorskie", "pomorskie", "r")
# potoczny miejscownik „w Lubelskiem”, „na Podkarpaciu” jest wyżej; PoliMorf nie zna form na -em
for voiv in config.VOIVODESHIPS:
    dodaj(fold(voiv[:-1] + "em"), voiv, "r")

# ── 2. miejscowości z haseł (rodzaj „m”) ───────────────────────────────────
nazwy = json.loads((TU / "nazwy_hasel.json").read_text(encoding="utf-8"))
RECZNE = {"pomorskie": ["Gdynia", "Jastarnia", "Hel"], "małopolskie": ["Krynica-Zdrój", "Kęty", "Chełmek"],
          "podkarpackie": ["Stalowa Wola", "Medyka", "Korczowa", "Budomierz", "Arłamów", "Nisko", "Jasło",
                           "Krosno"],
          "śląskie": ["Bielsko-Biała", "Tychy", "Tarnowskie Góry"],
          "lubelskie": ["Międzyrzec Podlaski", "Tarnawa-Kolonia", "Czosnówka", "Krasnystaw",
                        "Biała Podlaska", "Radzyń Podlaski", "Tomaszów Lubelski", "Opole Lubelskie",
                        "Janów Podlaski"],
          "podlaskie": ["Siemianówka", "Białystok", "Bielsk Podlaski", "Wysokie Mazowieckie",
                        "Kuźnica"],
          "wielkopolskie": ["Krzesiny", "Murowana Goślina", "Nowy Tomyśl", "Piła"],
          "kujawsko-pomorskie": ["Golub-Dobrzyń", "Świecie"], "opolskie": ["Opole", "Nysa", "Brzeg"],
          "mazowieckie": ["Ostrów Mazowiecka", "Sokołów Podlaski", "Mińsk Mazowiecki",
                          "Grodzisk Mazowiecki", "Maków Mazowiecki", "Modlin"],
          "łódzkie": ["Tomaszów Mazowiecki", "Zduńska Wola", "Rawa Mazowiecka"],
          "dolnośląskie": ["Jelenia Góra", "Oława", "Kamienna Góra", "Zgorzelec"],
          "lubuskie": ["Zielona Góra", "Nowa Sól", "Krosno Odrzańskie"],
          "warmińsko-mazurskie": ["Pisz"]}
MIASTA = defaultdict(set)
for voiv, d in nazwy.items():
    MIASTA[voiv] |= set(d)
for voiv, l in RECZNE.items():
    MIASTA[voiv] |= set(l)
for voiv, ns in MIASTA.items():
    for n in ns:
        for f in odmiany_nazwy(n):
            dodaj(f, voiv, "m")
        # „Kędzierzyn” z „Kędzierzyn-Koźle”, „Ustrzyki” z „Ustrzyki Dolne” — gazety skracają
        pierwszy = re.split(r"[\s-]", n)[0]
        if pierwszy != n and len(pierwszy) >= 5 and any(fold(k) == fold(pierwszy)[:len(fold(k))]
                                                        for k in config.VOIV_KEYWORDS[voiv]):
            for f in odmiany_nazwy(pierwszy):
                dodaj(f, voiv, "m")

# ── TERYT SIMC (GUS, 23.10.2026): pełny urzędowy rejestr miejscowości ────────
import csv   # noqa: E402
SIMC_PLIK = DANE / "SIMC.csv"
WOJ_KOD = {"02": "dolnośląskie", "04": "kujawsko-pomorskie", "06": "lubelskie", "08": "lubuskie",
           "10": "łódzkie", "12": "małopolskie", "14": "mazowieckie", "16": "opolskie",
           "18": "podkarpackie", "20": "podlaskie", "22": "pomorskie", "24": "śląskie",
           "26": "świętokrzyskie", "28": "warmińsko-mazurskie", "30": "wielkopolskie",
           "32": "zachodniopomorskie"}
SIMC = defaultdict(set)          # nazwa → województwa (każdy rodzaj)
SIMC_MIASTA = defaultdict(set)   # nazwa → województwa, w których jest MIASTEM (RM 96)
for x in csv.DictReader(open(SIMC_PLIK, encoding="utf-8-sig"), delimiter=";"):
    SIMC[x["NAZWA"]].add(WOJ_KOD[x["WOJ"]])
    if x["RM"] == "96":
        SIMC_MIASTA[x["NAZWA"]].add(WOJ_KOD[x["WOJ"]])
spoza_simc = sorted((v, n) for v, ns in MIASTA.items() for n in ns if v not in SIMC.get(n, ()))
print("hasła-miejscowości spoza SIMC w swoim województwie:", spoza_simc)

# ── 2a. reguła 3: dwa MIASTA o tej samej nazwie w różnych województwach → neutralne ──
# Automatycznie z SIMC (Józefów: miasto w lubelskim i w mazowieckim).
# Wyjątki: miasto powiatowe (~37–38 tys.) wygrywa z małym miastem o tej samej nazwie.
WYJATKI_R3 = {"Bolesławiec": "dolnośląskie", "Oleśnica": "dolnośląskie", "Olsztyn": "warmińsko-mazurskie"}
neutralne_r3 = []
for voiv, ns in MIASTA.items():
    for n in ns:
        inne_miasta = SIMC_MIASTA.get(n, set()) - {voiv}
        if inne_miasta and WYJATKI_R3.get(n) != voiv:
            neutralne_r3.append((n, voiv, sorted(inne_miasta)))
            for f in odmiany_nazwy(n):
                frazy[f] = (None, "x")
print("reguła 3 (neutralne):", neutralne_r3)

# ── 2b. ręcznie: hasła, których PoliMorf nie odmienia albo nie zna (pokrycie.py, 23.10.2026) ──
KONCOWKI_PRZYM = ("i", "a", "ie", "iego", "iej", "iemu", "im", "ich", "imi", "ą")
for rdzen, voiv in (("bialskopodlask", "lubelskie"), ("międzyrzeck", "lubuskie"), ("sochaczewsk", "mazowieckie")):
    for k in KONCOWKI_PRZYM:
        dodaj(fold(rdzen + k), voiv, "m")
RECZNE_FRAZY = {
    "dolnośląskie": ["dolnoślązak", "dolnoślązacy", "dolnoślązaków", "dolnoślązaczka", "dolnoślązakom"],
    "kujawsko-pomorskie": ["świecie nad wisłą", "świeciu nad wisłą", "świecia nad wisłą"],
    "lubelskie": ["międzyrzec podlaski", "międzyrzeca podlaskiego", "międzyrzecu podlaskim",
                  "międzyrzecem podlaskim", "międzyrzeczu podlaskim"],
    "łódzkie": ["warta k. sieradza", "warcie k. sieradza"],
    "małopolskie": ["krynica-zdrój", "krynicy-zdroju", "krynicy-zdrój", "krynicą-zdrojem", "krynica zdrój",
                    "krynicy zdroju"],
    "mazowieckie": ["ostrów mazowiecka", "ostrowi mazowieckiej", "ostrowie mazowieckiej", "ostrowią mazowiecką"],
    "opolskie": ["brzeg opolski", "brzegu opolskim", "brzegiem opolskim"],
    "podkarpackie": ["medyka-szeginie", "medyce-szeginiach", "medyki-szeginie"],
    "podlaskie": ["kuźnica białostocka", "kuźnicy białostockiej", "kuźnicą białostocką", "kuźnicę białostocką"],
    "śląskie": ["tarnowskie góry", "tarnowskich gór", "tarnowskich górach", "tarnowskim górom",
                "tarnowskimi górami"],
    "warmińsko-mazurskie": ["mazurskiego"],
    "wielkopolskie": ["piła wielkopolska", "pile wielkopolskiej", "piły wielkopolskiej"],
}
for voiv, lista in RECZNE_FRAZY.items():
    for f in lista:
        dodaj(" ".join(tokeny(f)), voiv, "r" if f == "mazurskiego" or f.startswith("dolnośląz") else "m",
              nadpisz=True)
for voiv, f in (("opolskie", "biała prudnicka"), ("opolskie", "białej prudnickiej")):
    dodaj(" ".join(tokeny(f)), voiv, "m", nadpisz=True)

# ── 3. powiaty (rodzaj „p”): „powiat opolski” jest w lubelskim I opolskim → neutralny ──
pow_gj = json.loads((DANE / "powiaty.geojson").read_text(encoding="utf-8"))
WOJ_TERC = {"02": "dolnośląskie", "04": "kujawsko-pomorskie", "06": "lubelskie", "08": "lubuskie",
            "10": "łódzkie", "12": "małopolskie", "14": "mazowieckie", "16": "opolskie",
            "18": "podkarpackie", "20": "podlaskie", "22": "pomorskie", "24": "śląskie",
            "26": "świętokrzyskie", "28": "warmińsko-mazurskie", "30": "wielkopolskie",
            "32": "zachodniopomorskie"}
powiaty_woj = defaultdict(set)
for f in pow_gj["features"]:
    n = f["properties"]["name"]
    if n.startswith("powiat "):
        powiaty_woj[n].add(WOJ_TERC[f["properties"]["terc"][:2]])
powiaty_woj["powiat łobeski"].add("zachodniopomorskie")
for n, wojs in powiaty_woj.items():
    v = next(iter(wojs)) if len(wojs) == 1 else None
    for f in odmiany_nazwy(n):
        dodaj(f, v, "p", nadpisz=True)

# ── 3b. przymiotniki od miast powiatowych („chełmskie placówki”, „legnickich placówek”) ──
# Stare rdzenie („chełm”, „legnic”) łapały je przy okazji. Jednoznaczne → województwo
# powiatu; wieloznaczne (świdnicki, tomaszowski, bielski…) → neutralne. „miński” (Mińsk
# na Białorusi) i „lipski” (Lipsk) pomijamy — w wiadomościach o dronach to obce miasta.
OBCE_HOMONIMY = {"miński", "lipski"}
for n, wojs in powiaty_woj.items():
    przym = n[len("powiat "):]
    if " " in przym or przym in OBCE_HOMONIMY or przym not in IDX:
        continue
    v = next(iter(wojs)) if len(wojs) == 1 else None
    for forma, tag, _k in IDX[przym]:
        if tag.startswith("adj") and tag.split(":")[-1] == "pos":
            dodaj(fold(forma), v, "m" if v else "x")

# ── 4. frazy ochronne z wykazu miejscowości (rodzaj „x”) ───────────────────
# Źródło: TERYT SIMC (pełny rejestr GUS) zamiast spisu OSM z GROTY, w którym brakowało m.in.
# Gdańska i Gdyni, a były nazwy spoza rejestru („Poznańskie Przedmieście”).
gdzie = {n: w for n, w in SIMC.items() if " " in n or "-" in n}
slowa_kluczowe = {w for fr in frazy for w in fr.split()}
ochronne = 0
def _klucz_w(forma):
    return any(w in slowa_kluczowe or any(c in slowa_kluczowe for c in w.split("-")) for w in forma.split())


for nazwa, wojs in gdzie.items():
    # słowo kluczowe bywa dopiero w ODMIANIE: „Kozi Lasek” → „Koziego Laska” (Łask), „Stare Brzozowo”
    # → „Starym Brzozowie” (Brzozów); także człony z łącznikiem („Krosno-Huby”) — 23.10.2026
    formy = odmiany_nazwy(nazwa)
    if not any(_klucz_w(f) for f in formy):
        continue
    v = next(iter(wojs)) if len(wojs) == 1 else None
    for f in formy:
        if f in frazy and frazy[f][1] in ("m", "r", "p"):
            continue                    # znana miejscowość z haseł albo powiat — zostaje jak jest
        dodaj(f, v, "x", nadpisz=True)
        ochronne += 1

# Formy o dwóch znaczeniach z różnych województw (np. „Radomska”: Radomsko — łódzkie, przymiotnik
# od Radomia — mazowieckie) → neutralne. Przymiotników województw („opolski”) to nie dotyczy.
for f, wojs in konflikty.items():
    if f in frazy and frazy[f][1] != "r" and len({w for w in wojs if w}) > 1 or             (f in frazy and frazy[f][1] == "m" and None in wojs and len(wojs) > 1):
        frazy[f] = (None, "x")

# ── 5. formy, które są też słowem POSPOLITYM → neutralne (23.10.2026) ────────────
# Lista ręczna z przeglądu pospolite.py (PoliMorf: ta sama forma ma lemat pisany małą literą).
# Stary słownik świadomie pomijał „piła”, „hel”, „brzeg”; tu ta sama zasada na poziomie FORM:
# „na świecie” (świat), „tych” (ten), „głównie”, „tureckie drony” (Turek), „świeckie” (Świecie).
# Formy, które w wiadomościach znaczą miasto („Sosnowcu”, „Mielca”, „Opola”, „Krosna”, „Żywca”),
# zostają przy mieście; wieloczłonowe („Piła Wielkopolska”, „Świecie nad Wisłą”) też.
POSPOLITE = """
brzeg brzegiem brzegowi brzegu hel helem helowi helu laska laski nisko pila pile pily
pisz pisza piska piski swiecie tych glowna glownie lipna lipnie slawna slawnie szczytna
szczytnie pieniezna pienieznie kolna kolnie debna gronowa koronowa mogilna kutna
turecki turecka tureckich tureckie tureckiego tureckiej tureckiemu tureckim tureckimi
swiecki swiecka swieccy swieckich swieckie swieckiego swieckiej swieckiemu swieckim swieckimi
medyka medyki obornik obornikach obornikami obornikom ket ketach ketami ketom polic mikolajek
""".split()
for f in POSPOLITE:
    if f in frazy and frazy[f][1] in ("m", "x"):
        frazy[f] = (None, "x")

wynik = {"zrodla": "PoliMorf 0.6.7 (IPI PAN, BSD 2-clause); TERYT SIMC (GUS, 23.10.2026)",
         "frazy": {k: list(v) for k, v in sorted(frazy.items())}}
WYNIK.write_text(json.dumps(wynik, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
licz = defaultdict(int)
for v, r in frazy.values():
    licz[r] += 1
print("fraz:", len(frazy), dict(licz), "ochronnych dodań:", ochronne,
      "rozmiar KB:", WYNIK.stat().st_size // 1024)
print("konflikty (pierwsze 40):", list(konflikty.items())[:40])
