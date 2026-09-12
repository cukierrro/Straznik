"""Regresje metadanych bezpiecznej aktualizacji APK."""
import asyncio
import time

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import app_updates
from app.app_updates import _change_items, _release_data


def main():
    digest = "a" * 64
    normal = _release_data({
        "tag_name": "v1.8.0", "body": "Zwykła poprawka", "published_at": "now",
        "assets": [{"name": "Straznik.apk", "digest": f"sha256:{digest}",
                    "browser_download_url": "https://github.com/x.apk", "size": 123}],
    })
    assert normal["version"] == "1.8.0" and not normal["critical"]
    assert normal["sha256"] == digest and normal["size"] == 123

    critical = _release_data({
        "tag_name": "v2.0.0", "body": "<!-- critical-update -->\nPilna poprawka",
        "assets": [{"name": "Straznik.apk", "digest": f"sha256:{digest}",
                    "browser_download_url": "https://github.com/x.apk"}],
    })
    assert critical["critical"] and "critical-update" not in critical["notes"]
    assert critical["changes"] == ["Pilna poprawka"]

    changes = _change_items("""# Wersja 2.1\n- **Naprawiono** historię.\n- Dodano [opis](https://example.test).\n- Usprawniono alarmy.\n- Czwarty punkt.\n""")
    # Limit podniesiony z 3 do 8: okno aktualizacji ucinało opis w połowie.
    assert changes == ["Naprawiono historię.", "Dodano opis.", "Usprawniono alarmy.",
                       "Czwarty punkt."]

    # Notatki bez listy: akapit zawinięty na kilku liniach MUSI wrócić jako całe
    # zdania. Wcześniej każda linia uchodziła za punkt i użytkownik widział trzy
    # urwane kawałki jednego zdania (zgłoszone 12.09.2026 na wydaniu 1.7.30).
    proza = _change_items(
        "# Tytuł\n\nPierwsze zdanie opisu zmiany, które zostało\n"
        "zawinięte na dwóch liniach. Drugie zdanie tego samego akapitu.\n\n"
        "## Szczegóły\n\nTego już nie pokazujemy.\n")
    assert proza == ["Pierwsze zdanie opisu zmiany, które zostało zawinięte na dwóch liniach.",
                     "Drugie zdanie tego samego akapitu."], proza

    # Lista wygrywa z akapitem, nawet gdy akapit jest pierwszy.
    mieszane = _change_items("Wstęp jednym zdaniem.\n\n- Punkt pierwszy.\n- Punkt drugi.\n")
    assert mieszane == ["Punkt pierwszy.", "Punkt drugi."], mieszane

    try:
        _release_data({"tag_name": "v1.0.0", "assets": []})
        raise AssertionError("brak APK powinien zostać odrzucony")
    except ValueError:
        pass

    # Limit GitHuba (403) nie może kończyć się komunikatem „nie udało się sprawdzić”,
    # jeśli mamy ostatnie znane wydanie — oddajemy je z flagą `stale`.
    calls = {"n": 0}

    async def boom():
        calls["n"] += 1
        raise RuntimeError("403 rate limit exceeded")

    saved = dict(app_updates._cache)
    original_fetch, original_save = app_updates._fetch, app_updates._save_store
    try:
        app_updates._fetch = boom
        app_updates._save_store = lambda data, at: None
        app_updates._cache.update(at=0.0, data=normal, failed_at=0.0)
        stale = asyncio.run(app_updates.latest())
        assert stale["stale"] is True and stale["version"] == "1.8.0", stale
        assert stale["sha256"] == digest, "suma z ostatniego wydania musi zostać"
        # przerwa po błędzie: kolejne telefony nie dokładają się do limitu
        asyncio.run(app_updates.latest())
        assert calls["n"] == 1, calls

        # bez żadnych znanych danych błąd nadal jest błędem
        app_updates._cache.update(at=0.0, data=None, failed_at=0.0)
        try:
            asyncio.run(app_updates.latest())
            raise AssertionError("bez danych zapasowych powinien być wyjątek")
        except RuntimeError:
            pass
    finally:
        app_updates._fetch, app_updates._save_store = original_fetch, original_save
        app_updates._cache.clear()
        app_updates._cache.update(saved)

    print("OK: app update metadata + stale fallback")


if __name__ == "__main__":
    main()
