# Dwa pomysły użytkowników: automatyczne aktualizacje i „gdzie słuchać komunikatów"

**29 września 2026.** Analiza przed jakąkolwiek zmianą w kodzie — obie sprawy
mają pułapki, które przy pochopnym wdrożeniu pogorszyłyby działanie narzędzia
ostrzegawczego. Nic z tego nie jest zrobione ani zatwierdzone.

Część o radiu dotyczy też GROTY — sesja GROTY była wtedy offline, więc analizę
napisałem sam; jest do przejęcia i podważenia.

---

## 1. Suwak „aktualizuj automatycznie" (Android) — ODPUSZCZONE

> **Decyzja użytkownika z 29.09.2026: nie robimy tego.** Uzasadnienie: i tak
> przyjdzie moment, w którym większość pobrań pójdzie przez sklepy, a tam
> aktualizacjami zarządza sklep. Rozpoznanie poniżej zostaje na wypadek
> powrotu do tematu — nie jest zadaniem do zrobienia.

### Krótka odpowiedź: da się, i to naprawdę bez okienka — ale tylko na Androidzie 12+

Pierwsza intuicja jest taka, że Android nigdy nie pozwoli zwykłej aplikacji
zainstalować pliku bez potwierdzenia. To prawda **poza jednym wyjątkiem**, i ten
wyjątek jest dokładnie naszym przypadkiem.

Dokumentacja `PackageInstaller.SessionParams.setRequireUserAction`
(API 31, sprawdzone u źródła 29.09.2026) mówi, że przy
`USER_ACTION_NOT_REQUIRED` potwierdzenie **nie jest wymagane**, gdy spełnione są
wszystkie warunki. Nasze spełnienie:

| warunek | my |
|---|---|
| instalator ma `REQUEST_INSTALL_PACKAGES` | tak, w wariancie `github` (sprawdzone aapt2: 17 uprawnień) |
| instalowana aplikacja celuje w odpowiednio wysokie API | `targetSdk 36`, próg dla Androida 16 to API 34 |
| instalator jest właścicielem aktualizacji / instalatorem / **„Updating itself"** | tak — aktualizujemy samych siebie |

Warunek „Updating itself" jest tu istotny: **nie musimy być instalatorem
pierwszej wersji.** Ktoś, kto pobrał APK przeglądarką, też się załapie.

**Czego to nie obejmuje:** `minSdk` mamy 24, więc na Androidzie 11 i starszym
API nie istnieje i systemowe okno zostaje. Tam degradujemy się łagodnie:
pobieramy w tle i pokazujemy powiadomienie „aktualizacja gotowa, dotknij, aby
zainstalować" — użytkownik oszczędza czekanie na pobieranie.

Dokumentacja wprost ostrzega, że próg `targetSdk` będzie rósł w kolejnych
wersjach Androida i trzeba zawsze obsłużyć `STATUS_PENDING_USER_ACTION`.
Czyli: kod musi umieć wrócić do okna, a nie zakładać, że cisza jest wieczna.

### Co już mamy i co trzeba dopisać

Aktualizator (`BackgroundPlugin.java`) **już teraz** pobiera plik, liczy
SHA-256, porównuje z sumą z serwera i sprawdza podpis, a dopiero potem otwiera
instalator. To jest dobra baza: automat nie osłabia niczego, bo wszystkie
kontrole zostają. Zmienia się tylko ostatni krok — `ACTION_VIEW` zamieniamy na
sesję `PackageInstaller`.

### Zabezpieczenia, bez których tego nie robimy

1. **Domyślnie wyłączone.** Włącza użytkownik, świadomie.
2. **Nigdy w wariancie sklepowym** — decyduje `wariant.js` i pilnuje tego
   `test_wariant_sklepowy.cjs`, tak jak dziś przy samym sprawdzaniu wersji.
3. **Nigdy w trakcie alarmu.** Podmiana aplikacji ubija proces. Mamy już
   precedens takiego strażnika przy przełączaniu na tryb awaryjny (1.6.8) —
   ten sam wzorzec.
4. **Zdalny wyłącznik** przez `data/wylaczniki.json`, jak przy GROCIE.
5. **Powiadomienie po fakcie**: „zaktualizowano do 1.7.x" z odnośnikiem do
   opisu zmian. Cicha podmiana narzędzia ostrzegawczego bez śladu jest
   nieuczciwa wobec użytkownika, nawet jeśli sam ją włączył.

### Ryzyko, które trzeba powiedzieć wprost

**Zepsute wydanie rozejdzie się samo, bez niczyjego kliknięcia.** Dziś złe
wydanie zatrzymuje się na tym, że ludzie nie zdążą go zainstalować. Przy
automacie nie ma tego bezpiecznika.

Gorzej: **Android blokuje instalację niższej wersji**, więc wycofanie nie
polega na cofnięciu, tylko na wypuszczeniu kolejnego, wyższego wydania.
Procedura z `docs/WYCOFANIE_WYDANIA.md` zakłada instalację ręczną i **nie
pokrywa tego przypadku** — trzeba ją uzupełnić razem z tą funkcją.

