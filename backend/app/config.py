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
#            × k_potwierdzeń × k_cyklu_życia × k_jakości_pozycji
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
# Krzywa odległości od granicy PL (km → mnożnik), interpolowana LINIOWO.
# Wcześniej były półki ((30,1.6),(60,1.3),(100,1.0),(150,0.55),(250,0.25)) i dawały
# dwa artefakty: obiekt 99 km miał ×1,0, a 101 km już ×0,55 (utrata połowy punktów
# przez przekroczenie okrągłej liczby), a cały przedział 30–59 km liczył się
# identycznie, więc dron 31 km od granicy ważył tyle co 59 km. Punkty kontrolne
# dobrane tak, by środki dawnych półek zostały w tym samym miejscu — kalibracja
# się nie przesuwa, znikają tylko skoki.
NEPTUN_DIST_CURVE = ((0, 1.7), (15, 1.6), (45, 1.3), (80, 1.0), (110, 0.7),
                     (150, 0.4), (200, 0.25), (250, 0.10))

# Podłoga dla obiektów CIĘŻKICH tuż przy granicy: rakieta manewrująca 30 km od
# granicy przy „średniej" wiarygodności i 2 potwierdzeniach wychodziła 1,43 pkt,
# czyli poniżej progu — mnożniki niepewności (0,6 × 0,9 × 0,85) ścinały ją o ponad
# połowę. Przy TAKIM obiekcie i TAKIM dystansie to za mało: gwarantujemy minimum
# progu żółtego, skalowane pewnością kursu (nieznany kurs = połowa podłogi).
NEPTUN_NEAR_FLOOR_KM = 60.0
NEPTUN_NEAR_FLOOR_TYPES = ("ballistic", "mig31k", "cruise", "missile")
NEPTUN_NEAR_FLOOR_SOURCES = 2      # min. liczba niezależnych zgłoszeń
NEPTUN_NEAR_FLOOR_POINTS = 2.0     # = THRESHOLD_ELEVATED

# Prędkości typowe klas obiektów (km/h) — do szacowania CZASU DOLOTU. NEPTUN nie
# podaje prędkości (sprawdzone na żywym API), więc czas liczymy z tej tablicy;
# gdy z kolejnych pozycji da się wyliczyć prędkość rzeczywistą, ma pierwszeństwo.
# Ta sama tablica jest w froncie (TYPE_SPEED_KMH) — musi się zgadzać, bo inaczej
# aplikacja pokazałaby inny czas niż ten w powiadomieniu.
NEPTUN_TYPE_SPEED_KMH = {"uav": 180, "shahed": 180, "fpv": 100, "missile": 800,
                         "cruise": 800, "ballistic": 3000, "kab": 900, "mig31k": 900,
                         "recon": 180}
NEPTUN_MAX_KM = 250.0              # dalej nie punktujemy: przy tej odległości kurs
                                   # jeszcze nic nie przesądza (obiekt może skręcić)
NEPTUN_CONF_MULT = {"high": 1.0, "medium": 0.6, "low": 0.35}
NEPTUN_LIFECYCLE_MULT = {"confirmed": 1.1, "uncertain": 0.85, "created": 0.7}
# liczba niezależnych zgłoszeń (sourceCount) → mnożnik; jedno zgłoszenie to
# jeszcze nie potwierdzenie, stąd kara poniżej 1.0
NEPTUN_SOURCE_MULT = ((1, 0.7), (2, 0.9), (4, 1.1))
NEPTUN_SOURCE_MULT_MAX = 1.25
# Punkt rejonowy nie może ważyć jak precyzyjny namiar. `source_approx` pochodzi
# wprost z API, a `locality_center` wykrywamy lokalnie, gdy współrzędne są
# kanonicznym punktem miejscowości. To nie zmienia danych źródłowych.
NEPTUN_POSITION_MULT = {"point": 1.0, "source_approx": 0.6,
                        "locality_center": 0.5}
