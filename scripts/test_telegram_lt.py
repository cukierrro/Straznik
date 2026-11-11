# -*- coding: utf-8 -*-
"""Telegram LRT — alarmy na Litwie w TRYBIE CIENIA (11.11.2026).

Noc 10/11.11: czerwony alarm w Druskienikach i Łoździejach (22:45 UTC) i w okręgu
Mariampol (23:19) Strażnik przegapił; kanał Telegram LRT podał oba od razu. Decyzja
usera: tydzień obserwacji bez punktów. Test pilnuje, że kolektor:
- rozpoznaje alarm, poziom, okręgi i bliskość granicy z Polską,
- nie myli ministra „Робертас Каунас” z okręgiem kowieńskim,
- zapisuje tylko do dziennika obserwacji i NIGDY nie woła fuzji,
- po starcie procesu nie udaje opóźnienia (wpis mógł wisieć od godzin).
Treści poniżej są własnymi, krótkimi zdaniami w stylu kanału, nie cytatami.

Uruchomienie: py scripts/test_telegram_lt.py
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
_dotenv = types.ModuleType("dotenv"); _dotenv.load_dotenv = lambda *a, **k: None
sys.modules.setdefault("dotenv", _dotenv)
from app import config  # noqa: E402
from app.collectors import telegram_lt as tg  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy: list[str] = []


def ok(warunek: bool, opis: str) -> None:
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


def wpis(nr: int, czas: str, tekst: str) -> str:
    # kształt publicznego podglądu t.me/s/… (11.11.2026), skrócony
    return (f'<div class="tgme_widget_message_wrap js-widget_message_wrap">'
            f'<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="lrtlt/{nr}" '
            f'data-view="x"><div class="tgme_widget_message_bubble">'
            f'<div class="tgme_widget_message_text js-message_text" dir="auto">{tekst}</div>'
            f'<div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="#">'
            f'<time datetime="{czas}" class="time">x</time></a></div></div></div></div>')


BLOKI = [
    wpis(100, "2026-11-10T20:56:00+00:00", "‼️ Вероятная воздушная тревога в Вильнюсском уезде"),
    wpis(101, "2026-11-10T22:22:00+00:00", "Министр обороны Робертас Каунас: армия следит за ситуацией"),
    wpis(102, "2026-11-10T22:30:00+00:00", "Тревога <b>отменена</b> в Утенском уезде"),
    wpis(103, "2026-11-10T22:45:00+00:00",
         "Друскининкай и Лаздияй – <b>красный уровень</b> воздушной опасности, жителям пройти в укрытие"),
    wpis(104, "2026-11-10T23:19:00+00:00", "В Мариямпольском уезде объявлен красный уровень воздушной опасности"),
    wpis(105, "2026-11-10T22:53:00+00:00", "Вероятный дрон движется в сторону польской границы"),
]
STRONA = "".join(BLOKI)

print("1. odczyt wpisów z podglądu kanału")
w = tg.wpisy(STRONA)
ok([x["id"] for x in w] == [100, 101, 102, 103, 104, 105], f"sześć wpisów w kolejności ({[x['id'] for x in w]})")
ok(w[2]["tekst"] == "Тревога отменена в Утенском уезде", f"tekst bez znaczników HTML: {w[2]['tekst']!r}")
ok(w[3]["czas"] == "2026-11-10T22:45:00+00:00", "czas publikacji z <time datetime>")

print("\n2. klasyfikacja")
k = {x["id"]: tg.klasyfikuj(x["tekst"]) for x in w}
ok(k[100]["rodzaj"] == "alarm" and k[100]["poziom"] == "zolty" and k[100]["okregi"] == ["Vilniaus"]
   and not k[100]["przy_polsce"], f"Wilno: żółty, nie przy Polsce ({k[100]})")
ok(k[101]["rodzaj"] == "inne" and k[101]["okregi"] == [], f"minister Kaunas to nie okręg kowieński ({k[101]})")
ok(k[102]["rodzaj"] == "odwolanie" and k[102]["okregi"] == ["Utenos"], f"odwołanie dla Uciany ({k[102]})")
ok(k[103]["rodzaj"] == "alarm" and k[103]["poziom"] == "czerwony" and k[103]["przy_polsce"]
   and k[103]["gminy_przy_pl"] == ["Druskininkai", "Lazdijai"], f"Druskieniki i Łoździeje: czerwony przy PL ({k[103]})")
ok(k[104]["poziom"] == "czerwony" and k[104]["okregi"] == ["Marijampolės"] and k[104]["przy_polsce"],
   f"okręg Mariampol: czerwony przy PL ({k[104]})")

ok(k[105]["rodzaj"] == "kierunek_pl" and k[105]["przy_polsce"], f"dron w stronę granicy polskiej ({k[105]})")

print("\n3. tylko dziennik obserwacji, opóźnienie liczone dopiero po starcie")
zapisy = []
tg.stealth.record = lambda kind, key, data, ts=None: (zapisy.append((kind, key, data)) or True)
widziane: set[int] = set()
import calendar  # noqa: E402
T = calendar.timegm((2026, 11, 10, 22, 40, 0))          # start procesu, widać wpisy 100–102
n = tg.przetworz("".join(BLOKI[:3]), widziane, True, T)
ok(all(kind == "lt_telegram" for kind, _, _ in zapisy), "rodzaj obserwacji lt_telegram")
ok(all(d["opoznienie_s"] is None and d["przy_starcie"] for _, _, d in zapisy),
   "wpisy zastane przy starcie — bez opóźnienia")
ok(not any(key == "lrtlt/101" for _, key, _ in zapisy), "wpis bez alarmu nie trafia do dziennika")
zapisy.clear()
n = tg.przetworz(STRONA, widziane, False, calendar.timegm((2026, 11, 10, 22, 50, 0)))
nowy = {key: d for _, key, d in zapisy}
ok(set(nowy) == {"lrtlt/103", "lrtlt/104", "lrtlt/105"}, f"po starcie tylko nowe wpisy ({sorted(nowy)})")
ok(nowy["lrtlt/103"]["opoznienie_s"] == 300, f"opóźnienie 22:45 → 22:50 = 300 s ({nowy['lrtlt/103']['opoznienie_s']})")
zapisy.clear()
tg.przetworz(STRONA, widziane, False, calendar.timegm((2026, 11, 10, 22, 51, 0)))
ok(not zapisy, "ten sam wpis drugi raz — nic")

print("\n4. tryb cienia: kolektor nie dotyka fuzji ani powiadomień")
zrodlo = Path(tg.__file__).read_text(encoding="utf-8")
ok("fusion" not in zrodlo.split('"""', 2)[2] and "notify" not in zrodlo.split('"""', 2)[2],
   "w kodzie kolektora nie ma fusion ani notify")
ok(tg.status["mode"] == "shadow", "status mówi wprost: shadow")
main = (Path(tg.__file__).resolve().parent.parent / "main.py").read_text(encoding="utf-8")
ok('"lt_telegram": telegram_lt.run' in main and '"lt_telegram": telegram_lt.status' in main,
   "zadanie i status zarejestrowane w main.py")
ok(config.LT_TELEGRAM_INTERVAL >= 60, f"nie częściej niż co minutę ({config.LT_TELEGRAM_INTERVAL} s)")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK — Telegram LRT w trybie cienia")
