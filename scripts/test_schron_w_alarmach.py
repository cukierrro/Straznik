# -*- coding: utf-8 -*-
"""„Miejsce schronienia”, nie „schron”, we WSZYSTKICH alarmach (17.10.2026).

Decyzja usera 15.10: na ekranie alarmu „miejsce schronienia” zamiast „schronu”.
W 1.7.95 poprawiono tylko ekran w przeglądarce/WebView (pilnuje tego
test_alarm_na_wierzchu.cjs). Push testowy NSE 17.10 pokazał, że powiadomienia
z serwera (iOS i Web Push) oraz natywny Android dalej mówiły „przejdź do schronu”.
Rozszerzenie iOS tłumaczy to zdanie dosłownym dopasowaniem — przy zmianie brzmienia
pilnuje go ios-app/skrypty/test_zdania_rozszerzenia.py na gałęzi iOS.

Uruchomienie:  py scripts/test_schron_w_alarmach.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
PLIKI = [
    "backend/app/notify.py",
    "android-app/android/app/src/main/java/pl/straznik/app/Alarms.java",
    "android-app/android/app/src/main/java/pl/straznik/app/AlarmActivity.java",
]
bledy = []
for rel in PLIKI:
    tekst = (ROOT / rel).read_text(encoding="utf-8")
    stare = re.findall(r"(?:przejdź|idź|udaj się) do schronu", tekst, re.I)
    if stare:
        bledy.append(f"{rel}: zostało {stare}")
    if "przejdź do miejsca schronienia" not in tekst:
        bledy.append(f"{rel}: brak „przejdź do miejsca schronienia”")
    print(("OK   " if not stare and "przejdź do miejsca schronienia" in tekst else "BLAD ") + rel)

if bledy:
    print("\n" + "\n".join(bledy))
    sys.exit(1)
print("\nOK - „miejsce schronienia” w powiadomieniach serwera i natywnym Androidzie")
