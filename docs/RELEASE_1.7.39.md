# Strażnik 1.7.39 — odporność na szczyty ruchu

- Stan, historia i strefy są przygotowywane zawczasu i podawane przez Cloudflare — serwer nie liczy ich przy każdym wejściu.
- Serwer sam odrzuca nadmiar wejść na stronę, zanim zabraknie pamięci; powiadomienia i zbieranie danych działają dalej.
- Po utracie połączenia aplikacja łączy się ponownie z losowym opóźnieniem, żeby tysiące telefonów nie wracały w tej samej sekundzie.
- Gdy serwer jest przeciążony, aplikacja pobiera stan co kilka sekund i po 1–2 minutach próbuje wrócić do stałego połączenia.

## Dlaczego

13 września o 04:54:50, w szczycie porannego ataku, jądro zatrzymało usługę za
przekroczenie limitu pamięci; po 5 sekundach wstała sama. W szczycie było 2700
zapytań na minutę i ponad 3300 adresów w 40 minut, a każde wejście składało od nowa
12-godzinną historię (8,4 MB). Teraz jest ona gotowa zawczasu (420 KB po kompresji)
i podawana z pamięci Cloudflare. Pomiar na serwerze po zmianach: 4700 zapytań
o stan na sekundę przy stałym zużyciu pamięci.
