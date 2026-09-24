# -*- coding: utf-8 -*-
"""Treść artykułu gov.pl uzupełnia województwa, których nie niesie RSO.

24.09.2026: „Alert RCB został wysłany do odbiorców na terenie woj. podkarpackiego
i lubelskiego", a w sygnałach punktowało się samo lubelskie — kanał RSO/TVP niósł
tylko jedno województwo. Tak samo 17.09 przy alercie 3. poziomu („znajdź
bezpieczne miejsce"). Odtworzenie 31 artykułów z 1–24.09.2026 (11 powietrznych)
nie dało ani jednego fałszywego dodania, więc czytamy artykuł dnia i dokładamy
brakujące województwa.

Pułapki, które sprawdza ten test:
  * „(powiaty: puławski, opolski, …)" to POWIATY — nie wolno z nich robić woj. opolskiego,
  * „Odwołano" ma „ł" bez rozkładu NFD — musi pasować do rdzenia odwołania,
  * lead artykułu bywa samym cytatem, bez zdania o odbiorcach,
  * meldunek zastany przy pierwszym otwarciu może być sprzed godzin.

Uruchomienie:  py scripts/test_rcb_artykul.py
"""
import asyncio
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app.collectors import rcb  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


MONITOR = ("UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. "
           "W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.")
SCHRON = ("UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce. "
          "Stosuj się do poleceń służb. Oczekuj dalszych komunikatów.")
KONIEC = "UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski."

print("1. Województwa z treści komunikatu")
ok(rcb.wojewodztwa_alertu(
    f"„{MONITOR}” Alert RCB został wysłany do odbiorców na terenie woj. podkarpackiego "
    "i lubelskiego.") == ["podkarpackie", "lubelskie"],
   "dwa województwa z jednego zdania")
ok(rcb.wojewodztwa_alertu(
    f"„{MONITOR}” Alert RCB o tej treści został wysłany do odbiorców na terenie województwa "
    "lubelskiego (powiaty: puławski, opolski, Lublin, lubelski, kraśnicki).") == ["lubelskie"],
   "powiat opolski w nawiasie nie robi z alertu woj. opolskiego (21.09.2026)")
ok(rcb.wojewodztwa_alertu(f"„{MONITOR}”") == [],
   "blok bez zdania o wysyłce nie zgaduje województw")
ok(rcb.wojewodztwa_alertu("wysłany do odbiorców na terenie woj. dolnośląskiego")
   == ["dolnośląskie"], "dolnośląskie nie wpada jako śląskie")

print("\n2. Poziom i odwołanie z treści")
ok(rcb.meldunki(f"„{SCHRON}” wysłany do odbiorców na terenie woj. lubelskiego."
                )[0]["poziom"] == 3, "„znajdź bezpieczne miejsce” to 3. poziom")
ok(rcb.meldunki(f"„{MONITOR}” wysłany do odbiorców na terenie woj. lubelskiego."
                )[0]["poziom"] == 1, "„sytuacja jest monitorowana” to 1. poziom")
ok(rcb._czy_odwolanie("UWAGA! UWAGA! UWAGA! Odwołano zagrożenie atakiem z powietrza."),
   "„Odwołano” rozpoznane mimo „ł” (13.09.2026)")
ok(rcb._czy_odwolanie(KONIEC), "„zakończył się / brak zagrożenia” to odwołanie")
ok(not rcb._czy_odwolanie(SCHRON), "wezwanie do schronienia to nie odwołanie")

print("\n3. Który blok jest najnowszy")
lead_bez_odbiorcow = (f"„{MONITOR}” Aktualizacja! „{MONITOR}” Alert RCB został wysłany do "
                      "odbiorców na terenie woj. podkarpackiego i lubelskiego.")
m = rcb.najnowszy_meldunek(rcb.meldunki(lead_bez_odbiorcow))
ok(m and m["wojewodztwa"] == ["podkarpackie", "lubelskie"],
   "lead bez zdania o odbiorcach bierze listę z powtórzenia tej samej treści")
starszy = f"„{SCHRON}” --------- „{MONITOR}” wysłany do odbiorców na terenie woj. lubelskiego."
ok(rcb.najnowszy_meldunek(rcb.meldunki(starszy)) is None,
   "gdy odbiorcy są tylko przy STARSZEJ treści, artykuł nic nie wnosi")

# ── kolektor: lista wpisów + artykuł dnia ────────────────────────────────────
ARTYKUL_TYTUL = "Alert RCB - zagrożenie z powietrza (24.09)"
LINK = "/web/rcb/alert-rcb---zagrozenie-z-powietrza-2409"
LISTA = f'<a href="{LINK}">{ARTYKUL_TYTUL}</a>'


def strona_artykulu(bloki: str, data: str = "24.09.2026") -> str:
    return (f"<html><body><nav>Menu gov.pl</nav><h1>{ARTYKUL_TYTUL}</h1> {data} "
            f"{bloki}<script>var x=1;</script>"
            '<div>{"register":{"foo":"bar"}}</div></body></html>')


BLOK_ALERT = (f"&bdquo;{MONITOR}&rdquo; Alert RCB został wysłany do odbiorców na terenie "
              "woj. podkarpackiego i lubelskiego.")
