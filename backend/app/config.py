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
# ── Punktacja obiektów NEPTUN ────────────────────────────────────────────────
# Zamiast jednej stawki za „obiekt kursem na PL” liczymy iloczyn czynników,
# bo zagrożenie zależy od tego CO leci, ILE tego jest, JAK BLISKO jest i JAK
# PEWNA jest obserwacja. Model skalibrowano na żywych danych NEPTUN i sprawdzono
# na udokumentowanych zdarzeniach: masowe naruszenie granicy i rakieta tuż przy
# granicy przekraczają próg alarmu, a rutynowy nalot na zachodnią Ukrainę —
# który zdarza się regularnie i Polsce nie zagraża — pozostaje poniżej progu.
#
#   punkty = waga_typu × √liczba × k_odległości × k_wiarygodności
#            × k_potwierdzeń × k_cyklu_życia
NEPTUN_TYPE_WEIGHTS = {
    "ballistic": 3.0,   # kilka minut lotu — brak czasu na reakcję
    "mig31k":    2.6,   # nosiciel Kindżałów, sam start bywa zapowiedzią
    "cruise":    2.4,   # Kalibr / Ch-101
    "missile":   2.4,
    "kab":       1.8,   # bomba kierowana: krótki zasięg, ale groźna przy granicy
    "shahed":    1.4,   # wolny, nadlatuje masowo
    "uav":       1.1,
    "recon":     0.5,   # rozpoznanie samo nie atakuje, ale poprzedza uderzenie
    "fpv":       0.0,   # zasięg kilkunastu km — dla Polski nieistotny
}
# progi odległości od granicy PL (km) → mnożnik
NEPTUN_DIST_BANDS = ((30, 1.6), (60, 1.3), (100, 1.0), (150, 0.55), (250, 0.25))
NEPTUN_MAX_KM = 250.0              # dalej nie punktujemy: przy tej odległości kurs
                                   # jeszcze nic nie przesądza (obiekt może skręcić)
NEPTUN_CONF_MULT = {"high": 1.0, "medium": 0.6, "low": 0.35}
NEPTUN_LIFECYCLE_MULT = {"confirmed": 1.1, "uncertain": 0.85, "created": 0.7}
# liczba niezależnych zgłoszeń (sourceCount) → mnożnik; jedno zgłoszenie to
# jeszcze nie potwierdzenie, stąd kara poniżej 1.0
NEPTUN_SOURCE_MULT = ((1, 0.7), (2, 0.9), (4, 1.1))
NEPTUN_SOURCE_MULT_MAX = 1.25
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
    "media_keywords": 1.5,     # <próg (2): samotny artykuł NIE alarmuje; dopiero
                               # korroboracja (2. medium → cap 2, albo inna klasa
                               # źródła) przekracza próg. Domyka fałszywe alerty
                               # z pojedynczego/retrospektywnego artykułu.
    "rcb_alert": 2.0,          # RCB (oficjalny) nadal może alarmować sam
    "ua_alert_border": 1.0,    # oficjalny alarm powietrzny w przygranicznym obwodzie UA
    "baltic_context": 1.0,     # incydent powietrzny wg mediów LT/LV/EE
}

# Maksymalny wkład punktowy JEDNEJ klasy źródła do sumy województwa w oknie.
# Wiele artykułów o tym samym zdarzeniu ≠ kilka niezależnych potwierdzeń —
# fuzja ma mierzyć NIEZALEŻNE klasy wskaźników. Neptun bez limitu (każdy track
# to osobny fizyczny obiekt). Wszystkie sygnały i tak są widoczne w UI.
# Neptun ma limit wyższy niż pozostałe źródła, bo każdy track to osobny fizyczny
# obiekt — ale nie nieograniczony: przy kilkudziesięciu obiektach suma i tak dawno
# przekroczyła próg alarmu, a trzycyfrowa punktacja tylko psułaby czytelność skali.
SOURCE_CAPS = {"media": 2.0, "rcb": 2.0, "adsb": 1.0, "pansa": 1.0, "neptun": 8.0}

