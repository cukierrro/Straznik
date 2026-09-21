"""Województwa artykułu: tytuł przed zapowiedziami innych tekstów w opisie RSS (21.09.2026).

Alert RCB „w Lubelskiem” dostawał po 1 pkt w opolskim i dolnośląskim przez nazwy miast
z zapowiedzi innych artykułów w opisie („Wrocławskie sparingi Startu Lublin”)."""
import sys, types
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("dotenv", types.SimpleNamespace(load_dotenv=lambda *a, **k: None))
from app.collectors import rss_media as r
T = "„Rosyjski atak powietrzny na terenie Ukrainy”. Alert RCB w Lubelskiem!"
cases = [
 (T, T + " Polskie lotnictwo operuje. O tym się mówiło: Wrocławskie sparingi Startu Lublin. Nowy park w Opolu.", ["lubelskie"]),
 ("Alert RCB dla Lubelszczyzny", "Alert RCB rozesłany do osób na terenie województw lubelskiego i podkarpackiego", ["lubelskie", "podkarpackie"]),
 ("Alert RCB w Lubelskiem", "Alert także w Białej Podlaskiej", ["lubelskie"]),
 ("Drony nad Polską", "Drony widziano nad Wrocławiem i Opolem", ["dolnośląskie", "opolskie"]),
 ("Alarm w Lubelskiem", "Służby na Opolszczyźnie też w gotowości", ["lubelskie", "opolskie"]),
]
bad = 0
for title, text, want in cases:
    got = r._article_voivs(title, text)
    ok = got == want; bad += not ok
    print("OK " if ok else "ZLE", got, "oczekiwane", want)
sys.exit(bad)
