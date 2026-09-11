# Strażnik 1.7.21 — ostrożniejsze źródła i naprawiony tryb cienia

Wydanie ogranicza fałszywe alarmy z mediów: zwykłe bieżące zdarzenie RSS wnosi
1 pkt, jednoznaczna reakcja operacyjna 1,5 pkt, a cała klasa RSS ma limit
1,5 pkt. Materiały historyczne, rocznicowe, poradnikowe, prawne i dotyczące
odbudowy pozostają widoczne, ale nie podnoszą poziomu zagrożenia.

Punkt środka Łucka używany w meldunkach NEPTUN jest rozpoznawany jako pozycja
rejonowa również wtedy, gdy źródło podaje `confirmed`. Aplikacja pokazuje
zaokrąglony dystans, nie wylicza ETA ani trasy, obniża wagę pozycji i nie sumuje
różnych identyfikatorów tego samego punktu jako pewnych nowych obiektów.

Tryb cienia nadal niczego nie wysyła. Naprawiono jego ciągłość między
dwuminutowymi ocenami oraz usunięto powtarzane co godzinę wpisy resetu dla
województw, w których nie było stanu incydentu do wyczyszczenia.

SHA-256 `Straznik.apk`:
`d593cc9db6826d8f78c342679e5d57b4c53cb8d4db89154c46203959a6cb2049`
