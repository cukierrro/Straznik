#!/usr/bin/env python3
"""Rejony Ukrainy (po reformie 2020) do podświetlania alarmów NEPTUN-a na mapie.

NEPTUN podaje alarmy co do rejonu (`raions`: key „бахмутський”, oblast „Донецька
область”, level red/yellow) i dla obwodów okupowanych całych (`oblasts`). Warstwa
jest TYLKO informacyjna — bez punktów (decyzja usera 15.09.2026).

Źródło: geoBoundaries gbHumanitarian UKR ADM2 (OCHA/HDX, „Kartographia”, 2022,
139 rejonów), wersja uproszczona; obwody z gbOpen ADM1 (scripts/.cache, jak
ua_oblast_rings.py). Nazwy rejonów są w transliteracji („Bakhmutskyi”), więc
aplikacja dopasowuje klucz NEPTUN-a przez tę samą transliterację (frontend/app.js,
`raionKey`). Wynik: frontend/assets/rejony-ua-v1.geojson z właściwościami
  k — klucz łaciński (małe litery, same litery), o — obwód po ukraińsku
  („Донецька”), jak w polu `oblast` NEPTUN-a bez słowa „область”.

    py scripts/build_rejony_ua.py
"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".cache"
ADM2 = CACHE / "UKR-adm2-hum-simplified.geojson"
ADM2_URL = ("https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/"
            "gbHumanitarian/UKR/ADM2/geoBoundaries-UKR-ADM2_simplified.geojson")
ADM1 = CACHE / "UKR-adm1.geojson"
OUT = ROOT / "frontend" / "assets" / "rejony-ua-v1.geojson"
SIMPLIFY_DEG = 0.004          # ~300–400 m: granice rejonów w skali kraju

OBLAST_UA = {
    "Kherson Oblast": "Херсонська", "Volyn Oblast": "Волинська", "Rivne Oblast": "Рівненська",
    "Zhytomyr Oblast": "Житомирська", "Kyiv Oblast": "Київська", "Chernihiv Oblast": "Чернігівська",
    "Sumy Oblast": "Сумська", "Kharkiv Oblast": "Харківська", "Luhansk Oblast": "Луганська",
    "Donetsk Oblast": "Донецька", "Zaporizhia Oblast": "Запорізька", "Lviv Oblast": "Львівська",
    "Ivano-Frankivsk Oblast": "Івано-Франківська", "Zakarpattia Oblast": "Закарпатська",
    "Ternopil Oblast": "Тернопільська", "Chernivtsi Oblast": "Чернівецька",
    "Odessa Oblast": "Одеська", "Mykolaiv Oblast": "Миколаївська",
    "Autonomous Republic of Crimea": "Автономна Республіка Крим",
    "Vinnytsia Oblast": "Вінницька", "Khmelnytskyi Oblast": "Хмельницька",
    "Cherkasy Oblast": "Черкаська", "Poltava Oblast": "Полтавська",
    "Dnipropetrovsk Oblast": "Дніпропетровська", "Kirovohrad Oblast": "Кіровоградська",
    "Kyiv": "Київ", "Sevastopol": "Севастополь",
}
# Literówka w źródle — klucz ma odpowiadać transliteracji nazwy ukraińskiej.
KEY_FIX = {"cnernivetskyi": "chernivetskyi"}


def key(name: str) -> str:
    return KEY_FIX.get(re.sub(r"[^a-z]", "", name.lower()), re.sub(r"[^a-z]", "", name.lower()))


def main() -> None:
    CACHE.mkdir(exist_ok=True)
    if not ADM2.is_file():
        with urllib.request.urlopen(ADM2_URL, timeout=120) as r:
            ADM2.write_bytes(r.read())
    oblasts = []
    for f in json.loads(ADM1.read_text(encoding="utf-8"))["features"]:
        oblasts.append((OBLAST_UA[f["properties"]["shapeName"]], shape(f["geometry"]).buffer(0)))
    feats, keys = [], set()
    for f in json.loads(ADM2.read_text(encoding="utf-8"))["features"]:
        g = shape(f["geometry"]).buffer(0)
        pt = g.representative_point()
        # obwód = ten, który zawiera punkt rejonu; przy brzegach — największa część wspólna
        own = [o for o, og in oblasts if og.contains(pt)]
        if not own:
            own = [max(oblasts, key=lambda x: x[1].intersection(g).area)[0]]
        k = key(f["properties"]["shapeName"])
        assert k not in keys, f"powtórzony klucz rejonu {k}"
        keys.add(k)
        s = g.simplify(SIMPLIFY_DEG, preserve_topology=True)
        geom = json.loads(json.dumps(mapping(s)), parse_float=lambda x: round(float(x), 4))
        feats.append({"type": "Feature", "properties": {"k": k, "o": own[0]}, "geometry": geom})
    fc = {"type": "FeatureCollection", "features": feats}
    OUT.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    per = {}
    for f in feats:
        per.setdefault(f["properties"]["o"], []).append(f["properties"]["k"])
    for o in sorted(per):
        print(f"{o}: {len(per[o])}")
    print(f"{len(feats)} rejonów, {OUT.stat().st_size // 1024} KB -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
