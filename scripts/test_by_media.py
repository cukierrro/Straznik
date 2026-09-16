# -*- coding: utf-8 -*-
"""Media białoruskie w trybie cienia (16.09.2026) — collectors/by_media_shadow.py.

1. Wpis liczy się tylko, gdy dron i Białoruś (miejscowość albo „nad/z Białorusi”) są
   w tym samym zdaniu — stopka Zerkalo „из Беларуси — с VPN” nie wystarcza.
2. Tagi: zachód (Brześć, Grodno…), Polska, Litwa, relacja po fakcie.
3. Parser publicznego podglądu kanału Telegram: numer wpisu, tekst, czas publikacji.
4. Zapis tylko do dziennika obserwacji (kind „by_media”), bez punktów.

Uruchomienie: py scripts/test_by_media.py
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, fusion, stealth  # noqa: E402
from app.collectors import by_media_shadow as m  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


STOPKA = ("В Киеве дроны уничтожили склады студии «Квартал 95».\n\nhttps://zerkalo.example/1\n\n"
          "👉 Не работает ссылка? Попробуйте эту, из Беларуси — с VPN.")
sprawdz(m.classify(STOPKA) is None, "dron nad Kijowem + stopka „из Беларуси” — pominięty")

c = m.classify("У сацсетках пішуць, што ў Слуцку ўпаў расійскі «Шахед». Улады інфармацыі не абвяргаюць.")
sprawdz(c and c["places"] == ["слуцк"] and not c["west"], f"szahed w Słucku (białoruski) — {c}")

c = m.classify("Над Брестом заметили беспилотник, который летел в сторону Польши")
sprawdz(c and c["west"] and c["poland"], f"dron nad Brześciem w stronę Polski — zachód i Polska ({c})")

c = m.classify("Паветраныя шары зноў заляцелі ў Літву з Беларусі")
sprawdz(c and c["lithuania"] and c["belarus"] == ["з беларусі"], f"balony z Białorusi na Litwę ({c})")

c = m.classify("Во время атаки на Украину российские дроны массово залетали в Беларусь. Что известно")
sprawdz(c and "что известно" in c["retro"], f"relacja „что известно” oznaczona jako po fakcie ({c and c['retro']})")

sprawdz(m.classify("В Гомеле прошла выставка дронов для сельского хозяйства") is None,
        "wystawa dronów w Homlu — pominięta")
sprawdz(m.classify("Лукашенко провел совещание в Минске") is None, "Mińsk bez drona — pominięty")

PAGE = """<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="belsat/145700">
<div class="tgme_widget_message_text js-message_text" dir="auto">💥 Пад <b>Мазыром</b> упаў беспілотнік?<br/>Мясцовыя жыхары чулі выбух.</div>
<a class="tgme_widget_message_date" href="https://t.me/belsat/145700"><time datetime="2026-09-16T11:31:00+00:00" class="time">11:31</time></a></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="belsat/145701">
<div class="tgme_widget_message_photo_wrap"></div>
<a class="tgme_widget_message_date"><time datetime="2026-09-16T11:40:00+00:00" class="time">11:40</time></a></div></div>"""
posts = m.parse_telegram(PAGE)
sprawdz(len(posts) == 1 and posts[0]["post"] == "belsat/145700" and "Мазыром упаў" in posts[0]["text"]
        and "\n" in posts[0]["text"] and posts[0]["published"] == 1789558260,
        f"parser Telegrama: wpis z tekstem, wpis bez tekstu pominięty ({posts})")

zapisy = []
stealth.record = lambda kind, key, data, ts=None: (zapisy.append((kind, key, data, ts)) or True)
ingested = []


async def fake_ingest(**kw):
    ingested.append(kw)
    return True

fusion.ingest = fake_ingest
for p in posts:
    m._store("tg:belsat", f"tg:{p['post']}", p["text"], "https://t.me/" + p["post"],
             p["published"], p["published"] + 600, True)
    m._store("tg:belsat", f"tg:{p['post']}", p["text"], "https://t.me/" + p["post"],
             p["published"], p["published"] + 900, True)
sprawdz(len(zapisy) == 1 and zapisy[0][0] == "by_media" and zapisy[0][2]["lag_min"] == 10.0
        and zapisy[0][3] == posts[0]["published"] and zapisy[0][2]["backlog"] is False,
        f"jeden zapis by_media z opóźnieniem 10 min ({[(k, d.get('lag_min')) for k, _, d, _ in zapisy]})")
sprawdz(not ingested, "media białoruskie nie dają punktów")
sprawdz("nexta" not in " ".join(config.BY_SHADOW_TELEGRAM + config.BY_SHADOW_FEEDS).lower()
        and set(config.BY_SHADOW_TELEGRAM) == {"zerkalo_io", "nashaniva", "belsat"},
        "źródła: Zerkalo, Nasza Niwa, Biełsat — bez Nexty")
src = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
sprawdz('"by_media_shadow": by_media_shadow.run' in src and '"by_entry_shadow": by_entry_shadow.status' in src,
        "kolektor uruchamiany w main i widoczny w /api/health")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - media białoruskie w trybie cienia, bez punktów")
