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
# Katalog danych da się przestawić zmienną środowiskową — próbne uruchomienie
# (np. rozbicie na writera i readera) pracuje wtedy na KOPII bazy i nie dotyka
# produkcyjnej. Domyślnie bez zmian.
DATA_DIR = Path(os.getenv("STRAZNIK_DATA_DIR", str(BASE_DIR / "data")))
FRONTEND_DIR = PROJECT_DIR / "frontend"

load_dotenv(BASE_DIR / ".env")

# Paczki map Groty (ok. 2 GB) — poza katalogiem repozytorium, żeby `git clean`
# przy wdrożeniu ich nie skasował. Brak katalogu = Grota bez map offline.
GROTA_PACZKI_DIR = Path(os.getenv("STRAZNIK_GROTA_PACZKI",
                                  "/var/lib/straznik/grota-paczki"))
DB_PATH = DATA_DIR / "straznik.db"
VAPID_PATH = DATA_DIR / "vapid.json"

# Rola procesu (rozbicie z audytu Mikrusa, 20.09.2026):
#   "all"    — jak dotąd: jeden proces robi wszystko (domyślnie, produkcja),
#   "writer" — zbiera dane, liczy, zapisuje i WYSYŁA ALARMY; nie obsługuje ludzi,
#   "reader" — podaje gotowe bajty telefonom; nie liczy i nie alarmuje NIGDY.
# Powiadomienia wychodzą wyłącznie z writera — dwa procesy wysyłałyby je podwójnie.
ROLE = os.getenv("STRAZNIK_ROLE", "all").lower()
IS_WRITER = ROLE in ("all", "writer")
IS_READER = ROLE in ("all", "reader")
# Tryb próby: proces liczy i serwuje ze swojej kopii bazy, ale NIE odpytuje źródeł
# (nie dubluje ruchu produkcji pod limitami ADS-B) i NIE wysyła powiadomień
# (nikt nie dostanie alarmu z testowego procesu). Produkcja tego nie ustawia.
PROBA = os.getenv("STRAZNIK_PROBA", "") in ("1", "true", "yes")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8600"))

# ── Neptun ────────────────────────────────────────────────────────────────────
NEPTUN_BASE = "https://neptun.in.ua"
NEPTUN_WS_URL = "wss://neptun.in.ua/api/v1/stream"
NEPTUN_REST_URL = f"{NEPTUN_BASE}/api/v1/threats"
NEPTUN_REST_INTERVAL = 10          # s; REST tylko jako fallback gdy WS padnie
# Po tylu sekundach bez ramki na gnieździe pytamy REST, czy to cisza, czy zawieszenie.
# Mniej niż monitoring.NEPTUN_SILENCE_S (180 s), żeby spokojna noc nie dawała „down”.
NEPTUN_SILENCE_PROBE_S = 120
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
# Alarm ogólnokrajowy NEPTUN-a (np. start MiG-31K): id „national-mig31k”, region
# „Загальнодержавна загроза” i stały punkt w środku Ukrainy (49,0 / 31,2) bez
# kursu. To nie jest pozycja samolotu — pokazujemy komunikat, nie ikonę, i nie
# liczymy odległości. Zgłoszony obiekt z własnym trk_* i obwodem zostaje zwykłym
# obiektem. Lustro: engine.js NEPTUN_NATIONAL_*.
# Audyt G6: drony odrzutowe (Geran-3 / Shahed-238) — NEPTUN pisze w opisie
# „Реактивний БпЛА”. Przelot 300–370 km/h, na końcowym odcinku 550–600 km/h
# (wywiad UA). Decyzja usera 14.09.2026: 450 km/h do czasu dolotu i alarmu ETA,
# a przy prędkości zmierzonej z ruchu — max(zmierzona, 350). Lustro: engine.js.
NEPTUN_JET_MARKERS = ("реактивн",)
NEPTUN_JET_SPEED_KMH = 450.0
NEPTUN_JET_CRUISE_KMH = 350.0
NEPTUN_NATIONAL_ID_PREFIX = "national-"
NEPTUN_NATIONAL_REGION_MARKERS = ("загальнодержавн",)   # porównanie po lower()

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
# Rumunia i Białoruś w mediach (tryb cienia) — WYŁĄCZONE 22.09.2026: RO 4/19 trafień, ~2 h po RO-ALERT;
# BY 12 wpisów bez żadnej wczesnej informacji. Dane zostają w obserwacje.db.
RCB_INTERVAL = int(os.getenv("RCB_INTERVAL", "120"))
RCB_URL = "https://www.gov.pl/web/rcb"
# RSO (Regionalny System Ostrzegania) przez TVP — realne alerty RCB/SPO (SMS-owe
# broadcasty), których scraping gov.pl nie łapie. Publiczne JSON bez tokenu.
RSO_URL = os.getenv("RSO_URL",
                    "https://komunikaty.tvp.pl/komunikatyxml/wszystkie/wszystkie/1?_format=json")
