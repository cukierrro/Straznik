"""Geometria: odległości, azymuty, punkty referencyjne granicy wschodniej PL."""
import math

# Punkty referencyjne wzdłuż granicy wschodniej (lat, lon, województwo).
# Przybliżone (±kilka km) — wystarczające dla progu 100 km.
BORDER_POINTS = [
    # warmińsko-mazurskie (granica z obwodem kaliningradzkim)
    (54.44, 19.80, "warmińsko-mazurskie"),  # Braniewo
    (54.35, 20.60, "warmińsko-mazurskie"),  # Bezledy
    (54.36, 21.50, "warmińsko-mazurskie"),  # Węgorzewo płn.
    (54.34, 22.79, "warmińsko-mazurskie"),  # Gołdap
    # podlaskie (granica z Białorusią)
    (53.90, 23.55, "podlaskie"),   # okolice trójstyku PL-LT-BY
    (53.51, 23.65, "podlaskie"),   # Kuźnica
    (53.16, 23.87, "podlaskie"),   # Bobrowniki
    (52.70, 23.87, "podlaskie"),   # Białowieża
    # lubelskie (granica z Białorusią i Ukrainą)
    (52.07, 23.62, "lubelskie"),   # Terespol
    (51.75, 23.55, "lubelskie"),   # Sławatycze
    (51.55, 23.55, "lubelskie"),   # Włodawa
    (51.18, 23.80, "lubelskie"),   # Dorohusk
    (50.80, 24.02, "lubelskie"),   # Zosin / Hrubieszów
    (50.58, 24.05, "lubelskie"),   # Dołhobyczów
    # podkarpackie (granica z Ukrainą)
    (50.19, 23.55, "podkarpackie"),  # okolice Lubaczowa
    (49.96, 23.10, "podkarpackie"),  # Korczowa
    (49.80, 22.94, "podkarpackie"),  # Medyka
    (49.63, 22.64, "podkarpackie"),  # Krościenko
    (49.20, 22.70, "podkarpackie"),  # Bieszczady (Ustrzyki Grn.)
]

EARTH_R_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Azymut z punktu 1 do punktu 2 (0-360, 0=N)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def angle_diff(a: float, b: float) -> float:
    """Najmniejsza różnica kątowa (0-180)."""
    d = abs(a - b) % 360.0
    return d if d <= 180.0 else 360.0 - d


def nearest_border_point(lat: float, lon: float):
    """Zwraca (dist_km, lat, lon, voivodeship) najbliższego punktu granicy PL."""
    best = None
    for blat, blon, voiv in BORDER_POINTS:
        d = haversine_km(lat, lon, blat, blon)
        if best is None or d < best[0]:
            best = (d, blat, blon, voiv)
    return best


def course_factor(heading, brg: float, dist_km: float, tol: float,
                  soft: float, unknown_mult: float, unknown_max_km: float) -> float:
    """Waga kursu 0..1 — ile z punktów obiektu bierzemy pod uwagę.

    * kurs znany: 1,0 do `tol`, potem LINIOWO do zera przy `soft` (koniec twardego
      cięcia, przez które obiekt z różnicą 51° dostawał 0 zamiast prawie pełnej wagi);
    * kurs NIEZNANY: `unknown_mult`, ale tylko bliżej niż `unknown_max_km` — brak
      danych o kursie nie może oznaczać ciszy dla obiektu tuż przy granicy.
    """
    if heading is None:
        return unknown_mult if dist_km <= unknown_max_km else 0.0
    d = angle_diff(float(heading), brg)
    if d <= tol:
        return 1.0
    if d >= soft:
        return 0.0
    return round((soft - d) / (soft - tol), 3)


def assess_threat(lat: float, lon: float, heading, tolerance_deg: float,
                  soft_deg: float = 70.0, unknown_mult: float = 0.5,
                  unknown_max_km: float = 150.0):
    """Ocena obiektu względem granicy PL.

    Zwraca dict: dist_km, border_voiv, bearing_to_border, course_factor (0..1),
    heading_known, toward_pl (= course_factor > 0; zgodność z UI i listą obiektów).
    """
    dist, blat, blon, voiv = nearest_border_point(lat, lon)
    brg = bearing_deg(lat, lon, blat, blon)
    cf = course_factor(heading, brg, dist, tolerance_deg, soft_deg,
                       unknown_mult, unknown_max_km)
    return {
        "dist_km": round(dist, 1),
        "border_voiv": voiv,
        "bearing_to_border": round(brg, 1),
        "course_factor": cf,
        "heading_known": heading is not None,
        "toward_pl": cf > 0,
    }


