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


# ── audyt A2: odległość do KONTURU Polski (w punktacji od 14.09.2026, wariant A2b) ──
# 19 punktów BORDER_POINTS zawyżało odległość przy granicy o 14–20 km, obiekt nad
# Polską nie miał odległości 0, a granica morska nie istniała (Kaliningrad → Gdańsk:
# 0 pkt). Kontur i przypisanie województw generuje scripts/build_pl_outline.py —
# te same dane ma engine.js (frontend/pl-outline.js). Przeliczenie historii przed
# włączeniem: scripts/replay_granica_a2.py.
from .pl_outline import PL_HULL, PL_RINGS, PL_RING_VOIV, PL_VOIVS

_PL_BBOX = (min(a for r in PL_RINGS for a, _ in r), min(b for r in PL_RINGS for _, b in r),
            max(a for r in PL_RINGS for a, _ in r), max(b for r in PL_RINGS for _, b in r))
_PL_POINTS = [p for r in PL_RINGS for p in r]


def in_poland(lat: float, lon: float) -> bool:
    la1, lo1, la2, lo2 = _PL_BBOX
    if not (la1 <= lat <= la2 and lo1 <= lon <= lo2):
        return False
    return any(point_in_ring(lat, lon, ring) for ring in PL_RINGS)


def nearest_outline_point(lat: float, lon: float):
    """(dist_km, lat, lon, województwo odcinka) najbliższego punktu konturu; 0 nad Polską.

    Odcinek wybieramy w lokalnym rzucie płaskim (sama arytmetyka), a odległość
    wybranego punktu liczymy po kuli — pełne haversine dla ~1000 odcinków kosztowało
    4 ms na obiekt. Ta sama metoda w engine.js."""
    kx = math.cos(math.radians(lat))
    best = None
    for ring, voivs in zip(PL_RINGS, PL_RING_VOIV):
        n = len(ring)
        for i in range(n):
            j = (i + 1) % n
            a, b = ring[i], ring[j]
            ax, ay = (a[1] - lon) * kx, a[0] - lat
            dx, dy = (b[1] - a[1]) * kx, b[0] - a[0]
            den = dx * dx + dy * dy
            tt = 0.0 if den == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / den))
            px, py = ax + dx * tt, ay + dy * tt
            d2 = px * px + py * py
            if best is None or d2 < best[0]:
                best = (d2, i, j, tt, voivs)
    _, i, j, tt, voivs = best
    ring = next(r for r, v in zip(PL_RINGS, PL_RING_VOIV) if v is voivs)
    a, b = ring[i], ring[j]
    plat, plon = a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt
    voiv = PL_VOIVS[voivs[i] if tt < 0.5 else voivs[j]]
    if in_poland(lat, lon):
        return (0.0, plat, plon, voiv)
    return (haversine_km(lat, lon, plat, plon), plat, plon, voiv)


def _bearing_arc(lat: float, lon: float, points):
    brgs = sorted(bearing_deg(lat, lon, a, b) for a, b in points)
    gap, i = max(((brgs[(k + 1) % len(brgs)] - brgs[k]) % 360.0, k) for k in range(len(brgs)))
    return brgs[(i + 1) % len(brgs)], (360.0 - gap) % 360.0


def pl_bearing_interval(lat: float, lon: float):
    """Wycinek kierunków (start, szerokość), pod którym punkt „widzi” Polskę — czy kurs
    obiektu trafia w kraj, a nie tylko w najbliższy punkt granicy.

    Spoza otoczki wypukłej wycinek wyznaczają jej wierzchołki (31 zamiast ~1000).
    Wewnątrz otoczki (np. w zatoce granicy) liczymy po wszystkich punktach konturu."""
    arc = _bearing_arc(lat, lon, PL_HULL)
    if arc[1] < 180.0:
        return arc
    return _bearing_arc(lat, lon, _PL_POINTS)


