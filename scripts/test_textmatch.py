"""Testy klasyfikatora nagłówków.

Każdy przypadek NEGATYWNY to fałszywy alarm, który system realnie wygenerował
w trakcie pracy — regresja tutaj oznacza, że wraca stary błąd.
Uruchom: py scripts/test_textmatch.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import config
from app.textmatch import match_keywords

CASES = [
    # (nagłówek, czy_ma_być_alarmem)
    # ── prawdziwe zdarzenia ──────────────────────────────────────────────
    ("Pocisk spadł w Tarnawie-Kolonii. Tusk: wszystko wskazuje na rosyjski Ch-101", True),
    ("Rakieta z Rosji spadła na Lubelszczyźnie. Tak wyglądał moment wybuchu", True),
    ("W Lublinie zawyły syreny, mieszkańcy słyszą eksplozje", True),
    ("Rosyjski dron naruszył przestrzeń powietrzną, poderwano myśliwce", True),
    ("Alarm powietrzny w powiecie hrubieszowskim", True),
    ("Zestrzelono drona nad wschodnią Polską", True),
    ("Szczątki drona znalezione w polu pod Chełmem", True),
    ("Niezidentyfikowany obiekt spadł na budynek mieszkalny", True),

    # ── fałszywe alarmy, które system wygenerował (regresje) ─────────────
    ("Podlaskie: Do 2027 r. potrwa wymiana 50 syren alarmowych w regionie", False),
    ("Nie tylko alarm, ale też komunikat głosowy. Nowe syreny pojawią się w Podlaskiem", False),
    ("Groźny pożar bloku w Poniatowej. Ewakuowano 21 osób, śmigłowiec LPR lądował dwa razy", False),
    ("Donald Tusk w Tarnawie-Kolonii: „Wszystko musi być przejrzyste”", False),
    ("Stopnie alarmowe", False),

    # ── inne konteksty, które nie powinny punktować ──────────────────────
    ("Nowy przetarg na zakup dronów dla wojska", False),
    ("Próba syren alarmowych w całym województwie", False),
    ("Koncert charytatywny: alarm dla klimatu", False),
    ("Ćwiczenia obrony cywilnej — syreny zawyją w południe", False),
    ("Gmina zamontuje nowoczesne syreny alarmowe za 200 tys. zł", False),
    ("Pokaz dronów nad zalewem — atrakcja na weekend", False),
    ("Wypadek drogowy na S17, jedna osoba ranna", False),
    ("Rusza modernizacja systemu ostrzegania w powiecie", False),

    # ── nowe zaliczenia (nowoczesny słownik zagrożeń) ────────────────────
    ("Zamknięto przestrzeń powietrzną nad wschodnią Polską", True),
    ("Poderwano F-16 po naruszeniu granicy", True),
    ("Lancet uderzył w cel tuż przy granicy", True),
    ("Rozpoczęto operację obrony powietrznej na wschodzie kraju", True),

    # ── RETROSPEKTYWA i publicystyka: świeży artykuł o DAWNYM zdarzeniu ──
    ("Czy na pewno? Tydzień po wybuchu rakiety w Tarnawie-Kolonii", False),
    ("Kalendarium: rok po ataku dronów na Lubelszczyźnie", False),
    ("Reportaż: co wiemy miesiąc po naruszeniu przestrzeni powietrznej", False),
    # ── kultura / kosmos / historia / sport („rakieta/dron/atak/bomba") ──
    ("Recenzja: nowy film fabularny o rosyjskim ataku rakietowym", False),
    ("Start rakiety SpaceX Falcon 9 zakończony eksplozją", False),
    ("1944: gdy na Warszawę spadały bomby", False),
    ("Pokaz dronów nad Wisłą — jeden spadł do wody", False),
]


def main():
    failed = []
    for text, expected in CASES:
        hits = match_keywords(text, config.ALERT_CRITICAL_KEYWORDS,
                              config.ALERT_AIR_KEYWORDS, config.ALERT_EVENT_KEYWORDS,
                              config.EXCLUDE_KEYWORDS)
        got = bool(hits)
        status = "OK  " if got == expected else "FAIL"
        if got != expected:
            failed.append(text)
        print(f"{status} {'ALARM ' if got else 'ignore'} {str(hits)[:42]:44} {text[:66]}")
    print()
    if failed:
        print(f"NIEPOWODZENIA: {len(failed)}/{len(CASES)}")
        for f in failed:
            print("  -", f)
        sys.exit(1)
    print(f"WSZYSTKIE {len(CASES)} PRZYPADKÓW OK")


main()
