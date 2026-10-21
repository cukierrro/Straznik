# Wydanie 1.8.00 — krótszy ekran alarmu z limitem 15 minut, alarmy tylko dla Twoich województw

versionCode 129, versionName 1.8.00. 21 października 2026.

<!-- zmiany -->
- Ekran czerwonego alarmu: przycisk potwierdzenia i wybór na górze, najwyżej 3 powody, reszta w panelu.
- Syrena, wibracja i miganie ekranu cichną same po 15 minutach — dla baterii i nagrzewania telefonu.
- Krótsze powiadomienia: nagłówek, 3 powody i jedno zdanie, co zrobić.
- Alarmy przychodzą tylko dla województw, które obserwujesz — telefon wypisuje się z pozostałych przy każdej synchronizacji.
- Alert RCB, który wygasł bez odwołania, przez godzinę widać jako „wygasł o …” zamiast znikać bez śladu.
- Zapowiedź spotkania, wykładu czy warsztatów w mediach nie daje już punktów.
- Poprawione pomyłki w nazwach: powiat opolski, Rawa Mazowiecka, Janów Podlaski, Chełmek, Medyka.
- Nagłówek województwa w panelu nie chowa się pod paskiem po otwarciu karty.
<!-- /zmiany -->

## Ekran czerwonego alarmu: przyciski na górze, 3 powody, 15 minut

Uwaga użytkownika: lista sygnałów na ekranie alarmu bywała tak długa, że do przycisku
„POTWIERDZAM” trzeba było przewijać. A syrena i migający pełny ekran nie miały końca —
przy alarmie trwającym godzinę telefon się grzał i tracił baterię.

- **Przyciski na górze.** Zaraz pod wynikiem jest „POTWIERDZAM — wycisz alarm”, a po
  potwierdzeniu w tym samym miejscu wybór: „Gdzie się schronić”, „Obserwuj mapę”,
  „Jestem w bezpiecznym miejscu”. Niżej „Co zrobić” i powody.
- **Najwyżej 3 powody** — najważniejsze sygnały regionu. Gdy jest ich więcej, ekran mówi
  wprost: „Pełna lista sygnałów w panelu”.
- **Limit 15 minut.** Syrena, wibracja i miganie pełnego ekranu kończą się same po
  15 minutach; ekran zostaje z napisem „Wyciszono automatycznie po 15 min”. Alarm nie znika —
  województwo dalej świeci na czerwono, a następny alarm zawyje od nowa. Na Androidzie
  dotyczy to też natywnego alarmu pełnoekranowego przy wygaszonym ekranie, a powiadomienie
  wygasa minutę po wyciszeniu.

## Krótsze powiadomienia

Treść powiadomienia na pasku (Android, iPhone i przeglądarka) to teraz nagłówek, najwyżej
3 powody i jedno zdanie: przy czerwonym „Co zrobić: przejdź do miejsca schronienia lub
pomieszczenia bez okien · źródło NIEOFICJALNE”, przy żółtym „Zachowaj czujność · źródło
NIEOFICJALNE”. Wcześniej długie powiadomienie było ucinane w połowie listy.

## Alarmy tylko dla obserwowanych województw (zgłoszenie #15)

Użytkownik z jednym miejscem w mazowieckim dostawał żółte i czerwone alarmy dla lubelskiego
i podkarpackiego. Mazowieckie nie miało w tym czasie ani jednego czerwonego, więc to nie było
przeniesienie od sąsiadów.

Przyczyna: przy pierwszym uruchomieniu, zanim wybierzesz województwa, aplikacja zapisuje się
na ścianę wschodnią (lubelskie, podkarpackie, podlaskie, warmińsko-mazurskie). Przy zmianie
wypisywała się tylko z tematów ze swojej listy, a ta bywała niepełna — i zapis zostawał
na serwerach Google.

Teraz:
- przy każdej synchronizacji aplikacja wypisuje się ze **wszystkich** województw spoza
  wybranych;
- alarm dla województwa, którego nie obserwujesz, telefon odrzuca, zanim cokolwiek zadzwoni —
  także w otwartej aplikacji.

Sprawdzone na emulatorze z logiem Firebase: świeża instalacja zapisała się na ścianę wschodnią,
po wybraniu samego Mazowsza wypisała się z 15 województw i zapisała na mazowieckie, każda
operacja potwierdzona przez Google.

Po aktualizacji wystarczy otworzyć aplikację raz — synchronizacja posprząta stare zapisy.

## Alert RCB „wygasł bez odwołania”

Alert RCB ma czas ważności. Gdy minął bez odwołania, wpis po prostu znikał i nie było wiadomo,
czy zagrożenie się skończyło, czy coś przepadło. Teraz przez godzinę po końcu ważności panel
pokazuje „Alert RCB wygasł bez odwołania” z godziną — bez punktów. Działa też w trybie
bez serwera.

## Media: zapowiedzi spotkań bez punktów

21.10 artykuł Lublin112 „Bezpłatne spotkanie dla osób niesłyszących” dał punkty w lubelskim.
Zapowiedzi spotkań, warsztatów, wykładów, prelekcji, webinarów i „zapisy na …” nie dają
już punktów (jak wcześniej zapowiedzi szkoleń).

## Pomyłki w nazwach miejscowości

Radio Lublin w opisie alertu dla lubelskiego wymienia powiaty, w tym „opolski” — to powiat
wokół Opola Lubelskiego, a słownik brał go za województwo opolskie (21.09–15.10 dziewięć razy).
Przymiotnik województwa poprzedzony słowem „powiat” to teraz nazwa powiatu, nie województwo.

Przy okazji: Opole Lubelskie we wszystkich odmianach, Janów Podlaski i Międzyrzec Podlaski →
lubelskie, Rawa Mazowiecka → łódzkie (nie mazowieckie), Chełmek → małopolskie (nie Chełm),
Medyka bez łapania słowa „medyk”, „Śląsk Opolski” → opolskie.

## Drobne

- Po dotknięciu województwa karta sygnałów przewija się tak, że jego nagłówek zostaje
  widoczny pod paskiem panelu.
- Polityka prywatności (21.10): administrator danych, kontakt przez formularz, podstawy
  prawne, czas przechowywania, prawo skargi do UODO.

## Czego nie sprawdziliśmy

Limitu 15 minut na fizycznym telefonie przy wygaszonym ekranie i w trybie oszczędzania
baterii — sprawdzony testami i na emulatorze Pixel 7. Wypisywania ze starych tematów na
telefonie, który miał je od tygodni — sprawdzone na świeżej instalacji emulatora.
