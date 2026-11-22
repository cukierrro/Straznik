# -*- coding: utf-8 -*-
"""Alarmy powiatowe — etap 2 (decyzje usera 18.11.2026), app/powiaty.py.

Czego pilnuje:
 1. Geometria PRG: 380 powiatów w 16 województwach, nazwy z powiaty_terc.json (parser
    odbiorców gov.pl) mają swój TERYT, atrybucja GUGiK w README.
 2. Przeniesienie sygnałów: NEPTUN mnożnikiem odległości i czasem dolotu PRĘDKOŚCIĄ —
    przypadek 17.11.2026 09:35 (dron 11,9 km od granicy, 180 km/h): powiat dębicki
    ~40 min i bez klucza czerwonego, bieszczadzki z kluczem. Proporcja eta×km/km0
    dawała ~700 km/h i czerwone całe podkarpackie. Alarm obwodu UA wagą od odległości
    obwodu i liczony raz, choć przypisany kilku województwom. Reszta × głębokość.
 3. Próg żółtego powiatu 2,5; czerwony 4,0 tylko z kluczem. Województwa bez zmian (2,0).
 4. Listy RCB: tylko powiaty z listy (gov.pl przed RSO), bez listy całe województwo.
 5. Wyłącznik wysyłki: domyślnie wyłączony — tylko dziennik; włączony — tematy
    pow_<TERYT> i pow_<TERYT>_krytyczne, poza produkcją z przedrostkiem test_.
 6. Wiadomość: poziom, nazwa powiatu, województwo, klucz zdarzenia (poziom + początek
    sesji alarmowej, wspólny dla powiatów jednego zdarzenia), znacznik ponowienia.
 7. Tor województw bez zmian: wynik fuzji, poziomy, dziennik i tematy voiv_* nietknięte,
    /api/state bez słownika `powiaty`, gdy żaden powiat nie ma poziomu.

Uruchomienie:  py scripts/test_powiaty.py
"""
import asyncio
import copy
import json
import sys
import tempfile
import types
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
warnings.filterwarnings("ignore")
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))

from app import config, db  # noqa: E402

_tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
config.DB_PATH = Path(_tmp.name) / "straznik.db"
db.init()
from app import fusion, geo, notify, powiaty, rcb_odbiorcy  # noqa: E402
from app.collectors import rcb  # noqa: E402
from app.collectors.neptun import _dist_mult  # noqa: E402

bledy = []


