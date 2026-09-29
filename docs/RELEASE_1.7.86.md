# Strażnik 1.7.86 — alarm mimo wyciszenia na iPhonie, wibracja zamiast syreny na Androidzie

**29 września 2026**, versionCode 115. Poprzednie wydanie:
[1.7.85](RELEASE_1.7.85.md) (Zasady GROTY zgodne z pisemną odpowiedzią PSP).

<!-- Blok poniżej to JEDYNE, co widzi użytkownik w oknie aktualizacji w telefonie.
     Krótkie, całe zdania, bez nagłówków i bez odsyłaczy — reszta notatek zostaje
     dla czytających na GitHubie. Parser: backend/app/app_updates.py, _change_items. -->
<!-- zmiany -->
- Nowy przełącznik: czerwony alarm może budzić samą wibracją, bez syreny. Zostaje wibracja, pełny ekran i miganie — także w trybie Nie przeszkadzać. Sparowany zegarek zawibruje tak samo.
- Ustawienia dźwięku przestały ze sobą walczyć. „Test: syrena” gra nawet przy włączonej ciszy, a opcja pełnej głośności jest przy niej nieczynna, bo nie ma czego podgłaśniać.
- Na iPhonie pojawia się przycisk zgody na alarm mimo wyciszenia. Apple przyznało nam to uprawnienie 28 września.
- Ukraińska zakładka Dźwięk mówi po ukraińsku. Dwa akapity zostawały po angielsku, jeden z nich od 1.7.84.
<!-- /zmiany -->

## Wibracja zamiast syreny (Android)

Prośba czytelnika z Facebooka: *„czy jest możliwość ustawiania tak, aby nie
włączała się syrena tylko wibracja? Na pewno wiele osób chciałoby, aby podczas
alarmu zamiast syreny wibrował zegarek"*. Do tej pory dało się to zrobić tylko
w ustawieniach Androida, grzebiąc w kanałach powiadomień.

Przełącznik jest w ⚙ → **Dźwięk**: *„Czerwony alarm: tylko wibracja, bez syreny"*.

**Milknie sam dźwięk.** Wibracja, pełny ekran, miganie i obejście trybu Nie
przeszkadzać zostają — inaczej byłoby to po prostu wyłączenie alarmu, a nie
zmiana sposobu powiadamiania. Sparowany zegarek wibruje od kopii powiadomienia,
więc działa to, o co prosił czytelnik.

Włączenie wymaga potwierdzenia i mówi wprost, co się traci: *przy wygaszonym
ekranie i telefonie w drugim pokoju możesz takiego alarmu nie zauważyć*. Ludzie
włączają takie rzeczy w dzień, a skutek widzą w nocy.

### Dlaczego to nie było jedno pole w ustawieniach

Dźwięk czerwonego alarmu ma **trzy niezależne drogi** i każdą trzeba było zdjąć
osobno. Przeoczenie którejkolwiek dałoby alarm, który „czasem" wyje — najgorszy
możliwy wynik przy takiej opcji:

- **kanał powiadomienia** — Android nie pozwala wyciszyć pojedynczego
  powiadomienia, można tylko wybrać kanał bez dźwięku (nowy `CH_HIGH_SILENT`);
- **pełnoekranowy alarm** — ma własny odtwarzacz, zupełnie niezależny od kanału;
- **warstwa strony** — przy otwartej aplikacji syrenę syntezuje sama aplikacja.

Przy ciszy nie podnosimy też suwaka głośności alarmów: to była ingerencja
w ustawienia telefonu bez żadnego skutku.

## Ustawienia dźwięku przestały ze sobą walczyć

Pytanie użytkownika po dodaniu przełącznika brzmiało: czy te opcje nie będą ze
sobą kolidować. Przegląd kombinacji znalazł trzy realne problemy:

1. **„Test: syrena" przy włączonej ciszy nie grał nic.** Przycisk obiecuje
   syrenę, więc wyglądałby na zepsuty. To prośba „daj mi to usłyszeć", nie alarm
   — gra teraz mimo ustawienia. `Test: pełny alarm` i test natywny celowo ciszę
   **szanują**: one pokazują, co naprawdę się stanie.
2. **„Zawsze na pełnej głośności" stało włączone i kłamało** — przy ciszy nie ma
   czego podgłaszać. Teraz jest nieczynne i wygaszone, z wyjaśnieniem. Wybór
   użytkownika zostaje zapamiętany i wraca po wyłączeniu ciszy.
3. **Zła kolejność zapisu.** Ustawienie zapisywało się lokalnie przed
   potwierdzeniem z warstwy natywnej. Gdyby to wywołanie padło, powstałby
   rozjazd nie do zauważenia: otwarta aplikacja milczy, a powiadomienie przy
   zgaszonym ekranie dalej wyje.

## Alarm mimo wyciszenia na iPhonie

Apple przyznało 28 września uprawnienie **Critical Alerts**. Pozwala ono
czerwonemu alarmowi zadzwonić, gdy telefon jest wyciszony przełącznikiem albo
w trybie Skupienia. Uprawnienie samo z siebie nic nie robi: iOS wymaga osobnej,
wyraźnej zgody użytkownika, o którą pyta tylko raz.

