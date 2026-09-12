"""Klasyfikacja nagłówków: czy to relacja o zagrożeniu z powietrza.

Historia zmian tej reguły to historia fałszywych alarmów:
  1. "syreny" jako jedno słowo  → złapało "wymiana 50 syren alarmowych do 2027"
  2. dwa dowolne słabe słowa     → złapało "Nowe syreny pojawią się w Podlaskiem"
                                    (alarm + syreny) i "pożar bloku, śmigłowiec LPR"

Stąd obecna reguła — zdarzenie musi mieć OBIEKT i AKCJĘ:

  CRITICAL              → wystarczy samo (np. "alarm powietrzny", "zawyły syreny")
  AIR + EVENT           → obiekt powietrzny ORAZ zdarzenie z nim związane
  EXCLUDE               → weto (zakup, montaż, ćwiczenia, plany, pożar bez kontekstu)

Samo "syreny", samo "dron" czy sam "alarm" nigdy nie wystarczą — bo to słowa,
które w mediach lokalnych padają najczęściej w kontekście administracyjnym.
"""
import re
from functools import lru_cache


_TOKEN_KEYWORDS = {"kab", "bsp", "fpv"}


@lru_cache(maxsize=4096)
def _wzorzec(word: str):
    """Hasło musi zaczynać się na GRANICY SŁOWA.

    Wcześniej było zwykłe wyszukiwanie podciągu i weto „dni po" trafiało
    w środek „wscho-DNI PO-wiat", kasując prawdziwy meldunek o poderwaniu
    lotnictwa (ustalenie A8 audytu, zmierzone 12.09.2026). Obcinamy tylko lewą
    stronę — hasła są rdzeniami odmian (rakiet-a/y, zestrzel-ono/enie), więc
    prawa musi zostać otwarta.

    Krótkie skróty wojskowe (kab, bsp, fpv) dodatkowo muszą być samodzielnymi
    tokenami: bez tego „kab" trafiało w środek zwykłego słowa.
    """
    prawo = r"(?!\w)" if word in _TOKEN_KEYWORDS else ""
    return re.compile(rf"(?<!\w){re.escape(word)}{prawo}", re.UNICODE)


def _contains(text: str, word: str) -> bool:
    return _wzorzec(word).search(text) is not None


def _hits(text: str, words) -> list[str]:
    return [w for w in words if _contains(text, w)]


def _weta(t: str, exclude, soft) -> tuple[list[str], list[str]]:
    """Dzieli trafione weta na twarde i miękkie.

    Miękkie (`soft`) są podzbiorem `exclude`, więc twarde to reszta trafień.
    """
    miekkie = _hits(t, soft or ())
    twarde = [w for w in _hits(t, exclude) if w not in set(miekkie)]
    return twarde, miekkie


def classify(text: str, critical, air, event, exclude, soft=()) -> tuple[bool, list[str]]:
    """Zwraca (czy_alarm, dopasowane_słowa) — słowa idą do UI, żeby użytkownik
    widział, co konkretnie wywołało sygnał."""
    t = text.lower()
    twarde, miekkie = _weta(t, exclude, soft)
    if twarde:
        return False, []
    crit = _hits(t, critical)
    if crit:
        return True, crit
    if miekkie:
        return False, []
    a, e = _hits(t, air), _hits(t, event)
    if a and e:
        return True, a[:2] + e[:2]
    return False, []


def match_keywords(text: str, critical, air, event, exclude, soft=()) -> list[str]:
    ok, hits = classify(text, critical, air, event, exclude, soft)
    return hits if ok else []


def classify_level(text: str, critical, air, event, exclude, soft=()):
    """Jak `classify`, ale rozróżnia SIŁĘ dopasowania — do zróżnicowanej wagi:

      "critical" → jednoznaczna relacja operacyjna („zawyły syreny",
                   „poderwano F-16") — 1,5 pkt, nadal bez alarmu z samego RSS.
      "weak"     → tylko para OBIEKT+ZDARZENIE („dron” + „naruszył”) — 1 pkt,
                   wymaga potwierdzenia przez inną klasę źródła.
      None       → brak / weto.

    Zwraca (poziom|None, dopasowane_słowa)."""
    t = text.lower()
    twarde, miekkie = _weta(t, exclude, soft)
    if twarde:
        return None, []
    crit = _hits(t, critical)
    if crit:
        # Miękkie weto OBNIŻA relację operacyjną do zwykłej pary, zamiast ją
        # kasować: „Zamknięto przestrzeń powietrzną. Utrudnienia potrwają" to
        # prawdziwe zdarzenie opisane od strony skutków.
        return ("weak" if miekkie else "critical"), crit
    if miekkie:
        return None, []
    a, e = _hits(t, air), _hits(t, event)
    if a and e:
        return "weak", a[:2] + e[:2]
    return None, []
