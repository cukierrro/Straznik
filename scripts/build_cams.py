"""Buduje listę DZIAŁAJĄCYCH kamer dla wschodniej Polski.

Weryfikacja: kamera trafia na listę tylko wtedy, gdy jej miniatura z dzisiejszą
datą faktycznie się pobiera (HTTP 200, typ obrazu, sensowny rozmiar) — czyli
kamera realnie nadaje, a nie tylko widnieje w katalogu.
"""
import concurrent.futures as cf
import json
import re
import sys
import urllib.request
from datetime import date, timedelta

import truststore
truststore.inject_into_ssl()   # bez tego antywirus podpisujący TLS wywala pobieranie

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
BASE = "https://www.worldcam.pl"

CITIES = {
    "lubelskie": ["lublin", "zamosc", "chelm", "pulawy", "naleczow", "krasnik",
                  "biala-podlaska", "leczna", "wlodawa", "janow-lubelski", "kazimierz",
                  "kazimierz-dolny", "deblin", "swidnik", "lubartow", "tomaszow-lubelski",
                  "hrubieszow", "krasnobrod", "zwierzyniec", "parczew", "ryki"],
    "podkarpackie": ["rzeszow", "przemysl", "sanok", "krosno", "lancut", "jaroslaw",
                     "ustrzyki-dolne", "solina", "polanczyk", "iwonicz-zdroj", "rymanow",
                     "stalowa-wola", "mielec", "lezajsk", "tarnobrzeg", "lesko",
                     "cisna", "wetlina", "arlamow", "jaslo", "debica", "przeworsk",
                     "nisko", "kolbuszowa", "boguchwala"],
    "podlaskie": ["bialystok", "suwalki", "augustow", "lomza", "hajnowka",
                  "bielsk-podlaski", "sokolka", "wigry", "suprasl", "grajewo",
                  "zambrow", "kolno", "monki", "siemiatycze", "bialowieza", "tykocin"],
    "warmińsko-mazurskie": ["olsztyn", "elblag", "elk", "gizycko", "mikolajki",
                            "ostroda", "mragowo", "wegorzewo", "ilawa", "goldap",
                            "ketrzyn", "lidzbark-warminski", "braniewo", "pisz",
                            "szczytno", "olecko", "nidzica", "dzialdowo", "morag",
                            "ryn", "wilkasy", "krutyn", "frombork"],
    "mazowieckie": ["warszawa", "radom", "plock", "siedlce", "ostroleka", "pruszkow",
                    "otwock", "konstancin-jeziorna", "legionowo", "zyrardow", "ciechanow",
                    "minsk-mazowiecki", "wyszkow", "sochaczew", "grodzisk-mazowiecki",
                    "piaseczno", "serock", "pultusk", "ostrow-mazowiecka"],
    "małopolskie": ["krakow", "zakopane", "nowy-sacz", "tarnow", "oswiecim", "wieliczka",
                    "krynica-zdroj", "szczawnica", "bukowina-tatrzanska", "bialka-tatrzanska",
                    "muszyna", "rabka-zdroj", "zawoja", "wadowice", "niepolomice",
                    "myslenice", "nowy-targ", "koscielisko", "witow", "chocholow",
                    "piwniczna-zdroj", "krynica", "limanowa", "gorlice", "bochnia",
                    "olkusz", "chrzanow", "andrychow", "sucha-beskidzka"],
    "śląskie": ["katowice", "czestochowa", "gliwice", "bielsko-biala", "szczyrk", "wisla",
                "ustron", "korbielow", "zwardon", "sosnowiec", "zabrze", "rybnik",
                "cieszyn", "tarnowskie-gory", "istebna", "brenna", "koniakow",
                "jastrzebie-zdroj", "tychy", "chorzow", "bytom", "zawiercie", "beskidy"],
    "dolnośląskie": ["wroclaw", "jelenia-gora", "karpacz", "szklarska-poreba", "walbrzych",
                     "legnica", "klodzko", "swieradow-zdroj", "polanica-zdroj",
                     "kudowa-zdroj", "duszniki-zdroj", "zieleniec", "lubin", "boleslawiec",
                     "glogow", "swidnica", "trzebnica", "ladek-zdroj", "miedzygorze",
                     "szczawno-zdroj", "kowary", "olesnica", "dzierzoniow", "zgorzelec"],
    "wielkopolskie": ["poznan", "kalisz", "konin", "leszno", "gniezno", "pila",
                      "ostrow-wielkopolski", "sierakow", "koscian", "srem", "wrzesnia",
                      "turek", "krotoszyn", "jarocin", "gostyn", "swarzedz", "puszczykowo"],
    "pomorskie": ["gdansk", "gdynia", "sopot", "slupsk", "wladyslawowo", "hel", "jastarnia",
                  "leba", "ustka", "krynica-morska", "puck", "kartuzy", "chojnice",
                  "malbork", "tczew", "wejherowo", "reda", "rumia", "kwidzyn", "starogard-gdanski",
                  "jastrzebia-gora", "karwia", "debki", "chalupy", "kuznica", "stegna",
                  "jantar", "sztutowo", "kosciezyna", "bytow"],
    "zachodniopomorskie": ["szczecin", "koszalin", "kolobrzeg", "swinoujscie", "miedzyzdroje",
                           "dziwnow", "rewal", "mielno", "darlowo", "ustronie-morskie",
                           "pobierowo", "niechorze", "trzesacz", "stargard", "walcz",
                           "drawsko-pomorskie", "sarbinowo", "chlopy", "dabki", "grzybowo",
                           "dzwirzyno", "pogorzelica", "lukecin", "miedzywodzie"],
    "kujawsko-pomorskie": ["bydgoszcz", "torun", "wloclawek", "grudziadz", "inowroclaw",
                           "ciechocinek", "brodnica", "chelmno", "naklo-nad-notecia",
                           "swiecie", "rypin", "golub-dobrzyn", "solec-kujawski"],
    "łódzkie": ["lodz", "piotrkow-trybunalski", "sieradz", "kutno", "tomaszow-mazowiecki",
                "belchatow", "radomsko", "skierniewice", "spala", "uniejow", "leczyca",
                "zgierz", "pabianice", "wielun", "opoczno", "rawa-mazowiecka"],
    "lubuskie": ["zielona-gora", "gorzow-wielkopolski", "sulechow", "slubice", "kostrzyn",
                 "lubniewice", "drezdenko", "swiebodzin", "nowa-sol", "zagan", "zary",
                 "miedzyrzecz", "leknica", "krosno-odrzanskie"],
    "opolskie": ["opole", "nysa", "kedzierzyn-kozle", "brzeg", "glucholazy", "turawa",
                 "prudnik", "kluczbork", "strzelce-opolskie", "namyslow", "olesno",
                 "krapkowice", "pokrzywna", "jarnoltowek"],
    "świętokrzyskie": ["kielce", "sandomierz", "busko-zdroj", "ostrowiec-swietokrzyski",
                       "starachowice", "skarzysko-kamienna", "jedrzejow", "checiny",
                       "pinczow", "koniecpol", "opatow", "wloszczowa", "solec-zdroj"],
}