NEPTUN_LOCALITY_ANCHOR_TOLERANCE_KM = 0.25
# Potwierdzony przypadek z 10–11.09.2026: kolejne ID miały dokładnie punkt
# katalogowy Łucka 50.7472,25.3254. Lista jest celowo audytowalna i nie udaje
# kompletnej bazy miast; nowe punkty dodajemy dopiero po potwierdzeniu w danych.
NEPTUN_LOCALITY_ANCHORS = (
    {"name": "Łuck", "lat": 50.7472, "lon": 25.3254,
     "aliases": ("Луцьк", "Луцк", "Łuck", "Lutsk")},
)
NEPTUN_HEADING_TOLERANCE = 50.0    # ± stopni od azymutu na najbliższy punkt granicy
# Twarde cięcie na 50° gubiło obiekty tuż za progiem (51° = 0 pkt), więc waga
# kursu spada LINIOWO od tolerancji do NEPTUN_HEADING_SOFT_DEG, dopiero potem 0.
NEPTUN_HEADING_SOFT_DEG = 70.0
# Obiekt BEZ pola heading (NEPTUN nie zawsze je podaje) był pomijany w ciszy —
# tak przepadła rakieta manewrująca 130 km od granicy. Teraz liczy się z karą
# i tylko blisko granicy: nieznany kurs to niepewność, nie dowód bezpieczeństwa.
NEPTUN_UNKNOWN_HEADING_MULT = 0.5
NEPTUN_UNKNOWN_HEADING_MAX_KM = 150.0
# Pomiar 27–30.08.2026: p90 opóźnienia źródła wyniósł ok. 125–135 s, a
# sporadyczne próbki 5–7 min. Czas pokazywany użytkownikowi i progi alarmowe
# pomniejszamy o 2,5 min, żeby nie obiecywać zapasu, który mógł już upłynąć.
NEPTUN_ETA_BUFFER_MIN = 2.5
NEPTUN_ETA_ELEVATED_MIN = 10.0
NEPTUN_ETA_HIGH_MIN = 5.0
NEPTUN_ETA_MIN_SOURCES = 2
NEPTUN_ETA_CONFIDENCE = ("medium", "high")
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
OFFICIAL_ALERTS_INTERVAL = int(os.getenv("OFFICIAL_ALERTS_INTERVAL", "30"))
RCB_INTERVAL = int(os.getenv("RCB_INTERVAL", "120"))
RCB_URL = "https://www.gov.pl/web/rcb"
# RSO (Regionalny System Ostrzegania) przez TVP — realne alerty RCB/SPO (SMS-owe
# broadcasty), których scraping gov.pl nie łapie. Publiczne JSON bez tokenu.
RSO_URL = os.getenv("RSO_URL",
                    "https://komunikaty.tvp.pl/komunikatyxml/wszystkie/wszystkie/1?_format=json")
RSO_INTERVAL = int(os.getenv("RSO_INTERVAL", "60"))   # alerty są czasokrytyczne

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
    "pansa_zone": 0.5,
    # Północ (patrz NORTH_VOIVODESHIPS): ta sama strefa waży dwa razy tyle, bo
    # nie ma tam warstwy wyprzedzającej z NEPTUN-a. Nadal NIE domyka alarmu sama
    # (próg żółty 2,0) — musi spotkać się z drugim, niezależnym źródłem.
    "pansa_zone_north": 1.0,
    "media_keywords": 1.0,     # OBIEKT+ZDARZENIE: sygnał pomocniczy wymagający
                               # potwierdzenia przez inną klasę źródła.
    "media_critical": 1.5,     # Jednoznaczna relacja operacyjna jest silniejsza,
                               # ale nadal nie uruchamia żółtego wyłącznie z RSS.
    "rcb_alert": 2.0,          # RCB (oficjalny) nadal może alarmować sam
    "ua_alert_border": 1.0,    # oficjalny alarm powietrzny w przygranicznym obwodzie UA
    "baltic_context": 1.0,     # incydent powietrzny wg mediów LT/LV/EE
    "neighbour_zone": 0.3,     # zamknięcie przestrzeni u sąsiada (RO/EE/LT/LV) —
                               # sygnał POŚREDNI, niski: media 1,5 + sąsiad 0,3 = 1,8
                               # < próg 2,0, więc sam nie domyka alarmu ("bez flaszu")
}

# Maksymalny wkład punktowy JEDNEJ klasy źródła do sumy województwa w oknie.
# Wiele artykułów o tym samym zdarzeniu ≠ kilka niezależnych potwierdzeń —
# fuzja ma mierzyć NIEZALEŻNE klasy wskaźników. Neptun bez limitu (każdy track
# to osobny fizyczny obiekt). Wszystkie sygnały i tak są widoczne w UI.
# Neptun ma limit wyższy niż pozostałe źródła, bo każdy track to osobny fizyczny
# obiekt — ale nie nieograniczony: przy kilkudziesięciu obiektach suma i tak dawno
# przekroczyła próg alarmu, a trzycyfrowa punktacja tylko psułaby czytelność skali.
SOURCE_CAPS = {"media": 1.5, "rcb": 2.0, "adsb": 1.0, "pansa": 1.0, "neptun": 8.0,
               "neighbours": 0.6,   # sąsiedzi: nawet kilka zamknięć = drobny wkład
               # Alarmy obwodowe UA to JEDNA informacja („na zachodniej Ukrainie
               # trwa alarm"), nie kilka niezależnych potwierdzeń — inaczej Wołyń
               # + Lwów + Równe dawały 3,0 pkt i żółty bez żadnego obiektu.
               "ua_alert": 1.0}

# ── Propagacja na resztę kraju ────────────────────────────────────────────────
# Zdarzenie na wschodzie dotyczy też regionów dalej na zachód (obiekt leci
# dalej, alarmy się rozszerzają). Do podstawy propagacji nie wchodzą regionalne
# Alerty RCB/RSO: urząd już wskazał ich obszar, a ten sam komunikat bywa wydany
# osobno dla kilku województw. Pozostały wynik >= progu "uwagi" przelewa ułamek
# punktów na sąsiadów.
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

