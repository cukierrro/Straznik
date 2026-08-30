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


_TOKEN_KEYWORDS = {"kab", "bsp", "fpv"}


def _contains(text: str, word: str) -> bool:
    """Krótkie skróty wojskowe muszą być samodzielnymi tokenami.

    Zwykłe wyszukiwanie podciągu uznawało m.in. ``kab`` wewnątrz zwykłego
    słowa i ``bsp`` w tekście demograficznym. Dłuższe rdzenie celowo nadal są
    podciągami, bo obsługują polską odmianę (rakiet-a/y, zestrzel-ono/enie).
    """
    if word in _TOKEN_KEYWORDS:
        return re.search(rf"(?<!\w){re.escape(word)}(?!\w)", text, re.UNICODE) is not None
    return word in text


def _hits(text: str, words) -> list[str]:
    return [w for w in words if _contains(text, w)]


def classify(text: str, critical, air, event, exclude) -> tuple[bool, list[str]]:
    """Zwraca (czy_alarm, dopasowane_słowa) — słowa idą do UI, żeby użytkownik
    widział, co konkretnie wywołało sygnał."""
    t = text.lower()
    if _hits(t, exclude):
        return False, []
    crit = _hits(t, critical)
    if crit:
        return True, crit
    a, e = _hits(t, air), _hits(t, event)
    if a and e:
        return True, a[:2] + e[:2]
    return False, []


def match_keywords(text: str, critical, air, event, exclude) -> list[str]:
    ok, hits = classify(text, critical, air, event, exclude)
    return hits if ok else []


def classify_level(text: str, critical, air, event, exclude):
    """Jak `classify`, ale rozróżnia SIŁĘ dopasowania — do zróżnicowanej wagi:

      "critical" → padło samo słowo mocne („zawyły syreny", „poderwano f-16",
                   „naruszenie przestrzeni powietrznej") — pojedynczy taki
                   artykuł może alarmować sam.
      "weak"     → tylko para OBIEKT+ZDARZENIE („dron” + „zestrzelono”) — słabszy
                   sygnał, wymaga korroboracji (drugie medium / inne źródło).
      None       → brak / weto.

    Zwraca (poziom|None, dopasowane_słowa)."""
    t = text.lower()
    if _hits(t, exclude):
        return None, []
    crit = _hits(t, critical)
    if crit:
        return "critical", crit
    a, e = _hits(t, air), _hits(t, event)
    if a and e:
        return "weak", a[:2] + e[:2]
    return None, []