def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), dict(r.headers), r.status


def city_cams(voiv, city):
    """Zwraca [(id, nazwa, url_strony)] z katalogu miasta."""
    try:
        html, _, _ = fetch(f"{BASE}/kamery/polska/{city}")
        html = html.decode("utf-8", "replace")
    except Exception as e:
        print(f"  ! {city}: {e}", flush=True)
        return []
    out = []
    for href in set(re.findall(rf'href="(/kamery/polska/{re.escape(city)}/(\d+)-[^"]+)"', html)):
        path, cid = href
        slug = path.rsplit("/", 1)[-1]
        name = slug.split("-", 1)[1].replace("-", " ").strip() if "-" in slug else slug
        out.append((cid, name.capitalize(), BASE + path))
    return out


def alive(cid):
    """Miniatura z dziś lub wczoraj = kamera nadaje."""
    for d in (date.today(), date.today() - timedelta(days=1)):
        url = f"https://www.img.worldcam.pl/webcams/400x225/{d.isoformat()}/{cid}.jpg"
        try:
            data, hdr, status = fetch(url, timeout=12)
            ctype = (hdr.get("Content-Type") or "").lower()
            if status == 200 and "image" in ctype and len(data) > 4000:
                return url
        except Exception:
            continue
    return None


# ── normalizacja: polskie znaki i klasyfikacja plener/wnętrze ────────────────
WORD_FIX = {
    "kosciol": "kościół", "koscioł": "kościół", "swietej": "św.", "swietego": "św.",
    "sw": "św.", "pw": "pw.", "nmp": "NMP", "krolowej": "królowej", "ul": "ul.",
    "gora": "góra", "zdroj": "zdrój", "jezioro": "jezioro", "rynek": "Rynek",
    "wielka": "Wielka", "mala": "Mała", "stary": "Stary", "stare": "Stare",
    "polnocna": "północna", "poludniowa": "południowa", "zachodnia": "zachodnia",
    "wschodnia": "wschodnia", "plaza": "plaża", "przystan": "przystań",
    "molo": "molo", "wiez": "wieża", "wieza": "wieża", "sciezka": "ścieżka",
    "sniezka": "Śnieżka", "morskie": "Morskie", "oko": "Oko",
}
CITY_FIX = {
    "Chelm": "Chełm", "Leczna": "Łęczna", "Naleczow": "Nałęczów", "Pulawy": "Puławy",
    "Wlodawa": "Włodawa", "Zamosc": "Zamość", "Jaroslaw": "Jarosław", "Lancut": "Łańcut",
    "Przemysl": "Przemyśl", "Rzeszow": "Rzeszów", "Bialystok": "Białystok",
    "Augustow": "Augustów", "Lomza": "Łomża", "Suwalki": "Suwałki", "Suprasl": "Supraśl",
    "Hajnowka": "Hajnówka", "Elblag": "Elbląg", "Elk": "Ełk", "Gizycko": "Giżycko",
    "Ilawa": "Iława", "Mragowo": "Mrągowo", "Ostroda": "Ostróda", "Wegorzewo": "Węgorzewo",
    "Goldap": "Gołdap", "Ketrzyn": "Kętrzyn", "Krasnik": "Kraśnik", "Lezajsk": "Leżajsk",
    "Jaslo": "Jasło", "Debica": "Dębica", "Mikolajki": "Mikołajki", "Rymanow": "Rymanów",
    "Krakow": "Kraków", "Krynica Zdroj": "Krynica-Zdrój", "Busko Zdroj": "Busko-Zdrój",
    "Zakopane": "Zakopane", "Bialka Tatrzanska": "Białka Tatrzańska",
    "Bukowina Tatrzanska": "Bukowina Tatrzańska", "Koscielisko": "Kościelisko",
    "Chocholow": "Chochołów", "Rabka Zdroj": "Rabka-Zdrój", "Szczawnica": "Szczawnica",
    "Piwniczna Zdroj": "Piwniczna-Zdrój", "Sucha Beskidzka": "Sucha Beskidzka",
    "Czestochowa": "Częstochowa", "Bielsko Biala": "Bielsko-Biała", "Wisla": "Wisła",
    "Ustron": "Ustroń", "Zwardon": "Zwardoń", "Korbielow": "Korbielów",
    "Jastrzebie Zdroj": "Jastrzębie-Zdrój", "Slubice": "Słubice", "Zary": "Żary",
    "Wroclaw": "Wrocław", "Jelenia Gora": "Jelenia Góra", "Szklarska Poreba": "Szklarska Poręba",
    "Walbrzych": "Wałbrzych", "Klodzko": "Kłodzko", "Swieradow Zdroj": "Świeradów-Zdrój",
    "Polanica Zdroj": "Polanica-Zdrój", "Kudowa Zdroj": "Kudowa-Zdrój",
    "Duszniki Zdroj": "Duszniki-Zdrój", "Boleslawiec": "Bolesławiec",
    "Swidnica": "Świdnica", "Ladek Zdroj": "Lądek-Zdrój", "Miedzygorze": "Międzygórze",
    "Szczawno Zdroj": "Szczawno-Zdrój", "Olesnica": "Oleśnica", "Dzierzoniow": "Dzierżoniów",
    "Gdansk": "Gdańsk", "Wladyslawowo": "Władysławowo", "Leba": "Łeba",
    "Krynica Morska": "Krynica Morska", "Chalupy": "Chałupy", "Kuznica": "Kuźnica",
    "Debki": "Dębki", "Kosciezyna": "Kościerzyna", "Bytow": "Bytów", "Chojnice": "Chojnice",
    "Starogard Gdanski": "Starogard Gdański", "Jastrzebia Gora": "Jastrzębia Góra",
    "Swinoujscie": "Świnoujście", "Miedzyzdroje": "Międzyzdroje", "Kolobrzeg": "Kołobrzeg",
    "Dziwnow": "Dziwnów", "Ustronie Morskie": "Ustronie Morskie", "Dabki": "Dąbki",
    "Darlowo": "Darłowo", "Walcz": "Wałcz", "Drawsko Pomorskie": "Drawsko Pomorskie",
    "Lukecin": "Łukęcin", "Miedzywodzie": "Międzywodzie", "Dzwirzyno": "Dźwirzyno",
    "Torun": "Toruń", "Wloclawek": "Włocławek", "Grudziadz": "Grudziądz",
    "Chelmno": "Chełmno", "Naklo Nad Notecia": "Nakło nad Notecią", "Swiecie": "Świecie",
    "Golub Dobrzyn": "Golub-Dobrzyń", "Lodz": "Łódź", "Piotrkow Trybunalski": "Piotrków Trybunalski",
    "Belchatow": "Bełchatów", "Leczyca": "Łęczyca", "Wielun": "Wieluń",
    "Rawa Mazowiecka": "Rawa Mazowiecka", "Poznan": "Poznań", "Pila": "Piła",
    "Koscian": "Kościan", "Srem": "Śrem", "Wrzesnia": "Września",
    "Ostrow Wielkopolski": "Ostrów Wielkopolski", "Warszawa": "Warszawa",
    "Plock": "Płock", "Ostroleka": "Ostrołęka", "Zyrardow": "Żyrardów",
    "Ciechanow": "Ciechanów", "Minsk Mazowiecki": "Mińsk Mazowiecki",
    "Wyszkow": "Wyszków", "Pultusk": "Pułtusk", "Ostrow Mazowiecka": "Ostrów Mazowiecka",
    "Grodzisk Mazowiecki": "Grodzisk Mazowiecki", "Konstancin Jeziorna": "Konstancin-Jeziorna",
    "Kedzierzyn Kozle": "Kędzierzyn-Koźle", "Glucholazy": "Głuchołazy",
    "Strzelce Opolskie": "Strzelce Opolskie", "Namyslow": "Namysłów", "Olesno": "Olesno",
    "Jarnoltowek": "Jarnołtówek", "Ostrowiec Swietokrzyski": "Ostrowiec Świętokrzyski",
    "Skarzysko Kamienna": "Skarżysko-Kamienna", "Jedrzejow": "Jędrzejów",
    "Checiny": "Chęciny", "Pinczow": "Pińczów", "Wloszczowa": "Włoszczowa",
    "Solec Zdroj": "Solec-Zdrój", "Zabrze": "Zabrze", "Tarnowskie Gory": "Tarnowskie Góry",
    "Zawiercie": "Zawiercie", "Gorzow Wielkopolski": "Gorzów Wielkopolski",
    "Zielona Gora": "Zielona Góra", "Nowy Sacz": "Nowy Sącz", "Tarnow": "Tarnów",
    "Oswiecim": "Oświęcim", "Myslenice": "Myślenice", "Nowy Targ": "Nowy Targ",
    "Ustrzyki Dolne": "Ustrzyki Dolne", "Stalowa Wola": "Stalowa Wola",
    "Tomaszow Lubelski": "Tomaszów Lubelski", "Hrubieszow": "Hrubieszów",
    "Krasnobrod": "Krasnobród", "Biala Podlaska": "Biała Podlaska",
    "Janow Lubelski": "Janów Lubelski", "Deblin": "Dęblin", "Swidnik": "Świdnik",
    "Lubartow": "Lubartów", "Zambrow": "Zambrów", "Monki": "Mońki",
    "Bialowieza": "Białowieża", "Siemiatycze": "Siemiatycze", "Dzialdowo": "Działdowo",
    "Morag": "Morąg", "Szczytno": "Szczytno", "Frombork": "Frombork",
    "Andrychow": "Andrychów", "Chorzow": "Chorzów", "Glogow": "Głogów",
    "Niepolomice": "Niepołomice", "Opatow": "Opatów", "Uniejow": "Uniejów",
    "Trzesacz": "Trzęsacz", "Kolbuszowa": "Kolbuszowa", "Legnica": "Legnica",
    "Wieliczka": "Wieliczka", "Olkusz": "Olkusz", "Chrzanow": "Chrzanów",
    "Krapkowice": "Krapkowice", "Pobierowo": "Pobierowo", "Rewal": "Rewal",
    "Mielno": "Mielno", "Sarbinowo": "Sarbinowo", "Chlopy": "Chłopy",
    "Grzybowo": "Grzybowo", "Pogorzelica": "Pogorzelica", "Wetlina": "Wetlina",
    "Cisna": "Cisna", "Lesko": "Lesko", "Arlamow": "Arłamów", "Nisko": "Nisko",
    "Boguchwala": "Boguchwała", "Przeworsk": "Przeworsk", "Solec Kujawski": "Solec Kujawski",
    "Krosno Odrzanskie": "Krosno Odrzańskie", "Miedzyrzecz": "Międzyrzecz",
    "Swiebodzin": "Świebodzin", "Nowa Sol": "Nowa Sól", "Zagan": "Żagań",
    "Leknica": "Łęknica", "Lubniewice": "Lubniewice", "Drezdenko": "Drezdenko",
    "Sulechow": "Sulechów", "Puszczykowo": "Puszczykowo", "Swarzedz": "Swarzędz",
    "Krotoszyn": "Krotoszyn", "Gostyn": "Gostyń", "Jarocin": "Jarocin",
    "Sierakow": "Sieraków", "Kartuzy": "Kartuzy", "Wejherowo": "Wejherowo",
    "Rumia": "Rumia", "Reda": "Reda", "Puck": "Puck", "Stegna": "Stegna",
    "Sztutowo": "Sztutowo", "Jantar": "Jantar", "Karwia": "Karwia",
    "Jastarnia": "Jastarnia", "Hel": "Hel", "Ustka": "Ustka", "Slupsk": "Słupsk",
    "Malbork": "Malbork", "Brodnica": "Brodnica", "Rypin": "Rypin",
    "Inowroclaw": "Inowrocław", "Zwierzyniec": "Zwierzyniec", "Parczew": "Parczew",
    "Ryki": "Ryki", "Tykocin": "Tykocin", "Kolno": "Kolno", "Grajewo": "Grajewo",
    "Wilkasy": "Wilkasy", "Krutyn": "Krutyń", "Ryn": "Ryn", "Olecko": "Olecko",
    "Nidzica": "Nidzica", "Braniewo": "Braniewo", "Pisz": "Pisz",
    "Lidzbark Warminski": "Lidzbark Warmiński", "Serock": "Serock",
    "Sochaczew": "Sochaczew", "Piaseczno": "Piaseczno", "Pruszkow": "Pruszków",
    "Otwock": "Otwock", "Legionowo": "Legionowo", "Radom": "Radom",
    "Siedlce": "Siedlce", "Gorlice": "Gorlice", "Limanowa": "Limanowa",
    "Bochnia": "Bochnia", "Zawoja": "Zawoja", "Wadowice": "Wadowice",
    "Witow": "Witów", "Muszyna": "Muszyna", "Istebna": "Istebna", "Brenna": "Brenna",
    "Koniakow": "Koniaków", "Tychy": "Tychy", "Bytom": "Bytom", "Rybnik": "Rybnik",
    "Gliwice": "Gliwice", "Katowice": "Katowice", "Sosnowiec": "Sosnowiec",
    "Kowary": "Kowary", "Zgorzelec": "Zgorzelec", "Trzebnica": "Trzebnica",
    "Zieleniec": "Zieleniec", "Lubin": "Lubin", "Kluczbork": "Kluczbork",
    "Prudnik": "Prudnik", "Turawa": "Turawa", "Nysa": "Nysa", "Brzeg": "Brzeg",
    "Pokrzywna": "Pokrzywna", "Starachowice": "Starachowice", "Kielce": "Kielce",
    "Koniecpol": "Koniecpol", "Radomsko": "Radomsko", "Kutno": "Kutno",
    "Zgierz": "Zgierz", "Pabianice": "Pabianice", "Opoczno": "Opoczno",
    "Skierniewice": "Skierniewice", "Spala": "Spała", "Sieradz": "Sieradz",
    "Tomaszow Mazowiecki": "Tomaszów Mazowiecki", "Konin": "Konin", "Turek": "Turek",
}
INDOOR = re.compile(r"kości|koscio|parafi|kaplic|klasztor|sanktuari|bazylik|ołtarz|"
                    r"oltarz|dominikan|cerkiew|kapliczk|katedr", re.I)
