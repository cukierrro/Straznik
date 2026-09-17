# Strażnik 1.7.56 — „duży ruch” zamiast „brak połączenia”

## Co się stało 17 września

- Podczas syren w Lublinie i Rzeszowie z serwerem łączyło się naraz więcej osób, niż pozwalał limit połączeń na żywo (3000).
- Serwer działał, a mapa się odświeżała, ale aplikacja przez około dwie godziny pokazywała **„brak połączenia z serwerem”** i co kilka sekund próbowała połączyć się od nowa.
- Powiadomienia i alarmy doszły normalnie — nie zależą od połączenia na żywo.

## Co się zmienia

- Gdy serwer jest zajęty, aplikacja pokazuje **„duży ruch — mapa odświeżana co kilka sekund”**, pobiera stan mapy co 5–8 sekund i próbuje połączenia na żywo co 1–2 minuty.
- „Brak połączenia z serwerem” pojawia się tylko wtedy, gdy nie da się pobrać nawet stanu mapy.
- Serwer: limit połączeń na żywo 10 000 zamiast 3000, a nadmiarowi użytkownicy dostają sygnał „zajęty” zamiast odmowy. Na stronie internetowej te zmiany działają już od 17 września.
