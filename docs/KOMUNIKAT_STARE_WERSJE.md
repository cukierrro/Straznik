# Prośba o aktualizację — tylko do starych wersji

Od 1.7.63 aplikacja odpytuje serwer i **nie otwiera już gniazda (WebSocket)**. Dlatego każdy,
kto jeszcze wisi na gniazdku, ma z definicji starsze wydanie — a ramka gniazda jest jedynym
kanałem, który trafia dokładnie do nich i pomija wszystkich pozostałych.

Zwykły `data/notice.json` idzie do **wszystkich**, więc „zaktualizuj aplikację" zobaczyłoby też
kilkaset osób, które właśnie to zrobiły. Do starych wersji służy osobny plik:
`data/notice-stare-wersje.json`.

## Treść do opublikowania

```json
{
  "id": "aktualizacja-1763",
  "text": "Masz starszą wersję Strażnika. W aplikacji: Ustawienia → Aplikacja → „⬆ Sprawdź aktualizacje” — nowa instaluje się na starej, ustawienia i miejsca zostają. W przeglądarce wystarczy odświeżyć stronę.",
  "until": "2026-10-15T00:00:00+02:00"
}
```

Dlaczego tak, a nie inaczej:

- **„instaluje się na starej"** — APK jest podpisany tym samym kluczem, więc aktualizacja
  zachowuje zapisane miejsca i ustawienia. **Nie pisać „odinstaluj i zainstaluj ponownie"**:
  to skasowałoby człowiekowi wszystko, co sobie ustawił.
- **zdanie o przeglądarce** — część tych połączeń to nie telefony, tylko karty z zapamiętaną
  starą stroną. Im wystarczy odświeżenie; same wygasną, gdy przeglądarka odświeży `app.js`.
- **bez adresu do przepisania** — treść komunikatu jest celowo eskejpowana (komunikat z serwera
  nie może wstrzyknąć niczego do aplikacji), więc link i tak nie byłby klikalny. Przycisk
  „⬆ Sprawdź aktualizacje" sam pobiera wydanie i uruchamia instalację.
- **`until`** — komunikat wygasa sam. Zapomniany nie będzie straszył ludzi w nieskończoność.

Przycisk i zakładka „Aplikacja" istnieją we wszystkich wydaniach od 1.7.50 do 1.7.62 — sprawdzone
w drzewie znaczników, więc instrukcja jest prawdziwa dla każdej wersji, która jeszcze łączy się
gniazdem.

## Publikacja (bez restartu usługi)

```bash
ssh ruth121 'cat > /opt/straznik/backend/data/notice-stare-wersje.json' < docs/notice-stare-wersje.json
```

Plik czytany jest przy każdym odświeżeniu stanu, więc komunikat pojawia się w ciągu sekund.
Stare wersje dostają go przy połączeniu, a średnia sesja gniazda to ~140 s — czyli u wszystkich
w ciągu paru minut.

Zdjęcie komunikatu: `rm` tego pliku (albo poczekanie na `until`).

## Czego ten komunikat NIE robi

- nie idzie pushem — push to kanał alarmowy, z syreną; prośba o aktualizację tam nie należy,
- nie zbiera żadnych danych zwrotnych — aplikacja tylko wyświetla tekst i pozwala go zamknąć,
- nie wyłącza gniazd. To osobna decyzja, przy progu ~2% (dziś ~19%), opisana w pamięci projektu.

Test pilnujący, że komunikat nie wycieknie do nowych wersji: `py scripts/test_komunikat_stare_wersje.py`.
