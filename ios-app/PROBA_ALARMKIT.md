# Próba AlarmKit — czerwony alarm przy wyciszonym iPhonie (21.09.2026)

## Po co

Zwykłe powiadomienie iOS przy **wyciszonym** telefonie (przełącznik z boku) jest bezgłośne.
Przebić to mogą tylko:

- Critical Alerts, na które wniosek do Apple (`442YB6VV2L`, 19.09) czeka na odpowiedź,
- albo alarm z **AlarmKit** (iOS 26+). Według Apple taki alarm „breaks through the silent mode
  and the current focus”, a do jego użycia nie potrzeba zgody Apple, tylko zgody użytkownika.

Niepotwierdzone przez nikogo, także przez Apple: **czy alarm da się zaplanować z tła**, po
powiadomieniu z serwera, przy zamkniętej aplikacji. To sprawdza ta próba.

## Co jest w kodzie

- `straznik-background/.../AlarmKitProba.swift` zawiera cały AlarmKit:
  - alarm jest „tylko alertem”: stała data, bez odliczania, więc nie potrzeba rozszerzenia
    z Live Activity;
  - syrena gra z `alarm_syrena.wav`;
  - każda próba zostawia ślad do odczytu.
- `AppDelegate.didReceiveRemoteNotification`: gdy przyjdzie push z `alarmkit=1` i próba jest
  włączona, planuje alarm za 1 s. Zapisuje, którą drogą to się stało: „push w tle” albo
  „push (aplikacja otwarta)”.
- `Info.plist` dostał dwa klucze:
  - `NSAlarmKitUsageDescription` (bez niego AlarmKit nie działa),
  - `UIBackgroundModes: remote-notification` (bez niego iOS nie budzi aplikacji).
- Serwer (`backend/app/notify.py` na `main`) dodaje `content-available` i `alarmkit=1`
  **wyłącznie** przy czerwonym poziomie na temacie `test_…`. Zwykłe tematy mają ładunek bez
  zmian, co pilnuje `scripts/test_fcm_apns.py`, część 6.
- Wtyczka ma nowe metody: `alarmKitStan`, `alarmKitZgoda`, `alarmKitTest`, `alarmKitPrzelacz`.
  Wszystkie działają tylko w wersji testowej.
- ⚙ → Dźwięk ma sekcję „PRÓBA”. Widać ją tylko w TestFlight na iOS 26+. Wersja ze sklepu
  jej nie pokazuje, bo `isTestBuild` jest tam fałszem.

## Test (iPhone z iOS 26, wersja z TestFlight)

1. ⚙ → Dźwięk → „🔔 Zgoda na alarmy” → zezwól.
2. **Test A, z aplikacji:**
   - naciśnij „▶ Test: alarm za 10 s”,
   - przestaw przełącznik na cichy,
   - zablokuj ekran.
   Oczekiwane: pełnoekranowy alarm z syreną mimo wyciszenia. Zapisz, czy grał, jak długo
   i jak się go zatrzymuje.
3. Włącz przełącznik „Próba: alarm z serwera przez AlarmKit”.
4. **Test B, push przy otwartej aplikacji:** sesja główna wysyła czerwony test na `test_voiv_…`
   (za zgodą usera).
5. **Test C, push w tle:** aplikacja w tle (ekran zablokowany), telefon wyciszony, znowu test
   z serwera.
6. **Test D, aplikacja zamknięta:** usuń ją z przełącznika aplikacji, wycisz telefon, test
   z serwera.
7. Po każdym teście: ⚙ → Dźwięk → wiersz „ostatnia próba” i zrzut ekranu.

Wynik rozstrzyga:

- Jeśli B, C i D grają przy wyciszeniu, mamy działający alarm przebijający wyciszenie
  niezależnie od decyzji o Critical Alerts. Zostanie wtedy pytanie, jak na to spojrzy
  przegląd App Store: Apple w materiałach WWDC pisze, że alarmy „are not a replacement for …
  critical alerts”.
- Jeśli C lub D nie grają (iOS nie wybudził aplikacji albo AlarmKit nie planuje z tła),
  następny krok to rozszerzenie Notification Service Extension. Ono uruchamia się przy każdym
  pushu z `mutable-content`, ale wymaga osobnego celu i profilu podpisu.

## Ograniczenia znane z góry

- iOS może nie wybudzić aplikacji po pushu z `content-available`, np. przy niskiej baterii,
  w trybie oszczędzania energii albo gdy aplikacja była „zabita” ręcznie. To nie jest
  gwarantowane.
- Alarm AlarmKit zatrzymuje się gestem „przesuń, aby zatrzymać” (od iOS 26.1) albo przyciskiem
  bocznym. Przycisk boczny zatrzymuje wszystkie grające alarmy.
- Własny dźwięk ma 8 s. Od iOS 26.1 alarm powtarza go do zatrzymania. Na 26.0 według forów
  gra raz.