RSO_INTERVAL = int(os.getenv("RSO_INTERVAL", "60"))   # alerty są czasokrytyczne
# Migawki mapy do historii 12 h (main.snapshot_loop). 120 s dawało widoczne skoki.
SNAPSHOT_INTERVAL_S = int(os.getenv("SNAPSHOT_INTERVAL_S", "60"))

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
    # E10 (audyt 11.09.2026, decyzja 13.09): w 41 dniach 27 skoków ruchu i same
    # rutynowe loty — informacja na mapie i w dzienniku, bez punktów. Północ nadal
    # domyka próg parą strefa + media / incydent bałtycki / fala QRA.
    "adsb_spike": 0.0,
    "pansa_zone": 0.5,
    # Północ (patrz NORTH_VOIVODESHIPS): ta sama strefa waży dwa razy tyle, bo
    # nie ma tam warstwy wyprzedzającej z NEPTUN-a. Nadal NIE domyka alarmu sama
    # (próg żółty 2,0) — musi spotkać się z drugim, niezależnym źródłem.
    "pansa_zone_north": 1.0,
    # Media czytamy dziś tylko z tytułu i zajawki, a z nagłówka nie da się
    # odróżnić nowego zdarzenia od relacji z poranka. 13.09.2026 artykuły
    # o porannych syrenach dawały 1,5 pkt godzinami później i razem z alarmami
    # obwodów UA domknęły fałszywy żółty dla lubelskiego (godz. 10.01). Dlatego
    # media są tylko potwierdzeniem (pół punktu albo punkt, limit klasy jeden
    # punkt). Na historii od 2 sierpnia żaden alert RCB ani RSO nie traci
    # powiadomienia.
    "media_keywords": 0.5,     # OBIEKT+ZDARZENIE: sygnał pomocniczy
    "media_critical": 1.0,     # jednoznaczna relacja operacyjna
    # fala QRA: kilka redakcji o poderwaniu lotnictwa (E3). 0 pkt od 22.09.2026 (decyzja
    # usera): 0 z 3 fal przed Alertem RCB (spóźnienie 10–81 min), a fale opisują sam
    # alert. Zostaje w panelu jako informacja i w dzienniku obserwacji.
    "media_qra_wave": 0.0,
    "rcb_alert": 2.0,          # RCB (oficjalny) nadal może alarmować sam
    "ua_alert_border": 1.0,    # oficjalny alarm powietrzny w przygranicznym obwodzie UA
    # Incydent powietrzny wg mediów LT/LV/EE. Było 1,0; decyzja usera 15.09.2026: media
    # sąsiadów 0,2–0,5 pkt, bo po alarmie w Wilnie komentarze dawały 1,0 pkt przez cały
    # dzień. Kilka dni obserwacji (stealth „baltic_media_decision”), potem korekta wag.
    "baltic_context": 0.5,
    # Ogłoszony alarm powietrzny na Litwie, Łotwie albo w Estonii (np. Wilno
    # 13.09.2026). Zdarzenie jest daleko, więc to ślad w panelu i dziesiąte części
    # punktu — mnożone jeszcze przez BALTIC_ALERT_COUNTRY_WEIGHTS i wagę celu.
    "baltic_alert": 0.3,
    "neighbour_zone": 0.3,     # zamknięcie przestrzeni u sąsiada (RO/EE/LT/LV) —
                               # sygnał POŚREDNI, niski: media 1,0 + sąsiad 0,3 = 1,3
                               # < próg 2,0, więc sam nie domyka alarmu ("bez flaszu")
}