# Produkcyjna obserwacja kandydatów 1,5 oraz progresji 2,5 / 3,0 / 3,5. Ten tryb nie ma
# żadnego połączenia z kanałami powiadomień: zapisuje wyłącznie próbki i decyzje
# do SQLite/logów, żeby przed osobną zgodą ocenić reguły na prawdziwych danych.
ESCALATION_SHADOW_ENABLED = os.getenv("ESCALATION_SHADOW_ENABLED", "true").lower() == "true"

# Audyt referencyjny oficjalnych alertów RCB/RSO. Zachowuje 30 minut danych
# sprzed pierwszego wykrycia, ale nie zmienia punktacji ani powiadomień.
RCB_REFERENCE_AUDIT_ENABLED = os.getenv("RCB_REFERENCE_AUDIT_ENABLED", "true").lower() == "true"

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

# ── północ: Pomorze, Kaliningrad, Bałtyk ────────────────────────────────────
# Tu nie ma NEPTUN-a (pokrywa Ukrainę), więc jedyne sygnały wyprzedzające to
# strefy PAŻP, ruch ADS-B, media bałtyckie i zamknięcia u sąsiadów. Dlatego
# strefa PAŻP punktuje także tutaj, a nie tylko na ścianie wschodniej.
NORTH_VOIVODESHIPS = ["zachodniopomorskie", "pomorskie", "warmińsko-mazurskie",
                      "kujawsko-pomorskie"]

# Obwody UA, w których alarm powietrzny jest sygnałem dla polskich województw,
# wraz z NAJKRÓTSZĄ odległością wielokąta obwodu od wielokąta województwa (km).
#
# Do 1.7.25 była tu płaska lista „obwody graniczące", w której obwód rówieński i
# żytomierski dostawały tyle samo punktów co wołyński i miały w tytule nieprawdziwe
# „graniczy z woj. lubelskie" — żaden z nich nie ma z Polską wspólnej granicy
# (zgłoszone 12.09.2026). Teraz waga spada z odległością, a tytuł podaje dystans.
#
# Liczby pochodzą z geometrii ADM1 geoBoundaries (gbOpen), policzone
# `py scripts/ua_oblast_rings.py`; zaokrąglone do 5 km, bo granice z dwóch źródeł
# nie leżą idealnie na sobie. Polska graniczy TYLKO z obwodem wołyńskim, lwowskim
# i (krótkim odcinkiem w Bieszczadach) zakarpackim.
UA_ALERT_OBLASTS = {
    "Львівська":         {"lubelskie": 0,   "podkarpackie": 0},
    "Волинська":         {"lubelskie": 0,   "podkarpackie": 55},
    "Закарпатська":      {"lubelskie": 135, "podkarpackie": 0},
    "Івано-Франківська": {"lubelskie": 100, "podkarpackie": 50},
    "Рівненська":        {"lubelskie": 70,  "podkarpackie": 110},
    "Тернопільська":     {"lubelskie": 100, "podkarpackie": 115},
    "Хмельницька":       {"lubelskie": 160, "podkarpackie": 190},
    "Чернівецька":       {"lubelskie": 225, "podkarpackie": 180},
    # Żytomierski nie graniczy z Polską, ale to stamtąd (przez Białoruś) szły
    # drony 10.09.2026 — alarm w tym obwodzie jest wskaźnikiem wyprzedzającym.
    "Житомирська":       {"lubelskie": 220, "podkarpackie": 265},
    "Вінницька":         {"lubelskie": 280, "podkarpackie": 305},
}

# Pasy odległości: (do ilu km, mnożnik punktów). Alarm tuż za granicą znaczy dla
# nas więcej niż alarm 300 km w głąb Ukrainy, a limit klasy (SOURCE_CAPS) i tak
# nie pozwoli, by suma alarmów zastąpiła obiekt na mapie.
UA_ALERT_RINGS = ((0, 1.0), (120, 0.6), (220, 0.35), (320, 0.2))


def ua_alert_weight(distance_km: float) -> float:
    """Mnożnik punktów dla alarmu w obwodzie oddalonym o `distance_km`."""
    for limit, weight in UA_ALERT_RINGS:
        if distance_km <= limit:
            return weight
    return 0.0


# Nazwa obwodu w tytule sygnału po polsku — użytkownik nie ma czytać cyrylicy
# w polskim interfejsie (zgłoszone 12.09.2026).
UA_OBLAST_PL = {
    "Волинська": "wołyńskim",
    "Львівська": "lwowskim",
    "Закарпатська": "zakarpackim",
    "Рівненська": "rówieńskim",
    "Житомирська": "żytomierskim",
    "Тернопільська": "tarnopolskim",
    "Івано-Франківська": "iwanofrankowskim",
    "Хмельницька": "chmielnickim",
    "Чернівецька": "czerniowieckim",
    "Вінницька": "winnickim",
}

