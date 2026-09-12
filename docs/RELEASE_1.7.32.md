# Strażnik 1.7.32 — okno aktualizacji mówi całym zdaniem, strefa nie obiecuje końca

- Okno aktualizacji pokazywało trzy urwane w połowie kawałki jednego zdania. Teraz pokazuje pełne punkty i przewija się, gdy jest ich więcej.
- Karta strefy PAŻP pisała „Planowany koniec: 13.09" także dla strefy powołanej do grudnia. To był koniec dobowej rezerwacji, nie strefy — i tak jest teraz podpisany.
- Instrukcja tłumaczy, które strefy PAŻP punktują, które nie i skąd wzięła się ta decyzja (po polsku i po angielsku).
- Punktacja bez zmian.

## Trzy urwane kawałki zdania zamiast opisu zmian

Zgłoszenie brzmiało „opis zmian aplikacji się nie przewija, nie wyświetla się
całość". Przewijanie okazało się najmniejszą z trzech przyczyn.

Notatki wydania są pisane w Markdownie i zawijane na około 85 znakach. Funkcja
wyciągająca punkty do okna aktualizacji traktowała **każdą linię tekstu** jak
pozycję listy — więc jeden akapit rozpadał się na trzy „punkty", z których każdy
urywał się w połowie zdania. Tak wyglądało wydanie 1.7.30 na żywo:

> Dwa tematy z jednej sesji: pokazanie stref przestrzeni powietrznej, których do tej
> pory nie było w aplikacji widać w ogóle, i naprawa realnej dziury w pokryciu Pomorza.
> Gdy wojsko zamyka kawałek nieba, aplikacja o tym wiedziała (kolektor PAŻP działa od

Teraz brane są **wyłącznie prawdziwe pozycje listy** — pierwszy blok listy
w notatkach, bo to jest streszczenie wydania. Gdy listy nie ma nigdzie, pierwszy
akapit jest sklejany z powrotem w całe zdania i dzielony po kropkach.

Limit podniesiony z 3 do 8 pozycji i ze 180 do 300 znaków, po obu stronach —
w backendzie i w aplikacji. Pole tekstowe w banerze dostało `minmax(0, 1fr)`
w siatce: element siatki domyślnie nie kurczy się poniżej swojej treści, więc
dłuższa lista wypychała przyciski poza baner zamiast się przewinąć.

## Strefa nie obiecuje końca, którego nie zna

Karta strefy EPR134 — pasa przygranicznego powołanego NOTAM-em **od 10 września
do 10 grudnia 2026** — podawała „Planowany koniec: 13.09, 08:00". Data była
poprawnie odczytana z feedu, ale znaczyła co innego: PAŻP publikuje **plan
dobowy**, więc pole „koniec" to koniec dzisiejszej rezerwacji, a nie koniec
strefy. Karta obiecywała zniesienie, którego nie będzie.

Wiersz nazywa się teraz **„Rezerwacja do"** i ma dopisek, że PAŻP publikuje plan
dzień po dniu, a strefa bywa przedłużana. Tej samej właściwości feedu dotyczy
liczenie wieku strefy od pierwszego zobaczenia (1.7.30) — `startDate` jest
przepisywane codziennie o 06:00 UTC i też nie mówi nic o świeżości.

## Instrukcja: które strefy punktują i dlaczego

Nowy rozdział w instrukcji (PL i EN) rozpisuje w tabeli każdy typ strefy —
D, R, NPZ, ADHOC punktują, TSA/TRA i ATZ nie — oraz trzy warunki, które muszą
być spełnione naraz: pełna kolumna od ziemi, brak tego samego identyfikatora
przez 7 dni i położenie nad ścianą wschodnią albo północą.

Opisuje też, skąd wzięła się ta decyzja: z czterodniowego pomiaru w sierpniu
2026, w którym aplikacja logowała każdą aktywację **bez przyznawania punktów**.
Na 799 aktywacji 413 zaczynało się od ziemi, ale realnych zamknięć „od ziemi do
poziomu lotu" było około stu, a osobny test trzydniowy pokazał, że nawet po tym
filtrze sześć z siedmiu trafień to było tło. Stąd pamięć siedmiu dni.

## Testy

`scripts/test_app_updates.py` sprawdza teraz trzy rzeczy naraz: listę dłuższą niż
trzy pozycje, akapit zawinięty na kilku liniach składany w całe zdania oraz to,
że lista wygrywa z akapitem, nawet gdy akapit jest w notatkach pierwszy.
