"""Konfiguracja aplikacji Strażnik — wczytywana z .env + wartości domyślne."""
import os
from pathlib import Path

import truststore
from dotenv import load_dotenv

# Windows: użyj systemowego magazynu certyfikatów zamiast certifi
# (bez tego httpx/websockets wywalają się na CERTIFICATE_VERIFY_FAILED,
# gdy ruch TLS przechodzi przez antywirus/proxy z własnym CA)
truststore.inject_into_ssl()

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_DIR = BASE_DIR.parent                              # katalog projektu
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = PROJECT_DIR / "frontend"

load_dotenv(BASE_DIR / ".env")

DB_PATH = DATA_DIR / "straznik.db"
VAPID_PATH = DATA_DIR / "vapid.json"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8600"))

# ── Neptun ────────────────────────────────────────────────────────────────────
NEPTUN_BASE = "https://neptun.in.ua"
NEPTUN_WS_URL = "wss://neptun.in.ua/api/v1/stream"
NEPTUN_REST_URL = f"{NEPTUN_BASE}/api/v1/threats"
NEPTUN_REST_INTERVAL = 10          # s; REST tylko jako fallback gdy WS padnie
# typy obiektów brane pod uwagę w scoringu (fpv ignorujemy — zasięg kilkanaście km)
NEPTUN_SCORED_TYPES = {"uav", "missile", "ballistic", "kab", "mig31k", "cruise", "shahed"}
NEPTUN_NEAR_KM = 100.0             # próg odległości od granicy PL
NEPTUN_HEADING_TOLERANCE = 50.0    # ± stopni od azymutu na najbliższy punkt granicy
# obwody graniczące z PL — obiekty stamtąd zawsze obserwujemy
NEPTUN_BORDER_REGIONS = ("Волинська", "Львівська", "Закарпатська", "Рівненська")

# ── ADS-B ─────────────────────────────────────────────────────────────────────
ADSB_PROVIDER = os.getenv("ADSB_PROVIDER", "adsb.lol")   # adsb.lol | adsb.fi | adsbx
ADSB_INTERVAL = int(os.getenv("ADSB_INTERVAL", "60"))
ADSBX_RAPIDAPI_KEY = os.getenv("ADSBX_RAPIDAPI_KEY", "")
ADSB_BASELINE_DAYS = 7
ADSB_SPIKE_FACTOR = 2.0            # sygnał gdy > 2x baseline
ADSB_MIN_COUNT = 3                 # ...i co najmniej tyle maszyn wojskowych

# ── PAŻP / RSS / RCB ─────────────────────────────────────────────────────────
PANSA_INTERVAL = int(os.getenv("PANSA_INTERVAL", "300"))
RSS_INTERVAL = int(os.getenv("RSS_INTERVAL", "60"))
RCB_INTERVAL = int(os.getenv("RCB_INTERVAL", "120"))
RCB_URL = "https://www.gov.pl/web/rcb"

# ── Fuzja ─────────────────────────────────────────────────────────────────────
# Okno sumowania: 60 min, ale z wygaszaniem — sygnał zachowuje pełną wagę przez
# pierwsze FUSION_FULL_MIN minut, potem liniowo traci ją do zera. Dzięki temu
# system ma dłuższą pamięć (seria zdarzeń w ciągu godziny się sumuje), a stare
# pojedyncze zdarzenie samo nie utrzymuje alarmu.
FUSION_WINDOW_MIN = 60
FUSION_FULL_MIN = 30
THRESHOLD_ELEVATED = 2.0           # "PODWYŻSZONA UWAGA"
THRESHOLD_HIGH = 4.0               # "WYSOKI PRIORYTET"
NOTIFY_COOLDOWN_MIN = 10           # min. odstęp między powiadomieniami tego samego poziomu/woj.