# Maksymalny wkład punktowy JEDNEJ klasy źródła do sumy województwa w oknie.
# Wiele artykułów o tym samym zdarzeniu ≠ kilka niezależnych potwierdzeń —
# fuzja ma mierzyć NIEZALEŻNE klasy wskaźników. Neptun bez limitu (każdy track
# to osobny fizyczny obiekt). Wszystkie sygnały i tak są widoczne w UI.
# Neptun ma limit wyższy niż pozostałe źródła, bo każdy track to osobny fizyczny
# obiekt — ale nie nieograniczony: przy kilkudziesięciu obiektach suma i tak dawno
# przekroczyła próg alarmu, a trzycyfrowa punktacja tylko psułaby czytelność skali.
SOURCE_CAPS = {"media": 1.0, "rcb": 2.0, "adsb": 1.0, "pansa": 1.0, "neptun": 8.0,
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

# ── Kiedy BUDZIMY TELEFON (fusion.alert_level) ───────────────────────────────
# Kolor mapy liczy się z wyniku łącznego (własne + przeniesienie). Powiadomienie
# wymaga punktów własnych i przeniesienie może domknąć najwyżej jeden stopień
# ponad nie. Reguły sprawdzone 13.09.2026 na całej historii od 02.08: alerty RCB/RSO
# bez zmian, znikają powtórki i żółte zbudowane z tego samego zdarzenia liczonego
# dwa razy. Opis i przypadki: scripts/test_przeniesienia.py.
ALERT_OWN_MIN = 1.0              # min. punktów własnych, by przeniesienie mogło alarmować
# Powrót na ten sam poziom w ciągu tylu minut od powiadomienia tylko zmienia mapę,
# chyba że przyszedł NOWY alert RCB/RSO. Bez marginesu przy zejściu: poziom zawsze
# odpowiada bieżącym punktom. Margines 0,5 (13.09.2026 rano) trzymał lubelskie na
# żółtym przy 1,7 pkt, a wyjątek dla nowego obiektu NEPTUN przepuszczał powtórki
# co kilka minut w trakcie ataku. Na historii od 02.08: 36 powiadomień zamiast 37,
# każdy alert RCB/RSO nadal z powiadomieniem.
ALERT_REPEAT_QUIET_MIN = 60
# Podtrzymanie poziomu (mapa i powiadomienia) po ostatnim przekroczeniu progu —
# koniec migotania żółty/czerwony przy wyniku wahającym się wokół progu (16.09.2026).
# Czasowe, nie punktowe: po tylu minutach poziom znów odpowiada punktom. Odwołanie
# RCB/RSO zdejmuje je od razu (fusion.hold_level).
LEVEL_HOLD_MIN = 10

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
# E4 (audyt 11.09.2026): 7 wysyłek z testów poszło na prawdziwe tematy województw.
# Na prawdziwe tematy (voiv_*) wysyła WYŁĄCZNIE serwer z STRAZNIK_ENV=production;
# każdy inny (kopia na PC, serwer testowy) dostaje przedrostek test_. Brak tej
# zmiennej na VPS zgłasza /api/health/critical, więc nie przejdzie niezauważony.
STRAZNIK_ENV = os.getenv("STRAZNIK_ENV", "development").strip().lower()
PRODUCTION = STRAZNIK_ENV == "production"
TEST_TOPIC_PREFIX = "test_"
# D1: adres „sygnału życia” (np. Healthchecks.io). Serwer pinguje go co minutę
# tylko wtedy, gdy krytyczne źródła naprawdę działają. Sekret — tylko w .env.
HEALTHCHECK_PING_URL = os.getenv("HEALTHCHECK_PING_URL", "").strip()
NTFY_ENABLED = os.getenv("NTFY_ENABLED", "true").lower() == "true"
NTFY_SERVER = os.getenv("NTFY_SERVER", "https://ntfy.sh")
NTFY_TOPIC = os.getenv("NTFY_TOPIC", "")                 # ustaw własny, trudny do zgadnięcia
TELEGRAM_ENABLED = os.getenv("TELEGRAM_ENABLED", "false").lower() == "true"
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
WEBPUSH_ENABLED = os.getenv("WEBPUSH_ENABLED", "true").lower() == "true"
# Górny limit subskrypcji Web Push (16.09.2026: ~200 prawdziwych) — ochrona przed zalewem.
PUSH_SUBS_MAX = int(os.getenv("PUSH_SUBS_MAX", "20000"))
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
ESCALATION_SHADOW_ENABLED = os.getenv("ESCALATION_SHADOW_ENABLED", "false").lower() == "true"

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
# strefy PAŻP, media (w tym fala QRA), media bałtyckie i zamknięcia u sąsiadów. Dlatego
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

# Krzywa odległości (km, mnożnik punktów), interpolowana LINIOWO jak
# NEPTUN_DIST_CURVE. Do 13.09.2026 były półki ((0,1.0),(120,0.6),(220,0.35),
# (320,0.2)): obwód rówieński 70 km i tarnopolski 115 km ważyły tyle samo, a
# żytomierski 220 km — 0,35, czyli ponad jedną trzecią obwodu przygranicznego.
# Pojedynczy daleki alarm dawał więcej niż dron 190 km od granicy. Teraz waga
# spada płynnie i dalekie obwody ważą o połowę mniej; bliskie (50–70 km) prawie
# bez zmian. Sprawdzone na historii od 02.08: te same powiadomienia, żółte przed
# alertem RCB nie tracą wyprzedzenia (12.09 o 3 min, 13.09 bez zmian).
UA_ALERT_CURVE = ((0, 1.0), (50, 0.7), (100, 0.5), (150, 0.3), (220, 0.15), (320, 0.08))

# Czas trwania alarmu obwodu (decyzja 13.09.2026, wariant B2). NEPTUN przy każdej
# zmianie wysyła PEŁNĄ listę aktywnych rejonów z polem `since` (prawdziwy początek
# alarmu), a zaraz po połączeniu — listę bieżącą. Do tej pory liczyliśmy tylko
# początek: 10-minutowy alarm dawał pełne punkty przez 30 min i gasł po 60, a
# 3-godzinny znikał z punktów po godzinie, choć trwał.
#   * pierwsze FUSION_FULL_MIN minut od `since` — pełna waga,
#   * dalej, dopóki alarm trwa — UA_ALERT_LONG_FACTOR,
#   * koniec alarmu (obwód znika z listy na UA_ALERT_END_GRACE_S) — od razu 0.
# Bezpiecznik UA_ALERT_MAX_MIN: epizod bez odnotowanego końca nie liczy się dłużej.
UA_ALERT_LONG_FACTOR = 0.5
UA_ALERT_END_GRACE_S = 180
UA_ALERT_MAX_MIN = 12 * 60


def ua_alert_weight(distance_km: float) -> float:
    """Mnożnik punktów dla alarmu w obwodzie oddalonym o `distance_km`."""
    if distance_km > UA_ALERT_CURVE[-1][0]:
        return 0.0
    for (km_a, w_a), (km_b, w_b) in zip(UA_ALERT_CURVE, UA_ALERT_CURVE[1:]):
        if distance_km <= km_b:
            return w_a + (w_b - w_a) * (max(distance_km, km_a) - km_a) / (km_b - km_a)
    return UA_ALERT_CURVE[-1][1]


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
    # E3 (13.09.2026): strona czynna. 8.09 o 01:17 fala „Polska poderwała
    # myśliwce" szła 65 min przed alertem RCB (02:22), a lista znała tylko
    # „poderwano”. „Operuje lotnictwo” to formuła komunikatu DORSZ, „atakiem
    # z powietrza” — standardowa treść alertu RCB cytowana w nagłówkach.
    "poderwała myśliwce", "poderwała samoloty", "poderwała lotnictwo",
    "poderwało myśliwce", "poderwało samoloty", "poderwało lotnictwo",
    "poderwali myśliwce", "podrywa myśliwce", "podrywa samoloty", "podrywa lotnictwo",
    "wojsko poderwało", "operuje lotnictwo", "operuje polskie lotnictwo",
    "lotnictwo operuje", "rozpoczęło się operowanie", "rozpoczęło operowanie",
    "atakiem z powietrza",
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
    # E3: odmiany, których rdzenie wyżej nie łapały („eksplodował", „zaatakował")
    "poderwał", "poderwało", "poderwali", "podrywa", "eksplod", "zaatak", "uderza",
]

