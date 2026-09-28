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
import re
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

_re_czas = re.compile(r"^[0-2]\d:[0-5]\d · ")

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def zakodowana(topic, data, critical=False):
    msg = messaging.Message(topic=topic, data=data,
                            android=messaging.AndroidConfig(priority="high"),
                            apns=notify._apns_config(topic, data, critical))
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
sprawdz(aps["alert"]["title"] == "WYSOKI PRIORYTET: świętokrzyskie",
        "tytuł krótki — iPhone ucina długi i gubi właśnie nazwę województwa")
dlugosc = len(aps["alert"]["title"])
sprawdz(dlugosc <= 40, f"tytuł mieści się w linii ({dlugosc} znaków)")
# 24.09.2026 (prośba użytkownika): przed punktami stoi GODZINA WYSYŁKI, bo iPhone
# nie pokazuje własnego znacznika czasu na banerze, a przy spóźnionym pushu liczy
# się moment stwierdzenia zagrożenia, nie moment dotarcia. Test tego nie zauważył
# i padał po cichu od tamtej zmiany — stąd sprawdzamy oba człony osobno.
sprawdz(_re_czas.match(aps["alert"]["body"]),
        "treść otwiera godzina wysyłki w formacie HH:MM")
sprawdz("4.5 pkt" in aps["alert"]["body"].split("\n")[0], "punkty w pierwszej linii, zaraz za godziną")
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
sprawdz(taps["alert"]["title"] == "TEST — PODWYŻSZONA UWAGA: lubelskie", "test oznaczony w tytule")
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

print("6. Alarm krytyczny (Critical Alerts, entitlement Apple z 28.09.2026)")
# Dźwięk krytyczny przebija wyciszenie i tryb Nie przeszkadzać. Wymaga naraz:
# entitlementu w aplikacji, `sound` jako SŁOWNIKA w ładunku i zgody użytkownika.
# Telefony bez zgody zostają na `voiv_*` i nie mogą zauważyć tej zmiany.
k = zakodowana("voiv_lubelskie_krytyczne", dict(DANE, voiv="lubelskie"), critical=True)
kaps = k["apns"]["payload"]["aps"]
sprawdz(isinstance(kaps["sound"], dict),
        "czerwony na temacie krytycznym ma `sound` jako słownik, nie napis")
sprawdz(kaps["sound"].get("critical") == 1, "ustawiona flaga critical")
sprawdz(kaps["sound"].get("volume") == 1.0, "pełna głośność")
sprawdz(kaps["sound"].get("name") == "alarm_syrena.wav", "ta sama syrena co dotąd")
sprawdz(kaps["interruption-level"] == "critical", "poziom przerwania: critical")

# Żółty NIE ma prawa przebijać wyciszenia — nawet u kogoś, kto zgodził się na
# alarm krytyczny. Ale musi do niego dolecieć, bo on nie słucha już `voiv_*`.
z = zakodowana("voiv_lubelskie_krytyczne", dict(DANE, voiv="lubelskie", level="elevated"),
               critical=True)
zaps = z["apns"]["payload"]["aps"]
sprawdz(zaps["sound"] == "alert_uwaga.wav",
        "żółty na temacie krytycznym zostaje zwykłym dźwiękiem")
sprawdz(zaps["interruption-level"] == "active", "żółty nie budzi przy wyciszeniu")

# Dotychczasowy temat ani drgnie — tam siedzi Android i starsze iPhone'y.
sprawdz(m["apns"]["payload"]["aps"]["sound"] == "alarm_syrena.wav",
        "na zwykłym temacie czerwony ma dalej `sound` jako napis")
sprawdz(m["apns"]["payload"]["aps"]["interruption-level"] == "time-sensitive",
        "na zwykłym temacie poziom przerwania bez zmian")

# Nazwa tematu musi zgadzać się co do znaku z tym, co liczy aplikacja iOS.
# Bez literałów: poza usługą config.PRODUCTION jest fałszywe i każdy temat
# dostaje prefiks test_. Sprawdzamy ZALEŻNOŚĆ między tematami, nie napis.
for woj in ("lubelskie", "świętokrzyskie", "łódzkie"):
    sprawdz(notify.fcm_topic_krytyczny(woj) == notify.fcm_topic(woj) + notify.CRITICAL_TOPIC_SUFFIX,
            f"{woj}: temat krytyczny to zwykły temat plus sufiks")
sprawdz(notify.fcm_topic_krytyczny("świętokrzyskie", test=True).startswith("test_")
        and notify.fcm_topic_krytyczny("świętokrzyskie", test=True).endswith("_krytyczne"),
        "prefiks testowy z przodu, sufiks krytyczny z tyłu")
sprawdz("swietokrzyskie" in notify.fcm_topic_krytyczny("świętokrzyskie", test=True),
        "polskie znaki zamienione tak samo jak w zwykłym temacie")
sprawdz(re.fullmatch(r"[a-zA-Z0-9\-_.~%]+", notify.fcm_topic_krytyczny("łódzkie")) is not None,
        "nazwa tematu mieści się w alfabecie dozwolonym przez FCM")

# Ładunek krytyczny jest odrobinę większy (słownik zamiast napisu) — limit APNs
# obowiązuje tak samo, a przy przepełnieniu blok iOS ma odpaść jak dotąd.
# Chwila przepisywania telefonu: zapis na nowy temat jest już zrobiony, wypis ze
# starego jeszcze nie (bezpieczna kolejność ustalona z sesją iOS 28.09.2026).
# Ten sam alarm leci wtedy na oba tematy i MUSI skleić się w jeden baner.
sprawdz(k["apns"]["headers"]["apns-collapse-id"] == "voiv_lubelskie",
        "temat krytyczny skleja się z zwykłym — jeden baner, nie dwa")
sprawdz(k["apns"]["headers"]["apns-collapse-id"]
        == zakodowana("voiv_lubelskie", dict(DANE, voiv="lubelskie"))["apns"]["headers"]["apns-collapse-id"],
        "oba warianty mają identyczny apns-collapse-id")
sprawdz(kaps["thread-id"] == "voiv_lubelskie", "wątek powiadomień wspólny dla obu tematów")
sprawdz(bajty_apns(k) <= 4096, f"ładunek krytyczny mieści się w limicie ({bajty_apns(k)} B)")
sprawdz(notify._apns_config("voiv_lubelskie_krytyczne", ogromne, True) is None,
        "przepełnienie zdejmuje blok iOS także na temacie krytycznym")

print()
if bledy:
    print("BŁĘDY:", len(bledy))
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("OK: apns dla iOS, alarm krytyczny na osobnym temacie, Android bez zmian")
