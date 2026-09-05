"""Regresje metadanych bezpiecznej aktualizacji APK."""
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
    print("OK: app update metadata")


if __name__ == "__main__":
    main()