POINTS = {
    "neptun_high": 3.0,
    "neptun_medlow": 1.5,
    "adsb_spike": 1.0,
    "pansa_zone": 1.0,
    "media_keywords": 2.0,
    "rcb_alert": 2.0,
    "ua_alert_border": 1.0,    # oficjalny alarm powietrzny w przygranicznym obwodzie UA
    "baltic_context": 1.0,     # incydent powietrzny wg mediów LT/LV/EE
}

# Maksymalny wkład punktowy JEDNEJ klasy źródła do sumy województwa w oknie.
# Wiele artykułów o tym samym zdarzeniu ≠ kilka niezależnych potwierdzeń —
# fuzja ma mierzyć NIEZALEŻNE klasy wskaźników. Neptun bez limitu (każdy track
# to osobny fizyczny obiekt). Wszystkie sygnały i tak są widoczne w UI.
SOURCE_CAPS = {"media": 2.0, "rcb": 2.0, "adsb": 1.0, "pansa": 1.0}

# ── Propagacja na resztę kraju ────────────────────────────────────────────────
# Zdarzenie na wschodzie dotyczy też regionów dalej na zachód (obiekt leci
# dalej, alarmy się rozszerzają). Jedna iteracja: województwo z sumą >= progu
# "uwagi" przelewa ułamek punktów na bezpośrednich sąsiadów. Bez rekurencji —
# system ma pozostać przewidywalny i wytłumaczalny.
SPILLOVER_FACTOR = 0.4
SPILLOVER_MIN_SOURCE_SCORE = 2.0

VOIV_NEIGHBORS = {
    "dolnośląskie": ["lubuskie", "wielkopolskie", "opolskie"],
    "kujawsko-pomorskie": ["pomorskie", "warmińsko-mazurskie", "mazowieckie", "łódzkie",
                           "wielkopolskie"],
    "lubelskie": ["podkarpackie", "świętokrzyskie", "mazowieckie", "podlaskie"],
    "lubuskie": ["zachodniopomorskie", "wielkopolskie", "dolnośląskie"],
    "łódzkie": ["mazowieckie", "kujawsko-pomorskie", "wielkopolskie", "opolskie",
                "śląskie", "świętokrzyskie"],
    "małopolskie": ["śląskie", "świętokrzyskie", "podkarpackie"],
    "mazowieckie": ["warmińsko-mazurskie", "podlaskie", "lubelskie", "świętokrzyskie",
                    "łódzkie", "kujawsko-pomorskie"],
    "opolskie": ["dolnośląskie", "wielkopolskie", "łódzkie", "śląskie"],
    "podkarpackie": ["małopolskie", "świętokrzyskie", "lubelskie"],
    "podlaskie": ["warmińsko-mazurskie", "mazowieckie", "lubelskie"],
    "pomorskie": ["zachodniopomorskie", "wielkopolskie", "kujawsko-pomorskie",
                  "warmińsko-mazurskie"],
    "śląskie": ["opolskie", "łódzkie", "świętokrzyskie", "małopolskie"],
    "świętokrzyskie": ["łódzkie", "mazowieckie", "lubelskie", "podkarpackie",
                       "małopolskie", "śląskie"],
    "warmińsko-mazurskie": ["pomorskie", "kujawsko-pomorskie", "mazowieckie", "podlaskie"],
    "wielkopolskie": ["zachodniopomorskie", "pomorskie", "kujawsko-pomorskie", "łódzkie",
                      "opolskie", "dolnośląskie", "lubuskie"],
    "zachodniopomorskie": ["pomorskie", "wielkopolskie", "lubuskie"],
}

# ── Powiadomienia ─────────────────────────────────────────────────────────────
NTFY_ENABLED = os.getenv("NTFY_ENABLED", "true").lower() == "true"
NTFY_SERVER = os.getenv("NTFY_SERVER", "https://ntfy.sh")
NTFY_TOPIC = os.getenv("NTFY_TOPIC", "")                 # ustaw własny, trudny do zgadnięcia
TELEGRAM_ENABLED = os.getenv("TELEGRAM_ENABLED", "false").lower() == "true"
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
WEBPUSH_ENABLED = os.getenv("WEBPUSH_ENABLED", "true").lower() == "true"
VAPID_CONTACT = os.getenv("VAPID_CONTACT", "mailto:noweartykuly@gmail.com")