# E3: relacje, które same w sobie są słabym sygnałem (0,5), choć nie mają pary
# OBIEKT+ZDARZENIE: syreny w stronie czynnej, zgłoszenia wybuchów, wstrzymany
# ruch na lotnisku. Samo „syreny" dalej nie wystarcza — dlatego pełne frazy.
MEDIA_WEAK_PHRASES = [
    "syreny wyły", "rozległy się syreny", "usłyszeli syreny", "włączono syreny",
    "uruchomiono syreny", "zgłoszenia o wybuch", "zgłoszenia o huk",
    "wstrzymało operacje", "wstrzymano operacje", "wstrzymany ruch na lotnisku",
    "zamknięto część polskiego nieba", "lotnictwo w powietrzu", "myśliwce w powietrzu",
    "operowało lotnictwo",
]
# Nagłówek „alert RCB" jest słabym sygnałem tylko w kontekście powietrznym —
# RCB wysyła też alerty o wodzie, upałach i powodziach.
RCB_HEADLINE_WORDS = ["alert rcb", "alerty rcb", "alertu rcb", "rcb wydało alert",
                      "rcb wysłało alert"]
RCB_HEADLINE_CONTEXT = ["atak", "lotnictw", "obrony powietrznej", "myśliwc", "dron",
                        "rakiet", "z powietrza", "powietrzn"]

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

# Nazwy miejsc, które w tekście NIE umiejscawiają zdarzenia: relacja pociągu
# „Kijów–Warszawa" czy „loty do Warszawy wstrzymane" dawały mazowieckiemu punkty
# za atak na Ukrainie (E3, 13.09.2026). Wycinamy je przed rozpoznaniem regionu.
REGION_NEUTRAL_PATTERNS = [
    r"(?:kij[oó]w|lw[oó]w|odes(?:sa|y)|wilno|mi[nń]sk|berlin|praga|wiede[nń])\s*[-–—]\s*warszaw\w*",
    r"warszaw\w*\s*[-–—]\s*(?:kij[oó]w|lw[oó]w|odes(?:sa|y)|wilno|mi[nń]sk|berlin|praga|wiede[nń])",
    r"(?<!\w)(?:do|z|ze)\s+warszawy(?!\w)",
    # Miesiąc, nie miasto Września (hasło „wrześni”): 14.09.2026 „na początku
    # września” w artykule Radia Lublin dało wielkopolskiemu 0,5 pkt. Miasto łapie
    # się dalej w formie „Wrześni” (we/z/do Wrześni). Lustro: engine.js.
    r"(?<!\w)wrze[sś]ni(?:a|u)(?!\w)",
]
# Odnośniki do INNYCH artykułów w opisie RSS („CZYTAJ: Wzmożona czujność na granicy
# po ataku dronów…”). 14.09.2026 dały artykułowi o oszuście słowa „dron” i „atak”.
# Wycinamy od znacznika do końca linii, myślnika albo 220 znaków. Lustro: engine.js.
MEDIA_TEASER_PATTERNS = [
    r"(?<!\w)(?:przeczytaj|czytaj|zobacz|posłuchaj|sprawdź)(?:\s+(?:także|też|również|więcej))?\s*:\s*[^\n–—]{0,220}",
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
    # podsumowania minionego alarmu (13.09.2026: „Niespokojny poranek na
    # Lubelszczyźnie. W sześciu powiatach zawyły syreny…" dało 1,5 pkt trzy
    # godziny po odwołaniu)
    "po nocnym alarmie", "po porannym alarmie", "po wieczornym alarmie",
    "po nocnym ataku", "po porannym ataku", "po nocnych alarmach",
    # E3: zaprzeczenia, pomyłki i umorzenia („syreny nie zawyły", „fałszywy alarm")
    "nie zawyły", "nie zawyła", "pomyłk", "omyłkow", "fałszywy alarm", "umorzył",
    "umorzono", "przespał", "stado ptaków", "to ptaki", "wykrył ptaki",
    # testy i zapowiedzi — czas przyszły to nie meldunek
    "testy syren", "testy dron", "testuje", "testów", "rozpoczyna testy", "korytarz",
    "zawyją", "rozlegną się", "zabrzmią", "przelecą", "polecą", "będą latać",
    "dostaną alert", "wyją syreny",
    # 15.09.2026: poranna relacja i publicystyka po nocnym alercie RCB dały po 1,0 pkt
    # („Nocny alert RCB na wschodzie Polski… przestrzeń powietrzna nie została naruszona”,
    # „Alert RCB zamiast ostrzegać, usypia czujność? Co nie działa w systemie alarmowym?”)
    "nocny alert", "nocnego alertu", "nie została naruszona", "zakończyło operację", "znamy szczegóły", "usypia czujność", "co nie działa w systemie", "zakończyło działania",
]
# „Niespokojna noc/poranek" nie jest już wetem (E3): podsumowanie nocy bywa
# relacją na żywo, a o świeżości decyduje article_reader po treści artykułu.