To nie jest argument przeciw, tylko warunek: automat wolno włączyć dopiero,
gdy każde wydanie przechodzi pełny zestaw testów przed publikacją. Ten
warunek już obowiązuje (AGENTS.md pkt 7).

### Czego ten suwak NIE naprawi

Osoby na 1.7.54–1.7.63 mają zepsutego aktualizatora (błąd flag w
`getPackageArchiveInfo`) i muszą raz zainstalować ręcznie. Automat w nowszym
wydaniu ich nie dosięgnie, bo najpierw musieliby się na nie zaktualizować.

### Rekomendacja

Warto, jako **osobne wydanie** z własnymi testami na emulatorze z API 31+
i jednym starszym (mamy `Test_API28`). Nie doklejać do wydania z inną
zawartością — to zmiana w ścieżce instalacji aplikacji.

---

## 2. Odnośniki do radia i telewizji na czas alarmu

### Pomysł trafia w realną lukę

GROTA **już mówi**, w trzech językach, cytując wytyczne MSWiA:

> „Jeśli usłyszysz sygnał alarmowy, włącz radio lub telewizor i stosuj się do
> komunikatów."

i zaleca w wyprawce „radio na baterie lub na korbkę". Czyli rada jest, a
brakuje tego, o co pyta użytkownik: **którą stację i na jakiej
częstotliwości.** Luka jest prawdziwa.

### Ale odwróciłbym pomysł: najpierw częstotliwość FM, dopiero potem stream

To jest najważniejszy wniosek z tej analizy.

**Streaming jest najsłabszym możliwym kanałem dokładnie w tym momencie, do
którego go proponujemy.** Podczas realnego zagrożenia sieć komórkowa zapycha
się pierwsza. Mamy własne pomiary tego zjawiska: 3000 gniazd WS zajętych przy
syrenach w Lublinie, pad z przeciążenia przy 2700 zapytań/min, a 28.09 jeden
słupek 147 GB w godzinę. Wysyłanie kogoś w schronieniu do streamu to
kierowanie go na kanał, który ma największą szansę nie zadziałać.

Oficjalna rada mówi „włącz radio" nie z przyzwyczajenia, tylko dlatego, że
**FM działa bez internetu, bez sieci komórkowej i na bateriach**.

Kolejność, którą proponuję pokazywać:

1. **częstotliwość FM** regionalnej rozgłośni — działa offline, dane w aplikacji;
2. **Polskie Radio Program 1** jako druga częstotliwość;
3. **odnośnik do oficjalnego streamu** — wyraźnie opisany jako wymagający
   internetu, otwierany w przeglądarce systemowej.

### Które stacje — obawa użytkownika jest słuszna, ale prowadzi do innego wniosku

Użytkownik napisał: *„małe stacje nie przerwą tak szybko transmisji głównej"*.
Zgoda — i właśnie dlatego **nie kierujemy do małych stacji**. Kierujemy do
**rozgłośni regionalnych Polskiego Radia**: jest ich 17, po jednej na
województwo, a w zachodniopomorskim dwie (Szczecin i Koszalin). To one mają
misję publiczną obejmującą komunikaty o zagrożeniach.

**Do zweryfikowania przed napisaniem czegokolwiek w aplikacji:** dokładna
podstawa prawna tego obowiązku. Sprawdzałem 29.09 i **nie potwierdziłem numeru
artykułu** — art. 34 ustawy o radiofonii i telewizji, na który najpierw
wskazywałem, dotyczy koncesji, nie komunikatów. Dopóki tego nie ustalimy,
w aplikacji nie wolno napisać „stacja ma prawny obowiązek".

### Dane są i są oficjalne

To przesądza o wykonalności:

- **UKE publikuje wykazy pozwoleń radiowych dla stacji radiofonicznych jako
  dane otwarte** na `dane.gov.pl` (zbiór 723) — częstotliwość, lokalizacja
  nadajnika, moc ERP, nazwa programu.
- RadioPolska prowadzi wykaz 1183 emisji FM — dobry materiał kontrolny,
  ale społecznościowy, więc nie jako źródło główne.

Czyli da się policzyć dla pozycji użytkownika najbliższy nadajnik jego
rozgłośni regionalnej i pokazać częstotliwość. Podzbiór jest mały: 17 stacji
plus PR1, po kilkanaście–kilkadziesiąt nadajników. **Dane trzymamy w
aplikacji**, żeby działały bez sieci — inaczej cała przewaga FM znika.

### CB radio: nie

Użytkownik pytał. Odpowiedź brzmi nie, i to dość stanowczo:

- CB nie ma żadnej służby nadającej oficjalne komunikaty. Kanał 9 jest
  **wywoławczym kanałem ratunkowym**, kanał 19 drogowym — to są kanały do
  wołania o pomoc, nie do słuchania obwieszczeń.
- Skierowanie tam tysięcy ludzi naraz zapchałoby jedyny kanał, na którym ktoś
  może wołać o pomoc. To pogorszenie sytuacji, nie ulepszenie.