# ── Propagacja na resztę kraju ────────────────────────────────────────────────
# Zdarzenie na wschodzie dotyczy też regionów dalej na zachód (obiekt leci
# dalej, alarmy się rozszerzają). Jedna iteracja: województwo z sumą >= progu
# "uwagi" przelewa ułamek punktów na bezpośrednich sąsiadów. Bez rekurencji —
# system ma pozostać przewidywalny i wytłumaczalny.
SPILLOVER_FACTOR = 0.4
SPILLOVER_MIN_SOURCE_SCORE = 2.0
# Propagacja jest kaskadowa: każdy kolejny krąg sąsiedztwa dostaje SPILLOVER_FACTOR
# tego, co krąg poprzedni (0.4, 0.16, 0.064…), licząc po najkrótszej drodze od
# źródła. Dzięki temu zdarzenie na ścianie wschodniej daje wyraźny sygnał w
# centrum i słabszy — ale niezerowy — na zachodzie, zamiast urywać się na
# bezpośrednich sąsiadach. Wkłady poniżej progu odcinamy, żeby nie zaśmiecać
# panelu ułamkami bez znaczenia i żeby kaskada miała skończony zasięg.
SPILLOVER_MIN_CONTRIBUTION = 0.1
SPILLOVER_MAX_DEPTH = 5

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

# ── FCM (push do aplikacji Android; tematy per województwo) ────────────────────
# Serwer liczy fuzję raz i przy wzroście poziomu wysyła wiadomość na temat
# voiv_<slug województwa>. Aplikacja subskrybuje temat swojego regionu i dostaje
# push nawet przy zamkniętej aplikacji / w trybie Doze — bez usługi
# pierwszoplanowej, którą producenci ubijają. Klucz konta serwisowego (sekret)
# trzymamy poza repo, domyślnie w backend/data/ (jest w .gitignore).
FCM_ENABLED = os.getenv("FCM_ENABLED", "true").lower() == "true"
FCM_CREDENTIALS_PATH = os.getenv("FCM_CREDENTIALS_PATH",
                                 str(DATA_DIR / "fcm-service-account.json"))

# Endpoint /api/test-signal wstrzykuje sygnały do fuzji i wyzwala powiadomienia
# (w tym push do WSZYSTKICH subskrybentów tematu) — publiczny byłby wektorem
# nadużyć. Domyślnie WYŁĄCZONY; do testów ustaw TEST_SIGNAL_ENABLED=true w .env.
TEST_SIGNAL_ENABLED = os.getenv("TEST_SIGNAL_ENABLED", "false").lower() == "true"

