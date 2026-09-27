# Wycofanie wydania — punkt przywracania

Co robić, gdy wydanie okaże się złe. Pisane na spokojnie, żeby dało się z tego
skorzystać w pośpiechu.

## Punkt przywracania: 1.7.81

| | |
|---|---|
| tag | `v1.7.81` |
| commit | `3f1fe10` — „Wydanie 1.7.81: alarm da się odczytać czytnikiem ekranu” |
| wydane | 26.09.2026, 21:47 UTC |
| APK | zasób `Straznik.apk` w wydaniu `v1.7.81` na GitHubie (28,8 MB) |
| na VPS | ten sam commit był wdrożony 27.09.2026 przed wydaniem 1.7.82 |

## Najważniejsze: co da się cofnąć, a czego nie

**Serwer — tak.** Backend, frontend na stronie i API wracają jednym `git checkout`
i restartem. Zmiana dociera do przeglądarek w **około minutę**: strona główna ma
`max-age=0, s-maxage=60`, więc przeglądarka zawsze pyta, a brzeg Cloudflare trzyma
kopię najwyżej minutę (plus do 5 minut w trybie „podaj starą i odśwież w tle”).

**Aplikacja na telefonie — NIE.** Android nie zainstaluje wydania o niższym
`versionCode` na wyższym, a wbudowany aktualizator patrzy na NAJNOWSZE wydanie
w GitHubie. Nie ma więc czegoś takiego jak cofnięcie aplikacji u ludzi, którzy
już ją zaktualizowali. **Zepsutą aplikację naprawia się kolejnym wydaniem, nie
wycofaniem.** Jedyne, co można zrobić od ręki, to usunąć wadliwe wydanie
z GitHuba, żeby nie pobierali go następni — kto ma, ten ma.

Z tego wynika kolejność przy wydawaniu: **najpierw serwer, potem aplikacja.**
Serwer da się cofnąć, aplikacji nie.

## Wycofanie serwera

Na VPS (`ssh straznik`, katalog `/opt/straznik`):

```bash
cd /opt/straznik
git log --oneline -3                 # zobacz, co jest teraz
git checkout v1.7.81                 # albo: git reset --hard 3f1fe10
systemctl restart straznik straznik-reader
systemctl is-active straznik straznik-reader straznik-tunnel
curl -s -o /dev/null -w '%{http_code}\n' https://straznik.eu/api/health/critical
```

- `straznik.service` to **writer** (liczy stan, port 40141),
  `straznik-reader.service` **reader** (podaje gotowe bajty, 40142).
  Oba czytają ten sam katalog, więc oba trzeba zrestartować.
- Backend serwuje też pliki strony, więc cofnięcie repozytorium cofa frontend.
- Paczki GROTY leżą poza repozytorium (`/var/lib/straznik/grota-paczki`)
  i wycofanie ich nie dotyka.

Po restarcie sprawdź, czy stan naprawdę płynie — sama żywa usługa nie wystarcza:

```bash
curl -s https://straznik.eu/api/state | head -c 120   # powinien być świeży fusion.ts
```

## Czy aplikacja 1.7.82 przeżyje cofnięty serwer?

**Tak, sprawdzone.** Od 1.7.82 klient pyta o `/api/state?part=main`. Backend 1.7.81
nie zna tego parametru, ignoruje go i odsyła **pełny** stan. Klient to rozpoznaje
po obecności sekcji `adsb`, wyrzuca zapamiętaną część pomocniczą i bierze to, co
przyszło.

Zabezpieczenie jest nieoczywiste i dlatego ma własny test: bez niego klient
nałożyłby na pełny stan starą część pomocniczą i **samoloty zamarłyby** na mapie
w ostatnio pobranej pozycji, a mapa wyglądałaby zupełnie normalnie — nikt by tego
nie zgłosił. Sekcja 6 w `scripts/test_odpytywanie.cjs`.

## Czego wycofanie NIE naprawi samo

- **Klucze `?v=` w adresach plików.** Pliki z wersją w adresie leżą w przeglądarce
  rok (`immutable`). Wycofanie podmienia `index.html`, a ten wskazuje na stare
  klucze, więc użytkownik dostanie starą, poprawną treść. Ale **nigdy nie wolno
  wypuścić dwóch różnych treści pod tym samym kluczem** — wtedy część ludzi
  zostałaby ze złą wersją na rok i żadne wycofanie ich nie ruszy.
  Pilnuje tego `scripts/test_klucze_cache.cjs`.
- **Wyłączniki funkcji.** `data/wylaczniki.json` na serwerze pozwala zgasić
  pojedynczą funkcję (tak wyłączano GROTĘ) bez wycofywania całości. Jeśli problem
  da się zamknąć wyłącznikiem, to jest szybsza i mniej ryzykowna droga.
- **Wydanie w Google Play.** Idzie osobnym torem i ma własne wycofanie w konsoli.

## Kolejność przy podejrzeniu awarii

1. Czy to na pewno wydanie? Sprawdź `/api/health/critical` i panel Cloudflare —
   awaria źródła wygląda podobnie, a wycofanie jej nie naprawi.
2. Czy wystarczy wyłącznik?
3. Jeśli nie — wycofaj serwer (wyżej) i dopiero wtedy szukaj przyczyny.
4. Aplikację napraw kolejnym wydaniem.
