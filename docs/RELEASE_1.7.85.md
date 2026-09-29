# Strażnik 1.7.85 — Zasady GROTY zgodne z pisemną odpowiedzią PSP

**29 września 2026**, versionCode 114. Poprzednie wydanie:
[1.7.84](RELEASE_1.7.84.md) (widać, po której stronie granicy jest obiekt).

<!-- Blok poniżej to JEDYNE, co widzi użytkownik w oknie aktualizacji w telefonie.
     Krótkie, całe zdania, bez nagłówków i bez odsyłaczy — reszta notatek zostaje
     dla czytających na GitHubie. Parser: backend/app/app_updates.py, _change_items. -->
<!-- zmiany -->
- Zakładka Zasady w GROCIE mówi teraz to, co Komenda Główna PSP odpowiedziała nam na piśmie. Wycofaliśmy obietnicę, że dodamy datę weryfikacji punktu — rejestr jej nie prowadzi i nie planuje udostępniać.
- Dopisaliśmy, co naprawdę oznacza „Dostępność” przy punkcie i czego urząd nam nie wyjaśnił: kto otwiera punkt „na żądanie” w czasie alarmu.
- Jest też wprost napisane, że wykaz punktów aktualizuje się raz w tygodniu i że nie ma do niego API.
<!-- /zmiany -->

**To wydanie nie zmienia działania aplikacji. Zmienia trzy zdania, które
przestały być prawdziwe, i dokłada to, czego wcześniej nie wiedzieliśmy.**

## Skąd to się wzięło

15 września wysłaliśmy do Komendy Głównej PSP wniosek o informację publiczną
w sprawie zbioru „Punkty schronienia w Polsce” i aplikacji „Gdzie się ukryć”.
Odpowiedź przyszła 25 września (BKG-III.065.119.2026) i unieważniła część tego,
co GROTA pisała w zakładce Zasady.

## Co konkretnie było nieprawdą

Zasady obiecywały: *„Jeśli PSP udostępni rodzaj obiektu, dodamy go razem z datą
weryfikacji”*. Tej obietnicy nie da się dotrzymać. Urząd odpowiedział wprost, że
**rejestr nie prowadzi daty weryfikacji** jako danej o punkcie i nie planuje jej
udostępniania, a puste pole „Data weryfikacji” zniknie z ich własnej aplikacji.

Rodzaj obiektu to inna sprawa i tu obietnica zostaje: należy do ustawowego
zakresu danych rejestru (art. 108 ust. 5), tylko nie ma go w publikowanym
zbiorze. Jeśli się pojawi, dodamy go.

W aplikacji ostrzegawczej obietnica, której nie da się spełnić, jest gorsza niż
jej brak — dlatego wykreślona, a nie przeformułowana.

## Co doszło

**Zakres rejestru.** Zbiór obejmuje także obiekty w postępowaniu o uznanie za
budowlę ochronną, byłe budowle ochronne i planowane miejsca doraźnego
schronienia, a aplikacja „Gdzie się ukryć” publikuje je — cytat z pisma —
**„bez wskazywania ostatecznej kategorii obiektów”**. Do tej pory był to nasz
domysł; teraz jest to zdanie urzędu.

**Co znaczy „Dostępność”.** To parametr pomocniczy z etapu rozpoznania obiektu,
który może się zmienić razem ze sposobem użytkowania budynku. Całodobowa dotyczy
zwykle obiektów z obsługą przez całą dobę, „określone godziny” — urzędów i szkół,
„na żądanie” — najczęściej obiektów zamieszkania zbiorowego.

Na pytanie, **kto i w jakim trybie otwiera punkt „na żądanie” w czasie alarmu**
i czy godziny są gdziekolwiek publikowane, odpowiedzi nie dostaliśmy. To też jest
w Zasadach napisane wprost, bo dla kogoś, kto szuka schronienia w nocy, brak
odpowiedzi jest informacją.

**Jak często się aktualizuje.** Zbiór na dane.gov.pl raz w tygodniu, **API nie ma
i nie będzie**. Nasz cotygodniowy przegląd wykazu to więc maksimum, co się da.

## Co zostało zmienione

- `grota/grota.js`: trzy akapity w zakładce Zasady — jeden przepisany, dwa nowe.
- `grota/jezyk-en.js`, `grota/jezyk-uk.js`: tłumaczenia nowych zdań. Cytat
  z pisma zostaje cytatem także po angielsku i ukraińsku.
- `grota/widok.js`: stempel wersji modułu, żeby po aktualizacji aplikacji
  zaczytały się świeże pliki.

Nic poza katalogiem `grota/`. Mapa, punktacja, progi, alarmy i powiadomienia
nietknięte.

## Zrzutów w instrukcji nie wymieniam

Sprawdzone, nie założone. Zmienione akapity leżą poniżej kadrów `g27` (góra
zakładki Zasady) i `g28` (Instrukcja reagowania MSWiA). Na `g29` widoczny
fragment kończy się na akapicie „Wykaz się zmienia…”, a nowe zdanie o
cotygodniowej aktualizacji zaczyna się dokładnie pod dolną krawędzią kadru.
Widoczna treść zrzutów się nie zmienia.

## Źródło

Pismo Komendy Głównej PSP, Biuro Komendanta Głównego, BKG-III.065.119.2026
z 25 września 2026, w odpowiedzi na wniosek z 15 września 2026. Cytaty
w aplikacji są dosłowne.