# Nazwy tematów FCM muszą być ASCII ([a-zA-Z0-9-_.~%]), a województwa mają polskie
# znaki — mapujemy je na ASCII. Ten sam slug liczy natywna strona aplikacji
# (BackgroundPlugin.voivTopic), więc obie strony muszą się zgadzać.
_PL_ASCII = str.maketrans("ąćęłńóśźż", "acelnoszz")
def voiv_topic(voiv: str) -> str:
    return "voiv_" + voiv.translate(_PL_ASCII)

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
    # jednoznaczne zamknięcie przestrzeni / reakcja obronna
    "zamknięto przestrzeń powietrzn", "zamknięcie przestrzeni powietrzn",
    "zamknięta przestrzeń powietrzn", "operacja obrony powietrzn",
    "operację obrony powietrzn", "operacji obrony powietrzn",
    "poderwano f-16", "poderwano f-35", "poderwano samoloty",
]
# obiekt, który może zagrażać z powietrza
ALERT_AIR_KEYWORDS = [
    "dron", "bezzałogow", "bsp", "shahed", "geran", "rakiet", "pocisk",
    "ch-101", "kalibr", "iskander", "kab", "bomb", "myśliwc", "mig-31",
    "obiekt powietrzny", "przestrzeni powietrznej", "przestrzeń powietrzną",
    "obrona powietrzna", "obiekt latając",
    # nowoczesny słownik zagrożeń (amunicja krążąca, pociski, obce lotnictwo)
    "lancet", "kindżał", "kinżał", "kh-101", "kh-47", "kh-59",
    "amunicja krążąc", "fpv", "kamikadze", "statek powietrzny",
    "pocisk manewrując", "pocisk balistyczn", "hipersoniczn",
    "f-16", "f-35", "su-24", "su-34", "su-35", "tu-95", "tu-160", "mig-29",
    "lotnictwo wojskow",
]
# zdarzenie związane z tym obiektem
ALERT_EVENT_KEYWORDS = [
    "spadł", "spadła", "spadło", "eksploz", "wybuch", "zestrzel", "przechwyc",
    "poderwan", "naruszen", "naruszył", "naruszyła", "wleciał", "wtargn",
    "uderzy", "trafił", "szczątki", "atak", "ostrzał", "zawył", "alarm",
    "ewakuac", "schron", "zagrożeni",
    "przekrocz", "wtargnięci", "detonac", "runął", "runęła", "runęło",
    "zestrzelen", "przechwycen",
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
    # RETROSPEKTYWA: świeży artykuł o DAWNYM zdarzeniu (pubDate nie łapie, bo
    # data publikacji jest bieżąca, a zdarzenie sprzed dni/tygodni)
    "tydzień po", "tygodnie po", "tygodni po", "dzień po", "dni po",
    "miesiąc po", "miesiące po", "miesięcy po", "rok po", "lata po", "lat po",
    "godzin po", "godziny po", "kalendarium", "przypominamy", "wspomina",
    # publicystyka / analiza / reportaż (nie meldunek o zdarzeniu na żywo)
    "kulisy", "reportaż", "felieton", "czy na pewno", "co wiemy", "jak doszło",
    "śledztwo w sprawie", "podsumowanie roku",
    # kultura / fikcja / rozrywka („rakieta/dron/atak/bomba" w tytule dzieła)
    "film fabularn", "film dokumentaln", "serial", "premiera", "recenzja",
    "zwiastun", "gra wideo", "gry wideo", "powieść", "komiks", "cosplay", "spektakl",
    # historia (II wojna, rocznice, daty)
    "1939", "1944", "1945", "ii wojn", "powstanie warszawsk",
    # kosmos / nauka (rakieta = start rakiety nośnej, nie zagrożenie)
    "rakieta kosmiczn", "rakieta nośn", "start rakiety", "spacex", "falcon",
    "starship", "misja kosmiczn", "kosmodrom",
    # sport / potoczne „rakieta"
    "rakieta tenisow", "rakietka", "rakiety śnieżn",
    # metafory / nie-powietrzne
    "bomba atomow", "wybuchła afera",
    # drony cywilne / nagrania z drona (dron + zdarzenie, ale nie zagrożenie)
    "pokaz dron", "dron rolnicz", "dron dostawcz", "wyścig dron",
    "nagranie z drona", "zdjęcia z drona", "zdjęcie z drona", "widok z drona",
]

