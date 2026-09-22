"""Alarm bałtycki przypisany do kraju, o którym mówi tytuł (22.09.2026).

Portal litewski opisujący alarm na Łotwie był liczony jako alarm litewski (0,3 zamiast 0,18)."""
import sys, types
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
sys.modules.setdefault("dotenv", types.SimpleNamespace(load_dotenv=lambda *a, **k: None))
from app.collectors import rss_media as r
cases = [("Latvijoje paskelbtas oro pavojus Krāslavos savivaldybėje", "LT", "LV"),
         ("Lietuvoje paskelbtas oro pavojus", "LT", "LT"),
         ("Oro pavojus Vilniaus apskrityje", "LT", "LT"),
         ("Air alert in Latvia and Lithuania", "LT", "LT"),
         ("Lätis anti õhuhäire", "EE", "LV")]
bad = 0
for t, feed, want in cases:
    got = r._baltic_named_country(t.lower(), feed)
    bad += got != want
    print("OK " if got == want else "ZLE", t, "->", got)
sys.exit(bad)
