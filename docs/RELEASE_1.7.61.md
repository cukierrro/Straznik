# Strażnik 1.7.61 — trzy poprawki zgłoszone z telefonów

## Historia znowu wygląda jak mapa na żywo

Po wydaniu 1.7.60 w trybie historii zamiast ikony drona potrafił pojawić się **pełny żółty krążek**, a sylwetki były gorzej czytelne.
Przyczyna: migawki nie zapisują czasu potwierdzenia obiektu, więc znaczniki w historii szły bez wieku meldunku. Wygaszanie dodane w 1.7.60 dostawało wtedy pustą wartość, silnik mapy odrzucał całe wyrażenie i brał ustawienie domyślne, czyli pełne krycie — miękka poświata pod ikoną zamieniała się w jednolite koło.

- migawka zapisuje teraz wiek meldunku w minutach,
- obiekty odtworzone z sygnałów liczą wiek względem oglądanej chwili,
- brak wieku rysuje obiekt jak świeży, zamiast psuć rysowanie.

Migawki starsze niż ta aktualizacja nie mają zapisanego wieku i wyglądają jak przed 1.7.60.

## Moje miejsca bez znikających zakładek

Przy czterech i więcej miejscach rząd zakładek przewijał się w bok. Na wąskim ekranie — a w systemie iOS bez widocznego paska przewijania — zapisane miejsca po prostu znikały za krawędzią.
Teraz zakładki **zawijają się do kolejnych wierszy**, a długie nazwy kończą się wielokropkiem. Osiem miejsc mieści się w czterech wierszach.

## iPhone nie powiększa już ekranu przy pisaniu

Pola formularzy nie miały ustawionego rozmiaru tekstu i brały 13 punktów. iOS przybliża wtedy całą stronę przy dotknięciu pola i sam tego nie cofa, a w aplikacji nie ma paska adresu, którym dałoby się wrócić.
Pola mają teraz 16 punktów — tyle, ile iOS wymaga, żeby nie przybliżać. Reguła działa wyłącznie w Safari i WebView Apple, więc **na Androidzie nic się nie zmienia**. Powiększanie strony pozostaje dostępne dla użytkownika.
