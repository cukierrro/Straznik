"""Pilnuje, żeby rozszerzenie powiadomień znało zdania, które wysyła serwer.

Rozszerzenie na iOS tłumaczy treść alarmu przez DOSŁOWNE dopasowanie zdań
z `notify.py` i etykiet poziomu z `fusion.py`. To było świadome: przy niezgodności
dopasowanie nie zadziała i zostanie tekst polski, a nie tekst ucięty. Cena jest
taka, że zmiana brzmienia po stronie serwera cicho wyłącza tłumaczenie.

Ten test zamienia ciszę w błąd. Uruchamiać z korzenia repozytorium:

    python ios-app/skrypty/test_zdania_rozszerzenia.py

Gdy padnie, są dwie poprawne reakcje — i żadna z nich to „zmień test":
  1. dopisać nowe brzmienie do tabeli w `NotificationService.swift` razem
     z tłumaczeniami EN i UK,
  2. albo świadomie uznać, że tego zdania nie tłumaczymy, i usunąć je z tabeli.
"""
import pathlib
import re
import sys

KORZEN = pathlib.Path(__file__).resolve().parents[2]
NOTIFY = KORZEN / "backend" / "app" / "notify.py"
FUSION = KORZEN / "backend" / "app" / "fusion.py"
SWIFT = (KORZEN / "ios-app" / "straznik-background" / "ios" / "Sources"
         / "StraznikBackgroundPlugin" / "StraznikBackgroundPlugin.swift")
NSE = KORZEN / "ios-app" / "ios" / "App" / "NotificationService" / "NotificationService.swift"


def czytaj(sciezka: pathlib.Path) -> str:
    if not sciezka.exists():
        print(f"POMIJAM: brak {sciezka.relative_to(KORZEN)}")
        sys.exit(0)
    return sciezka.read_text(encoding="utf-8")


def zdania_serwera(tresc: str) -> set[str]:
    """Stałe zdania z bloku `tail` w `_apns_config`."""
    i = tresc.find("tail = [")
    if i < 0:
        print("BŁĄD: nie znalazłem bloku `tail` w notify.py — zmienił się kształt kodu,")
        print("      więc ten test przestał cokolwiek sprawdzać. Popraw test, nie usuwaj.")
        sys.exit(1)
    blok = tresc[i:tresc.index("]", i)]
    return {m.group(1) for m in re.finditer(r'"([^"]{30,})"', blok)}


def etykiety_poziomu(tresc: str) -> set[str]:
    i = tresc.find("LEVEL_LABELS = {")
    blok = tresc[i:tresc.index("}", i)]
    return {m.group(1) for m in re.finditer(r'"(?:elevated|high)":\s*"([^"]+)"', blok)}


def main() -> int:
    oczekiwane = zdania_serwera(czytaj(NOTIFY)) | etykiety_poziomu(czytaj(FUSION))
    rozszerzenie = czytaj(NSE)
    brakuje = [z for z in sorted(oczekiwane) if z not in rozszerzenie]

    print(f"Zdań i etykiet z serwera: {len(oczekiwane)}")
    if brakuje:
        print("\nROZSZERZENIE NIE ZNA TYCH ZDAŃ — alarm przyjdzie po polsku mimo")
        print("ustawionego języka, i NIC o tym nie powie:\n")
        for z in brakuje:
            print(f"  • {z}")
        print(f"\nTabele do uzupełnienia: {NSE.relative_to(KORZEN)} (POZIOMY / ZDANIA).")
        return 1

    # To samo dla testu lokalnego we wtyczce — tam zdania są wpisane drugi raz.
    wtyczka = czytaj(SWIFT)
    rozjazd = [z for z in sorted(oczekiwane) if z not in wtyczka and "PRIORYTET" not in z
               and "UWAGA" not in z]
    if rozjazd:
        print("\nUWAGA (nie błąd): test alarmu we wtyczce ma inne brzmienie niż serwer:")
        for z in rozjazd:
            print(f"  • {z}")
        print("Test 5 s wygląda wtedy inaczej niż prawdziwy alarm — do rozważenia.")

    print("OK — rozszerzenie zna wszystkie stałe zdania serwera.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