# Po ODWOŁANIU alertu RCB/RSO w województwie artykuły, które TYLKO relacjonują
# alarm (syreny, alert), to opis tego, co już się skończyło — o ile w tym czasie
# nie przyszedł nowy alert. Zerujemy je przez tyle minut po odwołaniu.
RSO_CLEAR_MEDIA_ECHO_MIN = 240
RSO_CLEAR_ECHO_MARKERS = ("syren", "alert", "alarm", "rcb")
# Bez wyjątków na „znów" czy „wybuchy": 13.09.2026 wyjątki przepuściły „Na
# Lubelszczyźnie znów zawyły syreny alarmowe. Były zgłoszenia o wybuchach" —
# drugiego włączenia syren nie było, a artykuł dał fałszywy żółty o 10:01.
RSO_CLEAR_NOT_ECHO_MARKERS = ()

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
    # E3
    "odwołano alert", "odwołuje alert", "odwołało alert", "zakończyło się operowanie",
]
# Odwołanie bez żadnej frazy alarmowej („Zakończono operowanie lotnictwa") też
# ma wygaszać — byle dotyczyło zagrożenia z powietrza, a nie np. objazdu.
MEDIA_CLEAR_CONTEXT = ["lotnictw", "operowani", "alert rcb", "alertu rcb", "syren",
                       "dron", "rakiet", "powietrz", "myśliwc", "alarm"]

# ── Kanały RSS (per województwo) ─────────────────────────────────────────────
# ── Kogo cytujemy w treści powiadomienia (audyt bezpieczeństwa 16.09.2026) ──────
# Zapytania Google News zbierają artykuły z dowolnych stron. Tytuł z takiego wyniku
# trafiał dosłownie do powiadomienia o prawdziwym alarmie, więc obcy portal mógł
# wstawić swój tekst do alarmu. Decyzja usera 17.09: cytujemy tylko redakcje
# z tej listy (agencja, nadawcy publiczni i komercyjni, ogólnopolskie dzienniki,
# tygodniki i portale oraz redakcje regionalne) i kanały RSS wpisane w RSS_FEEDS
# bezpośrednio. Inne doniesienia są w powiadomieniu jako „Doniesienie medialne”,
# a pełny tytuł zostaje w aplikacji. Porównanie po nazwie znormalizowanej
# (rss_media._norm_publisher), dokładne — bez dopasowania fragmentu.
MEDIA_PUSH_TRUSTED_PUBLISHERS = [
    "PAP", "Polska Agencja Prasowa", "TVP Info", "TVP3", "Polskie Radio", "Polskie Radio 24",
    "TVN24", "Polsat News", "PolsatNews.pl", "RMF24", "RMF FM", "Radio Zet", "Radio Lublin",
    "Radio Olsztyn", "Radio Białystok", "Radio Gdańsk", "Radio Szczecin", "Radio Rzeszów",
    "Rzeczpospolita", "Gazeta Wyborcza", "Wyborcza.pl", "lublin.wyborcza.pl", "Gazeta",
    "Gazeta.pl", "Gazeta Prawna", "gazetaprawna.pl", "Dziennik.pl", "wiadomosci.dziennik.pl",
    "Wiadomości Onet", "Onet", "wiadomosci.onet.pl", "Interia", "Interia Wydarzenia",
    "WP Wiadomości", "Wirtualna Polska", "Wprost", "Do Rzeczy", "Niezależna", "Tysol.pl",
    "Zero.pl", "Portal Obronny", "Portal Samorządowy", "Defence24", "Dziennik Wschodni",
    "Kurier Lubelski", "Lublin112", "Nowiny24", "Super Nowości", "Kurier Poranny",
    "Gazeta Współczesna", "Gazeta Olsztyńska", "wm.pl", "Trojmiasto.pl", "Dziennik Bałtycki",
    "Głos Szczeciński", "gs24.pl", "Dziennik Polski", "Gazeta Krakowska",
]

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
    # E3: ogólnopolski nasłuch poderwań lotnictwa — materiał dla fali QRA.
    ("https://news.google.com/rss/search?q=%28%22poderwa%C5%82a%20my%C5%9Bliwce%22%20OR%20%22poderwa%C5%82o%20my%C5%9Bliwce%22%20OR%20%22poderwano%20my%C5%9Bliwce%22%20OR%20%22poderwane%20my%C5%9Bliwce%22%20OR%20%22poderwa%C5%82a%20samoloty%22%20OR%20%22poderwano%20samoloty%22%20OR%20%22operuje%20lotnictwo%22%20OR%20%22operowanie%20lotnictwa%22%20OR%20%22wojsko%20poderwa%C5%82o%22%29&hl=pl&gl=PL&ceid=PL:pl", None),
]