def ok(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


P = powiaty.powiaty()
TERC = {p["name"]: t for t, p in P.items()}


def terc(nazwa, woj):
    return next(t for t, p in P.items() if p["name"] == nazwa and p["woj"] == woj)


BIESZCZADZKI = terc("powiat bieszczadzki", "podkarpackie")
DEBICKI = terc("powiat dębicki", "podkarpackie")
LUBLIN = terc("powiat Lublin", "lubelskie")
HRUBIESZOWSKI = terc("powiat hrubieszowski", "lubelskie")
POZNAN = terc("powiat Poznań", "wielkopolskie")
REF = datetime(2026, 11, 17, 9, 36, tzinfo=timezone.utc)

# 17.11.2026 09:35:34 UTC — meldunek z bazy produkcyjnej (trk_00369483), podkarpackie
DRON = {"id": 1, "ts": "2026-11-17T09:35:34+00:00", "source": "neptun", "event_type": "neptun_threat",
        "voivodeship": "podkarpackie", "points": 2.0, "title": "Dron 11,9 km od woj. podkarpackie",
        "details": {"track_id": "trk_00369483", "physical_key": "trk_00369483", "type": "uav",
                    "count": 1, "lat": 49.15355, "lon": 23.02934, "dist_km": 11.9,
                    "speed_kmh": 180, "eta_border_min": 1, "eta_buffer_min": 2.5,
                    "course": "unknown", "confidence": "high", "source_count": 2,
                    "position_approximate": False}}


def sig(sid, voiv, source, points, typ, ts="2026-11-17T09:30:00+00:00", **det):
    return {"id": sid, "ts": ts, "source": source, "event_type": typ, "voivodeship": voiv,
            "points": points, "title": f"sygnał {sid}", "details": det}


# ── 1. geometria ───────────────────────────────────────────────────────────────
print("1. Geometria PRG GUGiK")
ok(len(P) == 380, f"380 powiatów (jest {len(P)})")
ok(sorted(powiaty.geometria()["woj_pow"]) == sorted(config.VOIVODESHIPS), "16 województw jak w config")
ok(all(t[:2] == powiaty.WOJ_KOD[p["woj"]] for t, p in P.items()), "TERYT zgodny z województwem")
terc_json = json.loads((ROOT / "backend/app/powiaty_terc.json").read_text(encoding="utf-8"))["powiaty"]
brak = [(v, n) for v, ns in terc_json.items() for n in ns
        if (powiaty.WOJ_KOD[v], rcb_odbiorcy._fold(n)) not in powiaty.geometria()["slownik"]]
ok(not brak, f"każda nazwa z powiaty_terc.json ma TERYT w PRG (brak: {brak[:5]})")
readme = (ROOT / "README.md").read_text(encoding="utf-8")
ok("GUGiK" in readme.split("## Dane i atrybucja", 1)[-1], "atrybucja GUGiK w „Dane i atrybucja”")
ok(powiaty.nazwa_krotka(LUBLIN) == "Lublin" and powiaty.nazwa_krotka(DEBICKI) == "powiat dębicki",
   "nazwa krótka: miasto na prawach powiatu bez słowa „powiat”")

# ── 2. przeniesienie ──────────────────────────────────────────────────────────
print("\n2. Przeniesienie sygnałów na powiaty")
kop = {c["voivodeship"]: c for c in powiaty.na_powiaty(DRON, powiaty.Listy([]), REF.isoformat())}
deb, bie = kop[powiaty.klucz(DEBICKI)], kop[powiaty.klucz(BIESZCZADZKI)]
dk = deb["details"]["dist_km"]
ok(125 <= dk <= 140, f"Dębica {dk} km od drona (PRG dokładnie 135,9 km)")
eta = deb["details"]["eta_border_min"]
ok(eta == geo.eta_minutes(dk, 180, 2.5), f"ETA Dębicy prędkością: {eta} min = eta_minutes({dk}, 180, 2,5)")
ok(38 <= eta <= 48, f"ETA Dębicy ok. 40–47 min, nie ~11 min z proporcji (jest {eta})")
ok(abs(deb["points"] - 2.0 * _dist_mult(dk) / _dist_mult(11.9)) < 0.002,
   "punkty × m(odl. od powiatu) / m(odl. od województwa)")
ok(bie["details"]["dist_km"] <= 13 and bie["details"]["eta_border_min"] <= 1,
   "bieszczadzki: ten sam dron przy samej granicy powiatu")
ok(deb["_woj"] == "podkarpackie" and DRON["voivodeship"] == "podkarpackie",
   "kopia pamięta województwo, oryginał nietknięty")
bez_predkosci = copy.deepcopy(DRON)
bez_predkosci["details"].pop("speed_kmh")
k2 = {c["voivodeship"]: c for c in powiaty.na_powiaty(bez_predkosci, powiaty.Listy([]), REF.isoformat())}
ok(k2[powiaty.klucz(DEBICKI)]["details"]["eta_border_min"] is None,
   "bez prędkości ETA nie zgadujemy (zostaje bezpiecznik odległości)")

# Dębica wysoko z innych sygnałów, ale bez klucza: zostaje żółta
inne = [sig(10 + i, "podkarpackie", "adsb", 1.0, "adsb_military") for i in range(1)]
inne += [sig(20, "podkarpackie", "media", 1.0, "media_keywords", link="https://x/1"),
         sig(21, "podkarpackie", "pansa", 1.0, "pansa_zone"),
         sig(22, "podkarpackie", "neighbours", 0.6, "neighbour_zone", ident="a", country="SK")]
duzo = [DRON] + [dict(DRON, id=100 + i, details=dict(DRON["details"], track_id=f"t{i}", physical_key=f"t{i}",
                                                      lat=49.15355 + i * 0.05))
                 for i in range(6)]
wyn, licz = powiaty.oblicz(duzo + inne, REF)
d = wyn[DEBICKI]
ok(d["score"] >= 4.0 and d["level"] == "elevated" and d["red_key"] is None,
   f"17.11 09:36: Dębica {d['score']} pkt — bez klucza czerwonego zostaje żółta")
b = wyn[BIESZCZADZKI]
ok(b["level"] == "high" and b["red_key"] and b["red_key"]["powod"] in ("eta", "blisko"),
   f"bieszczadzki czerwony z kluczem ({b['red_key'] and b['red_key']['powod']})")
ok(licz["kopii"] < (len(duzo) + len(inne)) * 380, "kopii mniej niż sygnały × 380")

# ten sam meldunek NEPTUN-a w kilku województwach — na powiecie liczony raz
druga = dict(DRON, id=2, voivodeship="małopolskie", points=0.1,
             details=dict(DRON["details"], dist_km=122.3))
w1, _ = powiaty.oblicz([DRON], REF)
w2, _ = powiaty.oblicz([DRON, druga], REF)
ok(w1[DEBICKI]["score"] == w2[DEBICKI]["score"] and w1[BIESZCZADZKI]["score"] == w2[BIESZCZADZKI]["score"],
   "ten sam meldunek z dwóch województw = ten sam wynik powiatu")

# alarm obwodu UA: waga od odległości obwodu, jeden sygnał na obwód i epizod
ua = [sig(30, v, "ua_alert", 1.0, "ua_alert_border", oblast="Волинська",
          episode="2026-11-17T09:20:00+00:00") for v in ("lubelskie", "podkarpackie", "mazowieckie")]
k_ua = powiaty.na_powiaty(ua[0], powiaty.Listy([]), REF.isoformat())
hrub = next(c for c in k_ua if c["voivodeship"] == powiaty.klucz(HRUBIESZOWSKI))
ok(abs(hrub["points"] - config.POINTS["ua_alert_border"]
       * config.ua_alert_weight(P[HRUBIESZOWSKI]["obw"]["Волинська"])) < 0.002,
   "alarm obwodu: punkty × ua_alert_weight(odległość obwodu od powiatu)")
ok(all(P[c["voivodeship"][1:]]["obw"]["Волинська"] <= config.UA_ALERT_CURVE[-1][0] for c in k_ua),
   "alarm obwodu nie sięga dalej niż krzywa wagi")
jeden, _ = powiaty.oblicz(ua[:1], REF)
trzy, _ = powiaty.oblicz(ua, REF)
ok({t: s["score"] for t, s in jeden.items()} == {t: s["score"] for t, s in trzy.items()},
   "ten sam alarm obwodu przypisany trzem województwom liczy się na powiecie raz")
ok(max(s["score"] for s in trzy.values()) <= config.SOURCE_CAPS["ua_alert"],
   "limit klasy alarmów UA (0,5) obowiązuje na powiecie")

# pozostałe: województwo × głębokość
med = sig(40, "lubelskie", "media", 1.0, "media_keywords", link="https://x/2")
k_med = {c["voivodeship"][1:]: c["points"] for c in powiaty.na_powiaty(med, powiaty.Listy([]), REF.isoformat())}
ok(set(k_med) == set(powiaty.geometria()["woj_pow"]["lubelskie"]), "media: wszystkie powiaty województwa")
ok(k_med[HRUBIESZOWSKI] > k_med[LUBLIN] and k_med[HRUBIESZOWSKI] >= 0.95,
   f"przygraniczny ×{k_med[HRUBIESZOWSKI]:.2f}, Lublin ×{k_med[LUBLIN]:.2f} (krzywa głębokości)")
k_poz = {c["voivodeship"][1:]: c["points"] for c in powiaty.na_powiaty(
    sig(41, "wielkopolskie", "media", 1.0, "media_keywords"), powiaty.Listy([]), REF.isoformat())}
gleb = P[POZNAN]["gleb"]
ok(gleb > 200 and abs(k_poz[POZNAN] - powiaty.krzywa(config.POWIATY_DEPTH_CURVE, gleb)) < 0.001
   and k_poz[POZNAN] < 0.25, f"Poznań ({gleb} km od granicy) ×{k_poz[POZNAN]:.2f}")

# ── 3. progi ──────────────────────────────────────────────────────────────────
print("\n3. Próg żółtego 2,5, czerwony 4,0 z kluczem")
ok(config.POWIATY_PROG_ZOLTY == 2.5 and config.POWIATY_PROG_CZERWONY == 4.0, "progi w config")
ok([powiaty.poziom(x) for x in (2.4, 2.5, 3.9, 4.0)] == ["none", "elevated", "elevated", "high"],
   "2,4 brak · 2,5 żółty · 3,9 żółty · 4,0 czerwony")
ok(config.THRESHOLD_ELEVATED == 2.0 and fusion.level_for(2.0) == "elevated",
   "województwa dalej z progiem 2,0")
pas = [sig(50 + i, "lubelskie", s, p, t) for i, (s, p, t) in enumerate(
    [("media", 1.0, "media_keywords"), ("adsb", 1.0, "adsb_military"), ("pansa", 0.4, "pansa_zone")])]
w_pas, _ = powiaty.oblicz(pas, REF)
h = w_pas[HRUBIESZOWSKI]
ok(h["score"] == 2.4 and h["level"] == "none", f"hrubieszowski 2,4 pkt — jeszcze bez żółtego ({h['score']})")
w_pas, _ = powiaty.oblicz(pas + [sig(60, "lubelskie", "neighbours", 0.1, "neighbour_zone")], REF)
ok(w_pas[HRUBIESZOWSKI]["level"] == "elevated", "2,5 pkt — żółty")
bez_klucza = [sig(70 + i, "lubelskie", s, 1.0, t) for i, (s, t) in enumerate(
    [("media", "media_keywords"), ("adsb", "adsb_military"), ("pansa", "pansa_zone")])]
bez_klucza.append(sig(75, "lubelskie", "rcb", 1.5, "rso_alert", rso_id="9", rcb_level=1))
w_bk, _ = powiaty.oblicz(bez_klucza, REF)
ok(w_bk[HRUBIESZOWSKI]["score"] >= 4.0 and w_bk[HRUBIESZOWSKI]["level"] == "elevated",
   "4,5 pkt bez klucza (RCB 1. stopnia, media, ADS-B, PAŻP) — żółty")

# ── 4. listy RCB ──────────────────────────────────────────────────────────────
print("\n4. Alert RCB tylko w powiatach z listy")
alert = sig(80, "lubelskie", "rcb", 1.5, "rso_alert", ts="2026-10-23T16:00:00+00:00", rso_id="555", rcb_level=1)
REF2 = "2026-10-23T16:30:00+00:00"
bez = {c["voivodeship"][1:] for c in powiaty.na_powiaty(alert, powiaty.Listy([]), REF2)}
ok(bez == set(powiaty.geometria()["woj_pow"]["lubelskie"]), "bez listy — całe województwo (24 powiaty)")
tresc_rso = ("Alert RCB w powiatach na terenie województw: LUBELSKIEGO: hrubieszowski, Zamość, "
             "zamojski PODKARPACKIEGO: dębicki, Rzeszów wysłano Alert RCB o treści: UWAGA!")
lista_rso = powiaty.powiaty_z_tresci(tresc_rso, [])
ok(lista_rso == {HRUBIESZOWSKI, terc("powiat Zamość", "lubelskie"), terc("powiat zamojski", "lubelskie"),
                 DEBICKI, terc("powiat Rzeszów", "podkarpackie")}, "treść RSO: nagłówki województw rozstrzygają")
ok(powiaty.powiaty_z_tresci("UWAGA! Dotyczy powiatów: opolski, tomaszowski", ["06"])
   == {terc("powiat opolski", "lubelskie"), terc("powiat tomaszowski", "lubelskie")},
   "„Dotyczy powiatów” — województwo z pola provinces (opolski lubelski, nie opolskie)")
rso_wpis = [{"ts": "2026-10-23T15:59:00+00:00", "zrodlo": "rso", "rso_id": "555", "woj": None,
             "powiaty": sorted(lista_rso), "odwolanie": False}]
z_rso = {c["voivodeship"][1:] for c in powiaty.na_powiaty(alert, powiaty.Listy(rso_wpis), REF2)}
ok(z_rso == lista_rso, "lista z treści RSO")

STRONA_2310 = (
    "<h2>Alert RCB - zagrożenie z powietrza (23.10)</h2><p>23.10.2026</p>"
    "<p>&bdquo;UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.&rdquo;</p>"
    '<div class="editor-content"><div>'
    "<p><strong><u>Aktualizacja! &mdash; 18:23</u></strong></p>"
    "<p><strong>&bdquo;UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski.&rdquo;</strong></p>"
    "<p>Alert RCB został wysłany do odbiorc&oacute;w na terenie części wojew&oacute;dztwa: "
    "- lubelskiego - powiaty: włodawski, łęczyński.</p><hr />"
    "<p><strong><u>Aktualizacja! &mdash; 17:57</u></strong></p>"
    "<p><strong>&bdquo;UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.&rdquo;</strong></p>"
    "<p>Alert RCB został wysłany do odbiorc&oacute;w na terenie części wojew&oacute;dztwa: "
    "- lubelskiego - powiaty: włodawski, łęczyński, hrubieszowski, Zamość, biłgorajski.</p><hr />"
    "<p><strong>&bdquo;UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.&rdquo;</strong></p>"
    "<p>Alert RCB został wysłany do odbiorc&oacute;w na terenie części wojew&oacute;dztwa:</p>"
    "<p>- lubelskiego - powiaty: hrubieszowski, Zamość</p>"
    "<p>- podkarpackiego - powiaty: dębicki, Rzesz&oacute;w.</p></div></div>")
tekst = rcb.tresc_artykulu(STRONA_2310, "Alert RCB - zagrożenie z powietrza (23.10)")
teraz = datetime(2026, 10, 23, 14, 0, tzinfo=timezone.utc)
nowe = powiaty.zapisz_govpl("/web/rcb/alert-2310", tekst, teraz)
ok(nowe == 4, f"gov.pl: 4 listy (odwołanie, 17:57, pierwszy alert ×2 województwa) — jest {nowe}")
ok(powiaty.zapisz_govpl("/web/rcb/alert-2310", tekst, teraz) == 0, "drugi odczyt nic nie dopisuje")
listy = powiaty.Listy(db.rcb_listy_pow_since("2026-10-22T00:00:00+00:00"))
g = listy.z_gov("lubelskie", "2026-10-23T16:00:00+00:00", REF2)
ok(g == {terc(n, "lubelskie") for n in ("powiat włodawski", "powiat łęczyński", "powiat hrubieszowski",
                                         "powiat Zamość", "powiat biłgorajski")},
   "gov.pl 17:57 (15:57 UTC): pięć powiatów; odwołanie z 18:23 pominięte")
z_gov = {c["voivodeship"][1:] for c in powiaty.na_powiaty(alert, powiaty.Listy(
    db.rcb_listy_pow_since("2026-10-22T00:00:00+00:00") + rso_wpis), REF2)}
ok(z_gov == g, "gov.pl ma pierwszeństwo przed RSO")
ok(listy.z_gov("lubelskie", "2026-10-23T18:00:00+00:00", "2026-10-23T18:05:00+00:00") is None,
   "lista starsza niż alert − 10 min nie dotyczy alertu")
ok(listy.z_gov("podkarpackie", "2026-10-23T14:00:00+00:00", "2026-10-23T14:05:00+00:00")
   == {DEBICKI, terc("powiat Rzeszów", "podkarpackie")}, "pierwszy alert (bez godziny) — chwila odczytu")
w_rcb, _ = powiaty.oblicz([alert], datetime(2026, 10, 23, 16, 30, tzinfo=timezone.utc), listy)
ok(set(w_rcb) == g and all(s["score"] == 1.5 for s in w_rcb.values()),
   "punkty RCB tylko w powiatach z listy, w pełnej wysokości")

# ── 5–6. przejścia, wyłącznik, wiadomość ─────────────────────────────────────
print("\n5. Wyłącznik wysyłki i dziennik")
ok(config.POWIATY_WYSYLKA is False, "domyślnie WYŁĄCZONA (STRAZNIK_POWIATY_WYSYLKA ≠ 1)")
wyslane = []


async def stub_send(t, data, test):
    wyslane.append((t, data, test))
    return True

powiaty.on_send = stub_send
config.PRODUCTION = False


def stan(score, level, signals=None, red=None):
    return {"score": score, "level": level, "signals": signals or [], "red_key": red, "clear_at": None}


async def krok(wynik, t):
    powiaty._przejscia(wynik, teraz=t)
    await asyncio.sleep(0)
    await asyncio.sleep(0)

T0 = 1_800_000_000.0
A, B, C = LUBLIN, HRUBIESZOWSKI, POZNAN


async def scenariusz():
    await krok({A: stan(2.7, "elevated")}, T0)
    await krok({A: stan(2.7, "elevated"), B: stan(3.0, "elevated")}, T0 + 60)
    await krok({A: stan(4.6, "high", red={"powod": "blisko"}), B: stan(3.0, "elevated")}, T0 + 120)
    await krok({}, T0 + 2000)                    # po podtrzymaniu (10 min) — spadek
    # A z punktami poniżej progu, B z zerem — do pola `powiaty_pkt` (1.8.11)
    await krok({C: stan(2.6, "elevated"), A: stan(1.4, "none"), B: stan(0.0, "none")}, T0 + 2100)

asyncio.run(scenariusz())
log_pow = db.alert_log_pow_since(1)
dec = [(r["terc"], r["new_level"], r["decision"], r["klucz"]) for r in log_pow]
ok(not wyslane, "przy wyłączonej wysyłce on_send nie jest wołane")
ok([x[2] for x in dec if x[2] != "falling"] == ["dziennik"] * 4,
   f"każde powiadomienie tylko w dzienniku: {[x[2] for x in dec]}")
sesja = datetime.fromtimestamp(T0, timezone.utc).isoformat(timespec="seconds")
ok(dec[0][3] == dec[1][3] == f"elevated|{sesja}", "dwa powiaty jednego zdarzenia — ten sam klucz")
ok(dec[2][1] == "high" and dec[2][3] == f"high|{sesja}", "wyższy poziom — inny klucz, ta sama sesja")
ok(sorted((x[0], x[2]) for x in dec if x[2] == "falling") == sorted([(A, "falling"), (B, "falling")]),
   "po podtrzymaniu spadek obu powiatów w dzienniku")
nowa = datetime.fromtimestamp(T0 + 2100, timezone.utc).isoformat(timespec="seconds")
ok(dec[-1][0] == C and dec[-1][3] == f"elevated|{nowa}", "po ciszy w całym kraju — nowa sesja, nowy klucz")
ok(db.last_notif_pow(A, "elevated") is not None, "„dziennik” liczy się do ciszy powtórki jak wysyłka")
ok(powiaty.publiczne() == {C: {"level": "elevated", "score": 2.6, "name": "powiat Poznań",
                               "woj": "wielkopolskie"}}, "słownik publiczny: tylko powiaty z poziomem")
ok(powiaty.punkty_ponizej() == {A: 1.4},
   f"punkty poniżej progu: tylko powiat bez poziomu z punktami > 0 ({powiaty.punkty_ponizej()})")


async def powrot():
    await krok({C: stan(2.6, "elevated")}, T0 + 2200)
    await krok({}, T0 + 3000)
    await krok({C: stan(2.6, "elevated")}, T0 + 3100)

asyncio.run(powrot())
ok(db.alert_log_pow_since(1)[-1]["decision"] == "quiet_repeat",
   "powrót na ten sam poziom w 60 min bez nowego RCB — cisza powtórki")

config.POWIATY_WYSYLKA = True


async def wlaczona():
    await krok({DEBICKI: stan(2.8, "elevated", [dict(DRON, counted_points=0.7)])}, T0 + 4000)
    for _ in range(5):
        await asyncio.sleep(0)

asyncio.run(wlaczona())
ok(len(wyslane) == 1 and wyslane[0][0] == DEBICKI, "włączona — jedna wysyłka dla powiatu dębickiego")
ok(wyslane and wyslane[0][2] is True, "poza produkcją — test (temat test_pow_*)")
r = [x for x in db.alert_log_pow_since(1) if x["terc"] == DEBICKI][-1]
ok(r["decision"] == "test" and r["delivery"]["fcm_topic"] == "test_pow_" + DEBICKI,
   f"dziennik: decyzja test, temat {r['delivery'] and r['delivery']['fcm_topic']}")
config.POWIATY_WYSYLKA = False

# send_fcm_pow: tematy pow_<TERYT> i _krytyczne (bez sieci)
tematy = []
notify._send_fcm_sync = lambda topic, data, critical=False: tematy.append((topic, critical)) or "id"
notify._fcm_ready, config.FCM_ENABLED, config.PRODUCTION = True, True, True
asyncio.run(notify.send_fcm_pow(LUBLIN, {"level": "high", "score": "4.5"}))
ok(tematy == [("pow_" + LUBLIN, False), ("pow_" + LUBLIN + "_krytyczne", True)],
   f"produkcja: {tematy}")
tematy.clear()
asyncio.run(notify.send_fcm_pow(LUBLIN, {"level": "high"}, test=True))
ok(tematy[0][0] == "test_pow_" + LUBLIN, "test nigdy na prawdziwy temat (E4)")
config.PRODUCTION = False
notify._fcm_ready = False

print("\n6. Wiadomość")
st = {"score": 4.6, "signals": [dict(DRON, voivodeship="P" + BIESZCZADZKI, counted_points=2.0,
                                     title="Dron ok. 12 km od powiatu, dolot ok. 1 min",
                                     details=dict(DRON["details"], dist_km=11.5, eta_border_min=1))]}
w = powiaty.wiadomosc(BIESZCZADZKI, "high", st, sesja_od="2026-11-17T09:10:00+00:00",
                      sent_at=datetime(2026, 11, 17, 9, 36, tzinfo=timezone.utc))
ok(all(isinstance(v, str) for v in w.values()), "FCM data: same napisy")
ok(w["pow"] == BIESZCZADZKI and w["pow_nazwa"] == "powiat bieszczadzki" and w["voiv"] == "podkarpackie",
   "kod, nazwa powiatu i województwo")
ok(w["miejsce"] == "powiat bieszczadzki, woj. podkarpackie", "miejsce do tytułu iPhone'a")
ok(w["level"] == "high" and w["score"] == "4.6", "poziom i punkty")
ok(w["klucz_zdarzenia"] == "high|2026-11-17T09:10:00+00:00" and w["sesja_od"] == "2026-11-17T09:10:00+00:00",
   "klucz zdarzenia = poziom | początek sesji")
ok(w["ponowienie"] == "0" and w["typ"] == "pow", "zwykły alarm — bez znacznika ponowienia")
ok(w["event_id"].startswith(f"pow_{BIESZCZADZKI}|high|"), "event_id z tematem powiatu")
ok("km od powiatu" in w["headline"], f"nagłówek o odległości od POWIATU: {w['headline']}")
wp = powiaty.wiadomosc(BIESZCZADZKI, "high", st, sesja_od="2026-11-17T09:10:00+00:00",
                       ponowienie_powod={"rodzaj": "obiekt", "km": 8.0})
ok(wp["ponowienie"] == "1" and wp["headline"].startswith("PONOWNY ALARM")
   and wp["klucz_zdarzenia"] == w["klucz_zdarzenia"], "ponowienie: znacznik 1, ten sam klucz — telefon dzwoni")

# ── 7. tor województw bez zmian ──────────────────────────────────────────────
print("\n7. Tor województw bez zmian")
wejscie = duzo + inne + ua + bez_klucza + [med]
kopia_wejscia = copy.deepcopy(wejscie)
przed = fusion.apply_spillover(fusion.accumulate(copy.deepcopy(wejscie), REF), REF)
powiaty.oblicz(wejscie, REF)
po = fusion.apply_spillover(fusion.accumulate(copy.deepcopy(wejscie), REF), REF)
ok(wejscie == kopia_wejscia, "sygnały województw nie zmienione przez przeliczenie powiatów")
ok(json.dumps(przed, sort_keys=True, default=str) == json.dumps(po, sort_keys=True, default=str),
   "wynik województw identyczny przed i po przeliczeniu powiatów")
ok(set(przed) == set(config.VOIVODESHIPS) and len(config.VOIVODESHIPS) == 16,
   "config.VOIVODESHIPS nietknięte (cień podmieniał je globalnie)")
ok(fusion._woj({"voivodeship": "lubelskie"}) == "lubelskie", "sygnał województwa: _woj = voivodeship")
with db._lock:
    woj_tabele = {t: db._conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in ("level_state", "notif_log", "alert_log")}
ok(woj_tabele == {"level_state": 0, "notif_log": 0, "alert_log": 0},
   f"poziomy, cooldown i dziennik województw nietknięte: {woj_tabele}")
ok(notify.fcm_topic("lubelskie") == "test_voiv_lubelskie" and config.voiv_topic("łódzkie") == "voiv_lodzkie",
   "tematy województw bez zmian")
licznik = []
fusion.on_reevaluated = lambda: licznik.append(1)
fusion.on_level_change = None
asyncio.run(fusion.reevaluate())
ok(licznik == [1], "reewaluacja województw zgłasza przeliczenie powiatów (bez czekania na nie)")
fusion.on_reevaluated = None

try:
    from app import main
    powiaty._publiczne = {}
    powiaty._ponizej = {}
    ok("powiaty" not in main._fusion_z_powiatami(), "/api/state: bez poziomów w powiatach — bez klucza `powiaty`")
    ok("powiaty_pkt" not in main._fusion_z_powiatami(), "/api/state: w ciszy bez klucza `powiaty_pkt`")
    powiaty._ponizej = {LUBLIN: 1.3}
    ok(main._fusion_z_powiatami().get("powiaty_pkt") == {LUBLIN: 1.3} and "powiaty" not in main._fusion_z_powiatami(),
       "/api/state: punkty poniżej progu w osobnym polu, `powiaty` bez nich")
    powiaty._ponizej = {}
    powiaty._publiczne = {LUBLIN: {"level": "elevated", "score": 2.7, "name": "powiat Lublin", "woj": "lubelskie"}}
    ok(main._fusion_z_powiatami().get("powiaty", {}).get(LUBLIN, {}).get("level") == "elevated",
       "/api/state: rzadki słownik, gdy powiat ma poziom")
    powiaty._publiczne = {}
except ImportError as e:
    print(f"  (pominięte /api/state: {e})")

# ── 8. etap 3: tor tematów aplikacji i most wyłącznika awaryjnego ────────────
print("\n8. Tor tematów aplikacji (`tematy`) i most")
ok(config.tematy_aplikacji() == "woj" and not config.powiaty_wysylka_wlaczona(),
   "domyślnie aplikacje zostają na województwach (`tematy` = woj)")
config.POWIATY_WYSYLKA = True
ok(config.tematy_aplikacji() == "pow" and config.powiaty_wysylka_wlaczona(),
   "włączona wysyłka powiatów = aplikacje na powiatach (jedno bez drugiego się nie da)")
config.POWIATY_MOST = True
ok(config.tematy_aplikacji() == "woj" and not config.powiaty_wysylka_wlaczona(),
   "most (wyłącznik awaryjny): aplikacje z powrotem na województwach, punktacja powiatów milknie")
wyslane.clear()


async def przy_moscie():
    await krok({RZESZOW: stan(2.9, "elevated")}, T0 + 5000)
    for _ in range(5):
        await asyncio.sleep(0)

RZESZOW = terc("powiat Rzeszów", "podkarpackie")
asyncio.run(przy_moscie())
r = [x for x in db.alert_log_pow_since(1) if x["terc"] == RZESZOW][-1]
ok(not wyslane and r["decision"] == "dziennik", f"przy moście powiaty tylko do dziennika: {r['decision']}")
try:
    from app import main
    ok(main.build_state().get("tematy") == "woj", "/api/state niesie `tematy` = woj przy moście")
    config.POWIATY_MOST = False
    ok(main.build_state().get("tematy") == "pow", "/api/state niesie `tematy` = pow przy wysyłce")
except ImportError as e:
    print(f"  (pominięte /api/state: {e})")
config.POWIATY_WYSYLKA, config.POWIATY_MOST = False, False

dane_woj = {"voiv": "lubelskie", "level": "high", "score": "4.3", "reasons": "a\nb", "headline": "Dron",
            "sent_at": "2026-11-17T09:36:00+00:00", "event_id": "lubelskie|high|1794908160",
            "ponowienie": "0"}
LUB_POW = sorted(t for t, p in P.items() if p["woj"] == "lubelskie")
m1, m2 = powiaty.wiadomosc_most(LUBLIN, dane_woj), powiaty.wiadomosc_most(LUB_POW[0], dane_woj)
ok(all(isinstance(v, str) for v in m1.values()), "most: FCM data same napisy")
ok(m1["typ"] == "pow" and m1["pow"] == LUBLIN and m1["miejsce"] == "Lublin, woj. lubelskie"
   and m1["level"] == "high" and m1["score"] == "4.3" and m1["most"] == "1",
   f"most: alarm województwa w formie alarmu powiatu ({m1['miejsce']})")
ok(m1["klucz_zdarzenia"] == m2["klucz_zdarzenia"] == "high|voiv_lubelskie|1794908160",
   "most: jeden klucz dla wszystkich powiatów województwa — telefon dzwoni raz")
ok(powiaty.wiadomosc_most(terc("powiat Rzeszów", "podkarpackie"),
                          {**dane_woj, "voiv": "podkarpackie"})["klucz_zdarzenia"] != m1["klucz_zdarzenia"],
   "most: dwa województwa — dwa klucze (jak dotąd dwa alarmy)")
ok(len(m1["klucz_zdarzenia"].encode()) <= 64, "klucz mieści się w apns-collapse-id (64 B)")

tematy = []
notify._send_fcm_sync = lambda topic, data, critical=False: tematy.append((topic, critical, data)) or "id"
notify._fcm_ready, config.FCM_ENABLED, config.PRODUCTION = True, True, True


async def wysylka_woj(most):
    config.POWIATY_MOST = most
    tematy.clear()
    await notify.send_fcm("lubelskie", "high", 4.3, "a", headline="Dron", most_ponowienie=False)
    await asyncio.gather(*list(notify._most_zadania))
    return [t for t, _, _ in tematy]

bez = asyncio.run(wysylka_woj(False))
ok(bez == ["voiv_lubelskie", "voiv_lubelskie_krytyczne"], f"bez mostu tylko województwo: {bez}")
ok("ponowienie" not in tematy[0][2] and "klucz_zdarzenia" not in tematy[0][2],
   "ładunek województwa bez nowych pól (stare aplikacje i iPhone'y bez zmian)")
z = asyncio.run(wysylka_woj(True))
ok(z[:2] == ["voiv_lubelskie", "voiv_lubelskie_krytyczne"], "most: najpierw województwo")
ok(sorted(z[2:]) == sorted([f"pow_{t}" for t in LUB_POW] + [f"pow_{t}_krytyczne" for t in LUB_POW]),
   f"most: wszystkie {len(LUB_POW)} powiaty lubelskiego, oba tematy ({len(z) - 2})")
ok(all(d.get("typ") == "pow" and d.get("ponowienie") == "0" for t, _, d in tematy[2:]),
   "most: ładunek powiatowy ze znacznikiem ponowienia")
tematy.clear()
asyncio.run(notify.send_fcm("lubelskie", "high", 4.3, "a", test=True, most_ponowienie=False))
ok([t for t, _, _ in tematy] == ["test_voiv_lubelskie", "test_voiv_lubelskie_krytyczne"],
   "most nigdy dla testu (E4)")
config.POWIATY_MOST, config.PRODUCTION = False, False
notify._fcm_ready = False

db._conn.close()
print()
if bledy:
    print(f"BŁĘDY: {len(bledy)}")
    for b_ in bledy:
        print("  -", b_)
    sys.exit(1)
print("Wszystko OK")
