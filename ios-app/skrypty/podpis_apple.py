"""Certyfikat i profil do podpisu, wzięte z App Store Connect na czas budowania.

Po co: uprawnienia (`aps-environment`, powiadomienia czasowo zależne) wchodzą do
aplikacji wyłącznie przy podpisywaniu. Podpis w chmurze Apple, robiony dopiero przy
eksporcie, ustala je sam i pomijał powiadomienia — build wyglądał na sprawny, a nie
odbierał żadnego alarmu (19.09.2026, zmierzone na dwóch iPhone'ach). Podpisanie
archiwum wymaga certyfikatu, a na maszynie budującej nie ma żadnego.

Skrypt prosi więc Apple o certyfikat dystrybucyjny i profil App Store, używa ich do
podpisu i oddaje je z powrotem (`--sprzatanie`). Konto ma limit certyfikatów
dystrybucyjnych, dlatego przy odmowie „za dużo certyfikatów” wycofujemy najstarszy
i próbujemy raz jeszcze.

Wymaga: pyjwt, cryptography (instalowane w venv w workflow) oraz openssl (macOS).

Użycie:
    python podpis_apple.py --przygotuj   # tworzy certyfikat, profil, .p12
    python podpis_apple.py --sprzatanie  # wycofuje certyfikat i kasuje profil
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import subprocess
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


def narzedzie_openssl() -> str:
    """Systemowy openssl (LibreSSL) przed ewentualnym z Homebrew.

    Ma znaczenie przy pakowaniu .p12: OpenSSL 3 domyślnie szyfruje algorytmami,
    których pęk kluczy macOS nie czyta („MAC verification failed during PKCS12
    import” — 19.09.2026). LibreSSL pakuje po staremu i system to przyjmuje.
    """
    return "/usr/bin/openssl" if pathlib.Path("/usr/bin/openssl").exists() else "openssl"


def openssl(*args: str, wejscie: bytes | None = None) -> None:
    wynik = subprocess.run([narzedzie_openssl(), *args], input=wejscie, capture_output=True)
    if wynik.returncode != 0:
        raise SystemExit("openssl " + args[0] + ": " + wynik.stderr.decode(errors="replace"))


def wypisz(klucz: str, wartosc: str) -> None:
    """Przekazuje wartość do kolejnych kroków workflow."""
    plik = os.environ.get("GITHUB_OUTPUT")
    if plik:
        with open(plik, "a", encoding="utf-8") as f:
            f.write(f"{klucz}={wartosc}\n")
    print(f"{klucz}={wartosc}")


def certyfikaty_dystrybucyjne() -> list[dict]:
    dane = api("/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=200")
    return dane.get("data", [])


def utworz_certyfikat(csr: str) -> dict:
    zadanie = {
        "data": {
            "type": "certificates",
            "attributes": {"certificateType": "DISTRIBUTION", "csrContent": csr},
        }
    }
    try:
        return api("/v1/certificates", "POST", zadanie)["data"]
    except SystemExit as e:
        if "maximum" not in str(e).lower() and "limit" not in str(e).lower():
            raise
        # Limit wyczerpany: wycofujemy najstarszy i próbujemy jeszcze raz. Na tym
        # koncie certyfikaty dystrybucyjne pochodzą wyłącznie z tego skryptu —
        # użytkownik nie ma Maca i nie tworzy ich ręcznie.
        stare = sorted(certyfikaty_dystrybucyjne(),
                       key=lambda c: c["attributes"].get("expirationDate", ""))
        if not stare:
            raise
        print("Limit certyfikatów wyczerpany — wycofuję najstarszy:",
              stare[0]["attributes"].get("displayName"))
        api("/v1/certificates/" + stare[0]["id"], "DELETE")
        return api("/v1/certificates", "POST", zadanie)["data"]


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


def przygotuj() -> None:
    katalog = pathlib.Path(os.environ["RUNNER_TEMP"])
    klucz = katalog / "podpis.key"
    csr_plik = katalog / "podpis.csr"
    cer = katalog / "podpis.cer"
    pem = katalog / "podpis.pem"
    p12 = katalog / "podpis.p12"

    openssl("genrsa", "-out", str(klucz), "2048")
    openssl("req", "-new", "-key", str(klucz), "-out", str(csr_plik),
            "-subj", "/CN=Straznik CI/O=Straznik/C=PL")
    csr = csr_plik.read_text()

    cert = utworz_certyfikat(csr)
    wypisz("cert_id", cert["id"])
    print("Certyfikat:", cert["attributes"].get("displayName"),
          "ważny do", cert["attributes"].get("expirationDate"))
    cer.write_bytes(base64.b64decode(cert["attributes"]["certificateContent"]))
    openssl("x509", "-inform", "DER", "-in", str(cer), "-out", str(pem))

    haslo = base64.b64encode(os.urandom(18)).decode()
    # Algorytmy wskazane wprost: pęk kluczy macOS nie przyjmuje domyślnych
    # ustawień OpenSSL 3, a na maszynie budującej bywają oba narzędzia.
    openssl("pkcs12", "-export", "-inkey", str(klucz), "-in", str(pem),
            "-out", str(p12), "-name", "Straznik CI",
            "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1",
            "-passout", "pass:" + haslo)
    wypisz("p12", str(p12))
    # Hasło idzie do pliku, nie do wyjścia kroku: wyjścia trafiają do podsumowania
    # przebiegu, a repozytorium jest publiczne.
    haslo_plik = katalog / "podpis.haslo"
    haslo_plik.write_text(haslo, encoding="utf-8")
    haslo_plik.chmod(0o600)

    # Profil zawsze tworzymy od nowa: musi wskazywać certyfikat z tego przebiegu.
    for stary in profile_o_nazwie():
        api("/v1/profiles/" + stary["id"], "DELETE")
        print("Skasowałem poprzedni profil", stary["id"])

    profil = api("/v1/profiles", "POST", {
        "data": {
            "type": "profiles",
            "attributes": {"name": NAZWA_PROFILU, "profileType": "IOS_APP_STORE"},
            "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": id_bundle()}},
                "certificates": {"data": [{"type": "certificates", "id": cert["id"]}]},
            },
        }
    })["data"]
    wypisz("profil_id", profil["id"])
    wypisz("profil_nazwa", NAZWA_PROFILU)
    wypisz("profil_uuid", profil["attributes"]["uuid"])

    cel = pathlib.Path.home() / "Library/MobileDevice/Provisioning Profiles"
    cel.mkdir(parents=True, exist_ok=True)
    plik = cel / (profil["attributes"]["uuid"] + ".mobileprovision")
    plik.write_bytes(base64.b64decode(profil["attributes"]["profileContent"]))
    print("Profil zapisany:", plik)


def sprzatanie() -> None:
    """Oddaje to, co pożyczyliśmy. Błędy tylko zgłaszamy — nie psujemy wyniku builda."""
    for nazwa, sciezka in (("profil", "/v1/profiles/" + os.environ.get("PROFIL_ID", "")),
                           ("certyfikat", "/v1/certificates/" + os.environ.get("CERT_ID", ""))):
        ident = sciezka.rsplit("/", 1)[1]
        if not ident:
            continue
        try:
            api(sciezka, "DELETE")
            print("Wycofano", nazwa, ident)
        except SystemExit as e:
            print("Nie udało się wycofać", nazwa, ident, "—", e)


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