# ── odległość do województwa i czas dolotu ───────────────────────────────────
from .voiv_points import VOIV_OUTLINE


def dist_to_voiv_km(lat: float, lon: float, voiv: str) -> float | None:
    """Najmniejsza odległość obiektu do obrysu województwa.

    Sama odległość „do granicy PL" nie mówi użytkownikowi, ile czasu ma ON —
    ktoś pod Warszawą jest 200 km dalej niż ktoś w Hrubieszowie. Liczymy więc
    dystans do KAŻDEGO województwa (użytkownicy wybierają różne), po punktach
    uproszczonego obrysu. Gdy obiekt jest już nad regionem, zwracamy 0.
    """
    ring = VOIV_OUTLINE.get(voiv)
    if not ring:
        return None
    if point_in_ring(lat, lon, ring):
        return 0.0          # obiekt jest już NAD regionem — nie ma „drogi do niego"
    return round(min(haversine_km(lat, lon, blat, blon) for blat, blon in ring), 1)


def point_in_ring(lat: float, lon: float, ring) -> bool:
    """Czy punkt leży wewnątrz obrysu (ray casting).

    Bez tego obiekt nad środkiem województwa dostawał odległość do najbliższego
    punktu GRANICY tego województwa (np. Lublin → „50 km do lubelskiego"),
    co przy liczeniu czasu dolotu byłoby wprost mylące."""
    inside = False
    n = len(ring)
    for i in range(n):
        y1, x1 = ring[i]            # (lat, lon)
        y2, x2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            xin = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < xin:
                inside = not inside
    return inside


def eta_raw_minutes(dist_km: float | None, speed_kmh: float | None) -> float | None:
    """Surowy czas dolotu, przed buforem opóźnienia źródła."""
    if dist_km is None or not speed_kmh or speed_kmh <= 0:
        return None
    return max(0.0, dist_km / speed_kmh * 60)


def eta_minutes(dist_km: float | None, speed_kmh: float | None,
                buffer_min: float = 0.0) -> int | None:
    """Konserwatywny czas dolotu — przy TEJ prędkości i utrzymaniu kursu.

    Świadomie zwracamy liczbę całkowitą: to szacunek (NEPTUN nie podaje
    prędkości, więc zwykle bierzemy typową dla klasy obiektu), a minuty
    z przecinkiem sugerowałyby precyzję, której nie ma. Zaokrąglamy w dół po
    odjęciu bufora, aby komunikat nigdy nie zawyżał dostępnego czasu.
    """
    raw = eta_raw_minutes(dist_km, speed_kmh)
    if raw is None:
        return None
    return max(0, int(math.floor(raw - max(0.0, buffer_min))))


# Centroidy województw priorytetowych + bounding boxy do ADS-B
VOIV_BBOX = {
    # (lat_min, lon_min, lat_max, lon_max) — przybliżone
    "lubelskie": (50.25, 21.60, 52.30, 24.15),
    "podkarpackie": (49.00, 21.10, 50.85, 23.60),
    "podlaskie": (52.28, 21.60, 54.40, 24.00),
    "warmińsko-mazurskie": (53.13, 19.10, 54.45, 22.95),
}


# Szeroka strefa obserwacji ADS-B: wschodnia flanka NATO + zachodnia Ukraina.
# Uwaga: nad Ukrainą praktycznie nic nie widać — wojsko UA i RU nie nadaje ADS-B,
# a przestrzeń jest zamknięta dla cywilów (sprawdzone na żywych danych).
# Trzymamy tę strefę, bo NATO-wskie AWACS-y i tankowce nad PL/RO/Bałtykiem są
# realnym wskaźnikiem podwyższonej aktywności.
WATCH_BBOX = (44.0, 14.0, 60.0, 32.0)


def in_watch_area(lat: float, lon: float) -> bool:
    la1, lo1, la2, lo2 = WATCH_BBOX
    return la1 <= lat <= la2 and lo1 <= lon <= lo2


def voiv_for_point(lat: float, lon: float):
    """Prosta klasyfikacja punktu do województwa priorytetowego po bbox.
    Bboxy się częściowo nakładają — rozstrzyga mniejsza odległość do centroidu."""
    hits = []
    for voiv, (la1, lo1, la2, lo2) in VOIV_BBOX.items():
        if la1 <= lat <= la2 and lo1 <= lon <= lo2:
            c_lat, c_lon = (la1 + la2) / 2, (lo1 + lo2) / 2
            hits.append((haversine_km(lat, lon, c_lat, c_lon), voiv))
    if not hits:
        return None
    return min(hits)[1]
