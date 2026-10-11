# Teksty do ludzi: dlaczego czerwony alarm milczał na wyciszonym iPhonie

Trzy gotowe teksty — do odpowiedzi pod komentarzem, do wiadomości prywatnej
i do notatek wydania. Do użycia po Twojej akceptacji; nic nigdzie nie wysłałem.

---

## 1. Krótka odpowiedź pod komentarzem

> Już wiem, co się stało — i częściowo to nasza wina.
>
> Powiadomienia u Ciebie działają: oba testy doszły, widać je na ekranie
> blokady. Cichy był dźwięk, bo telefon był wyciszony przełącznikiem.
>
> Na iPhonie zwykłe powiadomienie nigdy nie zagra przy wyciszonym dzwonku —
> nie pomaga ani „Dźwięki: Wł.", ani „Pilne powiadomienia". Etykieta **PILNE**
> znaczy „przebij tryb Skupienia", a nie „zagraj mimo ciszy". Ciszę przebija
> wyłącznie **alarm krytyczny** — osobna zgoda Apple, którą włącza się
> w aplikacji: **⚙ → Alarmy → „Włącz alarm mimo wyciszenia"**. Dotyczy tylko
> czerwonego; żółty zostaje cichy i tak ma być.
>
> A teraz nasza część: **test 5 s nigdy nie szedł jako alarm krytyczny**,
> więc przy wyciszonym telefonie milczał u wszystkich — nawet u osób, u których
> prawdziwy czerwony alarm by zagrał. Czyli Twój test niczego nie rozstrzygał.
> Poprawione, wejdzie w najbliższej aktualizacji; od niej test idzie tą samą
> drogą co prawdziwy alarm, a jeśli iść nią nie może, powiadomienie samo pisze
> dlaczego.
>
> Co sprawdzić u siebie teraz: odcisz telefon i zrób test żółty — jeśli zagra,
> dźwięk działa. Potem włącz „Włącz alarm mimo wyciszenia" i wróć do mnie,
> jeśli coś dalej będzie nie tak.

---

## 2. Na priv, gdy ktoś chce przejść po kolei

> 1. Przełącznik ciszy z boku telefonu (albo dzwonek w Centrum sterowania) —
>    wyłącz wyciszenie i zrób test żółty. Zagrało? Dźwięk jest sprawny.
> 2. Głośność dzwonka — przyciskami, przy odblokowanym ekranie, bez grającej
>    muzyki.
> 3. W aplikacji **⚙ → Alarmy**. Jeśli przycisk pisze **„Włącz alarm mimo
>    wyciszenia"** — zgody nie ma, naciśnij go. iPhone zapyta tylko raz.
>    Jeśli pisze „Alarm mimo wyciszenia: włączony" — już jest.
> 4. Jeśli to pytanie kiedyś odrzuciłaś/odrzuciłeś: **Ustawienia iPhone'a →
>    Strażnik → Powiadomienia → Alerty krytyczne**. Ta pozycja pojawia się
>    dopiero po pierwszym pytaniu z aplikacji.
> 5. Wersja: **⚙ → Aplikacja**. Potrzebna 1.7.91 lub nowsza — wcześniejsze
>    zapisywały telefon na zły temat i mimo zgody czerwony leciał bez dźwięku
>    krytycznego.
> 6. Po włączeniu zgody otwórz aplikację raz i poczekaj chwilę — zapis robi się
>    przy starcie.
> 7. Sprawdź, czy w **⚙ → Moje miejsca** masz zaznaczone województwo
>    i „Obserwuj alerty" — bez tego nie przyjdzie nic, bo powiadomienia idą
>    według województwa.
> 8. Upewnij się, że to aplikacja z App Store, a nie strona dodana do ekranu
>    początkowego z Safari — ze strony dźwięku nie będzie.

---

## 3. Do notatek wydania (iOS)

> **Test alarmu mówi teraz prawdę.** Czerwony test idzie tą samą drogą co
> prawdziwy alarm: jeśli masz włączone „Alarm mimo wyciszenia", zagra nawet
> przy wyciszonym telefonie. Jeśli tej zgody nie masz, powiadomienie samo
> napisze, dlaczego było cicho i co włączyć. Wcześniej test milczał przy
> wyciszeniu u każdego — także u osób, u których prawdziwy alarm by zagrał.

---

## Dlaczego tak działa — jedno zdanie na wypadek pytań

iPhone ma trzy różne poziomy: zwykły (cichy przy wyciszeniu i w Skupieniu),
`time-sensitive` czyli **PILNE** (przebija Skupienie, ale nie ciszę)
i **krytyczny** (przebija jedno i drugie, wymaga osobnej zgody Apple, którą
dostaliśmy 28.09.2026). Serwer wysyła każdy alarm dwa razy: zwykłą drogą
i krytyczną — telefon ze zgodą słucha wyłącznie tej drugiej.
