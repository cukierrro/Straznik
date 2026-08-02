# Odpowiedniki PAŻP u sąsiadów — co realnie da się pobrać

Sprawdzone **realnym curlem 2 sierpnia 2026**, nie z opisów i nie z wyszukiwarki.
Każdy wiersz poniżej to zaobserwowany kod HTTP, typ treści i zawartość odpowiedzi.
Surowe wyniki: `test-out/sonda.txt`, pełne odpowiedzi w `test-out/sonda/`.
Sonda do powtórzenia: `8_sonda_zrodel.bat` + lista w `scripts/probe_urls.txt`.

## Wynik w skrócie

**Są CZTERY realnie użyteczne źródła: Rumunia, Litwa, Estonia i Łotwa.**
Rumunia jest lepsza niż PAŻP do naszego celu, bo oddaje sparsowany NOTAM razem
z geometrią i oknem czasowym. Łotwa domknięta (proxy same-origin — patrz niżej),
z bogatymi atrybutami (typ restrykcji, operator wojskowy, okno czasowe). Słowacja,
Węgry i Białoruś odpadają.

---

## 🇷🇴 Rumunia — najlepsze źródło z całej stawki

ROMATSA wystawia **publiczny GeoServer** (OGC WFS), bez klucza i rejestracji.

```
https://flightplan.romatsa.ro/init/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities
```

Wykaz warstw zawiera m.in. `opr:AUP`, `carto:restrictii_notam_pt_uav`,
`carto:cairestrictionatelower`, `carto:cairestrictionateupper`,
`carto:zone_restrictionate_uav`.

Warstwa **`opr:AUP`** jako GeoJSON (200, `application/json`):

```
https://flightplan.romatsa.ro/init/geoserver/ows?service=WFS&version=1.0.0
  &request=GetFeature&typeName=opr:AUP&outputFormat=application/json
```

Pojedynczy obiekt wygląda tak:

```json
{
  "serie": "B9281/2026",
  "notam_id": 11820677,
  "mesaj": "(B9281/26 NOTAMN\nQ) LRBB/QRDCA/IV/BO /W /000/150/4534N02513E001\nA) LRBB B) 2607180900 C) 2608111700\nE) DANGER AREA ACTIVATED\n   PJE WILL TAKE PLACE INTO THE FLW AREA: ...\nF) GND G) FL150)",
  "dfrom": "2026-07-18T09:00:00Z",
  "dto":   "2026-08-11T17:00:00Z",
  "lower": 0, "upper": 150, "um": "FL",
  "tip": "D"
}
```

To jest **więcej, niż daje PAŻP**: mamy numer NOTAM-u, pełną treść, kod Q,
okno ważności w UTC, pułapy i poligon w jednym rekordzie.

Druga warstwa, `carto:restrictii_notam_pt_uav`, to restrykcje dla UAV
wywiedzione z NOTAM-ów (200, GeoJSON). Do tego statyczny plik stref:
`https://flightplan.romatsa.ro/init/static/zone_restrictionate_uav.json`
(200, 2,17 MB GeoJSON).

## 🇱🇹 Litwa i 🇪🇪 Estonia — ta sama platforma, ten sam wzorzec

Oro Navigacija i EANS używają **tego samego produktu** (bundle `main.js` różni
się o 600 bajtów). Endpoint znalazłem w ich własnym kodzie:

```
https://utm.ans.lt/avm/utm/uas.geojson     → 200, application/json, 3,5 MB, 335 stref
https://utm.eans.ee/avm/utm/uas.geojson    → 200, application/json, 5,1 MB, 232 strefy
```

**UWAGA (Litwa):** przy weryfikacji serwerowym curlem z domyślnym User-Agentem
`utm.ans.lt` zwrócił **403** (Estonia 200). To UA-gating — kolektor MUSI wysłać
User-Agent przeglądarki, dokładnie jak `pansa.py`.

Format ED-269 z polem `applicability`. Rozkład na żywych danych:

| | strefy ogółem | z oknem czasowym | krótkotrwałe i aktywne w chwili sprawdzenia |
| --- | --- | --- | --- |
| Litwa | 335 | 29 | 24 |
| Estonia | 232 | 55 | 21 |

Istotne: identyfikatory tych czasowych stref to `A5076/26`, `A1964/26`,
`A2040/26` — czyli **numery NOTAM-ów serii A**. Innymi słowy oba kraje
publikują zamknięcia wynikające z NOTAM-ów jako gotowe wielokąty z oknem
czasowym. To omija problem, przez który odłożyliśmy NOTAM: nie trzeba parsować
tekstu i rekonstruować geometrii ze współrzędnych.

Bonus dla Litwy: `https://utm.ans.lt/avm/utm/operationplans.geojson`
(200, 59 KB) — aktywne plany lotów dronów.

Estonia ma dodatkowo **AUP w czystym HTML**, generowany automatycznie
z bazy przydziałów przestrzeni dla Tallinn FIR:

