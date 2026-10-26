# Słownik województw (pełne formy)

Od 23.10.2026 województwa w tekstach (media, tytuły wpisów RCB na gov.pl) rozpoznaje
`backend/app/slownik_woj.py`, a jego lustro w `frontend/engine.js` (tryb bez serwera)
korzysta z tego samego pliku `frontend/assets/slownik-woj.json`. Wcześniej rozpoznanie
opierało się na rdzeniach („podlask”, „august”). Przez to „Biała Podlaska” w alercie RCB
dla lubelskiego dała fałszywy alert w podlaskim.

Plik powstaje z trzech źródeł:

| Plik w `<dane>` | Skąd | Licencja |
|---|---|---|
| `indeks.json` | PoliMorf 0.6.7 (IPI PAN) przez `indeks.py`. Ze słownika biorą się formy przez przypadki. | BSD 2-clause |
| `SIMC.csv` | TERYT SIMC „urzędowy” (GUS, eteryt.stat.gov.pl). Pełny rejestr miejscowości. | dane publiczne |
| `powiaty.geojson` | Granice powiatów z OSM (`admin_level=6`, `teryt:terc`). | ODbL |

`nazwy_hasel.json` (hasło → miejscowość w tym samym województwie) leży w repozytorium.
Odtwarza go `nazwy_hasel.py`, ale potrzebne to jest tylko po zmianie `config.VOIV_KEYWORDS`.

## Przebudowa

```
py -I scripts/slownik_woj/indeks.py <polimorf.tab> <dane>/SIMC.csv <dane>/powiaty.geojson <dane>/indeks.json
py scripts/slownik_woj/buduj.py <dane>
py scripts/slownik_woj/audyt.py <dane>
```

Warunek wdrożenia ustalony z użytkownikiem: audyt musi pokazać **0 i 0**. Pierwsza liczba
to formy, które dają cudze województwo; druga to formy zgubione. Kod wyjścia jest wtedy 0.

Po przebudowie uruchom też `scripts/test_slownik_woj.py` i `.cjs`. Zmienia się wtedy treść
pliku, więc trzeba podnieść klucz `?v=` przy `assets/slownik-woj.json` w `engine.js`.

`pospolite.py` wypisuje formy miast, które są też zwykłym słowem („tych”, „pile”, „helu”).
Wynik trzeba przejrzeć ręcznie i uzupełnić listę `POSPOLITE` w `buduj.py`. Formy, które
w wiadomościach znaczą miasto („Sosnowcu”, „Mielca”), zostają przy mieście.

## Reguły

- Kraina albo przymiotnik województwa wskazuje to województwo.
- Miejscowość z listy haseł wygrywa z niewymienioną wsią o tej samej formie.
- Dwa miasta o tej samej nazwie w różnych województwach dają wynik neutralny (Józefów).
  Wyjątki: Bolesławiec, Oleśnica, Olsztyn.
- Forma o dwóch znaczeniach z różnych województw albo słowo pospolite daje wynik neutralny.
- Wieloczłonowe nazwy z TERYT są frazami ochronnymi z prawdziwym województwem.
  Zapobiega to sytuacjom takim jak „Koziego Laska”, które dawało Łask.
- Pojedynczy przymiotnik po „powiat…” w tym samym zdaniu to nazwa powiatu z listy,
  a nie województwo.
