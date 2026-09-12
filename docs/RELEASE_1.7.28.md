# Strażnik 1.7.28 — karta obiektu i sygnały mówią to samo

Dwa zgłoszenia z 12.09.2026, oba o tym samym: te same dane wyglądały inaczej
w zależności od tego, gdzie się patrzyło.

## Karta obiektu mówi, czy kurs prowadzi na Polskę

Karta podawała same stopnie — „kurs: 180° (płd.)" — i odległość. Lista sygnałów
mówiła o tym samym obiekcie „0 pkt, kurs 71° od kierunku na Polskę". Te same dane,
dwa różne wrażenia; z karty nie dało się wyczytać, czy obiekt w ogóle jest liczony.

Karta ma teraz jedną linijkę werdyktu, tę samą co lista:

- **0 pkt** — kurs 71° od kierunku na Polskę
- **0 pkt** — kurs nieznany
- **kurs na Polskę** (12° od kierunku na granicę) — na czerwono, gdy obiekt się zbliża

Werdykt jedzie razem ze znacznikiem, więc działa też w trybie historii.

## Sygnał pokazuje, gdzie obiekt jest TERAZ

Odległość zapisana w sygnale to stan z chwili jego powstania. Po pół godziny panel
mówił „192,5 km", a ten sam dron był na mapie 130 km od granicy. Numer był
technicznie prawdziwy i praktycznie mylący.

Dopóki obiekt jest jeszcze śledzony, wiersz sygnału dopisuje **teraz 130,0 km** —
na pomarańczowo, gdy zbliżył się od czasu wpisu. Różnice poniżej 5 km pomijamy, żeby
nie migotać przy każdej aktualizacji pozycji. W trybie historii nic nie dopisujemy:
tam panel należy do wybranej chwili, a nie do teraz.

Punktacja bez zmian — sygnał wchodzi ponownie z wyższą wagą dopiero wtedy, gdy
obiekt naprawdę przekroczy kolejny próg (`dedup_key` z poziomem punktów).

## Dlaczego obiekt lecący w bok ma zero

Przy okazji, bo pytanie wróciło: punkty za obiekt liczą się od kąta między jego
kursem a kierunkiem na najbliższy punkt granicy. Pełna waga do **±50°**, potem
liniowy spadek do zera przy **±70°**, powyżej — zero. Nieznany kurs to ×0,5 i tylko
do 150 km od granicy: brak kursu jest niepewnością, nie dowodem bezpieczeństwa.

Obiekt 155 km od granicy lecący na północ, przy kierunku na granicę 269°, mija nas
o 86° — i nie jest zagrożeniem dla Polski w tej chwili. Od 1.7.27 widać go w
„Sygnałach" na liście „Na mapie, ale bez punktów", teraz także z werdyktem w karcie.

## Zweryfikowane

Emulator Pixel 7 (Android 14) na żywych danych: dron 170 km od granicy, kurs 180°,
karta pokazuje „0 pkt — kurs 71° od kierunku na Polskę". Testy: 15 pythonowych
i 9 node'owych, w tym nowe sprawdzenie werdyktu w `test_threat_photos.cjs`.
