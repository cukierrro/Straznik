"""Ikona Strażnika: tarcza z falą radarową i sygnałem zagrożenia.

Rysowana proceduralnie z 4x supersamplingiem (bez zależności zewnętrznych).
Generuje:
  - ic_launcher.png / ic_launcher_round.png (legacy, pełne tło)
  - ic_launcher_foreground.png (adaptive: motyw na przezroczystym tle,
    treść w bezpiecznym okręgu 66/108)
  - assets/icon-192.png, icon-512.png (PWA)
"""
import math
import os
import struct
import sys
import zlib

SS = 4  # supersampling


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


def shield_sdf(x, y):
    """Znormalizowany kształt tarczy w układzie [-1,1]; <0 = wewnątrz."""
    # góra: prostokąt z zaokrągleniem, dół: zbieżny szpic
    w = 0.78
    if y < 0.15:
        # górna część — zaokrąglony prostokąt
        dx = abs(x) - (w - 0.16)
        dy = abs(y - (-0.42)) - 0.42
        d = math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - 0.16
        return d
    # dolna część — zbieżność do szpica
    t = (y - 0.15) / 0.93
    half = w * (1 - t * t * 0.98)
    return abs(x) - half if y <= 1.08 else 1.0


def render(size, foreground_only):
    px = bytearray()
    C_BG1 = (16, 24, 44, 255)      # tło (legacy)
    C_BG2 = (8, 12, 24, 255)
    C_SH1 = (58, 106, 214, 255)    # tarcza — gradient
    C_SH2 = (28, 52, 118, 255)
    C_EDGE = (150, 190, 255, 255)
    C_SWEEP = (120, 190, 255, 255)
    C_ALERT = (255, 176, 32, 255)
    C_ALERT2 = (255, 90, 60, 255)

    # adaptive foreground: treść musi się zmieścić w bezpiecznym okręgu 66/108,
    # inaczej maska launchera obcina szpic tarczy
    scale = 0.50 if foreground_only else 0.80

    for iy in range(size):
        row = bytearray([0])
        for ix in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    fx = (ix + (sx + 0.5) / SS) / size * 2 - 1
                    fy = (iy + (sy + 0.5) / SS) / size * 2 - 1
                    col = (0, 0, 0, 0)
                    if not foreground_only:
                        r = math.hypot(fx, fy)
                        col = lerp(C_BG1, C_BG2, min(r / 1.4, 1.0))

                    ux, uy = fx / scale, fy / scale + (0.08 if foreground_only else 0.05)
                    d = shield_sdf(ux, uy)
                    if d < 0.02:
                        # wnętrze tarczy: pionowy gradient
                        t = (uy + 1) / 2
                        shield = lerp(C_SH1, C_SH2, max(0.0, min(1.0, t)))

                        r = math.hypot(ux, uy + 0.05)
                        ang = (math.degrees(math.atan2(uy + 0.05, ux)) + 360) % 360
                        # łuki radaru
                        for rr in (0.30, 0.52, 0.74):
                            if abs(r - rr) < 0.035 and 200 < ang < 340:
                                shield = C_EDGE
                        # wiązka omiatająca (klin ku górze-prawo)
                        sweep = (300 - ang) % 360
                        if sweep < 55 and r < 0.85:
                            shield = lerp(shield, C_SWEEP, (1 - sweep / 55) * 0.5)
                        # punkt zagrożenia
                        ax, ay = 0.34, -0.40
                        da = math.hypot(ux - ax, uy + 0.05 - ay)
                        if da < 0.13:
                            shield = lerp(C_ALERT2, C_ALERT, max(0.0, 1 - da / 0.13))
                        # krawędź tarczy
                        if d > -0.05:
                            shield = lerp(shield, C_EDGE, min(1.0, (d + 0.05) / 0.07))
                        col = shield if col[3] == 0 else lerp(col, shield, 1.0)
                        col = (col[0], col[1], col[2], 255)
                    for k in range(4):
                        acc[k] += col[k]
            n = SS * SS
            row += bytes(int(max(0, min(255, acc[k] / n))) for k in range(4))
        px += row

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(px), 9)) + chunk(b"IEND", b""))


ANDROID_RES = sys.argv[1]
FRONTEND_ASSETS = sys.argv[2]

DENSITIES = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216),
             "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}

for dens, (legacy, fg) in DENSITIES.items():
    d = os.path.join(ANDROID_RES, f"mipmap-{dens}")
    os.makedirs(d, exist_ok=True)
    data = render(legacy, False)
    open(os.path.join(d, "ic_launcher.png"), "wb").write(data)
    open(os.path.join(d, "ic_launcher_round.png"), "wb").write(data)
    open(os.path.join(d, "ic_launcher_foreground.png"), "wb").write(render(fg, True))
    print("mipmap-" + dens, "ok")

for s in (192, 512):
    open(os.path.join(FRONTEND_ASSETS, f"icon-{s}.png"), "wb").write(render(s, False))
print("PWA icons ok")
