# Wydanie 1.8.14 — budzik po alarmie, Kowel bez czerwonego, uczciwiej o tym, czego nie widać

versionCode 145, versionName 1.8.14. 25 listopada 2026. Wspólny numer dla Androida i iPhone'a.

<!-- zmiany -->
- Android: po wyciszeniu czerwonego alarmu głośność „Alarmy” wraca do tej sprzed alarmu, a nie do wartości zapamiętanej wiele godzin wcześniej — budzik nie zostaje wyciszony.
- Czerwony: dron w środku miejscowości z katalogu źródła (np. Kowel) dalej niż 50 km od powiatu lub województwa nie zapala czerwonego — zostaje żółty.
- „O aplikacji” wyjaśnia, dlaczego nie widać dronów i rakiet nad Polską.
- Ustawienia → Mapa podpowiadają, co pomaga, gdy mapa się zacina na słabszym telefonie.
<!-- /zmiany -->

## Android: budzik po alarmie

Opinia w Google Play z 20 listopada (Motorola edge 70, 1.8.09): po wyłączeniu alertu w aplikacji zostawał wyciszony systemowy budzik i wszystko, co korzysta z głośności „Alarmy”.

Przy czerwonym alarmie aplikacja podnosi głośność „Alarmy” co najmniej do połowy (albo do maksimum z opcją pełnej głośności), a po wyciszeniu przywraca poprzednią. Zapamiętana głośność „sprzed alarmu” zostawała jednak w pamięci, gdy przywrócenie nie doszło do skutku — na przykład system zamknął aplikację w trakcie alarmu. Następny alarm jej nie nadpisywał, więc po nim aplikacja ustawiała głośność sprzed wielu godzin, choćby 0 z nocy, choć użytkownik zdążył ją zmienić.

Od 1.8.14 aplikacja zapamiętuje też głośność, którą sama ustawiła, i przywraca poprzednią tylko wtedy, gdy obecna to wciąż ta ustawiona przez aplikację. Kto w trakcie alarmu albo pomiędzy alarmami zmienił głośność ręcznie, zostaje przy swoim. Zapis zostawiony przez starsze wersje jest traktowany jak nieaktualny. Sprawdzone testem (9 scenariuszy) i na emulatorze Pixel 7: z podłożonym starym zapisem „1” i budzikiem na 6 alarm podniósł głośność do 7, a po wyciszeniu wróciła 6 — dawny kod ustawiłby 1. iPhone tego nie dotyczy: tam aplikacja nie zmienia głośności systemu.

## Czerwony: punkty katalogowe miejscowości

Źródło podaje czasem jako pozycję „potwierdzoną” środek miejscowości ze swojego katalogu — te same współrzędne co do metra u wielu różnych dronów. To znaczy „gdzieś w okolicy”, a nie pomiar. Kowel leży 54,7 km od granicy, czyli równo na 15 minut dolotu, i od 2 sierpnia do 20 listopada otworzył 25 z 56 czerwonych; 24 listopada dwa kolejne w powiecie hrubieszowskim. RCB wysyłało przy nich najwyżej alert o monitorowaniu sytuacji.

Dron w takim punkcie dalej niż 50 km od województwa lub powiatu nie otwiera już czerwonego; punkty liczą się jak dotąd, więc żółty zostaje. Lista jest ręczna i obejmuje Kowel, Lwów, Dublany, Gródek i Drohobycz. Bliżej niż 50 km (np. Rawa Ruska, Luboml) i dla rakiet wszystko działa jak dotąd. Przeliczenie na danych od 2 sierpnia: czerwonych 34 zamiast 56, żółte bez zmian; 6 czerwonych przychodzi 4–42 minuty później, gdy ten sam atak dał bliższy obiekt.

Powiadomienia liczy serwer, więc reguła działa od 24 listopada wieczorem. W tym wydaniu trafia też do trybu wbudowanego aplikacji (gdy serwer nie odpowiada). Nowe punkty o stałych współrzędnych sprawdza co tydzień skrypt przeglądu.

## Czego nie widać

Pytanie wraca w opiniach: dlaczego nie widać dronów, które wleciały nad Polskę? Źródło śledzi niebo nad Ukrainą, a nad Polską nikt takich danych nie publikuje — dane radarowe wojska nie są jawne. Obiekt, który przekroczy granicę, znika z mapy; to nie znaczy, że odleciał. Liczą się wtedy syreny, Alert RCB i RSO. Ekran „O aplikacji” → „Czego ta aplikacja NIE robi” mówi to teraz na samym początku, a instrukcje w rozdziale 12.

## Mapa na słabszym telefonie

Od 1.8.13 mapa rysuje około 380 brył powiatów. Na telefonach z małą ilością pamięci (opinia z Moto e20) potrafi się zacinać. Ustawienia → Mapa → Podział mapy podpowiadają teraz, co pomaga: „Województwa” i wyłączenie Menu → Widok 3D (mapa patrzy wtedy z góry, bez ścian brył). Domyślny widok się nie zmienia.
