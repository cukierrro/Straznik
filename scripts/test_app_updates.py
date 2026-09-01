"""Regresje metadanych bezpiecznej aktualizacji APK."""
from app.app_updates import _release_data


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

    try:
        _release_data({"tag_name": "v1.0.0", "assets": []})
        raise AssertionError("brak APK powinien zostać odrzucony")
    except ValueError:
        pass
    print("OK: app update metadata")


if __name__ == "__main__":
    main()
