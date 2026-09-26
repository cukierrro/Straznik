"""Content-Security-Policy dla strony straznik.eu (audyt bezpieczeństwa 26.09.2026).

Po co: frontend escapuje każde wstawienie danych i przepuszcza tylko linki http(s),
ale jedno przeoczenie w przyszłości dałoby XSS. CSP to druga linia: przeglądarka
nie wykona skryptu, którego nie wpuszczamy — ani wstrzykniętego w stronę, ani
dociągniętego z obcej domeny.

Co chroni, a czego świadomie nie:
- `script-src` jest ciasny: tylko nasze pliki i CZTERY skrypty wpisane w index.html,
  wpuszczone po skrócie SHA-256. Bez 'unsafe-inline' i bez 'unsafe-eval'.
- Obrazy, połączenia i czcionki są szerokie (`https:`). Strona łączy się z kafelkami
  mapy, zdjęciami z Wikimedii, kamerami i źródłami trybu awaryjnego; zamknięta lista
  po cichu odcięłaby któreś z nich. Przed XSS chroni `script-src`, nie te dyrektywy.

Dotyczy wyłącznie strony w przeglądarce. Aplikacja wczytuje pliki lokalnie i tego
nagłówka nie dostaje — CSP dla aplikacji wymaga osobnego testu na iPhonie.

Skróty skryptów liczymy z pliku, który serwer właśnie podaje, i przeliczamy, gdy plik
się zmieni. Stronę wdrażamy często samym `git pull` bez restartu — skróty policzone
tylko przy starcie rozjechałyby się z plikiem i w trybie `enforce` strona by stanęła.

Tryb z CSP_MODE: `report-only` (domyślnie — przeglądarka tylko zgłasza naruszenia
w konsoli), `enforce` albo `off`.
"""
import base64
import hashlib
import logging
import os
import re
from pathlib import Path

from . import config

log = logging.getLogger("csp")

TRYB = os.getenv("CSP_MODE", "report-only").strip().lower()
_NAZWA = {"report-only": b"content-security-policy-report-only",
          "enforce": b"content-security-policy"}.get(TRYB)

# <script> BEZ atrybutu src — to te, które przeglądarka wykonuje z treści strony.
_INLINE = re.compile(r"<script(?![^>]*\bsrc\s*=)[^>]*>(.*?)</script\s*>", re.S | re.I)

_cache: dict = {"klucz": None, "wartosc": None}


def skroty(html: str) -> list[str]:
    """Skróty SHA-256 skryptów wpisanych w stronę — dokładnie tak liczy je przeglądarka:
    z surowego tekstu między znacznikami, w UTF-8."""
    return ["'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode() + "'"
            for m in _INLINE.finditer(html)]


def polityka(html: str) -> str:
    return "; ".join([
        "default-src 'self'",
        "script-src " + " ".join(["'self'"] + skroty(html)),
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        # MapLibre uruchamia wątki roboczy z adresów blob:
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https: wss:",
        # style="…" jest w szablonach wszędzie; wstrzyknięty styl nie wykona kodu
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data: https:",
        "manifest-src 'self'",
        "media-src 'self' data: blob:",
    ])


def naglowek() -> tuple[bytes, bytes] | None:
    """Gotowy nagłówek albo None (tryb `off` / brak index.html)."""
    if _NAZWA is None:
        return None
    plik = Path(config.FRONTEND_DIR) / "index.html"
    try:
        st = plik.stat()
    except OSError:
        return None
    klucz = (st.st_mtime_ns, st.st_size)
    if _cache["klucz"] != klucz:
        html = plik.read_text(encoding="utf-8")
        _cache["wartosc"] = polityka(html).encode("ascii")
        _cache["klucz"] = klucz
        log.info("CSP (%s): %d skryptów w stronie wpuszczonych po skrócie", TRYB, len(skroty(html)))
    return (_NAZWA, _cache["wartosc"])
