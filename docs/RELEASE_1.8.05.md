# Wydanie 1.8.05 — syrena, której nie wyciszy przypadek, i dziennik alarmów

versionCode 135, versionName 1.8.05. 1 listopada 2026.

<!-- zmiany -->
- Przy otwartym ekranie alarmu syrena gra sama: inne powiadomienia, panel i przyciski głośności już jej nie przerywają.
- Czerwony pokazuje pełny ekran także po wcześniejszym żółtym, a na starszym Androidzie nie kończy się na samym pasku.
- W Alarmy i zgody jest dziennik: kiedy alarm dotarł, ile szedł i jak się skończył. Dane zostają w telefonie.
- Dron bez znanego kursu rzadziej włącza czerwony, a jego opis nie mówi już „kursem na granicę”.
- Karta kontrolna ostrzega o włączonej optymalizacji baterii na telefonach innych niż Google.
<!-- /zmiany -->

## Co się stało

W nocy 1 listopada o 3:06 serwer wysłał czerwony dla lubelskiego w ciągu sekund, ale dwie osoby
mówiły rano, że go nie słyszały. Nie da się już ustalić, co dokładnie zaszło na ich telefonach:
telefon pamiętał tylko ostatni sygnał, a ten nadpisał poranny żółty. Rano tego samego dnia
kolejny czerwony pokazał na obu telefonach pełny ekran i zagrał syreną.

Odtworzenie prawdziwej ścieżki powiadomienia na emulatorach (Android 14 i 9) znalazło za to
konkretne błędy, które mogły do tego doprowadzić.

## Syrena

Syrenę grało samo powiadomienie, a Android traktuje dźwięki powiadomień jak zbywalne.
Zmierzone przed poprawką: syrenę na stałe gasiły rozwinięcie panelu powiadomień, przyciski
głośności (Android 14) oraz SMS i żółty dla innego województwa (Android 9).

Teraz, gdy ekran alarmu jest otwarty, gra własny odtwarzacz, a powiadomienie przechodzi na
kanał bez dźwięku. Gasi ją tylko „POTWIERDZAM”, „Wycisz alarm” albo limit 15 minut. Przyciski
głośności przy grającym alarmie nic nie robią. Zmierzone po poprawce na tych samych emulatorach:
żaden z tych scenariuszy nie gasi syreny, a limit 15 minut działa dalej.

Ograniczenie: gdy ekran alarmu się nie otworzy (telefon w użyciu albo Android 14+ bez zgody na
pełny ekran), syrena nadal gra przez powiadomienie. Nakładki producentów mogą działać inaczej
niż czysty Android na emulatorze.

## Pełny ekran

- Czerwony po żółtym tego samego województwa był tylko aktualizacją powiadomienia, a Android
  uruchamia pełny ekran wyłącznie dla nowego. Zmierzone na Androidzie 14: syrena grała, a ekran
  zostawał zgaszony.
- Poniżej Androida 14 aplikacja sama zapalała ekran, a przy włączonym ekranie Android pokazuje
  już tylko pasek. Teraz czeka 3 sekundy i zapala ekran tylko wtedy, gdy nadal śpi.

## Dziennik alarmów

Menu → Ustawienia → Alarmy i zgody → „Dziennik alarmów na tym telefonie”: 40 ostatnich zdarzeń.
Zapisuje odebranie (z czasem drogi i informacją o obniżonym priorytecie), stan telefonu przy
pokazaniu alarmu (ekran, Nie przeszkadzać, zgoda na pełny ekran, głośność), otwarcie ekranu
alarmu oraz wyciszenie. Dane nie wychodzą z telefonu.

## Dron bez kursu

1 listopada o 9:03 czerwony dla dwóch województw otworzył jeden dron 36 km od granicy,
z wiarygodnością średnią, jednym meldunkiem i bez kursu; RCB nie wydało alertu. Dron bez kursu
potwierdza czerwony teraz tylko przy wysokiej wiarygodności i co najmniej 2 zgłoszeniach albo do
30 km od granicy. Rakiet to nie dotyczy.

Przeliczone na zapisanych sygnałach 2 sierpnia – 1 listopada: znika 12 z 57 czerwonych, we
wszystkich zostaje żółty, a RCB miało wtedy najwyżej 1. stopień; 2 czerwone przychodzą później
(2 i 11 minut). Reguła ma znaczenie dopiero od 13 października, więc to tylko 19 dni danych
bez żadnego alertu 3. stopnia.

Serwer liczy tak od 1 listopada. W tej wersji tak samo liczy aplikacja, gdy serwer nie odpowiada.

## Drobne

- Opis obiektu bez kursu: „w odległości 42 km od granicy PL [kurs nieznany]” zamiast sprzecznego
  „kursem na granicę PL … [kurs nieznany]”, także w historii.
- Karta kontrolna ostrzega o optymalizacji baterii poza telefonami Google; lista producentów
  pomijała nowe marki.
