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
    # ── A8 z audytu 1.7.21: weta bez granicy słowa i weto bijące frazę krytyczną
    # Weto „dni po" trafiało w środek „wscho-DNI PO-wiat" i kasowało prawdziwy
    # meldunek; „potrwa" kasowało realne zamknięcie przestrzeni.
    ("Poderwano myśliwce. Wschodni powiat w gotowości", True),
    ("Zamknięto przestrzeń powietrzną nad Lublinem. Utrudnienia potrwają do rana", True),
    ("Zawyły syreny w Lublinie. Przypominamy, co oznacza sygnał alarmowy", True),
    # … ale weto TWARDE nadal musi kasować także frazę krytyczną
    ("Syreny zawyły w całym mieście — to ogólnopolskie ćwiczenia", False),
    ("Zawyły syreny alarmowe. Rocznica wybuchu powstania", False),
    ("Wybiła godzina „W”. Warszawa stanęła, w mieście zawyły syreny", False),
    ("Alarm bombowy w szkole. Ewakuowano uczniów", False),
    # samo omówienie bez frazy krytycznej nadal nie punktuje
    ("Poznaj sygnały alarmowe — poradnik bezpieczeństwa", False),
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
                              config.EXCLUDE_KEYWORDS, config.SOFT_EXCLUDE_KEYWORDS)
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
        config.ALERT_EVENT_KEYWORDS, config.EXCLUDE_KEYWORDS,
        config.SOFT_EXCLUDE_KEYWORDS)
    assert weak == "weak" and weak_hits, (weak, weak_hits)
    critical, critical_hits = classify_level(
        "Rosyjski dron naruszył przestrzeń powietrzną; poderwano F-16",
        config.ALERT_CRITICAL_KEYWORDS, config.ALERT_AIR_KEYWORDS,
        config.ALERT_EVENT_KEYWORDS, config.EXCLUDE_KEYWORDS,
        config.SOFT_EXCLUDE_KEYWORDS)
    assert critical == "critical" and critical_hits, (critical, critical_hits)

    # A8: miękkie weto OBNIŻA frazę krytyczną do 1,0 zamiast ją kasować,
    # a twarde nadal kasuje wszystko — inaczej test syren dawałby punkty.
    obnizone, _ = classify_level(
        "Zamknięto przestrzeń powietrzną nad Lublinem. Utrudnienia potrwają do rana",
        config.ALERT_CRITICAL_KEYWORDS, config.ALERT_AIR_KEYWORDS,
        config.ALERT_EVENT_KEYWORDS, config.EXCLUDE_KEYWORDS,
        config.SOFT_EXCLUDE_KEYWORDS)
    assert obnizone == "weak", obnizone
    twarde, _ = classify_level(
        "Syreny zawyły w całym mieście — to ogólnopolskie ćwiczenia",
        config.ALERT_CRITICAL_KEYWORDS, config.ALERT_AIR_KEYWORDS,
        config.ALERT_EVENT_KEYWORDS, config.EXCLUDE_KEYWORDS,
        config.SOFT_EXCLUDE_KEYWORDS)
    assert twarde is None, twarde
    # ── przypisanie artykułu do województw ───────────────────────────────────
    # Ta sama tabela co w scripts/test_voiv_match.cjs (silnik wbudowany) — oba
    # silniki muszą przypisywać artykuły identycznie.
    from app.collectors.rss_media import _match_voivs
    voiv_cases = [
        # Alert RCB „dla województw lubelskiego i podkarpackiego" trafiał do 12.09.2026
        # WYŁĄCZNIE do podkarpackiego, bo dopasowanie brało jedno, najdłuższe hasło.
        ("Lubelskie: RCB ostrzega mieszkańców w związku z atakami Rosji na Ukrainę. "
         "Rządowe Centrum Bezpieczeństwa rozesłało w sobotę alert do osób na terenie "
         "województw lubelskiego i podkarpackiego.", ["lubelskie", "podkarpackie"]),
        # kolizje nazw: krótsze hasło schowane w dłuższym trafieniu musi przegrać
        ("Chełmno: ćwiczenia syren", ["kujawsko-pomorskie"]),
        ("Radomsko: alarm", ["łódzkie"]),
        ("Tomaszów Mazowiecki — nalot", ["łódzkie"]),
        ("Biała Podlaska: syreny", ["lubelskie"]),
        ("Ostrowiec Świętokrzyski", ["świętokrzyskie"]),
        ("Alarm w Rzeszowie", ["podkarpackie"]),
        ("Nic o regionach", []),
        ("Syreny w Przemyślu, potem w Lublinie", ["podkarpackie", "lubelskie"]),
    ]
    for text, expected in voiv_cases:
        got = _match_voivs(text)
        assert got == expected, f"{text[:48]!r}: {got} ≠ {expected}"

    print(f"WSZYSTKIE {len(CASES)} PRZYPADKÓW OK "
          f"+ {len(voiv_cases)} przypisań do województw")


main()