W 1.7.84 dołożyliśmy przycisk tej zgody. **Nie działał** — i wyszło to dopiero
na prawdziwym telefonie.

**Zapętlenie.** iOS zgłasza „nie obsługuję alertów krytycznych" dopóty, dopóki
aplikacja **ani razu** o nie nie poprosi. Nasz warunek chował wtedy przycisk,
a bez przycisku nikt nie pytał — więc system dalej mówił „nie obsługuję". Na
ekranie wyglądało to identycznie jak brak uprawnienia, łącznie z brakiem wiersza
„Alerty krytyczne" w Ustawieniach iOS.

To nie była kosmetyka: **w wersji ze sklepu ta zgoda byłaby nieosiągalna dla
wszystkich.** Aplikacja ze sklepu nigdy nie pyta sama.

Teraz przycisk jest widoczny, dopóki nikt nie pytał, a chowa się dopiero wtedy,
gdy system **odpowiedział**, że nie potrafi. Druga, bliźniacza pułapka dotyczyła
osób, które odrzuciły powiadomienia w ogóle: iOS zgłasza im wtedy brak obsługi
wszystkiego. Taki przypadek jest teraz rozpoznawany osobno i aplikacja mówi
wprost, że najpierw trzeba włączyć powiadomienia.

### Zmierzone na prawdziwym iPhonie

Trzy testy na urządzeniu testera, wyłącznie na kanale testowym — żaden alarm
próbny nie poszedł do użytkowników:

| test | warunki | wynik |
|---|---|---|
| czerwony, zgoda udzielona | dzwonek wyciszony, ekran zablokowany | **syrena zagrała**, baner nad blokadą |
| czerwony, zgoda cofnięta | jak wyżej | baner przyszedł, **cisza**; iOS zdegradował go do „PILNE", więc dalej przebija Skupienie |
| żółty, zgoda udzielona | **aplikacja zamknięta**, dzwonek włączony | baner + krótki sygnał uwagi, nie syrena |

Trzeci test był najważniejszy z niesprawdzonych. Telefon ze zgodą przepisuje się
na osobny kanał i przestaje słuchać zwykłego — gdyby żółty tam nie docierał, ci
ludzie po cichu straciliby wszystkie żółte ostrzeżenia i nikt by tego nie
zgłosił, bo brak alarmu nie wygląda jak usterka.

**Czego iPhone nadal nie potrafi:** pełnego ekranu i syreny w pętli. iOS nie
pozwala na to zwykłym aplikacjom i instrukcja mówi to od dawna.

**Uwaga o dostępności:** samo uprawnienie działa dopiero w wersji iOS, która
przejdzie przegląd App Store. To wydanie przygotowuje stronę wspólną; wersja na
iPhone'a jest zgłaszana osobno.

## Ukraiński na zakładce Dźwięk

Zrzuty do instrukcji wyłapały dwa akapity, które w ukraińskim interfejsie
zostawały po angielsku. Oba z tego samego powodu: ukraiński powstaje przez
podmianę tekstu angielskiego, a kluczem słownika jest **całe zdanie**.
Pogrubienie w środku akapitu rozbija je na kilka węzłów tekstowych i klucz
nigdy nie pasuje — po cichu, bez żadnego błędu.

- akapit o głośności żółtego sygnału: po angielsku **od 1.7.84**, czyli
  przeoczenie starsze niż to wydanie;
- akapit o nowym przełączniku ciszy: wstawiłem jego ukraińską wersję w złym
  miejscu, gdzie kilkaset linii dalej nadpisywał ją angielski.

Oba tłumaczenia są teraz wstawiane wprost, obok pozostałych wyjątków na
pogrubienia. Zwykłe przełączenie języka bez restartu aplikacji nadal nie
odświeża kilku napisów (m.in. dolnych zakładek) — to osobna, starsza sprawa,
której to wydanie nie rusza.

## Co zostało zmienione

- `frontend/app.js`, `index.html`, `style.css`: przełącznik ciszy czerwonego,
  obsługa konfliktów, warunek widoczności przycisku zgody, obsługa odrzuconych
  powiadomień.
- `android-app/.../Alarms.java`, `AlarmActivity.java`, `BackgroundPlugin.java`:
  kanał `CH_HIGH_SILENT`, ustawienie `redSilent`, wyciszenie pełnoekranowego
  odtwarzacza, pominięcie podnoszenia głośności.
- `scripts/test_syrena_ios.cjs`: dwa nowe przypadki (cisza zdejmuje oscylatory,
  ale nie wibrację; iOS nietknięty).
- `frontend/i18n.js`: ukraińskie akapity zakładki Dźwięk wstawiane wprost,
  bez martwego klucza w słowniku.
- Instrukcja w trzech językach: zdanie „czerwony alarm gra zawsze tak samo"
  przestało być prawdziwe i zostało przepisane; odświeżone zrzuty zakładki Dźwięk.

## Czego to NIE zmienia

Punktacja, progi, treść alarmów i powiadomienia — bez zmian.