# ── Województwa ───────────────────────────────────────────────────────────────
VOIVODESHIPS = [
    "lubelskie", "podkarpackie", "podlaskie", "mazowieckie", "świętokrzyskie",
    "małopolskie", "warmińsko-mazurskie", "łódzkie", "śląskie", "kujawsko-pomorskie",
    "pomorskie", "zachodniopomorskie", "lubuskie", "wielkopolskie", "dolnośląskie",
    "opolskie",
]
PRIORITY_VOIVODESHIPS = ["lubelskie", "podkarpackie", "podlaskie", "warmińsko-mazurskie"]

# obwody UA graniczące z PL -> województwa, których dotyczy tamtejszy alarm
UA_BORDER_OBLASTS = {
    "Волинська": ["lubelskie"],
    "Львівська": ["lubelskie", "podkarpackie"],
    "Закарпатська": ["podkarpackie"],
    "Рівненська": ["lubelskie"],
}

# Klasyfikacja nagłówków (patrz textmatch.py): CRITICAL wystarcza samo,
# w przeciwnym razie potrzebny OBIEKT powietrzny + ZDARZENIE.
ALERT_CRITICAL_KEYWORDS = [
    "alarm powietrzny", "zagrożenie z powietrza", "zawyły syreny", "zawyła syrena",
    "naruszenie przestrzeni powietrznej", "naruszyła przestrzeń powietrzną",
    "naruszył przestrzeń powietrzną", "obiekt powietrzny spadł",
    "niezidentyfikowany obiekt", "zestrzelono dron", "zestrzelono rakiet",
    "poderwano myśliwce", "poderwano lotnictwo", "schrony otwarte",
]
# obiekt, który może zagrażać z powietrza
ALERT_AIR_KEYWORDS = [
    "dron", "bezzałogow", "bsp", "shahed", "geran", "rakiet", "pocisk",
    "ch-101", "kalibr", "iskander", "kab", "bomb", "myśliwc", "mig-31",
    "obiekt powietrzny", "przestrzeni powietrznej", "przestrzeń powietrzną",
    "obrona powietrzna", "obiekt latając",
]
# zdarzenie związane z tym obiektem
ALERT_EVENT_KEYWORDS = [
    "spadł", "spadła", "spadło", "eksploz", "wybuch", "zestrzel", "przechwyc",
    "poderwan", "naruszen", "naruszył", "naruszyła", "wleciał", "wtargn",
    "uderzy", "trafił", "szczątki", "atak", "ostrzał", "zawył", "alarm",
    "ewakuac", "schron", "zagrożeni",
]
# weto — konteksty, w których powyższe słowa nie oznaczają zagrożenia
EXCLUDE_KEYWORDS = [
    # ćwiczenia i testy
    "ćwiczeni", "trening", "test syren", "próba syren", "próby syren",
    "głośna próba", "rocznic", "upamiętni", "minuta ciszy",
    # inwestycje i administracja (stąd "wymiana 50 syren", "nowe syreny")
    "wymian", "modernizac", "przetarg", "inwestycj", "zakup", "montaż",
    "zamontow", "instalac", "rozbudow", "dofinansow", "dotacj", "planowan",
    "potrwa", "konserwac", "remont", "pojawią się", "powstan", "wdroż",
    "komunikat głosowy", "system ostrzegania będzie", "nowe syreny", "nowych syren",
    # zdarzenia niezwiązane z zagrożeniem z powietrza
    "pożar bloku", "pożar domu", "pożar mieszkania", "pożar lasu", "wypadek drogow",
    "kolizja", "lpr lądował", "śmigłowiec lpr", "utonię", "potrąc", "dachowa",
    "karambol", "zderzenie samochod",
]