# Klasyfikacja RSS (patrz textmatch.py) ma trzy rozłączne wyniki:
#   0 pkt  — ćwiczenia, administracja, publicystyka, historia i następstwa prawne;
#   1,0 pkt — obiekt powietrzny + zdarzenie, wymagające innej klasy źródła;
#   1,5 pkt — jednoznaczna bieżąca reakcja operacyjna, nadal bez alarmu sama.
# Sama fraza „naruszenie przestrzeni powietrznej” jest niejednoznaczna czasowo:
# opisuje zarówno zdarzenie bieżące, jak i zarzuty za dawny lot. Dlatego należy
# do AIR+EVENT (1,0), a nie do silniejszej klasy CRITICAL.
ALERT_CRITICAL_KEYWORDS = [
    "alarm powietrzny", "zagrożenie z powietrza", "zawyły syreny", "zawyła syrena",
    "obiekt powietrzny spadł", "niezidentyfikowany obiekt spadł",
    "zestrzelono dron", "zestrzelono rakiet",
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

# Materiał o postępowaniu po zdarzeniu nie jest meldunkiem operacyjnym. Te
# sformułowania mają pierwszeństwo przed AIR/EVENT i CRITICAL. Nie stosujemy
# ogólnych słów „prokuratura” ani „policja”, bo instytucja może również jako
# pierwsza potwierdzić aktualny upadek obiektu.
# Alarm bombowy w szkole czy urzędzie przechodził bramkę OBIEKT+ZDARZENIE
# („alarm" + „ewakuowano") i punktował jak zagrożenie z powietrza. Frazy MUSZĄ
# być pełne — sam rdzeń „bombow" wyciąłby też „bombowiec".
BOMB_HOAX_KEYWORDS = [
    "alarm bombowy", "alarmy bombowe", "alarmu bombowego", "alarmów bombowych",
    "alarmie bombowym", "alarmem bombowym", "alarmów bombowych",
    "o podłożeniu ładunku", "podłożeniu bomby", "informacja o bombie",
]

# Kanał regionalny (zapytanie Google News) ma domyślne województwo dla artykułów,
# które nie nazywają miejsca wprost. Ale te kanały niosą też sporo depesz
# zagranicznych — „Kolejne drony spadły w Rumunii i Bułgarii" z Radia Szczecin
# dostawało domyślne zachodniopomorskie. Gdy tekst mówi o zagranicy, a żadne
# polskie hasło nie padło, domyślnego regionu NIE używamy.
# Formy przyimkowe, nie przymiotniki: „rosyjski dron nad Polską" ma zostać.
FOREIGN_PLACE_MARKERS = [
    "w rumunii", "nad rumunią", "do rumunii", "rumunia:", "rumunii",
    "w bułgarii", "nad bułgarią", "bułgarii",
    "w mołdawii", "nad mołdawią", "mołdawii",
    "na łotwie", "nad łotwą", "łotwy",
    "na litwie", "nad litwą", "litwy",
    "w estonii", "nad estonią", "estonii",
    "w finlandii", "nad finlandią", "finlandii",
    "na ukrainie", "nad ukrainą", "ukrainy", "charkow", "charków", "kijow", "kijów",
    "na białorusi", "białorusi", "w rosji", "rosji", "obwodzie kaliningradzkim",
    "w niemczech", "niemiec", "w czechach", "czech", "na słowacji", "słowacji",
    "na węgrzech", "węgier", "w danii", "danii", "w norwegii", "norwegii",
    "w szwecji", "szwecji", "w iranie", "iranu", "w izraelu", "izraela",
]

MEDIA_NONCURRENT_KEYWORDS = [
    # Syreny na uroczystości i alarmy próbne. „Wybiła godzina W. Warszawa
    # stanęła, w mieście zawyły syreny" przechodziło bramkę i dawało
    # mazowieckiemu 1,0 pkt (pomiar 12.09.2026).
    "wybiła godzina", 'godzina "w"', 'godzinie "w"', 'godziny "w"',
    "oddali hołd", "oddał hołd", "oddano hołd", "hołd bohaterom", "hołd powstańcom",
    "uroczystoś", "próbny alarm", "alarm próbny", "próbnego alarmu",
    "próba syren alarmowych", "ogólnopolskie ćwiczenia",

    "są zarzuty", "usłyszał zarzut", "usłyszała zarzut", "usłyszeli zarzuty",
    "postawiono zarzut", "postawiono zarzuty", "zarzuty dla",
    "akt oskarżenia", "odpowie przed sądem", "stanął przed sądem",
    "stanęła przed sądem", "skazany za", "skazana za",
    "do zdarzenia miało dojść",
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
    # pożary/wybuchy naziemne: w teście „pożar ciężarówki, wybuch paliwa”
    # został błędnie połączony z fragmentem „kab” ukrytym w zwykłym słowie
    "pożar ciężarów", "pożar samochod", "pożar autobusu", "pożar cystern",
    "zapaliła się ciężarów", "zapalił się samoch", "zbiornik paliw", "wyciek paliw",
    # demografia/statystyka — skrót BSP pojawiał się jako fragment dłuższego słowa
    "demograf", "przyrost naturaln", "liczba mieszkańc", "wyludnia",
    # RETROSPEKTYWA: świeży artykuł o DAWNYM zdarzeniu (pubDate nie łapie, bo
    # data publikacji jest bieżąca, a zdarzenie sprzed dni/tygodni)
    "tydzień po", "tygodnie po", "tygodni po", "dzień po", "dni po",
    "miesiąc po", "miesiące po", "miesięcy po", "rok po", "lata po", "lat po",
    "rok temu", "lata temu", "lat temu", "ubiegłym roku", "ubiegłego roku",
    "godzin po", "godziny po", "kalendarium", "przypominamy", "wspomina",
    # publicystyka / analiza / reportaż (nie meldunek o zdarzeniu na żywo)
    "kulisy", "reportaż", "felieton", "czy na pewno", "co wiemy", "jak doszło",
    "śledztwo w sprawie", "śledztwo ws", "podsumowanie roku",
    # pytania hipotetyczne i poradniki, a nie meldunki o trwającym zdarzeniu
    "zawyły syreny?", "zawyła syrena?", "alarm powietrzny?",
    "co powinieneś zrobić", "co należy zrobić", "jak się zachować w razie",
    "co robić w razie", "co zrobić w razie", "poradnik bezpieczeństwa",
    "poznaj sygnały alarmowe", "co oznacza sygnał alarmowy",
    # kultura / fikcja / rozrywka („rakieta/dron/atak/bomba" w tytule dzieła)
    "film fabularn", "film dokumentaln", "serial", "premiera", "recenzja",
    "zwiastun", "gra wideo", "gry wideo", "powieść", "komiks", "cosplay", "spektakl",
    # historia (II wojna, rocznice, daty)
    "1939", "1944", "1945", "ii wojn", "powstanie warszawsk",
    # kosmos / nauka (rakieta = start rakiety nośnej, nie zagrożenie)
    "rakieta kosmiczn", "rakieta nośn", "start rakiety", "spacex", "falcon",
    "starship", "misja kosmiczn", "kosmodrom", "odbudow", "ma być gotow",
    # sport / potoczne „rakieta"
    "rakieta tenisow", "rakietka", "rakiety śnieżn",
    # metafory / nie-powietrzne
    "bomba atomow", "wybuchła afera",
    # drony cywilne / nagrania z drona (dron + zdarzenie, ale nie zagrożenie)
    "pokaz dron", "dron rolnicz", "dron dostawcz", "wyścig dron",
    "nagranie z drona", "zdjęcia z drona", "zdjęcie z drona", "widok z drona",
    # postępowania i następstwa prawne po wcześniejszym zdarzeniu
    *MEDIA_NONCURRENT_KEYWORDS,
    *BOMB_HOAX_KEYWORDS,
]

# Kolejność ma znaczenie: dopasowanie kończy się na pierwszym trafieniu, więc
# nazwy zawierające się w innych (pomorskie ⊂ kujawsko-pomorskie, zachodnio-)
# muszą być sprawdzane po tych bardziej szczegółowych. Świadomie pomijamy nazwy
# kolidujące ze słowami pospolitymi ("piła", "żary", "hel", "brzeg").
VOIV_KEYWORDS = {
    "dolnośląskie": [
        "dolnośląsk", "dolnoslask", "dolny śląsk", "dolnym śląsku", "dolnym śląskiem",
        "dolnego śląska", "dolnoślązak", "wrocław", "wroclaw", "legnic", "wałbrzych",
        "jelenia gór", "jeleniej gór", "lubin", "głogów", "świdnic", "bolesławiec", "oleśnic",
        "dzierżoniów", "zgorzelec", "polkowic", "kłodzk", "bielaw", "oława", "oławie",
        "brzeg dolny", "strzelin", "środa śląsk", "trzebnic", "złotoryj", "kamienna gór",
        "kamiennej gór", "lubań", "milicz", "syców", "chojnów", "karpacz", "szklarska poręb",
        "bogatyni", "zgorzelc"
    ],
    "kujawsko-pomorskie": [
        "kujawsko", "kujawach", "kujawy", "bydgoszcz", "toruń", "torun", "włocławek",
        "grudziądz", "inowrocław", "brodnic", "świeciu", "świecia", "świecie nad wisłą",
        "chełmn", "chełmż", "rypin", "lipno", "nakło", "żnin", "mogilno", "tuchol", "sępólno",
        "wąbrzeźno", "golub-dobrzyń", "aleksandrów kujawsk", "ciechocinek", "solec kujawsk",
        "kruszwic", "radziejów", "janikowo", "koronowo", "szubin"
    ],
    "lubelskie": [
        "lubelski", "lubelskie", "lubelskiem", "lubelszczy", "lublin", "chełm", "zamość",
        "zamoś", "hrubiesz", "włodaw", "terespol", "dorohusk", "świdnik", "puław", "kraśnik",
        "łęczn", "biała podlask", "białej podlask", "białą podlask", "bialskopodlask",
        "radzyń podlask", "radzyniu podlask", "radzynia podlask", "tomaszów lubelsk",
        "tomaszowie lubelsk", "janów lubelsk", "opole lubelsk", "opolu lubelsk", "biłgoraj",
        "lubartów", "łuków", "parczew", "dęblin", "krasnystaw", "krasnymstaw", "szczebrzeszyn",
        "józefów", "poniatowa", "bychawa", "rejowiec", "międzyrzec podlask", "kock", "annopol",
        "tarnawa-kolonia", "wyryki", "czosnówka"
    ],
    "lubuskie": [
        "lubusk", "zielona gór", "zielonej gór", "gorzów", "gorzow", "nowa sól", "nowej soli",
        "świebodzin", "międzyrzecz", "słubic", "sulechów", "żagań", "kostrzyn", "gubin",
        "krosno odrzańsk", "krośnie odrzańsk", "drezdenko", "strzelce krajeńsk", "wschowa",
        "szprotawa", "lubsko", "skwierzyna", "sulęcin", "rzepin", "dobiegniew", "witnica",
        "międzyrzeck"
    ],
    "łódzkie": [
        "łódzk", "lodzk", "łódź", "piotrków trybunalsk", "pabianic", "bełchatów", "sieradz",
        "kutno", "zgierz", "radomsk", "skierniewic", "tomaszów mazowieck",
        "tomaszowie mazowieck", "tomaszowa mazowieck", "tomaszowem mazowieck", "zduńska wol",
        "zduńskiej wol", "wieluń", "opoczno", "rawa mazowieck", "łowicz", "kolusz",
        "aleksandrów łódzk", "konstantynów łódzk", "ozorków", "głowno", "poddębic", "łęczyc",
        "pajęczno", "wieruszów", "warta k. sieradza"
    ],
    "małopolskie": [
        "małopolsk", "malopolsk", "małopolsce", "kraków", "krakow", "tarnów", "nowy sącz",
        "nowym sączu", "nowego sącza", "oświęcim", "zakopane", "chrzanów", "olkusz", "bochni",
        "wadowic", "nowy targ", "nowym targu", "gorlic", "brzesk", "andrychów", "skawina",
        "myślenic", "limanow", "trzebini", "libiąż", "wieliczk", "sucha beskidzk",
        "krynic-zdrój", "muszyn", "dąbrowa tarnowsk", "proszowic", "miechów", "wolbrom",
        "kęty", "niepołomic", "bukowno", "szczawnic"
    ],
    "mazowieckie": [
        "mazowieck", "mazowsz", "warszaw", "radom", "siedlc", "płock", "ostrołęk", "pruszków",
        "legionow", "otwock", "żyrardów", "ciechanów", "mińsk mazowieck",
        "nowy dwór mazowieck", "grodzisk mazowieck", "maków mazowieck", "ostrów mazowieck",
        "ostrowie mazowieck", "sokołów podlask", "sokołowie podlask", "sokołowa podlask",
        "mińsku mazowieck", "grodzisku mazowieck", "makowie mazowieck", "rawie mazowieck",
        "wołomin", "piaseczno", "sochaczew", "wyszków", "garwolin", "węgrów", "płońsk",
        "mława", "żuromin", "gostynin", "sierpc", "przasnysz", "pułtusk", "łosic", "grójec",
        "kozienic", "zwoleń", "lipsko", "szydłowiec", "białobrzeg", "sulejówek", "konstancin",
        "modlin", "sochaczewsk"
    ],
    "opolskie": [
        "opolsk", "opole", "opolu", "opolszczy", "kędzierzyn", "nysa", "nysie", "kluczbork",
        "prudnik", "strzelce opolsk", "namysłów", "krapkowic", "głubczyc", "olesno", "ozimek",
        "zdzieszowic", "praszka", "grodków", "niemodlin", "gogolin", "brzeg opolsk", "paczków",
        "biała prudnick"
    ],
    "podkarpackie": [
        "podkarpack", "podkarpaci", "rzeszów", "rzeszow", "przemyśl", "przemysl", "medyk",
        "jarosław", "lubaczów", "sanok", "krosno", "krośni", "mielec", "stalowa wol",
        "stalowej woli", "tarnobrzeg", "dębic", "jasło", "jaśle", "łańcut", "ropczyc",
        "sędziszów", "leżajsk", "przeworsk", "ustrzyk", "lesko", "brzozów", "strzyżów",
        "kolbuszow", "głogów małopolsk", "nowa dęba", "radymno", "korczowa", "budomierz",
        "krościenko", "bieszczad", "nisku", "jasionka", "arłamów"
    ],
    "podlaskie": [
        "podlask", "podlasi", "białystok", "bialystok", "białymstok", "białegostok", "suwałk",
        "suwalk", "augustów", "sokółk", "kuźnic", "siemiatycz", "hajnówk", "bielsk podlask",
        "bielsku podlask", "wysokie mazowieck", "wysokiem mazowieck", "łomż", "grajewo",
        "zambrów", "mońk", "kolno", "sejny", "dąbrowa białostock", "czarna białostock",
        "supraśl", "michałowo", "narewk", "białowież", "krynk", "czeremch", "siemianówk",
        "wasilków", "zabłudów", "kuźnica białostock", "połowce"
    ],
    "pomorskie": [
        "woj. pomorsk", "pomorskiego", "pomorzu", "pomorza", "pomorze", "kaszub", "gdańsk",
        "gdansk", "gdyni", "sopot", "słupsk", "tczew", "malbork", "wejherow", "kwidzyn",
        "starogard gdańsk", "chojnic", "lębork", "puck", "pruszcz gdańsk", "kościerzyn",
        "kartuz", "bytów", "człuchów", "sztum", "nowy dwór gdańsk", "ustk", "półwysep hel",
        "władysławow", "jastarni", "krynica morsk", "skarszew", "żukowo", "trójmiast"
    ],
    "śląskie": [
        "śląski", "slaski", "śląsku", "śląska", "śląsk", "katowic", "częstochow", "gliwic",
        "sosnowiec", "zabrze", "bytom", "rybnik", "bielsko-biał", "bielsku-biał", "tychy",
        "tychach", "chorzów", "dąbrowa górnicz", "jastrzębie", "żywiec", "ruda śląsk",
        "tarnowskie gór", "tarnowskich gór", "mysłowic", "siemianowic", "piekary śląsk",
        "świętochłowic", "zawiercie", "będzin", "racibórz", "wodzisław", "mikołów",
        "czechowic", "cieszyn", "pszczyn", "lubliniec", "myszków", "kłobuck", "knurów", "żory",
        "jaworzno", "bieruń", "radzionków", "orzesze", "pyrzowic"
    ],
    "świętokrzyskie": [
        "świętokrzysk", "swietokrzysk", "kielc", "kielecczy", "ostrowiec świętokrzysk",
        "starachowic", "skarżysk", "sandomierz", "końskie", "jędrzejów", "busko", "staszów",
        "opatów", "pińczów", "włoszczow", "kazimierza wielk", "chmielnik", "suchedniów",
        "morawic", "daleszyc", "bodzentyn", "połaniec", "ćmielów"
    ],
    "warmińsko-mazurskie": [
        "warmińsko", "warminsko", "warmii", "warmia", "mazurach", "mazurskiego", "olsztyn",
        "elbląg", "ełk", "gołdap", "braniew", "ostróda", "iława", "kętrzyn", "giżyck",
        "mrągow", "szczytno", "działdow", "bartoszyc", "lidzbark", "węgorzew", "olecko",
        "nidzic", "nowe miasto lubawsk", "morąg", "orneta", "dobre miasto", "biskupiec",
        "mikołajk", "bezledy", "grzechotki", "gronowo", "pieniężno", "pasłęk", "piszu"
    ],
    "wielkopolskie": [
        "wielkopolsk", "wielkopolsce", "poznań", "poznan", "kalisz", "konin", "leszno",
        "gniezno", "ostrów wielkopolsk", "piła wielkopolsk", "grodzisk wielkopolsk",
        "środa wielkopolsk", "swarzędz", "śrem", "luboń", "kościan", "wrześni", "jarocin",
        "krotoszyn", "słupc", "oborniki", "szamotuł", "wągrowiec", "chodzież", "czarnków",
        "złotów", "rawicz", "gostyń", "pleszew", "wolsztyn", "nowy tomyśl", "murowana goślin",
        "puszczykowo", "opalenic", "krzesiny"
    ],
    "zachodniopomorskie": [
        "zachodniopomorsk", "pomorze zachodnie", "pomorzu zachodnim", "pomorza zachodniego",
        "zachodnim pomorzu", "zachodniego pomorza", "szczecin", "koszalin", "kołobrzeg",
        "świnoujści", "stargard", "police", "wałcz", "gryfin", "białogard", "szczecinek",
        "goleniów", "gryfic", "kamień pomorsk", "nowogard", "choszczno", "drawsko pomorsk",
        "świdwin", "myślibórz", "dębno", "barlinek", "trzebiatów", "darłowo", "sławno",
        "złocieniec", "połczyn", "mielno", "międzyzdroj"
    ],
}

# ── Odwołanie zagrożenia w mediach polskich ─────────────────────────────────
# Artykuł mówiący, że jest PO wszystkim, przechodził bramkę OBIEKT+ZDARZENIE
# i punktował jak zapowiedź zagrożenia: komunikat „DORSZ: zakończono operowanie
# lotnictwa" dał 12.09.2026 pełne +1,0. Teraz taki tekst nie punktuje i wygasza
# wcześniejsze doniesienia medialne w tym samym województwie — dokładnie tak, jak
# od dawna działa to dla mediów bałtyckich (BALTIC_CLEAR_KEYWORDS).
# Weta MIĘKKIE: frazy, które nie przeczą zdarzeniu, tylko mówią, że artykuł jest
# jego omówieniem, poradnikiem albo relacją o skutkach. Gdy w tekście jest fraza
# KRYTYCZNA, takie weto obniża ją do zwykłej pary OBIEKT+ZDARZENIE (1,0 zamiast
# 1,5) zamiast kasować cały sygnał. Bez frazy krytycznej działa jak dotąd — blokuje.
# Reszta EXCLUDE_KEYWORDS zostaje TWARDA: ćwiczenia, rocznice, retrospektywy,
# fikcja, kosmos, sport i alarmy bombowe muszą kasować także frazę krytyczną,
# bo przy teście syren one naprawdę zawyły.
SOFT_EXCLUDE_KEYWORDS = [
    "co wiemy", "co należy zrobić", "co powinieneś zrobić", "co robić w razie",
    "co zrobić w razie", "jak się zachować w razie", "poradnik bezpieczeństwa",
    "poznaj sygnały alarmowe", "co oznacza sygnał alarmowy", "przypominamy",
    "potrwa", "jak doszło", "kulisy", "czy na pewno", "felieton", "reportaż",
]

MEDIA_CLEAR_KEYWORDS = [
    "odwołano alarm", "odwołanie alarmu", "alarm odwołany", "koniec alarmu",
    "zakończono operowanie", "zakończyło operowanie", "zakończone operowanie",
    "powróciły do standardowej", "wrócił do standardowej", "powrót do standardowej",
    "zagrożenie minęło", "zagrożenie minelo", "niebezpieczeństwo minęło",
    "zakończono działania", "zakończyły się działania", "zakończono operację",
    "przestrzeń powietrzna została otwarta", "wznowiono ruch lotniczy",
    "lotniska wznowiły", "lotnisko wznowiło", "odwołano ostrzeżenie",
    "ostrzeżenie odwołane", "alert odwołany", "alert rcb odwołany",
    "sytuacja wróciła do normy", "po zagrożeniu",
]

# ── Kanały RSS (per województwo) ─────────────────────────────────────────────
RSS_FEEDS = [
    # (url, województwo domyślne | None => wykryj po słowach kluczowych)
    #
    # DOMYŚLNY REGION MAJĄ TYLKO WŁASNE REDAKCJE LOKALNE. Zapytanie Google News to
    # agregator, nie źródło wiedzy o miejscu: pomiar z 12.09.2026 na żywych kanałach
    # pokazał, że domniemanie myli się częściej niż trafia — „Czosnówka. Pierwszy
    # dron odnaleziony" szło do podlaskiego (Czosnówka leży w lubelskim), a „Rumunia:
    # rosyjski dron spadł na blok" do zachodniopomorskiego (bo wydawcą było Radio
    # Szczecin). Kanały regionalne zostają — wyławiają artykuły, których ogólnopolskie
    # zapytanie nie widzi — ale województwo bierze się wyłącznie z treści.
    # Ma to znaczenie od 1.7.30: na północy media 1,0 + strefa PAŻP 1,0 = próg żółty.
    ("https://www.lublin112.pl/feed/", "lubelskie"),
    ("https://radio.lublin.pl/feed/", "lubelskie"),
    ("https://www.dziennikwschodni.pl/rss", "lubelskie"),
    # nowiny24/poranny blokują boty (403) — Google News jako niezależny agregator regionalny
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podkarpackie&hl=pl&gl=PL&ceid=PL:pl", None),
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podlaskie&hl=pl&gl=PL&ceid=PL:pl", None),
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20lubelskie&hl=pl&gl=PL&ceid=PL:pl", None),
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(warmi%C5%84sko-mazurskie%20OR%20mazurskie%20OR%20olsztyn)&hl=pl&gl=PL&ceid=PL:pl", None),
    # Północ dostała punktację PAŻP (NORTH_VOIVODESHIPS), więc musi mieć czym
    # ją sparować — bez własnego kanału strefa 1,0 stałaby samotnie pod progiem.
    # Te same słowa co dla ściany wschodniej: filtr OBIEKT+ZDARZENIE bez zmian.
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(pomorskie%20OR%20Gda%C5%84sk%20OR%20Gdynia%20OR%20S%C5%82upsk)&hl=pl&gl=PL&ceid=PL:pl", None),
    ("https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(zachodniopomorskie%20OR%20Szczecin%20OR%20Ko%C5%82obrzeg)&hl=pl&gl=PL&ceid=PL:pl", None),
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
# Incydent powietrzny nad Bałtykiem dotyczy całego wybrzeża, nie tylko flanki
# wschodniej. Waga maleje z odległością od miejsca zdarzenia: podlaskie,
# warmińsko-mazurskie i pomorskie w pełni, zachodniopomorskie o połowę słabiej
# (Estonia leży od niego ~900 km).
BALTIC_TARGET_WEIGHTS = {"podlaskie": 1.0, "warmińsko-mazurskie": 1.0,
                         "pomorskie": 1.0, "zachodniopomorskie": 0.5}
BALTIC_TARGET_VOIVS = list(BALTIC_TARGET_WEIGHTS)
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
# Komunikat kończący alarm nie jest kolejnym potwierdzeniem zagrożenia. Musi
# wyzerować odpowiadający mu aktywny kontekst (LSM/ERR często zmieniają tytuł
# i slug tego samego artykułu, zachowując jego numeryczny identyfikator).
BALTIC_CLEAR_KEYWORDS = [
    "alert over", "alert is over", "threat over", "threat is over",
    "warning over", "warning is over", "warning lifted", "alert lifted",
    "threat ended", "threat has ended", "danger has passed", "all clear",
    "no longer a threat", "cancelled", "canceled",
    # łotewski
    "apdraudējums noslēdzies", "apdraudējums beidzies", "brīdinājums atcelts",
    "draudi beigušies", "gaisa apdraudējums noslēdzies",
    # estoński
    "oht on möödas", "õhuoht on möödas", "ohu lõpp", "oht lõppenud",
    "ohuhoiatus tühistati", "ohuteade lõpetati",
    # litewski
    "pavojus baigėsi", "oro pavojus baigėsi", "perspėjimas atšauktas",
]
