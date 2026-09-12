# Strażnik 1.7.24 — poprawki po dniu na urządzeniu

Wydanie zbiera to, co wyszło z testowania 1.7.23 na telefonie, i dokłada stronę z
historią zmian. Punktacja, źródła i powiadomienia bez zmian.

## „Sprawdź aktualizacje" znów odpowiada

Przycisk zwracał „nie udało się sprawdzić". Przyczyna była po stronie serwera, nie
aplikacji: GitHub odpowiadał `403 rate limit exceeded`. Bez tokenu limit to 60 zapytań
na godzinę **na adres IP**, a VPS dzieli adres z innymi maszynami. Cache trzymał tylko
sukcesy, więc po wyczerpaniu limitu każde dotknięcie przycisku szło prosto do GitHuba i
dokładało się do wyczerpanego limitu — a sprawdzanie przy każdym uruchomieniu z 1.7.23
tylko by to nasiliło.

Teraz ostatnie udane metadane lądują na dysku i przeżywają restart usługi, a gdy GitHub
odmawia, serwer oddaje je z flagą `stale` zamiast błędu. Numer wersji sprzed kwadransa
jest wart więcej niż „nie udało się sprawdzić", a suma SHA-256 pochodzi z tego samego
podpisanego wydania, więc weryfikacja pobranego pliku działa bez zmian. Po błędzie
serwer robi pięć minut przerwy, żeby telefony nie dokładały się do limitu.

## Moje miejsca

- **„Zapisz na urządzeniu" przy pustej nazwie wyglądał na martwy przycisk.** Komunikat
  „Uzupełnij nazwę…" trafiał pod przewiniętą treść formularza, więc nikt go nie widział.
  Teraz przewija się na ekran, a kursor ląduje w brakującym polu. Limit 8 miejsc też
  mówi wprost, zamiast cicho nic nie robić.
- **Udany zapis zamyka okno i wraca do Ustawień na zakładkę „Moje miejsca"** — tam,
  skąd się przyszło. Potwierdzenie idzie toastem nad mapą.

## Mapa startuje tam, gdzie widać sytuację

Ekran startowy jest zawsze ten sam: Polska i cała Ukraina. Skok na zapisane
województwo startował tak blisko, że nie było widać, skąd nadlatują obiekty — a to
jest powód, dla którego ktoś otwiera tę mapę. Kadr przycisku „mój region" też został
odsunięty (zoom 7,15 → 5,3): województwo w kontekście całego kraju i przygranicznych
obwodów, a nie obrys wypełniający ekran.

## Pasek historii stoi w miejscu

Gdy w oknie pojawiał się sygnał, dochodziła druga linijka opisu i cały pasek uciekał w
górę spod palca. Dodatkowo klikalna liczba sygnałów to `<button>` (inline-block), który
przy wyrównaniu do linii bazowej dokładał jeszcze kilka pikseli. Wysokość opisu jest
teraz zarezerwowana z góry, a przycisk wyrównany do góry linii. Zmierzone na Pixelu 7:
górna krawędź paska stoi w tym samym miejscu przy sygnałach i bez nich.

## Historia zmian jako strona

Nie było gdzie sprawdzić, co zmieniło się w danym wydaniu — opisy leżały tylko w
`docs/RELEASE_*.md` i w wydaniach na GitHubie. Powstały dwie strony:

- <https://cukierrro.github.io/Straznik/zmiany.html>
- <https://cukierrro.github.io/Straznik/zmiany-en.html>

Skrót zmian widocznych dla użytkownika dla wszystkich wydań od 1.7.12, ze zrzutami i
odnośnikiem do pełnego opisu. Generuje je `scripts/build_changelog.py` — jedno źródło
prawdy dla obu języków. Link **„Historia zmian ↗"** jest w aplikacji: Ustawienia →
Aplikacja, obok instrukcji i wsparcia autora.

## Drobne

- Odnośniki na dole ustawień układają się w zawijany rząd; przy trzech pozycjach kropka
  rozdzielająca zostawała sama na końcu wiersza.
- Karta obiektu w miniaturze zmniejsza także zdjęcie samolotu (karta samolotu ustawia
  własną wysokość w atrybucie `style`).

## Zweryfikowane na urządzeniu

Emulator Pixel 7 (Android 14) z trzyprzyciskową nawigacją systemową. Testy:
14 pythonowych i 9 node'owych, w tym nowy odtwarzający limit GitHuba i sprawdzający,
że odpowiedź zapasowa zachowuje sumę SHA-256.
