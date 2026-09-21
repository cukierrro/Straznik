# -*- coding: utf-8 -*-
"""Komunikat tylko do starych wersji — czy trafia dokładnie tam (20.09.2026).

Gniazdo otwierają wyłącznie wydania ≤1.7.62; od 1.7.63 telefon odpytuje i do
ramki WebSocketu nigdy nie zajrzy. Dlatego prośbę o aktualizację wkładamy do
ramki gniazda, a nie do `data/notice.json`, który idzie do wszystkich.

Test pilnuje trzech rzeczy:
  1. paczka dla przeglądarek i nowych telefonów NIE dostaje tego komunikatu,
  2. ramka gniazda go dostaje,
  3. bez pliku nic się nie zmienia — zero ryzyka, gdy komunikatu nie ma.

Uruchomienie: py scripts/test_komunikat_stare_wersje.py
"""
import json
import os
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
_dotenv = types.ModuleType("dotenv")
_dotenv.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", _dotenv)
DANE = Path(tempfile.mkdtemp(prefix="straznik-notice-"))
os.environ["STRAZNIK_DATA_DIR"] = str(DANE)
sys.stdout.reconfigure(encoding="utf-8")

from app import config, main, public_cache  # noqa: E402

config.DATA_DIR = DANE
bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def odswiez():
    """Podstawiamy lekki stan zamiast liczenia z bazy — testujemy rozdział, nie punktację."""
    main.build_state = lambda: {"notice": main._load_notice(), "fusion": {"ts": "T", "voivodeships": {}},
                                "neptun": {"status": {"last_msg": 0}}}
    main._state_fingerprint = ""
    main.refresh_state()
    return json.loads(public_cache.get("state").raw), json.loads(main._ws_message)


print("1. Bez pliku z komunikatem nic się nie dzieje")
rest, ws = odswiez()
sprawdz(rest.get("notice") is None, "paczka dla nowych wersji bez komunikatu")
sprawdz(ws["type"] == "state" and ws["data"].get("notice") is None, "ramka gniazda też bez komunikatu")

print("2. Komunikat dla starych wersji trafia TYLKO do gniazda")
# Bierzemy dokładnie ten plik, który pójdzie na serwer — test sprawdza treść, nie atrapę.
GOTOWY = json.loads((ROOT / "docs/notice-stare-wersje.json").read_text(encoding="utf-8"))
(DANE / "notice-stare-wersje.json").write_text(json.dumps(GOTOWY, ensure_ascii=False),
                                               encoding="utf-8")
rest, ws = odswiez()
sprawdz(rest.get("notice") is None,
        "przeglądarki i telefony z 1.7.63+ NIE widzą prośby o aktualizację")
sprawdz((ws["data"].get("notice") or {}).get("id") == GOTOWY["id"],
        "stare wersje dostają ją przez gniazdo")
tresc = ws["data"]["notice"]["text"]
sprawdz("Sprawdź aktualizacje" in tresc, "kieruje do przycisku w aplikacji")
sprawdz("straci połączenie" in tresc and "25 września" in tresc,
        "uprzedza datą, a nie odcina bez słowa — kanał jeszcze działa, więc ostrzeżenie ma gdzie dotrzeć")
sprawdz("odzysk" not in tresc and "odinstal" not in tresc.lower(),
        "NIE każe odinstalowywać — to skasowałoby zapisane miejsca i ustawienia")
sprawdz("instaluje się na starej" in tresc,
        "mówi wprost, że ustawienia zostają (ludzie boją się stracić miejsca)")
sprawdz("straznik.eu/pobierz" in tresc,
        "podaje krótki adres do ręcznej instalacji — stare wersje nie umieją pokazać klikalnego linku")
sprawdz("przeglądarce" in tresc,
        "ma zdanie dla kart z zapamiętaną starą stroną — im wystarczy odświeżenie")
from datetime import datetime, timezone  # noqa: E402
sprawdz(datetime.fromisoformat(GOTOWY["until"]) > datetime.now(timezone.utc),
        f"ma termin wygaśnięcia w przyszłości ({GOTOWY['until'][:10]})")

print("3. Zwykły komunikat dla wszystkich działa jak dotąd")
(DANE / "notice.json").write_text(json.dumps({"id": "test-syren", "text": "Jutro próba syren."}),
                                  encoding="utf-8")
rest, ws = odswiez()
sprawdz((rest.get("notice") or {}).get("id") == "test-syren", "trafia do wszystkich")
sprawdz((ws["data"]["notice"] or {}).get("id") == GOTOWY["id"],
        "a stare wersje widzą swój — komunikat dla nich ma pierwszeństwo")

print("4. Wygasanie po terminie zostało nietknięte")
(DANE / "notice-stare-wersje.json").write_text(json.dumps({
    "id": "stary", "text": "x", "until": "2020-01-01T00:00:00+00:00"}), encoding="utf-8")
rest, ws = odswiez()
sprawdz((ws["data"]["notice"] or {}).get("id") == "test-syren",
        "przeterminowany komunikat znika sam, bez wchodzenia na serwer")

print()
if bledy:
    print("BŁĘDY:", len(bledy))
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("OK: prośba o aktualizację dociera do starych wersji i do nikogo więcej.")
