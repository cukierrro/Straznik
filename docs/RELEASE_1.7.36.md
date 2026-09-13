# Strażnik 1.7.36 — przeniesienia bez podwójnego liczenia, odwołania RCB

- To samo zdarzenie przypisane do dwóch sąsiednich województw nie wraca już do sąsiada jako przeniesienie.
- Przeniesienie włącza powiadomienie tylko przy co najmniej 1 pkt własnych i najwyżej o jeden stopień.
- Kolor z samych przeniesień jest na mapie przygaszony, a karta ma kreskowaną ramkę i napis „podniesione przez sąsiedztwo · bez alarmu”.
- Dźwięk w otwartej aplikacji słucha poziomu alarmu, nie koloru mapy.
- Poziom gaśnie 0,5 pkt pod progiem; powrót na ten sam poziom w ciągu 30 min nie powtarza powiadomienia bez nowego alertu RCB albo obiektu NEPTUN.
- Odwołanie alertu RCB w RSO gasi alert i artykuły, które go potem opisują.

## Co się działo 13 września rano

Ten sam artykuł („Rosyjski atak na Ukrainę. Polskie lotnictwo poderwane, RCB
wysłało alerty…”) i ten sam alarm obwodu rówieńskiego trafiły do lubelskiego
i podkarpackiego. Każde województwo liczyło je w pełni, a potem jeszcze raz jako
40% przeniesienia od drugiego. Lubelskie dostało przez to żółty o 07:02 przy
1,97 pkt własnych i czerwony o 07:15 i 07:51, oba domknięte przeniesieniem.

Podkarpackie o 07:00–07:02 spadło na trzy minuty do 3,87 pkt i po kolejnym
artykule dostało drugi czerwony z tym samym alertem RCB co o 06:44.

Świętokrzyskie było żółte na mapie z samych przeniesień (0 pkt własnych).
Telefon nie dostawał powiadomienia, ale otwarta aplikacja włączała dźwięk według
koloru mapy.

RCB odwołało alert dla lubelskiego o 04:58, zmieniając istniejący wpis RSO
23329799. Kolektor znał już jego numer i zmiany nie zauważył, a o 07:39 i 07:44
artykuły o porannych syrenach dostały po 1,5 pkt.

## Sprawdzone na historii

Nowe reguły przeliczono na wszystkich sygnałach od 2 sierpnia (980 sygnałów):
39 powiadomień zamiast 45. Wszystkie 13 alertów RCB/RSO dało powiadomienie tak
samo jak wcześniej. Zniknęły powtórki i żółte zbudowane z tego samego zdarzenia
liczonego dwa razy.
