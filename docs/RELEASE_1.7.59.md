# Strażnik 1.7.59 — lżejsze połączenie na żywo

## Co się zmienia

- Serwer wysyłał każdemu telefonowi **cały stan mapy (ok. 55 KB)** przy każdej zmianie i kompresował go **osobno dla każdego połączenia**.
- Pomiar z 17 września 2026: rozesłanie do **1281 telefonów zajmowało 0,98 s** (najdłuższe 1,25 s), a samo policzenie stanu tylko 3 ms. To blokowało serwer i dawało zacięcia oraz komunikat o dużym ruchu podczas syren w Lublinie.
- Teraz połączenie na żywo przenosi **sygnał „zmieniło się” (ok. 50 bajtów)**, a aplikacja pobiera stan z pamięci podręcznej Cloudflare. Rozesłanie sygnału do 1000 telefonów zajmuje **5 ms**.

## Co to znaczy dla użytkownika

- Mapa odświeża się tak samo; pierwszy stan przychodzi w całości zaraz po połączeniu.
- Alarmy i powiadomienia push idą osobną drogą — bez zmian.
- Limit jednoczesnych połączeń na żywo: **15 000** (wcześniej 10 000, a podczas syren 3000).

## Pod spodem

- Klient łączy się z `/ws?v=2`; serwer trzyma takich klientów w osobnej puli i wysyła im ramkę `{"type":"tick","etag":...}`.
- Aplikacja pomija pobranie, gdy znacznik wersji się nie zmienił albo gdy pobieranie już trwa.
- `/api/health` pokazuje liczbę połączeń w trybie sygnału i czas rozsyłki.
