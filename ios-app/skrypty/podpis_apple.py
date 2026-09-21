"""Certyfikat i profil do podpisu aplikacji iOS w chmurze.

Po co podpis w ogóle: uprawnienia (`aps-environment`, powiadomienia czasowo zależne)
wchodzą do aplikacji wyłącznie przy podpisywaniu. Podpis w chmurze Apple, robiony
dopiero przy eksporcie, ustala je sam i pomijał powiadomienia — build wyglądał na
sprawny, a nie odbierał żadnego alarmu (19.09.2026, zmierzone na dwóch iPhone'ach).

JEDEN TRWAŁY CERTYFIKAT, NIGDY NIE WYCOFYWANY (od 21.09.2026)
Do 21.09 skrypt „pożyczał” certyfikat: tworzył nowy na każde budowanie i wycofywał go
na końcu, żeby nie zajmował limitu konta. To unieważniało podpis każdego zbudowanego
nim pliku. TestFlight to przepuścił, ale przegląd App Store sprawdza podpis ponownie
przy zgłoszeniu — build 1.7.63 dostał ITMS-90035 „Invalid Signature” i przepadł.
Do tego przy wyczerpanym limicie skrypt kasował najstarszy certyfikat, więc KAŻDE
nowe budowanie w trakcie przeglądu unieważniało build czekający na przegląd.

Teraz certyfikat jest jeden, trwały (utworzony przepływem `ios-certyfikat.yml` z
wniosku przygotowanego poza GitHubem), a jego .p12 leży w sekretach:
`IOS_DIST_P12_BASE64`, `IOS_DIST_P12_PASSWORD`, `IOS_DIST_CERT_ID`. Skrypt tylko go
używa. Profil App Store jest wykorzystywany ponownie, póki wskazuje ten certyfikat.
Nie ma tu już żadnej ścieżki, która wycofuje certyfikat — i ma jej nie być.

Wymaga: pyjwt, cryptography (instalowane w venv w workflow).

Użycie:
    python podpis_apple.py --przygotuj   # .p12 z sekretu + profil App Store
    python podpis_apple.py --sprzatanie  # nic nie wycofuje (zostawione dla zgodności)
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

API = "https://api.appstoreconnect.apple.com"
NAZWA_PROFILU = "Straznik CI App Store"
BUNDLE_ID = "pl.straznik.app"


def token() -> str:
    kid = os.environ["ASC_KEY_ID"]
    iss = os.environ["ASC_ISSUER_ID"]
    klucz = pathlib.Path(os.environ["ASC_KEY_PATH"]).read_text()
    teraz = int(time.time())
    return jwt.encode(
        {"iss": iss, "iat": teraz, "exp": teraz + 900, "aud": "appstoreconnect-v1"},
        klucz,
        algorithm="ES256",
        headers={"kid": kid, "typ": "JWT"},
    )


def api(sciezka: str, metoda: str = "GET", dane: dict | None = None) -> dict:
    url = sciezka if sciezka.startswith("http") else API + sciezka
    body = json.dumps(dane).encode() if dane is not None else None
    req = urllib.request.Request(url, data=body, method=metoda)
    req.add_header("Authorization", "Bearer " + token())
    if body:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            tresc = r.read()
            return json.loads(tresc) if tresc else {}
    except urllib.error.HTTPError as e:
        tresc = e.read().decode(errors="replace")
        raise SystemExit(f"App Store Connect: HTTP {e.code} przy {metoda} {sciezka}\n{tresc}")


def wypisz(klucz: str, wartosc: str) -> None:
    """Przekazuje wartość do kolejnych kroków workflow."""
    plik = os.environ.get("GITHUB_OUTPUT")
    if plik:
        with open(plik, "a", encoding="utf-8") as f:
            f.write(f"{klucz}={wartosc}\n")
    print(f"{klucz}={wartosc}")


def id_bundle() -> str:
    filtr = urllib.parse.quote(BUNDLE_ID)
    dane = api(f"/v1/bundleIds?filter[identifier]={filtr}&limit=200")
    for wpis in dane.get("data", []):
        if wpis["attributes"]["identifier"] == BUNDLE_ID:
            return wpis["id"]
    raise SystemExit(f"Nie znalazłem identyfikatora aplikacji {BUNDLE_ID} na koncie")


def profile_o_nazwie() -> list[dict]:
    dane = api("/v1/profiles?limit=200")
    return [p for p in dane.get("data", []) if p["attributes"]["name"] == NAZWA_PROFILU]


def profil_dla(cert_id: str) -> dict:
    """Profil App Store wskazujący trwały certyfikat — istniejący albo nowy.

    Istniejący aktywny profil bierzemy bez zmian. Nowy powstaje tylko wtedy, gdy
    takiego nie ma; wcześniej kasujemy profile o tej samej nazwie, bo wskazują
    wycofane certyfikaty z czasów „pożyczania” i do niczego się nie nadają.
    """
    for profil in profile_o_nazwie():
        attrs = profil["attributes"]
        if attrs.get("profileState") != "ACTIVE" or attrs.get("profileType") != "IOS_APP_STORE":
            continue
        certy = api(f"/v1/profiles/{profil['id']}/certificates?limit=50").get("data", [])
        if any(c["id"] == cert_id for c in certy):
            print("Używam istniejącego profilu", profil["id"], attrs.get("uuid"))
            return profil
    for stary in profile_o_nazwie():
        api("/v1/profiles/" + stary["id"], "DELETE")
        print("Skasowałem nieaktualny profil", stary["id"],
              stary["attributes"].get("profileState"))
    profil = api("/v1/profiles", "POST", {
        "data": {
            "type": "profiles",
            "attributes": {"name": NAZWA_PROFILU, "profileType": "IOS_APP_STORE"},
            "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": id_bundle()}},
                "certificates": {"data": [{"type": "certificates", "id": cert_id}]},
            },
        }
    })["data"]
    print("Utworzyłem profil", profil["id"], profil["attributes"].get("uuid"))
    return profil


def przygotuj() -> None:
    katalog = pathlib.Path(os.environ["RUNNER_TEMP"])
    p12 = katalog / "podpis.p12"
    haslo_plik = katalog / "podpis.haslo"

    p12_b64 = os.environ.get("STALY_P12_BASE64", "").strip()
    haslo = os.environ.get("STALY_P12_HASLO", "")
    cert_id = os.environ.get("STALY_CERT_ID", "").strip()
    if not (p12_b64 and haslo and cert_id):
        # Celowo bez powrotu do starego trybu. On tworzył i wycofywał certyfikat, co
        # unieważnia build w przeglądzie — lepiej przerwać budowanie niż wysłać plik,
        # który Apple odrzuci dopiero przy zgłoszeniu (ITMS-90035, 21.09.2026).
        raise SystemExit(
            "Brak trwałego certyfikatu w sekretach (IOS_DIST_P12_BASE64, "
            "IOS_DIST_P12_PASSWORD, IOS_DIST_CERT_ID). Utwórz go przepływem "
            "ios-certyfikat.yml — NIE twórz certyfikatu na czas budowania.")

    p12.write_bytes(base64.b64decode(p12_b64))
    haslo_plik.write_text(haslo, encoding="utf-8")
    haslo_plik.chmod(0o600)
    wypisz("p12", str(p12))
    # `cert_id` celowo NIE trafia do wyjść kroku: po nim krok sprzątania rozpoznawał
    # certyfikat „pożyczony” i go wycofywał.
    print("Podpis trwałym certyfikatem", cert_id)

    profil = profil_dla(cert_id)
    wypisz("profil_nazwa", NAZWA_PROFILU)
    wypisz("profil_uuid", profil["attributes"]["uuid"])

    cel = pathlib.Path.home() / "Library/MobileDevice/Provisioning Profiles"
    cel.mkdir(parents=True, exist_ok=True)
    plik = cel / (profil["attributes"]["uuid"] + ".mobileprovision")
    plik.write_bytes(base64.b64decode(profil["attributes"]["profileContent"]))
    print("Profil zapisany:", plik)


def sprzatanie() -> None:
    """Nic nie wycofuje. Certyfikat i profil są trwałe — patrz opis na górze pliku."""
    print("Certyfikat i profil zostają: wycofanie unieważniłoby build w przeglądzie App Store.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--przygotuj", action="store_true")
    p.add_argument("--sprzatanie", action="store_true")
    a = p.parse_args()
    if a.przygotuj:
        przygotuj()
    elif a.sprzatanie:
        sprzatanie()
    else:
        p.print_help()
        sys.exit(2)
