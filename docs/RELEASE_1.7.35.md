# Strażnik 1.7.35 — zamknięcie karty strefy nie zamyka listy sygnałów

- Dotknięcie ✕ na karcie strefy zamykało listę sygnałów, a samej karty nie. Teraz zamyka tylko kartę.
- Punktacja bez zmian.

## Co się działo

Ścieżka zgłoszona przez użytkownika: zakładka **Sygnały** → plakietka strefy
w karcie województwa → otwiera się opis strefy → ✕. Zamiast zamknąć opis,
znikała lista sygnałów, a opis zostawał.

Panele zamykają się po wskazaniu dowolnego miejsca poza nimi — obsługuje to jedno
zdarzenie `pointerdown` dla myszy i dotyku. Karta obiektu jest osobnym elementem,
leżącym **poza** `#panel`, więc dotknięcie jej krzyżyka liczyło się jako „kliknięcie
poza panelem" i zwijało listę.

Drugi objaw brał się z tego samego: pozycja karty zależy od dolnego stosu, więc
zwinięcie panelu przesuwało ją spod palca. `pointerdown` trafiał w ✕, ale `click`
lądował już obok — i karta zostawała otwarta. Odtworzone na produkcji przed
poprawką:

```
po kliknięciu plakietki : panel otwarty, karta otwarta
po dotknięciu ✕         : panel ZAMKNIĘTY, karta NADAL OTWARTA
```

Karta obiektu i strefy nie jest już traktowana jak „miejsce poza panelem" — ani
dla listy sygnałów, ani dla legendy. Otwiera się przecież z ich wnętrza.
