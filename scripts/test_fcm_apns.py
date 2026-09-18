# -*- coding: utf-8 -*-
"""Blok apns dla iPhone'a: Android dalej data-only, iOS mieści się w 4096 bajtach.

Na iOS wiadomość data-only przy zamkniętej aplikacji nie pokazuje niczego, więc
tytuł, treść i dźwięk podaje serwer w bloku `apns`. FCM wysyła ten blok wyłącznie
na iOS — Android musi zostać nietknięty, bo jego alarm buduje StraznikFcmService.
Twardy limit ładunku APNs to 4096 B razem z całym `data`, a nasze powody potrafią
mieć kilka kilobajtów: wtedy blok iOS ma odpaść, żeby nie stracić wysyłki.

Wymaga firebase-admin (jest na serwerze). Uruchomienie: python3 scripts/test_fcm_apns.py
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

try:
    from firebase_admin import messaging
    from firebase_admin import _messaging_encoder as enc   # prywatne, ale stabilne w 6.x–7.x
except ImportError:
    print("POMINIĘTE: brak firebase-admin (uruchom na serwerze)")
    sys.exit(0)

from app import notify  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def zakodowana(topic, data):
    msg = messaging.Message(topic=topic, data=data,
                            android=messaging.AndroidConfig(priority="high"),
                            apns=notify._apns_config(topic, data))
    return json.loads(json.dumps(msg, cls=enc.MessageEncoder))


def bajty_apns(m):
    """Rozmiar ładunku tak, jak zobaczy go APNs: aps razem z całym `data`."""
    payload = dict(m["apns"]["payload"])
    payload.update(m["data"])
    return len(json.dumps(payload, ensure_ascii=False).encode())


DANE = {"voiv": "świętokrzyskie", "level": "high", "score": "4.5",
        "headline": "Rakieta manewrująca ok. 120 km od granicy, dolot do granicy ok. 9 min",
        "reasons": "\n".join(f"• Doniesienie {i}: " + "ż" * 120 + " (+0.5 pkt)" for i in range(9)),
        "sent_at": "2026-09-18T20:00:00+00:00", "event_id": "świętokrzyskie|high|1"}

m = zakodowana("voiv_swietokrzyskie", DANE)

print("1. Android bez zmian")
sprawdz("notification" not in m, "wiadomość nadal data-only — alarm buduje StraznikFcmService")
sprawdz(m["android"]["priority"] == "high", "wysoki priorytet Androida zachowany")

print("2. Czerwony alarm na iPhonie")
aps = m["apns"]["payload"]["aps"]
sprawdz(aps["alert"]["title"].startswith("WYSOKI PRIORYTET: woj. świętokrzyskie"),
        "tytuł jak na Androidzie")
sprawdz(aps["sound"] == "alarm_syrena.wav", "syrena dla czerwonego")
sprawdz(aps["interruption-level"] == "time-sensitive", "czerwony przebija tryb Skupienia")
sprawdz("NIEOFICJALNE" in aps["alert"]["body"], "zastrzeżenie o nieoficjalnym źródle w treści")
sprawdz(DANE["headline"] in aps["alert"]["body"], "pierwsza linia alarmu: co i gdzie")
sprawdz(m["apns"]["headers"]["apns-collapse-id"] == "voiv_swietokrzyskie",
        "kolejny stan województwa zastępuje poprzedni")
sprawdz(m["apns"]["headers"]["apns-push-type"] == "alert", "typ alert, priorytet 10")
waznosc = int(m["apns"]["headers"]["apns-expiration"]) - int(time.time())
sprawdz(590 <= waznosc <= 600,
        f"APNs przestaje próbować po 10 minutach, jak próg spóźnienia na Androidzie ({waznosc} s)")
sprawdz(bajty_apns(m) <= 4096, f"ładunek mieści się w limicie APNs ({bajty_apns(m)} B)")

print("3. Żółty i temat testowy")
t = zakodowana("test_voiv_lubelskie", dict(DANE, voiv="lubelskie", level="elevated"))
taps = t["apns"]["payload"]["aps"]
sprawdz(taps["alert"]["title"].startswith("TEST — PODWYŻSZONA UWAGA"), "test oznaczony w tytule")
sprawdz(taps["interruption-level"] == "active", "żółty nie budzi w trybie Skupienia")
sprawdz(taps["sound"] == "alert_uwaga.wav", "spokojniejszy dźwięk dla żółtego")

print("4. Ekstremum: bardzo duże dane")
ogromne = dict(DANE, reasons="x" * 3900)
sprawdz(notify._apns_config("voiv_lubelskie", ogromne) is None,
        "przy przepełnieniu blok iOS odpada, Android dostaje alarm normalnie")
duze = zakodowana("voiv_lubelskie", dict(DANE, reasons="ż" * 1200))
sprawdz("apns" not in duze or bajty_apns(duze) <= 4096,
        "przy długich powodach albo przycinamy treść, albo odpuszczamy blok iOS")

print("5. Osłona wysyłki")
sprawdz(notify._apns_safe("voiv_lubelskie", {"level": object()}) is None,
        "błąd w budowaniu bloku iOS nie przewraca alarmu na Androidzie")

print()
if bledy:
    print("BŁĘDY:", len(bledy))
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("OK: apns dla iOS, Android data-only bez zmian")
