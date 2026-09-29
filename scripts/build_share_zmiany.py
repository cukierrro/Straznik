# -*- coding: utf-8 -*-
"""Buduje miniaturę linku dla strony „Historia zmian" (docs/share-zmiany-v1.jpg).

Karta jest UNIWERSALNA: bez numeru wersji, daty i bez zrzutu ekranu, żeby nie
trzeba jej było wymieniać przy każdym wydaniu. Motyw po prawej to abstrakcyjna
oś czasu — celowo nie przypomina interfejsu aplikacji, bo grafika promocyjna
nie ma udawać działającej apki.

Uruchomienie: py scripts/build_share_zmiany.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
W, H = 1200, 630

# (plik, naglowek, podtytul, stopka)
WERSJE = [
    ("share-zmiany-v1.jpg",
     ["Co zmieniło się", "w każdym wydaniu"],
     ["Wszystkie zmiany widoczne dla użytkownika,", "od najnowszej wersji. Po polsku i po angielsku."],
     "Nieoficjalne źródło dodatkowe · nie zastępuje RCB i syren"),
    ("share-zmiany-en-v1.jpg",
     ["What changed", "in every release"],
     ["Every user-visible change, newest first.", "In English and in Polish."],
     "An unofficial supplementary source · it does not replace RCB or sirens"),
]

# Kolory zdjęte z docs/share-panel-v2.jpg, żeby obie karty wyglądały jak komplet.
TLO_OD, TLO_DO = (32, 57, 97), (8, 12, 22)
BIEL, SZARY = (252, 253, 255), (154, 166, 190)
BLEKIT, BURSZTYN = (130, 173, 255), (233, 204, 136)

CZCIONKI = Path("C:/Windows/Fonts")


def font(nazwa, rozmiar):
    return ImageFont.truetype(str(CZCIONKI / nazwa), rozmiar)


def tlo():
    """Przekątny gradient: rozjaśnienie w lewym górnym rogu, jak na karcie panelu."""
    im = Image.new("RGB", (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            t = (x / W * 0.55 + y / H * 0.45)
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TLO_OD, TLO_DO))
    return im


def rozstrzelone(d, xy, tekst, f, kolor, odstep):
    x, y = xy
    for znak in tekst:
        d.text((x, y), znak, font=f, fill=kolor)
        x += d.textlength(znak, font=f) + odstep
    return x


def os_czasu(im, x, gora, dol, punkty=5):
    """Pionowa oś z punktami — czytelny znak „kolejne wydania", nie zrzut ekranu.

    Poświata przy najnowszym punkcie powstaje na osobnej warstwie RGBA, bo
    malowanie kilku nieprzezroczystych kół jedno na drugim daje twardy pierścień.
    """
    swiatlo = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(swiatlo)
    ds.ellipse([x - 34, gora - 34, x + 34, gora + 34], fill=BLEKIT + (46,))
    ds.ellipse([x - 23, gora - 23, x + 23, gora + 23], fill=BLEKIT + (58,))
    swiatlo = swiatlo.filter(ImageFilter.GaussianBlur(9))
    im.alpha_composite(swiatlo)

    d = ImageDraw.Draw(im)
    d.line([(x, gora), (x, dol)], fill=(52, 80, 126, 255), width=2)
    krok = (dol - gora) / (punkty - 1)
    for i in range(punkty):
        y = gora + krok * i
        swiezy = i == 0
        r = 13 if swiezy else 9
        d.ellipse([x - r, y - r, x + r, y + r],
                  fill=(BLEKIT + (255,)) if swiezy else (30, 51, 86, 255),
                  outline=(BLEKIT + (255,)) if swiezy else (78, 112, 166, 255), width=2)
        # Paski bledna wraz z wiekiem wydania, ale zostaja widoczne w miniaturze.
        szer = 168 if swiezy else (132 - i * 12)
        jasnosc = 255 if swiezy else 150 - i * 16
        d.rounded_rectangle([x + 34, y - 7, x + 34 + szer, y + 7], radius=7,
                            fill=(46, 74, 122, jasnosc) if swiezy else (44, 68, 108, jasnosc))


def karta(plik, naglowek_linie, podtytul_linie, stopka):
    im = tlo().convert("RGBA")
    d = ImageDraw.Draw(im)

    d.ellipse([64, 78, 90, 104], fill=BLEKIT)
    rozstrzelone(d, (106, 72), "STRAŻNIK", font("segoeuib.ttf", 37), BIEL, 7)

    naglowek = font("segoeuib.ttf", 63)
    for i, linia in enumerate(naglowek_linie):
        d.text((64, 176 + i * 76), linia, font=naglowek, fill=BIEL)

    podtytul = font("segoeui.ttf", 27)
    for i, linia in enumerate(podtytul_linie):
        d.text((64, 356 + i * 40), linia, font=podtytul, fill=SZARY)

    d.text((64, 462), "straznik.eu", font=font("segoeuib.ttf", 30), fill=BLEKIT)
    d.text((64, 566), stopka, font=font("segoeui.ttf", 22), fill=BURSZTYN)

    os_czasu(im, 872, 132, 512)

    wyjscie = ROOT / "docs" / plik
    im.convert("RGB").save(wyjscie, quality=90, optimize=True, subsampling=0)
    print(f"  {plik}  {wyjscie.stat().st_size // 1024} kB  {im.size}")


for wersja in WERSJE:
    karta(*wersja)
