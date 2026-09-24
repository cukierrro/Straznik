# Strażnik 1.7.79 — odwołanie alarmu nie punktuje jak alarm

**24 września 2026**, versionCode 108. Poprzednie wydanie:
[1.7.78](RELEASE_1.7.78.md) (cichszy żółty i alert RCB z treści).
Wydanie cięte z tego samego commita co wersja na iPhone'a.

**Poprawki po 1.7.78: odwołanie alarmu nie punktuje jak alarm, historia pokazuje
właściwy kolor, a syrena na iPhonie przebija wyciszenie.**

To wydanie jest cięte z **jednego commita dla obu platform** — ten sam kod trafia
do aplikacji na Androida i do wersji na iPhone'a. Dotąd „1.7.78” oznaczało dwie
różne zawartości, bo poprawki z popołudnia 24 września nie weszły do wydanego APK.

### Odwołanie alarmu punktowane jako alarm

Najważniejsza poprawka. Strażnik rozpoznawał **pochodzenie** komunikatu RCB
i jego **kontekst powietrzny** z całej treści, ale samo **odwołanie** czytał
wyłącznie z tytułu i skrótu. Komunikat, który w nagłówku ma tylko „Alert RCB”,
a informację o odwołaniu w treści, dostawał więc 1,5 punktu jako świeży alert.

Zdarzyło się to dwa razy 24 września — o 05:01 i o 15:01. Poprawka: odwołanie
czyta całą treść komunikatu. Sprawdzone na korpusie 12 zapisanych komunikatów
RSO z bazy obserwacji — przed poprawką 10 na 12 rozpoznanych poprawnie, po niej
12 na 12. Ryzyko odwrotne (słowo „odwoł” w treści żywego alertu) jest
instrumentowane ostrzeżeniem w dzienniku, żeby dało się je wyłapać.

Ta sama pomyłka siedziała w **trybie awaryjnym** w telefonie: tam dodatkowo
zostało nieaktualne założenie, że `rso_alarm == "2"` znaczy odwołanie. Serwer
porzucił je 21 września. W trybie awaryjnym mogło to **wyciszyć żywy alarm**.

### Historia pokazywała czerwień tam, gdzie był żółty

Dokończenie poprawki z 1.7.78. Pasek historii już brał poziom z oceny, ale
**kolor województwa na mapie i karty pod suwakiem** nadal liczyły go z samych
punktów. Od 1.7.74 sama liczba punktów nie wystarcza do czerwonego alarmu —
potrzebny jest klucz: oficjalny alert „znajdź bezpieczne miejsce” albo obiekt
w zasięgu kilkunastu minut. Historia o tym nie wiedziała i malowała na czerwono
zdarzenia, które na żywo były żółte.

### Okno „co się zmieniło”

Pokazywało jeden urwany punkt zamiast listy. Przyczyna: notatki wydania dzielą
dłuższe punkty na kilka linii, a parser traktował każdą linię jako osobny wpis
i ucinał resztę. Teraz zawinięty punkt jest sklejany z powrotem, a notatki mogą
zawierać jawny blok `<!-- zmiany -->` z treścią przeznaczoną dla tego okna.

### Skąd naprawdę są dane o samolotach

Opis warstwy ADS-B podawał jako główne źródło serwis, który w praktyce odrzuca
nasze zapytania. Kolejność jest inna i tak też jest teraz napisane — w aplikacji,
w instrukcji i w README. Warstwa ADS-B nadal **nie daje punktów**; służy do
pokazania, co lata, a nie do podnoszenia poziomu zagrożenia.

### iPhone: syrena mimo wyciszonego dzwonka

Na iPhonie syrenę odtwarza teraz **część natywna aplikacji**, a strona nie tworzy
własnej — inaczej przy niewyciszonym telefonie grałyby dwie naraz. Potwierdzone
na urządzeniu 24 września: przy wyciszonym dzwonku test syreny **słychać**,
a muzyka w innej aplikacji wraca sama po jej ucichnięciu.

**Czego to nie zmienia:** powiadomienie nad zablokowanym ekranem przy wyciszonym
dzwonku nadal daje baner i wibrację **bez dźwięku**. Na dźwięk powiadomienia
potrzebne są Critical Alerts — wniosek do Apple złożony, bez odpowiedzi.

### Drobne

- Ukraiński podpis pod zdjęciem maszyny nie docierał na stronę: plik zmieniony
  23 września był podpięty kluczem cache z 9 września, więc Cloudflare podawał
  wersję sprzed poprawki. Aplikacji to nie dotyczyło — tam pliki są w paczce.
  Doszedł test, który pilnuje kluczy cache, żeby nie polegać na pamięci.

### Dla porządku

Backend z poprawką odwołań działa na produkcji od 24 września po południu —
użytkownicy korzystający z serwera byli chronieni już wtedy. To wydanie dowozi
tę samą poprawkę do **trybu awaryjnego** w telefonie oraz resztę zmian do APK.
