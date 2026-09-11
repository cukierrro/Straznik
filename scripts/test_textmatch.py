"""Testy klasyfikatora nagłówków.

Każdy przypadek NEGATYWNY to fałszywy alarm, który system realnie wygenerował
w trakcie pracy — regresja tutaj oznacza, że wraca stary błąd.
Uruchom: py scripts/test_textmatch.py
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
# Klasyfikator nie potrzebuje integracji TLS ani pliku .env.
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_args, **_kwargs: None
sys.modules.setdefault("dotenv", dotenv_stub)

from app import config
from app.textmatch import classify_level, match_keywords

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
    ("W Warszawie zawyły syreny? Co powinieneś zrobić? Wielu mieszkańców popełnia podstawowy błąd", False),
    ("Poradnik bezpieczeństwa: co zrobić w razie alarmu powietrznego", False),
    ("W Warszawie zawyły syreny. Mieszkańcy otrzymali pilny komunikat", True),
    # krótkie skróty muszą być osobnymi wyrazami, nie fragmentem zwykłego słowa
    ("Pożar ciężarówki. Kabina stanęła w ogniu, doszło do wybuchu paliwa", False),
    ("Alarm demograficzny: subspopulacja regionu nadal maleje", False),
    ("KAB uderzyła w rejonie przygranicznym", True),
    ("BSP naruszył przestrzeń powietrzną Polski", True),
    # samo naruszenie jest sygnałem 1,5 wymagającym potwierdzenia; postępowanie
    # po dawnym locie nie jest sygnałem zagrożenia
    ("Amatorski lot dronem i naruszenie przestrzeni powietrznej. Są zarzuty", False),
    ("Pilot drona usłyszał zarzut naruszenia przestrzeni powietrznej", False),
    # ── kultura / kosmos / historia / sport („rakieta/dron/atak/bomba") ──
    ("Recenzja: nowy film fabularny o rosyjskim ataku rakietowym", False),
    ("Start rakiety SpaceX Falcon 9 zakończony eksplozją", False),
    ("1944: gdy na Warszawę spadały bomby", False),
    ("Pokaz dronów nad Wisłą — jeden spadł do wody", False),
    ("Rok temu rosyjski dron spadł na dom w Wyrykach", False),
    ("Śledztwo ws. uderzenia rakiety w dom w Wyrykach umorzone", False),
    ("Najpierw postawimy choinkę. Dom w Wyrykach ma być gotowy na święta. "
     "W nocy polską przestrzeń powietrzną przekroczyły rosyjskie drony, "
     "a rakieta spadła na dom.", False),
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

    weak, weak_hits = classify_level(
        "BSP naruszył przestrzeń powietrzną Polski",
        config.ALERT_CRITICAL_KEYWORDS, config.ALERT_AIR_KEYWORDS,
        config.ALERT_EVENT_KEYWORDS, config.EXCLUDE_KEYWORDS)
    assert weak == "weak" and weak_hits, (weak, weak_hits)
    critical, critical_hits = classify_level(
        "Rosyjski dron naruszył przestrzeń powietrzną; poderwano F-16",
        config.ALERT_CRITICAL_KEYWORDS, config.ALERT_AIR_KEYWORDS,
        config.ALERT_EVENT_KEYWORDS, config.EXCLUDE_KEYWORDS)
    assert critical == "critical" and critical_hits, (critical, critical_hits)
    print(f"WSZYSTKIE {len(CASES)} PRZYPADKÓW OK")


main()
