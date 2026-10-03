# -*- coding: utf-8 -*-
"""Sprawdza oba pliki blokad w bazie podatności OSV.

Pliki: `backend/requirements.lock` (Python) i `android-app/package-lock.json`
(npm). Sprawdzane są wszystkie pakiety, także te wciągnięte pośrednio.

Bez zewnętrznych bibliotek — sam `urllib` ze standardowej biblioteki.
Narzędzie pilnujące bezpieczeństwa nie powinno samo dokładać zależności.

Nazwa NIE zaczyna się od `test_`, więc skrypt nie wchodzi do zestawu
uruchamianego przed wydaniem. To celowe: wymaga sieci, a test zależny od
internetu prędzej czy później pada bez winy kodu i uczy ignorowania czerwieni.

Kod wyjścia: 0 gdy czysto, 1 gdy cokolwiek znaleziono LUB nie udało się
sprawdzić. Nieudane sprawdzenie nie jest wynikiem „czysto". Decyzja po kodzie
wyjścia, nie po treści wydruku.

Uruchomienie: python3 scripts/osv_sprawdz.py
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

KORZEN = pathlib.Path(__file__).resolve().parent.parent
API = "https://api.osv.dev/v1/querybatch"
PACZKA = 100          # OSV przyjmuje wiele zapytań naraz
LIMIT_CZASU = 90


def pakiety_python(sciezka: pathlib.Path):
    """Linie `nazwa==wersja` z pliku po `pip freeze`; komentarze pomijamy."""
    wynik = []
    for linia in sciezka.read_text(encoding="utf-8").splitlines():
        linia = linia.split("#")[0].strip()
        m = re.match(r"^([A-Za-z0-9._-]+)==([^\s;]+)", linia)
        if m:
            wynik.append(("PyPI", m.group(1), m.group(2)))
    return wynik


def pakiety_npm(sciezka: pathlib.Path):
    """Wszystkie pakiety z `packages` w pliku blokad npm, razem z zagnieżdżonymi."""
    dane = json.loads(sciezka.read_text(encoding="utf-8"))
    wynik = []
    for klucz, info in (dane.get("packages") or {}).items():
        if not klucz or not info.get("version"):
            continue            # pusty klucz to sam projekt, nie zależność
        nazwa = info.get("name") or klucz.split("node_modules/")[-1]
        wynik.append(("npm", nazwa, info["version"]))
    return wynik


def zapytaj_osv(paczki):
    trafienia = []
    for i in range(0, len(paczki), PACZKA):
        kawalek = paczki[i:i + PACZKA]
        tresc = {"queries": [
            {"package": {"ecosystem": e, "name": n}, "version": v} for e, n, v in kawalek
        ]}
        zadanie = urllib.request.Request(
            API,
            data=json.dumps(tresc).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(zadanie, timeout=LIMIT_CZASU) as odp:
            wyniki = json.load(odp)["results"]
        if len(wyniki) != len(kawalek):
            raise RuntimeError(
                f"OSV zwróciło {len(wyniki)} odpowiedzi na {len(kawalek)} zapytań")
        for (e, n, v), w in zip(kawalek, wyniki):
            for podatnosc in (w.get("vulns") or []):
                trafienia.append((e, n, v, podatnosc["id"]))
    return trafienia


DO_SPRAWDZENIA = (
    ("backend/requirements.lock", pakiety_python),
    ("android-app/package-lock.json", pakiety_npm),
)


def main() -> int:
    kod = 0
    for wzgledna, czytaj in DO_SPRAWDZENIA:
        sciezka = KORZEN / wzgledna
        if not sciezka.exists():
            print(f"{wzgledna}: BRAK PLIKU — sprawdzenie nie odbyło się")
            kod = 1
            continue
        try:
            paczki = czytaj(sciezka)
            trafienia = zapytaj_osv(paczki)
        except (urllib.error.URLError, OSError, ValueError, RuntimeError) as e:
            # Nieudane sprawdzenie to NIE jest wynik „czysto”.
            print(f"{wzgledna}: nie udało się sprawdzić — {type(e).__name__}: {e}")
            kod = 1
            continue

        if trafienia:
            print(f"{wzgledna}: {len(paczki)} pakietów, ZNALEZIONO {len(trafienia)}:")
            for e, n, v, vid in trafienia:
                print(f"    {e} {n} {v} -> {vid}  (https://osv.dev/vulnerability/{vid})")
            kod = 1
        else:
            print(f"{wzgledna}: {len(paczki)} pakietów, czysto")
    return kod


if __name__ == "__main__":
    sys.exit(main())
