# -*- coding: utf-8 -*-
"""B12: nazwy tematów FCM i lista województw są takie same w serwerze i w aplikacji.

Rozjazd jednej litery (np. „ż" → „z" po jednej stronie, „zz" po drugiej) oznacza,
że telefon subskrybuje temat, na który serwer nigdy nie wysyła — cisza bez błędu.

Uruchomienie:  py scripts/test_tematy_fcm.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
from app import config, notify                                      # noqa: E402

JAVA = ROOT / "android-app/android/app/src/main/java/pl/straznik/app"
bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


alarms = (JAVA / "Alarms.java").read_text(encoding="utf-8")
plugin = (JAVA / "BackgroundPlugin.java").read_text(encoding="utf-8")

print("1. lista województw")
m = re.search(r"static final String\[\] VOIVS = \{(.*?)\};", alarms, re.S)
java_voivs = re.findall(r'"([^"]+)"', m.group(1)) if m else []
sprawdz(sorted(java_voivs) == sorted(config.VOIVODESHIPS),
        f"Alarms.VOIVS ({len(java_voivs)}) = config.VOIVODESHIPS ({len(config.VOIVODESHIPS)})")

print("2. temat FCM dla każdego województwa")
pary = re.findall(r"\.replace\('(.)', '(.)'\)", plugin)
prefix = re.search(r'return "(\w+_)" \+ s;', plugin)


def java_topic(name: str) -> str:
    s = name.lower()
    for a, b in pary:
        s = s.replace(a, b)
    return (prefix.group(1) if prefix else "?") + s


for v in config.VOIVODESHIPS:
    sprawdz(java_topic(v) == config.voiv_topic(v), f"{v}: Java {java_topic(v)} = Python {config.voiv_topic(v)}")
sprawdz(all(re.fullmatch(r"[a-zA-Z0-9-_.~%]+", config.voiv_topic(v)) for v in config.VOIVODESHIPS),
        "tematy tylko ze znaków dozwolonych przez FCM")

print("3. produkcja wysyła na te same tematy, test na osobne")
config.PRODUCTION = True
sprawdz(all(notify.fcm_topic(v) == config.voiv_topic(v) for v in config.VOIVODESHIPS), "produkcja: voiv_*")
sprawdz(all(notify.fcm_topic(v, True).startswith(config.TEST_TOPIC_PREFIX) for v in config.VOIVODESHIPS),
        "test: test_voiv_*")

print("4. kanały powiadomień: tryb wbudowany a strona natywna")
# Kanał raz utworzony ignoruje zmiany dźwięku, więc podmiana sygnału wymaga nowego
# identyfikatora, a stary trafia na listę do skasowania. Silnik wbudowany podaje te
# identyfikatory z palca: 13.09.2026 kanał żółtego poszedł na v4, a engine.js został
# przy v3 — czyli przy kanale KASOWANYM przy starcie. Android odrzuca wtedy
# powiadomienie bez śladu w aplikacji i tryb awaryjny milczy na żółtym poziomie.
kanaly_java = dict(re.findall(r'static final String (CH_\w+) = "([^"]+)"', alarms))
m = re.search(r"CH_LEGACY = \{(.*?)\};", alarms, re.S)
legacy = set(re.findall(r'"([^"]+)"', m.group(1))) if m else set()
engine = (ROOT / "frontend/engine.js").read_text(encoding="utf-8")
uzywane = set(re.findall(r'"(straznik-[a-z0-9-]+)"', engine))
sprawdz(bool(uzywane), f"engine.js podaje kanały: {', '.join(sorted(uzywane)) or 'brak'}")
for kanal in sorted(uzywane):
    sprawdz(kanal in kanaly_java.values(), f"„{kanal}” istnieje w Alarms.java")
    sprawdz(kanal not in legacy, f"„{kanal}” nie jest kanałem kasowanym przy starcie")
sprawdz(kanaly_java.get("CH_HIGH") in uzywane and kanaly_java.get("CH_INFO") in uzywane,
        "silnik używa obu kanałów alarmowych: czerwonego i żółtego")

print("5. pola wiadomości czytane przez aplikację")
fcm = (JAVA / "StraznikFcmService.java").read_text(encoding="utf-8")
serwer = (ROOT / "backend/app/notify.py").read_text(encoding="utf-8")
for pole in ("voiv", "level", "score", "reasons", "sent_at", "headline"):
    sprawdz(f'data.get("{pole}")' in fcm and f'"{pole}"' in serwer, f"pole „{pole}” wysyła serwer i czyta aplikacja")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - tematy FCM i pola wiadomości zgodne")