# ── Fala QRA (E3) ────────────────────────────────────────────────────────────
# Pojedynczy artykuł „Polska poderwała myśliwce" bez regionu nie daje nic, ale
# kilka RÓŻNYCH redakcji w krótkim czasie to niezależne potwierdzenie, że
# lotnictwo operuje teraz. 8.09.2026 taka fala szła 65 min przed alertem RCB.
QRA_WAVE_MIN_PUBLISHERS = 2
QRA_WAVE_WINDOW_MIN = 30
QRA_WAVE_COOLDOWN_MIN = 180       # fale ciągną się godzinami po zdarzeniu
QRA_WAVE_TARGETS = {
    "east": ["lubelskie", "podkarpackie"],
    # poderwanie nad Bałtykiem to sygnał dla północy, nie wschodu
    "north": ["pomorskie", "warmińsko-mazurskie", "zachodniopomorskie"],
}
QRA_BALTIC_MARKERS = ["bałtyk", "łeb", "kaliningrad", "królewc", "królewiec",
                      "zatoce gdańskiej", "zatoki gdańskiej"]
# Miejsca, które przesądzają o zagranicy nawet przy „polskie F-35" (Baltic Air
# Policing nad Litwą to nie zdarzenie nad Polską).
QRA_FOREIGN_STRONG = ["nad litwą", "nad łotwą", "nad estonią", "nad rumunią", "nad węgrami",
                      "nad słowacją", "nad mołdawią", "nad morzem czarnym", "nad finlandią",
                      "nad szwecją", "nad niemcami", "nad islandią", "korea", "korei", "japoni",
                      "tajwan", "węgry poderwały", "rumunia poderwała", "litwa poderwała",
                      "air policing", "baltic air policing"]
QRA_POLISH_MARKERS = ["polsk", "polsce", "dorsz", "dowództwo operacyjne", "nad polską"]
# Poderwanie przypisane NATO bez słowa o Polsce to zwykle misja nad krajami bałtyckimi.
# 15.09.2026 „NATO poderwało myśliwce i otworzyło ogień. Myśliwce zestrzeliły obcą
# maszynę” (Litwa) trafiło do grupy „east” — dwie takie redakcje dałyby fałszywą falę.
QRA_NATO_MARKERS = ["nato poderwało", "nato poderwał", "myśliwce nato", "samoloty nato",
                    "lotnictwo nato", "nato zestrzel"]