OUTDOOR_HINT = re.compile(r"panoram|rynek|plac|ulic|ul\.|most|port|molo|jezior|stadion|"
                          r"bulwar|park|góra|gora|zdrój|widok|pogodow|deptak|dworz|"
                          r"lotnisk|zamek|starów|brama|szlak|plaż|plaz|przystań|stok|"
                          r"wyciąg|wyciag|skocznia|basen|rondo|osiedl|kamienic|nabrzeż", re.I)


def normalize(d):
    for voiv, lst in d.items():
        for c in lst:
            c["name"] = " ".join(WORD_FIX.get(w.lower(), w) for w in c["name"].split())
            if c["name"]:
                c["name"] = c["name"][0].upper() + c["name"][1:]
            c["city"] = CITY_FIX.get(c["city"], c["city"])
            c["outdoor"] = bool(OUTDOOR_HINT.search(c["name"])) or not INDOOR.search(c["name"])
        lst.sort(key=lambda c: (not c["outdoor"], c["city"], c["name"]))
    return d


def main(out_path):
    result = {}
    for voiv, cities in CITIES.items():
        found = []
        with cf.ThreadPoolExecutor(max_workers=8) as ex:
            per_city = list(ex.map(lambda c: (c, city_cams(voiv, c)), cities))
        cams = [(cid, name, url, city) for city, lst in per_city for cid, name, url in lst]
        print(f"{voiv}: kandydatów {len(cams)}", flush=True)
        with cf.ThreadPoolExecutor(max_workers=12) as ex:
            checks = list(ex.map(lambda c: (c, alive(c[0])), cams))
        for (cid, name, url, city), thumb in checks:
            if thumb:
                found.append({"id": cid, "name": name, "city": city.replace("-", " ").title(),
                              "url": url, "thumb": thumb})
        # deduplikacja po id, sortowanie po mieście
        seen, ded = set(), []
        for c in sorted(found, key=lambda c: (c["city"], c["name"])):
            if c["id"] in seen:
                continue
            seen.add(c["id"])
            ded.append(c)
        result[voiv] = ded
        print(f"  → działających: {len(ded)}", flush=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(normalize(result), f, ensure_ascii=False, indent=0)
    print("zapisano", out_path)


if __name__ == "__main__":
    # --normalize-only: sama normalizacja istniejącego pliku, bez skanowania sieci
    if len(sys.argv) > 2 and sys.argv[2] == "--normalize-only":
        path = sys.argv[1]
        data = json.load(open(path, encoding="utf-8"))
        json.dump(normalize(data), open(path, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=0)
        print("znormalizowano", path)
    else:
        main(sys.argv[1])