BLOK_SCHRON = (f"&bdquo;{SCHRON}&rdquo; Alert RCB został wysłany do odbiorców na terenie "
               "woj. podkarpackiego i lubelskiego.")
BLOK_KONIEC = (f"&bdquo;{KONIEC}&rdquo; Alert RCB o tej treści został wysłany do odbiorców "
               "na terenie województwa lubelskiego.")

strona = {"artykul": strona_artykulu(BLOK_ALERT)}
rso_pokrycie = []
# `ingesty` to wszystko, co poszło do fuzji — także wpisy 0 pkt z samej LISTY
# komunikatów (rcb_govpl, punkt odniesienia czasowego). `punktowane` to już
# tylko to, co wnosi artykuł: alert z treści albo odwołanie.
zapisy, ingesty, punktowane = [], [], []


class _Resp:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


class _Client:
    async def get(self, url, **k):
        return _Resp(LISTA if url.endswith("/web/rcb") else strona["artykul"])


async def _ingest(**k):
    ingesty.append(k)
    if k["event_type"] in ("rcb_alert", "rso_clear"):
        punktowane.append(k)
    return True


def _add_signal(*a, **k):
    zapisy.append(a)
    return True


rcb.fusion.ingest = _ingest
rcb.fusion.db = types.SimpleNamespace(
    add_signal=_add_signal,
    now_iso=lambda: "2026-09-24T12:00:00+00:00",
    signals_since=lambda minutes: list(rso_pokrycie))
rcb.rcb_reference.capture = lambda **k: None
rcb._dzis = lambda: "2026-09-24"


def alert_rso(voiv, poziom=1):
    return {"source": "rcb", "event_type": "rso_alert", "voivodeship": voiv,
            "points": 1.5, "details": {"rcb_level": poziom}, "ts": "2026-09-24T11:55:00+00:00"}


def obieg():
    punktowane.clear()
    ingesty.clear()
    zapisy.clear()
    asyncio.run(rcb._check(_Client()))


print("\n4. Pierwszy obieg: bez żywego alertu RSO artykuł nie punktuje")
obieg()
ok(not punktowane, "zastany meldunek bez alertu w RSO nie daje punktów")
ok(any(a[1] == "rcb_art_seen" for a in zapisy), "…ale zostaje ślad w sygnałach (0 pkt)")

print("\n5. RSO potwierdza alert → artykuł dokłada brakujące województwo")
rso_pokrycie.append(alert_rso("lubelskie"))
obieg()
ok([p["voivodeship"] for p in punktowane] == ["podkarpackie"],
   f"punktuje samo podkarpackie ({[p['voivodeship'] for p in punktowane]})")
ok(punktowane and punktowane[0]["event_type"] == "rcb_alert"
   and punktowane[0]["points"] == 1.5 and punktowane[0]["details"]["rcb_level"] == 1,
   "alert RCB 1. poziomu = 1,5 pkt, typ rcb_alert (oficjalny w fuzji)")
obieg()
ok(not punktowane, "ten sam meldunek nie punktuje drugi raz")

print("\n6. Aktualizacja artykułu na 3. poziom obejmuje oba województwa")
strona["artykul"] = strona_artykulu(BLOK_SCHRON + " --------------------- " + BLOK_ALERT)
obieg()
ok(sorted(p["voivodeship"] for p in punktowane) == ["lubelskie", "podkarpackie"],
   "lubelskie też, bo RSO ma tam dopiero 1. poziom")
ok(all(p["points"] == 4.5 and p["details"]["rcb_level"] == 3 for p in punktowane),
   "wezwanie do schronienia = 4,5 pkt")

print("\n7. Odwołanie dopisane przy nas gasi alert")
strona["artykul"] = strona_artykulu(
    BLOK_KONIEC + " ------------------ " + BLOK_SCHRON + " ------------------ " + BLOK_ALERT)
obieg()
ok([(p["event_type"], p["voivodeship"]) for p in punktowane] == [("rso_clear", "lubelskie")],
   f"odwołanie dla lubelskiego, 0 pkt ({[p['event_type'] for p in punktowane]})")
ok(all(p["points"] == 0.0 for p in punktowane), "odwołanie nie dokłada punktów")

print("\n8. Artykuł z innego dnia to sama historia")
rcb._artykuly.clear()
rcb._meldunki.clear()
rcb._zastane.clear()
strona["artykul"] = strona_artykulu(BLOK_SCHRON, data="17.09.2026")
obieg()
ok(not punktowane, "wpis sprzed kilku dni nie punktuje, choćby wołał o schronienie")

print("\n9. Odwołanie zastane przy pierwszym otwarciu nie wycisza alertu")
rcb._artykuly.clear()
rcb._meldunki.clear()
rcb._zastane.clear()
strona["artykul"] = strona_artykulu(BLOK_KONIEC + " ---------------- " + BLOK_ALERT)
obieg()
ok(not punktowane, "przy pierwszym czytaniu nie wiemy, czy odwołanie nie jest starsze")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - artykuł RCB z gov.pl uzupełnia województwa pominięte przez RSO")