### Czy aplikacja może w ogóle odtwarzać sygnał? To przesądza o kształcie funkcji

Pytanie użytkownika okazało się najważniejsze w całej tej sprawie, bo
rozstrzyga między dwiema zupełnie różnymi funkcjami.

**Odtwarzanie cudzego programu we własnej aplikacji to prawdopodobnie
„rozprowadzanie” w rozumieniu ustawy o radiofonii i telewizji** (art. 4 pkt 8:
przejęcie programu w całości i bez zmian oraz równoczesne wtórne
rozpowszechnianie). Nie jest to teoria — KRRiT zajęła stanowisko w niemal
identycznej sprawie: serwis internetowy udostępniał programy telewizyjne
„w całości i bez jakichkolwiek zmian” i został uznany za rozprowadzającego.

Konsekwencje takiego zakwalifikowania:

- **wpis do rejestru prowadzonego przez Przewodniczącego KRRiT** (art. 41
  ust. 1 pkt 1), ze zgłoszeniem **nie później niż na miesiąc przed**
  rozpoczęciem rozprowadzania;
- wśród dokumentów do rejestracji jest **zgoda nadawcy** wraz z terminem jej
  obowiązywania;
- dochodzi warstwa praw do muzyki i nagrań (ZAiKS, ZPAV, STOART, SAWP), którą
  przy własnej reemisji trzeba rozliczyć samodzielnie.

Dla nas to zaporowe. Nie dlatego, że nie do przejścia, tylko dlatego, że
byłaby to zupełnie inna działalność niż aplikacja ostrzegawcza.

**Odnośnik otwierający stronę stacji w przeglądarce to co innego.** Niczego nie
przejmujemy ani nie rozpowszechniamy wtórnie — słuchacz łączy się z nadawcą
bezpośrednio, tak jak po kliknięciu dowolnego odnośnika. Obowiązki zostają po
stronie nadawcy, który i tak je wypełnia.

**Wniosek: żadnego odtwarzania w aplikacji, nawet w ukrytym odtwarzaczu.**
Tylko częstotliwość FM — nasza własna dana, bez niczyich praw — i odnośnik
otwierany na zewnątrz.

Zastrzeżenie: nie jestem prawnikiem, a powyższe to zebrane przepisy i stanowisko
KRRiT, nie porada prawna. Gdyby kiedykolwiek miało dojść do odtwarzania
w aplikacji, to jest moment na prawnika, nie na własną ocenę.

### Czego nie robić

- **Wbudowanego odtwarzacza.** Podpinanie cudzego strumienia pod własny
  interfejs bywa traktowane jak reemisja; do tego zapewniałoby pozór, że
  „słychać komunikat", gdy stacja akurat gra muzykę.
- **Listy małych stacji lokalnych** — dokładnie z powodu, który podał
  użytkownik.
- **Obietnicy, że tam będzie komunikat.** Aplikacja nie wie, co jest w tej
  chwili na antenie. Wolno napisać „to jest stacja, która nadaje komunikaty",
  nie wolno „tu usłyszysz komunikat".

### Uczciwe ograniczenie, które musi być napisane

Nawet publiczna rozgłośnia potrzebuje czasu, żeby przerwać program, a my nie
mamy jak sprawdzić, czy komunikat już poszedł. Dlatego ta sekcja ma być
**pomocą w znalezieniu odbiornika**, a nie kolejnym źródłem ostrzeżeń — i tak
musi być opisana.

### Zakres, który proponuję

Sekcja „Gdzie słuchać" w GROCIE (przy karcie schronienia) i na ekranie alarmu:
częstotliwość FM regionalnej rozgłośni dla miejsca użytkownika, częstotliwość
PR1, odnośnik do oficjalnego streamu z adnotacją o internecie, jedno zdanie
o radiu na baterie.

### Do sprawdzenia przed wdrożeniem

1. Podstawa prawna obowiązku nadawania komunikatów — **nieustalona**.
2. Czy regulaminy Polskiego Radia pozwalają linkować sam strumień; jeśli nie —
   odnośnik do strony stacji. (Odtwarzanie u nas jest już wykluczone wyżej.)
3. Rozmiar podzbioru danych UKE i licencja na ponowne wykorzystanie.
4. Czy pokazywać to zawsze, czy dopiero przy poziomie czerwonym.

---

## Co z tego wynika dla kolejności prac

Automatyczne aktualizacje są **zamknięte decyzją użytkownika** — sklepy i tak
przejmą dystrybucję.

Zostaje radio, w wersji okrojonej przez ustalenia o licencjach: **częstotliwość
FM plus odnośnik na zewnątrz, bez odtwarzania**. To dobrze się składa, bo wersja
bez odtwarzacza jest jednocześnie tą, która działa bez internetu — czyli lepsza
także technicznie. Do wyjaśnienia zostają podstawa prawna obowiązku nadawania
komunikatów i regulaminy Polskiego Radia.