```
https://aim.eans.ee/notampib/aup/aup.html            → 200
https://aim.eans.ee/notampib/aup/aup_tomorrow.html   → 200
```

## 🇱🇻 Łotwa — DOMKNIĘTE (proxy same-origin, 2026-08-02)

Placeholder `LGS-AGS` NIE jest podstawiany hostem klienta — rozwiązuje go
**proxy same-origin na m.airspace.lv**. Nie potrzebujemy realnego hosta;
wchodzimy przez proxy (zweryfikowane serwerowym curlem, 200, bez klucza,
`Referer: https://m.airspace.lv/mob/`):

```
https://m.airspace.lv/mob/proxy/proxy.ashx?https://LGS-AGS/rest/services/DRONES/DronesZonesUAS/MapServer/0/query?where=1=1&outFields=*&f=json
```

Warstwy `DronesZonesUAS/MapServer/{0,1,2,3}` (kategorie stref). Jest też endpoint
czasowy `.../DronesZonesUASAMSL/MapServer/exts/DronesRestSOE/getJSONZones?f=json&time=<UTC>&endTime=<UTC>`.
Atrybuty stref (bogatsze niż samo ED-269): `ZONENAME`, `RESTRICTIONNAME`
(PROHIBITED/RESTRICTED), `REASONNAME` (np. AIR_TRAFFIC), **`TIMEPERIODSTARTDATE`/
`TIMEPERIODENDDATE`** (epoch ms — realne okno), `TOFLYNAME`/`TOFLYSERVICE`
(operator — widać wojsko: „Nacionālie bruņotie spēki / NBS Gaisa spēki MAMC"),
`UPPERLIMIT`/`LOWERLIMIT`, `PERMANENT`, `TYPENAME`, `MESSAGEENG`, geometria.
Filtr anty-szumowy: `REASONNAME` + operator wojskowy zamiast kodu Q.

## Co odpada — sprawdzone, nie domniemane

| Źródło | Wynik |
| --- | --- |
| `dronespace.sk` | domena nie rozwiązuje się (brak DNS) |
| `aim.lps.sk` | **403 Forbidden** |
| `dronemaps.sk` | działa (200), ale to prywatna aplikacja, nie źródło urzędowe |
| `api.autorouter.aero` (NOTAM) | **401** — wymaga konta, wbrew temu, co piszą o nim poradniki |
| `utm.ans.lt/avm/utm/reservations.geojson` | **504** (też z parametrem `?start=`) |
| `utm.eans.ee/avm/utm/reservations.geojson` | **504** |
| Białoruś | brak jakichkolwiek publicznych danych, przestrzeń zamknięta |
| Węgry `ais-en.hungarocontrol.hu/airspace-use-plan/` | 200, ale to strona HTML — treść AUP do zweryfikowania osobno |

---

## Jak to wpiąć, żeby nie zalać się szumem

Zastrzeżenie z poprzedniej analizy było słuszne i zostaje w mocy: **to w
większości rutynowe aktywacje**. Siedem surowych źródeł to siedmiokrotność
problemu, który oswajaliśmy przy PAŻP. Ale dane z Rumunii dają narzędzie,
którego przy PAŻP nie mieliśmy — **kod Q z NOTAM-u**.

W przykładzie wyżej: `Q) LRBB/QRDCA/IV/BO /W /000/150/...`. Trzeci i czwarty
znak kodu (`RD` = *danger area*, `RR` = *restricted area*, `RT` = *temporary
restricted*) plus piąty i szósty (`CA` = *activated*) pozwalają odsiać
skoki spadochronowe i ćwiczenia od zamknięć istotnych. Bez tego filtra
odradzam wpinanie czegokolwiek.

Proponowana kolejność, gdyby to robić:

1. **Rumunia** — najbogatsze dane i najłatwiejsze filtrowanie (kod Q + treść).
   Graniczy z Ukrainą, więc trafia w tę samą flankę co reszta systemu.
2. **Litwa** — graniczy z obwodem królewieckim i Białorusią, czyli dokładnie
   tam, gdzie już punktujemy media bałtyckie.
3. **Estonia** — ta sama implementacja co Litwa, więc kosztuje tylko zmianę URL.

Waga jak przy PAŻP: **1 pkt, limit 1 pkt na źródło**, tylko strefy w pasie
przygranicznym, i — jak przy każdym nowym źródle — najpierw instrumentacja
i obserwacja, ile sygnałów generuje na dobę, zanim zacznie punktować.

Uczciwie: żadne z tych źródeł nie mówi „jest zagrożenie". Mówią „ta przestrzeń
jest zajęta". Zamknięcie przestrzeni bywa skutkiem zagrożenia, ale bywa też
skutkiem ćwiczeń, skoków spadochronowych i lotów wojskowych, których jest
codziennie dużo.