# ── Media bałtyckie (LT/LV/EE) — kontekst dla północno-wschodniej ściany ─────
# Incydent powietrzny u sąsiadów NATO nad Bałtykiem podnosi czujność dla
# podlaskiego i warmińsko-mazurskiego (kierunek Kaliningrad/Białoruś).
# Żaden z trzech krajów nie ma publicznego API alarmów (cell broadcast i aplikacje:
# LT NKVC, LV „112 Latvija”, EE EE-ALARM), a strony wojska i służb publikują
# komunikaty dopiero po fakcie. Najszybsze są kanały RSS mediów publicznych —
# sprawdzone 13.09.2026 na alarmie w Wilnie. Po dwa kanały na kraj: gdy jeden
# padnie albo przestanie podawać artykuły, drugi zostaje.
# delfi.lt/rss/feeds/daily.xml przekierowuje dziś na listę nazw działów bez
# artykułów — kolektor miał status „ok”, a Litwa była ślepa.
BALTIC_FEEDS = [
    ("https://www.lrt.lt/tema/oro-pavojus?rss", "LT"),   # temat „oro pavojus” LRT
    ("https://www.15min.lt/rss", "LT"),
    ("https://www.lsm.lv/rss/", "LV"),
    ("https://eng.lsm.lv/rss/", "LV"),
    ("https://www.err.ee/rss", "EE"),
    ("https://news.err.ee/rss", "EE"),
]
BALTIC_COUNTRY_NAMES = {"LT": "Litwa", "LV": "Łotwa", "EE": "Estonia"}
# Im dalej od Polski, tym mniej: Wilno ~150 km od granicy, Łotwa ~300 km,
# Estonia ~550 km.
BALTIC_ALERT_COUNTRY_WEIGHTS = {"LT": 1.0, "LV": 0.6, "EE": 0.4}
# Ogłoszenie alarmu dla ludności. Sprawdzane PRZED listą incydentów: artykuł
# „tikėtinas oro pavojus” to alarm (0,3), a nie naruszenie przestrzeni (1,0).
BALTIC_ALERT_KEYWORDS = [
    # litewski
    "oro pavoj", "oro pavojus", "(geltona)", "(raudona)", "geltonas signalas",
    "raudonas signalas", "įspėjimas dėl galimai fiksuoto drono",
    "gyventojams išsiųsti įspėjimai",
    # łotewski
    "gaisa telpas apdraudējum", "apdraudējums gaisa telpā",
    "dzeltenās pakāpes brīdinājum", "oranžās pakāpes brīdinājum", "šūnu apraide",
    # estoński
    "õhuohu hoiatus", "võimalik õhuoht", "drooniohu hoiatus", "drooniohu teavitus",
    "ohuteavitus", "ee-alarm", "õhuoht",
    # 19.09.2026: ERR i samorządy piszą o nocnym alarmie wprost „anti õhuhäire”
    # („Öösel anti Eestis õhuhäire”) — bez tego hasła taki tytuł przechodził bokiem
    "õhuhäire", "ohuhäire",
    # angielski (eng.lsm.lv, news.err.ee, LRT English)
    "air alert", "air raid", "airspace alert", "air hazard alert", "air threat alert",
    "air danger alert", "drone threat warning", "drone warning", "air threat warning",
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
    "airspace closed", "shot down a drone", "scrambled jets",
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
    "oro pavojus atšauktas", "oro pavojaus nebėra", "(balta)", "baltas signalas",
    "buvo skelbiamas oro pavojus", "atšauktas tikėtinas oro pavojus",
    # „Oro pavojus Lietuvoje atšauktas: …” — słowa rozdzielone, więc rdzeń
    # (BALTIC_CLEAR_CONTEXT pilnuje, że chodzi o powietrze albo alarm)
    "atšaukt", "atšauk", "lifted",
    # łotewski — LSM zmienia tytuł tego samego artykułu na „Beidzies…”
    "beidzies iespējamais gaisa telpas apdraudējums",
    "beidzies gaisa telpas apdraudējums", "brīdinājums atsaukts",
    # estoński
    "õhuhoiatus võeti maha", "ohu möödumisest", "ohuteavitus lõpetati",
    "drooniohtu ei tuvastatud",
    # Kaitsevägi ogłasza koniec słowami „häire lõpp” (kriis.ee, 19.09.2026)
    "häire lõpp", "häire on lõppenud", "õhuhäire lõppes",
]
# Samo „cancelled” czy „(balta)” to za mało: 02.09.2026 „Second round of
# Latvia's affordable housing programme cancelled” weszło jako odwołanie.
# Odwołanie musi dotyczyć powietrza albo alarmu.
# Relacja po fakcie („Dėl paskelbto oro pavojaus buvo stabdomi skrydžiai”) nie
# jest ogłoszeniem alarmu — 13.09.2026 taki tytuł wszedł jako alarm pół godziny
# po odwołaniu. Czas przeszły: LT „buvo”, LV „bija”, EE „oli”.
BALTIC_ALERT_PAST_MARKERS = ["buvo", "bija", "oli"]
# Artykuł O alarmach to nie ogłoszenie alarmu. 14.09.2026 „Po klausimų apie gyventojų
# perspėjimą, kariuomenės vadas sako, kad veikiama pagal išmėgintą sistemą” dostał
# 0,3 pkt, bo „oro pavoj” było tylko w zajawce. Alarm rozpoznajemy odtąd po TYTULE,
# a tytuł z rozmową, pytaniami czy krytyką odrzucamy.
BALTIC_DISCUSSION_MARKERS = [
    "klausim", " sako", "sakė", "kritik", "komentar", "interviu", "diskusij", "aiškina",
    "says", "said", "questions", "criticism", "interview", "debate", "explains",
    "saka", "jautājum", "skaidro", "ütles", "küsimus", "kriitik", "selgitab",
    # 14–15.09.2026: komentarze po nocnym alarmie na Litwie dawały 0,3 i 1,0 pkt
    # („Gaižauskas: nesutinku…”, „Oro pavojus naktį: neaišku, ar būtų atrakintos
    # priedangos”, „Juozas Olekas: turime visą spektrą priemonių”, „Estonian minister: …”)
    "neaišk", "nesutink", "įvertin", "reakcij", "neturėjome", "įstatym", "pasiruoš",
    # „ministerija:” (komunikat resortu o incydencie) zostaje — tylko osoba ministra
    "turime", "priemon", "ministras:", "ministrs:", "minister:", "a first for", "lessons", "pamok",
]
# Incydent bałtycki ma się dziać nad krajami bałtyckimi. 14.09.2026 „Train carrying
# Estonian leaders crossed Ukraine border just before Russian drone strike” dało 1 pkt
# czterem województwom, choć atak był na Ukrainie.
BALTIC_FOREIGN_MARKERS = [
    "ukrain", "kyiv", "kiev", "kharkiv", "odesa", "lviv", "kijev", "kijiv",
    # 19.09.2026: „Saudo Arabijos sostinėje paskelbtas pirmasis oro pavojus po kovų
    # Jemene atsinaujinimo” (15min.lt) zapaliło Litwę na czerwono i dało 0,3 pkt
    # czterem województwom — litewska redakcja pisała o alarmie w Rijadzie.
    "saudo arabij", "saudi arab", "saūda arāb", "saudi araabia", "rijad", "riyadh",
    "jemen", "yemen", "jeemen", "hutl", "houthi",
    "izrael", "israel", "iisrael", "tel avi", "jeruzal", "jerusalem", "gaza", "gazos",
    "palestin", "iran", "irān", "teheran", "tehran",
    "libanas", "libanā", "lebanon", "sirij", "syria", "süüria", "damask",
    "maskv", "moscow", "moskva", "peterburg", "rostov", "krasnodar", "soči", "sotši",
    # alarm w Polsce opisujemy z RCB i RSO, a nie z litewskiej relacji o nim
    "lenkij", "polij", "poola", "poland",
]
# Wyjątek od powyższego: tytuł mówiący i o zagranicy, i o miejscu w kraju
# bałtyckim, to zwykle nasz alarm z zagranicznym kontekstem („Oro pavojus
# Vilniuje dėl smūgių Ukrainoje”). Stolice, większe miasta i formy nazwy kraju.
BALTIC_LOCAL_MARKERS = {
    "LT": ["lietuv", "vilni", "kaun", "klaipėd", "klaiped", "šiauli", "siauli",
           "panevėž", "paneve", "alytu", "marijampol", "utena", "telšia", "telsia",
           "taurag", "druskinink", "visagin", "kybart", "šalčinink", "salcinink",
           "trak", "elektrėn", "elektren", "jonav", "mažeiki", "mazeiki"],
    "LV": ["latvij", "latvia", "rīg", "riga", "daugavpil", "liepāj", "liepaj",
           "ventspil", "jelgav", "rēzekn", "rezekn", "jūrmal", "jurmal", "valmier",
           "ludz", "kārsav", "karsav", "jēkabpil", "jekabpil"],
    "EE": ["eesti", "estonia", "tallinn", "tartu", "narva", "pärnu", "parnu",
           "kohtla", "jõhvi", "johvi", "võru", "voru", "valga", "viljandi",
           "kuressaare", "saarema", "hiiumaa", "haapsalu", "rakvere"],
}
BALTIC_CLEAR_CONTEXT = [
    "air", "drone", "uav", "oro", "pavoj", "gaisa", "apdraud", "õhu", "droon",
    "ohu", "oht", "alert", "alarm", "warning", "threat",
]
# Odwołanie przychodzi zwykle jako NOWY tytuł starego artykułu, a data
# publikacji zostaje z chwili ogłoszenia (LRT: 13:08 → „nebėra (balta)” o 13:43).
# Dla odwołań patrzymy więc dalej wstecz niż dla nowych doniesień.
BALTIC_CLEAR_MAX_AGE_MIN = 6 * 60
# Alarm i incydent: tylko świeży wpis (15.09.2026 — ostrzej niż 45 min dla mediów PL)
# i bez oznak, że zdarzenie było wcześniej. Czas przeszły dnia („vakar”, „sekmadienį”)
# sprawdzamy po całych słowach tytułu i opisu, frazy angielskie po fragmencie.
BALTIC_MAX_AGE_MIN = 30
BALTIC_PAST_TIME_WORDS = [
    "vakar", "užvakar", "praėjusią", "praėjusį", "sekmadienį", "pirmadienį", "antradienį",
    "trečiadienį", "ketvirtadienį", "penktadienį", "šeštadienį", "savaitgalį",
    "aizvakar", "pagājušajā", "pagājušo", "svētdien", "pirmdien", "otrdien", "trešdien",
    "ceturtdien", "piektdien", "sestdien",
    "eile", "üleeile", "möödunud", "pühapäeval", "esmaspäeval", "teisipäeval", "kolmapäeval",
    "neljapäeval", "reedel", "laupäeval", "nädalavahetusel",
    "yesterday",
]
BALTIC_PAST_TIME_PHRASES = ["last night", "last week", "on sunday", "on monday", "on tuesday",
                            "on wednesday", "on thursday", "on friday", "on saturday",
                            "over the weekend", "earlier this week", "nedēļas nogalē"]
# Godzina zdarzenia w tekście („03.15 val.”, „plkst. 3:15”, „kell 3.15”, „at 03:15”)
# starsza niż tyle minut od teraz (czas bałtycki) = relacja po fakcie.
BALTIC_EVENT_TIME_MAX_MIN = 60
