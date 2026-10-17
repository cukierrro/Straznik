# Dla Adriana — build 1.7.96 (2610171533) z TestFlighta

Wersja do testów ma w sobie nowy moduł, który ma w przyszłości tłumaczyć alarmy
na język aplikacji i wyciszać żółty sygnał, gdy ktoś tak ustawi. **Moduł jest na
razie uśpiony** — włączy go dopiero zmiana po stronie serwera. Dlatego ten test
dzieli się na dwie części i druga wymaga, żebyśmy wysłali Ci sygnał z serwera.

---

## Część 1 — do zrobienia od razu, samodzielnie (5 minut)

Sprawdzamy, że nowy moduł **niczego nie zepsuł**. To jest najważniejsze: aplikacja
ma działać dokładnie tak jak dotąd.

Zainstaluj 1.7.96 z TestFlighta, otwórz aplikację i przejdź:

1. **Mapa** — ładuje się, widać obiekty i kolory województw.
2. **⚙ → Alarmy** — czy wszystko wygląda normalnie i czy przy „Alarmy na tym
   telefonie" jest napisane, że powiadomienia są gotowe.
3. **⚙ → Dźwięk → „Test: czerwony natywny (za 5 s)"** — zablokuj ekran i posłuchaj.
   Alarm ma zadziałać tak jak w 1.7.95: z syreną, nad blokadą.
4. **Schronienie (GROTA)** — otwiera się, mapa punktów się rysuje.

Napisz krótko: czy coś działa inaczej niż w poprzedniej wersji. **Jeśli wszystko
jest jak było — to jest wynik pozytywny** i o to w tej części chodzi.

> **Uwaga, żeby nie szukać na próżno:** test 5 s **nie przejdzie** przez nowy
> moduł. iOS przepuszcza przez niego tylko powiadomienia przychodzące z serwera,
> a test jest planowany w telefonie. Więc nawet gdybyś przestawił język aplikacji
> na angielski, ten test dalej będzie po polsku. To nie błąd.

---

## Część 2 — po naszym sygnale (umówimy się na godzinę)

Tu sprawdzamy to, po co ten moduł powstał. Wyślemy Ci dwa powiadomienia na temat
**testowy** — nie idą do żadnego prawdziwego użytkownika.

### Przygotowanie (zrób przed umówioną godziną)

1. **⚙ → Alarmy** — upewnij się, że „Alarmy krytyczne" są włączone (przycisk
   powinien pisać „Alarm mimo wyciszenia: włączony").
2. **⚙ → Dźwięk → Głośność sygnału uwagi (żółty)** → ustaw **„Bez dźwięku"**.
3. Ustaw język aplikacji na **angielski** albo **ukraiński**
   (⚙ → Aplikacja → język). To jest sedno testu.
4. Zablokuj ekran i trzymaj telefon pod ręką.

### Co mierzymy

| # | Co wyślemy | Czego szukamy |
|---|------------|---------------|
| 1 | żółty sygnał | **czy jest CICHY** (baner ma przyjść, dźwięku ma nie być) i czy tytuł oraz dwa ostatnie zdania są w Twoim języku |
| 2 | czerwony alarm | **czy dźwięk ZOSTAŁ** mimo ustawienia „Bez dźwięku" dla żółtego — czerwonego nic nie ma prawa wyciszyć — i czy tekst jest w Twoim języku |

### Czego się spodziewać w treści

Przetłumaczone będą: nagłówek poziomu, zdanie „Co zrobić…" i zdanie o źródle
nieoficjalnym. **Nazwa województwa i opis sytuacji zostaną po polsku** — to
celowe, bo opis pisze serwer i są w nim m.in. cytaty z tytułów prasowych.

### Co nam przysłać

Dla obu powiadomień: **zrzut ekranu blokady** oraz jedno zdanie, czy był dźwięk.
Zrzut jest ważniejszy niż opis — po etykiecie nad tytułem („PILNE" albo
„KRYTYCZNE") widać, którą drogą poszło powiadomienie.

---

## Jeśli coś pójdzie nie tak

Nie szukaj przyczyny — to nasza robota. Najbardziej pomocne są trzy rzeczy:
co ustawiłeś, co zobaczyłeś i zrzut ekranu. **Wynik „nic nie przyszło" albo
„zagrało, choć nie powinno" jest dla nas równie cenny** jak wynik pozytywny;
po to robimy ten test przed wypuszczeniem, a nie po.

Po teście możesz przywrócić swoje ustawienia: język i głośność żółtego.
