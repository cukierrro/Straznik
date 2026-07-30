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


def assess_threat(lat: float, lon: float, heading, tolerance_deg: float):
    """Ocena obiektu względem granicy PL.

    Zwraca dict: dist_km, border_voiv, toward_pl (heading w stronę granicy),
    bearing_to_border.
    """
    dist, blat, blon, voiv = nearest_border_point(lat, lon)
    brg = bearing_deg(lat, lon, blat, blon)
    toward = heading is not None and angle_diff(float(heading), brg) <= tolerance_deg
    return {
        "dist_km": round(dist, 1),
        "border_voiv": voiv,
        "bearing_to_border": round(brg, 1),
        "toward_pl": toward,
    }


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
