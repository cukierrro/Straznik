# Strażnik 1.7.63 — mniej pracy dla serwera przy tej samej mapie

## Koniec ze stałym połączeniem

Do 1.7.62 każdy telefon trzymał otwarte gniazdo (WebSocket) do serwera Strażnika. Przy 530 telefonach to 530 gniazd w jednym procesie, a zużycie rosło **liniowo z liczbą osób** — czyli najbardziej wtedy, gdy wyją syreny i patrzą wszyscy naraz.

Teraz aplikacja **pyta o stan** i dołącza znacznik wersji, którą już ma:

- nic się nie zmieniło → odpowiada **Cloudflare ze swojego brzegu**: „304, nic nowego", kilkaset bajtów, nasz serwer o tym pytaniu nawet nie wie;
- stan się zmienił → Cloudflare pobiera **jedną** kopię od nas i rozdaje ją wszystkim pytającym.

Do serwera trafia więc najwyżej jeden stan na dwie sekundy na centrum danych — niezależnie od liczby użytkowników.

Pomiar z 20 września: stan zmienia się średnio **co 17 sekund**, a przy spokoju **6 z 7 zapytań** kończy się odpowiedzią „nic nowego".

## Co widzi użytkownik

Mapa odświeża się co dwie sekundy w czasie alarmu i co pięć, gdy jest spokojnie. W tle aplikacja nie pyta o nic — i tak jest wtedy zamrożona przez system. **Alarm przy zamkniętej aplikacji przychodzi jak dotąd powiadomieniem push** i ta droga się nie zmienia.

## Po stronie serwera

Znacznik wersji stanu przestał zmieniać się sam z siebie. Wcześniej stan przebudowywał się co kilka sekund tylko dlatego, że zawierał bieżący czas — i każde warunkowe pytanie dostawało pełne 28 KB zamiast krótkiego „nic nowego".

Serwer nadal obsługuje stare połączenia, więc wersje sprzed 1.7.63 działają bez zmian.
