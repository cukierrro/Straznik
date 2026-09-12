"""Regresje metadanych bezpiecznej aktualizacji APK."""
import asyncio
import time

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
    assert changes == ["Naprawiono historię.", "Dodano opis.", "Usprawniono alarmy."]

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
