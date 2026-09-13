# Strażnik 1.7.42 — ciągłe granice po oddaleniu i widoczne trasy obiektów

- Granice państw nie mają już przerw po oddaleniu mapy — także między Białorusią a Ukrainą, przy Krymie i na linii frontu.
- Trasy obiektów i samolotów (⚙ → Aplikacja → „Mapa: trasy obiektów”) widać od razu po otwarciu aplikacji: serwer przesyła krótką historię pozycji.
- Kierunek lotu korzysta też z trasy podawanej przez NEPTUN; linia trasy jest wyraźniejsza.

## Dlaczego

Po oddaleniu mapa bazowa korzysta z uproszczonych kafelków, które gubią odcinki
granic i pomijają granice sporne. Przy małym przybliżeniu Strażnik rysuje teraz
granice lądowe z Natural Earth 1:50 mln (Krym w granicach Ukrainy), a po przybliżeniu
wracają dokładne linie OpenStreetMap.

Trasy były widoczne dopiero po kilku minutach z otwartą aplikacją, bo telefon zbierał
ślad sam. Obiekty z pozycją przybliżoną (duże koło) nadal nie mają trasy — celowo,
żeby nie rysować drogi, której nie znamy.
