# Kopie zapasowe Strażnika

Od 13.09.2026. Wcześniej nie było żadnej kopii.

## Jak działa

| Gdzie | Co | Kiedy |
|---|---|---|
| VPS `/var/backups/straznik/` | `straznik-RRRRMMDD-GGMM.tar.zst` | co 6 h (00:17, 06:17, 12:17, 18:17 UTC), `/etc/cron.d/straznik-backup` |
| Ten komputer `Dokumenty\Straznik-kopie\` | te same pliki | codziennie i przy logowaniu — zadanie „Straznik - kopie zapasowe” |

Przechowywanie: wszystkie z 48 h, jedna dziennie przez 30 dni, jedna tygodniowo
przez 90 dni, jedna miesięcznie przez rok — około 57 kopii po kilka MB.

W kopii: spójna baza `straznik.db` (sprawdzona `PRAGMA integrity_check`),
`vapid.json`, `fcm-service-account.json`, `.env`, pliki stanu stref i alertów,
plik usługi systemd oraz `MANIFEST.json` z liczbą sygnałów i subskrypcji.

**Kopie zawierają sekrety** (hasła i klucze z `.env`, klucze VAPID i FCM). Nie
wrzucać ich do repozytorium ani nie wysyłać dalej.

Stan ostatniej kopii: `https://straznik.eu/api/health` → `backup`
(`stale: true`, gdy ostatnia kopia jest starsza niż 7 h). Log na VPS:
`/var/log/straznik-backup.log`, na komputerze: `Straznik-kopie\pobieranie.log`.

## Odtworzenie

1. Wybrać kopię (najnowsza sprzed awarii) i skopiować ją na VPS, jeśli jej tam nie ma.
2. Na VPS:

   ```bash
   systemctl stop straznik
   mkdir -p /tmp/odtw && tar --zstd -xf /var/backups/straznik/straznik-RRRRMMDD-GGMM.tar.zst -C /tmp/odtw
   cat /tmp/odtw/straznik/MANIFEST.json
   cp /tmp/odtw/straznik/straznik.db /opt/straznik/backend/data/straznik.db
   rm -f /opt/straznik/backend/data/straznik.db-wal /opt/straznik/backend/data/straznik.db-shm
   cp /tmp/odtw/straznik/{vapid.json,fcm-service-account.json,pansa_seen.json,zones_since.json,official_alerts_seen.json} /opt/straznik/backend/data/
   cp /tmp/odtw/straznik/.env /opt/straznik/backend/.env
   chown root:straznik /opt/straznik/backend/.env && chmod 640 /opt/straznik/backend/.env
   chmod 600 /opt/straznik/backend/data/vapid.json /opt/straznik/backend/data/fcm-service-account.json
   systemctl start straznik
   ```

   Od 14.09.2026 usługa działa jako użytkownik `straznik` (audyt D9). Właściciela
   plików w `data/` poprawia sama przy starcie (`ExecStartPre` w drop-inie), ale `.env`
   leży poza `data/` i musi być czytelny dla grupy `straznik`.

3. Sprawdzić `/api/health` i czy strona pokazuje mapę.

`vapid.json` jest najważniejszy: bez tych samych kluczy żadna zapisana subskrypcja
powiadomień w przeglądarce nie zadziała i każdy musiałby włączyć je od nowa.

Na nowym VPS trzeba jeszcze sklonować repozytorium do `/opt/straznik`, utworzyć
`backend/.venv`, wgrać `straznik.service` z kopii, utworzyć użytkownika
(`useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin straznik`),
skopiować `scripts/systemd/straznik-d9-hardening.conf` do
`/etc/systemd/system/straznik.service.d/d9-hardening.conf` (`systemctl daemon-reload`)
i ponownie skonfigurować tunel Cloudflare.

Na Windows kopię rozpakowuje wbudowany tar (tar z Git Bash nie zna zstd):
`C:\Windows\System32\tar.exe -xf straznik-RRRRMMDD-GGMM.tar.zst -C <katalog>`.
Odtworzenie sprawdzone 13.09.2026: `integrity_check` ok, 1088 sygnałów, 175 subskrypcji.

Kopia na VPS działa z najniższym priorytetem (`nice`/`ionice`), żeby kompresja
nie konkurowała z serwerem w trakcie ataku.

## Czego te kopie NIE obejmują

Klucza podpisu aplikacji `android-app/android/straznik-release.jks` i haseł
z `keystore.properties`. Leżą tylko na tym komputerze. Utrata klucza oznacza,
że nie da się wydać aktualizacji istniejącym użytkownikom — trzymaj kopię
w menedżerze haseł albo na dysku zewnętrznym.