VOIV_KEYWORDS = {
    "lubelskie": ["lubelski", "lublin", "chełm", "zamość", "zamoś", "biała podlask",
                  "hrubiesz", "włodaw", "terespol", "dorohusk", "świdnik", "puław", "kraśnik", "łęczn"],
    "podkarpackie": ["podkarpack", "rzeszów", "rzeszow", "przemyśl", "przemysl", "medyk",
                     "jarosław", "lubaczów", "sanok", "krosno", "mielec", "stalowa wol", "tarnobrzeg"],
    "podlaskie": ["podlask", "białystok", "bialystok", "suwałk", "suwalk", "augustów",
                  "sokółk", "kuźnic", "siemiatycz", "hajnówk", "bielsk podlask", "łomż"],
    "mazowieckie": ["mazowieck", "warszaw", "radom", "siedlc", "płock", "ostrołęk"],
    "warmińsko-mazurskie": ["warmińsko", "warminsko", "olsztyn", "elbląg", "ełk", "gołdap", "braniew"],
}

# ── Kanały RSS (per województwo) ─────────────────────────────────────────────
RSS_FEEDS = [
    # (url, województwo domyślne | None => wykryj po słowach kluczowych)
    ("https://www.lublin112.pl/feed/", "lubelskie"),
    ("https://radio.lublin.pl/feed/", "lubelskie"),
    ("https://www.dziennikwschodni.pl/rss", "lubelskie"),
    # nowiny24/poranny blokują boty (403) — Google News jako niezależny agregator regionalny
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podkarpackie&hl=pl&gl=PL&ceid=PL:pl", "podkarpackie"),
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podlaskie&hl=pl&gl=PL&ceid=PL:pl", "podlaskie"),
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20lubelskie&hl=pl&gl=PL&ceid=PL:pl", "lubelskie"),
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(warmi%C5%84sko-mazurskie%20OR%20mazurskie%20OR%20olsztyn)&hl=pl&gl=PL&ceid=PL:pl", "warmińsko-mazurskie"),
]

# ── Media bałtyckie (LT/LV/EE) — kontekst dla północno-wschodniej ściany ─────
# Incydent powietrzny u sąsiadów NATO nad Bałtykiem podnosi czujność dla
# podlaskiego i warmińsko-mazurskiego (kierunek Kaliningrad/Białoruś).
BALTIC_FEEDS = [
    ("https://news.err.ee/rss", "EE"),
    ("https://eng.lsm.lv/rss/", "LV"),
    ("https://www.delfi.lt/rss/feeds/daily.xml", "LT"),
]
BALTIC_TARGET_VOIVS = ["podlaskie", "warmińsko-mazurskie"]
BALTIC_CRITICAL_KEYWORDS = [
    "airspace violation", "violated airspace", "airspace was violated",
    "air raid", "airspace closed", "shot down a drone", "scrambled jets",
    "oro erdvės pažeid", "gaisa telpas pārkāp", "õhuruumi rikku",
]
BALTIC_AIR_KEYWORDS = [
    "airspace", "air space", "drone", "uav", "missile", "shahed", "air defence",
    "air defense", "oro erdv", "bepilot", "raket", "gaisa telp", "droon",
    "õhuruum", "military aircraft", "fighter jet", "jets",
]
BALTIC_EVENT_KEYWORDS = [
    "violat", "intercept", "shot down", "scrambl", "incursion", "crash", "fell",
    "explos", "struck", "entered", "closed", "alert", "debris",
]
BALTIC_EXCLUDE_KEYWORDS = ["exercise", "drill", "training", "anniversary",
                           "drone show", "festival", "pratyb", "mācīb", "õppus",
                           "delivery drone", "drone racing", "photo drone"]