# Kolejność ma znaczenie: dopasowanie kończy się na pierwszym trafieniu, więc
# nazwy zawierające się w innych (pomorskie ⊂ kujawsko-pomorskie, zachodnio-)
# muszą być sprawdzane po tych bardziej szczegółowych. Świadomie pomijamy nazwy
# kolidujące ze słowami pospolitymi ("piła", "żary", "hel", "brzeg").
VOIV_KEYWORDS = {
    "lubelskie": ["lubelski", "lublin", "chełm", "zamość", "zamoś", "biała podlask",
                  "hrubiesz", "włodaw", "terespol", "dorohusk", "świdnik", "puław", "kraśnik", "łęczn"],
    "podkarpackie": ["podkarpack", "rzeszów", "rzeszow", "przemyśl", "przemysl", "medyk",
                     "jarosław", "lubaczów", "sanok", "krosno", "mielec", "stalowa wol", "tarnobrzeg"],
    # Białystok odmienia się nieregularnie (Białymstoku, Białegostoku), więc
    # obok mianownika trzymamy rdzenie odmienionych form
    "podlaskie": ["podlask", "białystok", "bialystok", "białymstok", "białegostok",
                  "suwałk", "suwalk", "augustów", "sokółk", "kuźnic", "siemiatycz",
                  "hajnówk", "bielsk podlask", "łomż"],
    "mazowieckie": ["mazowieck", "warszaw", "radom", "siedlc", "płock", "ostrołęk",
                    "pruszków", "legionow", "otwock", "żyrardów", "ciechanów"],
    "warmińsko-mazurskie": ["warmińsko", "warminsko", "olsztyn", "elbląg", "ełk", "gołdap",
                            "braniew", "ostróda", "iława", "kętrzyn", "giżyck", "mrągow"],
    "świętokrzyskie": ["świętokrzysk", "swietokrzysk", "kielc", "ostrowiec świętokrzysk",
                       "starachowic", "skarżysk", "sandomierz", "końskie", "jędrzejów", "busko"],
    "małopolskie": ["małopolsk", "malopolsk", "kraków", "krakow", "tarnów", "nowy sącz",
                    "oświęcim", "zakopane", "chrzanów", "olkusz", "bochni", "wadowic"],
    "łódzkie": ["łódzk", "lodzk", "łódź", "piotrków trybunalsk", "pabianic", "bełchatów",
                "sieradz", "kutno", "zgierz", "radomsk", "tomaszów mazowieck",
                "tomaszowie mazowieck", "tomaszowa mazowieck", "skierniewic"],
    "śląskie": ["śląski", "slaski", "katowic", "częstochow", "gliwic", "sosnowiec", "zabrze",
                "bytom", "rybnik", "bielsko-biał", "tychy", "chorzów", "dąbrowa górnicz",
                "jastrzębie", "żywiec"],
    "kujawsko-pomorskie": ["kujawsko", "bydgoszcz", "toruń", "torun", "włocławek",
                           "grudziądz", "inowrocław", "brodnic", "świecie",
                           "chełmn", "chełmż"],
    "zachodniopomorskie": ["zachodniopomorsk", "szczecin", "koszalin", "kołobrzeg",
                           "świnoujści", "stargard", "police", "wałcz", "gryfin"],
    "pomorskie": ["woj. pomorsk", "pomorskiego", "gdańsk", "gdansk", "gdyni", "sopot",
                  "słupsk", "tczew", "malbork", "wejherow", "kaszub", "kwidzyn",
                  "starogard gdańsk", "chojnic", "lębork", "puck"],
    "lubuskie": ["lubusk", "zielona gór", "zielonej gór", "gorzów", "gorzow", "nowa sól",
                 "świebodzin", "międzyrzecz", "słubic", "sulechów"],
    "wielkopolskie": ["wielkopolsk", "poznań", "poznan", "kalisz", "konin", "leszno",
                      "gniezno", "ostrów wielkopolsk", "piła wielkopolsk", "swarzędz", "śrem"],
    "dolnośląskie": ["dolnośląsk", "dolnoslask", "wrocław", "wroclaw", "legnic", "wałbrzych",
                     "jelenia gór", "lubin", "głogów", "świdnic", "bolesławiec", "oleśnic"],
    "opolskie": ["opolsk", "opole", "opolu", "kędzierzyn", "nysa", "kluczbork", "prudnik",
                 "strzelce opolsk", "namysłów"],
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
    # Ogólnopolski nasłuch bez domyślnego regionu — województwo rozpoznaje
    # VOIV_KEYWORDS. Jedno zapytanie pokrywa pozostałe 12 województw, zamiast
    # dokładać po osobnym kanale na każde.
    ("https://news.google.com/rss/search?q=(%22alarm%20powietrzny%22%20OR%20%22zawy%C5%82y%20syreny%22%20OR%20%22naruszenie%20przestrzeni%20powietrznej%22%20OR%20%22zestrzelono%20dron%22)&hl=pl&gl=PL&ceid=PL:pl", None),
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
