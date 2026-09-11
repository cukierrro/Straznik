# Metadane NEPTUN do analizy progów

Stan 2026-09-08: użytkownik zatwierdził wdrożenie wyłącznie archiwizacji.
Commit `478342f` opublikowany; użytkownik wykonał pull i restart VPS.
Odczyt API potwierdził nowe metadane w migawce 19:17:51 CEST (12/12 śladów).
Starsza sprawdzona migawka zachowała stary format. Health źródeł bez błędów.
Nie potwierdzono jeszcze zapisu nowego naturalnego sygnału w signals.details,
ścieżki REST, zużycia RAM ani dziennika błędów VPS (SSH wymaga logowania).
Dotyczy zapisu diagnostycznego, nie zmiany progów, punktacji ani wysyłek.

## Format

Każda nowa migawka zagrożenia i szczegóły nowego sygnału NEPTUN otrzymują
osobne pole `source_metadata`:

```json
{
  "schema_version": 1,
  "source_fields": {
    "updatedAt": "surowa wartość źródłowa lub null",
    "confirmedAt": "surowa wartość źródłowa lub null",
    "createdAt": null,
    "observedAt": null,
    "observed_at": null,
    "count": 4,
    "status": "active",
    "lifecycle": "uncertain",
    "positionQuality": "approx",
    "displayConfidence": "medium"
  },
  "field_presence": ["updatedAt", "confirmedAt", "count", "status", "lifecycle"],
  "receipt": {
    "received_at": "2026-09-08T15:30:49.000+00:00",
    "transport": "ws",
    "message_type": "upsert",
    "source_message_ts": "surowe ts koperty albo null"
  }
}
```

To przykład schematu, nie historyczny pomiar. `field_presence` w rzeczywistym
zapisie wymienia dokładnie obecne klucze, także jeśli ich wartość jest null.

- Nie interpretujemy ani nie poprawiamy surowych czasów źródłowych.
- Nie tworzymy observed_at z updatedAt, confirmedAt, czasu koperty lub odbioru.
- Brak count daje null i brak klucza w field_presence. Jawne count=null ma
  klucz obecny. Dotychczasowy fallback punktacji count=1 pozostaje nietknięty;
  surowe dane do audytu są zachowane osobno.
- received_at: lokalny czas odbioru kompletnej wiadomości WS / odpowiedzi
  HTTP w UTC, milisekundy. **Nie czas obserwacji ani wykonania migawki.**
- Powtórne odebranie snapshotu może zmienić czas odbioru, nie odmładza
  źródłowych updatedAt/confirmedAt. Heartbeat nie podmienia czasów obiektów.
- Pole wewnętrzne `_receipt` jest nadpisywane lokalnie przy odbiorze:
  źródło nie może przypisać sobie lokalnego znacznika czasu.
- Stare migawki pozostają bez tych metadanych. Niczego nie uzupełniamy wstecz.
- Zachowanie UI pozostaje takie samo: pola diagnostyczne są zagnieżdżone,
  nie zastępują dawnych pól używanych przez mapę i punktację.

## Zakres i koszt

Bez migracji schematu SQLite: korzystamy z istniejącego JSON w snapshots
i signals.details. Nie dodano osobnej pętli, zapytań do NEPTUN ani tabeli
śledzącej użytkowników. Interwał migawki (120 s) i retencja pozostają bez zmian.
Nie jest to pełny dziennik wszystkich upsert/remove: zdarzenia pomiędzy
migawkami nadal mogą być niewidoczne; zniknięcie nie dowodzi zestrzelenia.

Na 18 rzeczywistych śladach z zapisanej próbki, z przykładową kopertą odbioru,
projekcja dodała około 9,5 KB JSON na migawkę (504–541 B na ślad).
To oszacowanie rozmiaru danych, **nie pomiar RAM serwera** ani gwarancja stałego
kosztu: zależy od liczby obiektów i wartości pól. Przy stałych 18 śladach
i 360 migawkach daje około 3,4 MB dodatkowego surowego JSON na 12 godzin.

## Weryfikacja lokalna

- `scripts/check_neptun_archive_static.py`: wyłącznie parsowanie AST,
  bez importu/uruchamiania backendu. Po odjęciu dokładanych metadanych
  porównano dotychczasowe instrukcje z bazą `53b2831` (ówczesny HEAD).
  Lokalny skrypt audytu i laboratorium nie są częścią publikacji. PASS; punktacja, tytuły,
  deduplikacja, callbacki i interwały nie zostały zmienione.
- Budowanie izolowanego APK uruchamia tę kontrolę i przekazuje schemat
  do Pixela. Interpreter można wskazać przez STRAZNIK_AUDIT_PYTHON lub
  parametr Gradle archiveAuditPython.
- Pixel offline: 18/18 kontroli projekcji metadanych PASS, w tym count=4,
  null/brak/zero, rozdzielenie czasów, niezmienność oryginału i zgodność JSON.
  Pozostałe 119 kontroli oraz test pamięci po restarcie nadal PASS.
- Test na Pixelu sprawdza równoważną projekcję deklaratywnego schematu;
  **nie uruchamia kolektora Python, SQLite ani prawdziwej wysyłki**.
  Późniejsza weryfikacja produkcyjna potwierdziła WS i odczyt zapisanej
  migawki z metadanymi; REST i zapis nowego sygnału pozostają niezweryfikowane.
  Nie przedstawiać kontroli AST jako testu integracyjnego.

Instrukcja PL/EN i zrzuty: nie wymieniać, ponieważ interfejs, alarmy i sposób
obsługi nie ulegają zmianie. Dokumentacja techniczna tej poprawki jest tutaj.
Nowy APK produkcyjny nie jest potrzebny do rozpoczęcia archiwizacji na VPS.

## Wdrożenie — zgoda tylko na archiwizację

Nie publikować prototypu progów wraz z tą poprawką. Zakres wdrożenia ograniczyć
do neptun_archive.py, kolektora, main.py i dokumentacji archiwizacji.
Po uzgodnionym wdrożeniu sprawdzić metodą GET nową migawkę po co najmniej
jednym cyklu: source_metadata, rozdzielone czasy, raw count, stare rekordy bez
backfillu. Sprawdzić błędy w logach i koszt pamięci. Żadnego testowego ingest
ani notify; działający system może niezależnie reagować na realną sytuację.
Przywrócenie poprzedniego kodu nie wymaga usuwania nowych metadanych z bazy.