def course_factor_extent(heading, interval, dist_km: float, tol: float, soft: float,
                         unknown_mult: float, unknown_max_km: float) -> float:
    """Jak course_factor, ale różnica kąta liczona do wycinka Polski (0 w środku)."""
    if heading is None:
        return unknown_mult if dist_km <= unknown_max_km else 0.0
    start, width = interval
    off = (float(heading) - start) % 360.0
    d = 0.0 if off <= width else min(off - width, 360.0 - off)
    if d <= tol:
        return 1.0
    if d >= soft:
        return 0.0
    return round((soft - d) / (soft - tol), 3)


# Pozycje NEPTUN-a w 92% nie zmieniają się między aktualizacjami — geometria punktu
# (odległość, województwo, wycinek) liczy się raz; kurs dokładamy przy każdej ocenie.
_GEOM_CACHE: dict = {}
_GEOM_CACHE_MAX = 20000


def _outline_geometry(lat: float, lon: float):
    key = (round(lat, 4), round(lon, 4))
    g = _GEOM_CACHE.get(key)
    if g is None:
        dist, plat, plon, seg_voiv = nearest_outline_point(lat, lon)
        if dist == 0.0:
            g = (0.0, None, nearest_voiv_to(lat, lon) or seg_voiv, None)
        else:
            g = (dist, bearing_deg(lat, lon, plat, plon), seg_voiv, pl_bearing_interval(lat, lon))
        if len(_GEOM_CACHE) >= _GEOM_CACHE_MAX:
            _GEOM_CACHE.clear()
        _GEOM_CACHE[key] = g
    return g


def assess_threat_outline_extent(lat: float, lon: float, heading, tolerance_deg: float,
                                 soft_deg: float = 70.0, unknown_mult: float = 0.5,
                                 unknown_max_km: float = 150.0):
    """Wariant A2b: odległość do konturu, kurs do całego wycinka Polski."""
    dist, brg, voiv, interval = _outline_geometry(lat, lon)
    if dist == 0.0:
        return {"dist_km": 0.0, "border_voiv": voiv, "bearing_to_border": None,
                "course_factor": 1.0, "heading_known": heading is not None,
                "toward_pl": True, "inside_pl": True}
    cf = course_factor_extent(heading, interval, dist, tolerance_deg, soft_deg,
                              unknown_mult, unknown_max_km)
    return {"dist_km": round(dist, 1), "border_voiv": voiv, "bearing_to_border": round(brg, 1),
            "course_factor": cf, "heading_known": heading is not None, "toward_pl": cf > 0,
            "inside_pl": False}


# Geometria używana w punktacji NEPTUN (neptun._evaluate) — jedno miejsce zmiany.
# A2b włączone 14.09.2026 (decyzja usera po przeliczeniu historii).
assess_for_scoring = assess_threat_outline_extent


def nearest_voiv_to(lat: float, lon: float) -> str | None:
    """Województwo nad którym jest punkt (uproszczone obrysy), a gdy żadne — najbliższe."""
    best = None
    for voiv in VOIV_OUTLINE:
        d = dist_to_voiv_km(lat, lon, voiv)
        if d is not None and (best is None or d < best[0]):
            best = (d, voiv)
    return best[1] if best else None


def assess_threat_outline(lat: float, lon: float, heading, tolerance_deg: float,
                          soft_deg: float = 70.0, unknown_mult: float = 0.5,
                          unknown_max_km: float = 150.0):
    """Jak assess_threat, ale do konturu Polski. Nad Polską: odległość 0,
    województwo z obrysu i pełna waga kursu (obiekt już jest nad krajem)."""
    dist, plat, plon, seg_voiv = nearest_outline_point(lat, lon)
    if dist == 0.0:
        return {"dist_km": 0.0, "border_voiv": nearest_voiv_to(lat, lon) or seg_voiv,
                "bearing_to_border": None, "course_factor": 1.0,
                "heading_known": heading is not None, "toward_pl": True, "inside_pl": True}
    brg = bearing_deg(lat, lon, plat, plon)
    cf = course_factor(heading, brg, dist, tolerance_deg, soft_deg, unknown_mult, unknown_max_km)
    return {"dist_km": round(dist, 1), "border_voiv": seg_voiv,
            "bearing_to_border": round(brg, 1), "course_factor": cf,
            "heading_known": heading is not None, "toward_pl": cf > 0, "inside_pl": False}


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
