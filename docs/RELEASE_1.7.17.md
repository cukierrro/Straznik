# Strażnik 1.7.17 — spójna historia samolotów

- Poprawiono błąd, przez który wpis ADS-B z przyszłości mógł pojawić się na wcześniejszej migawce.
- Panel 🛰, mapa i szczegóły maszyn pokazują ten sam wybrany czas. Dane na żywo nie zastępują historycznej pozycji ani telemetrii.
- Przygaszone ostatnie pozycje (z wcześniejszych wpisów do 2,5 min) mają oznaczenie czasu i osobny licznik; nie oznaczają lądowania ani zestrzelenia.
- Dziennik serwera działa także dla czasu, gdy aplikacja była zamknięta; wpisy lokalne są scalane bez duplikatów. Niedostępność dziennika jest widoczna.
- Przewijanie nadal działa lokalnie, bez zapytania do serwera przy każdym ruchu palca.
- Bez zmian punktacji, progów i wysyłania alarmów. Instrukcja PL/EN opisuje nowe zachowanie.

## English

Aircraft history now uses one consistent time across the map, the 🛰 panel and aircraft details. Future entries are excluded. Dimmed last positions are labelled and counted separately from snapshot aircraft. A small server journal covers periods when the app was closed. Scrolling remains local. Scoring and alerts are unchanged.
