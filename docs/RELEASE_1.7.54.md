# Strażnik 1.7.54 — bezpieczniejsze aktualizacje i nowa licencja

## Bezpieczniejsza aktualizacja w aplikacji

- Plik aktualizacji jest pobierany **tylko z wydań Strażnika na GitHubie**.
- Przed otwarciem instalatora aplikacja sprawdza **sumę kontrolną SHA-256**, **nazwę pakietu** i **certyfikat podpisu**. Plik musi być Strażnikiem podpisanym tym samym kluczem co wersja zainstalowana na telefonie.
- Wcześniej adres i sumę podawał ten sam serwer, a Android odrzucał tylko aktualizację z innym podpisem tej samej aplikacji. Podrobiony plik z inną nazwą pakietu mógł zainstalować się jako nowa aplikacja. Teraz zostanie odrzucony z komunikatem, zanim otworzy się instalator.
- Sprawdzone na emulatorze: wersja podpisana naszym kluczem otwiera instalator, a wersja podpisana innym kluczem pokazuje „Podpis aktualizacji nie zgadza się z zainstalowaną aplikacją”.

## Nowa licencja

Od tej wersji kod jest objęty licencją **„wszelkie prawa zastrzeżone”** ([LICENSE](https://github.com/cukierrro/Straznik/blob/main/LICENSE)). Wersje do 1.7.53 pozostają na MIT.

- Aplikację nadal pobierasz i używasz bezpłatnie, a kod możesz czytać i zgłaszać do niego uwagi.
- Kopiowanie kodu, zmienione wersje, rozpowszechnianie i udostępnianie funkcji innym wymaga pisemnej licencji autora.
- Licencje bibliotek, map i danych innych podmiotów są w [NOTICE](https://github.com/cukierrro/Straznik/blob/main/NOTICE). Linki do obu dokumentów są w oknie „O aplikacji” i w stopce instrukcji.

## Powiadomienia i bezpieczeństwo

- W powiadomieniu o alarmie **tytuł artykułu pojawia się tylko od znanych redakcji** i z kanałów wpisanych na stałe. Inne doniesienia są opisane jako „Doniesienie medialne”, a pełny tytuł widać w aplikacji. Wcześniej tytuł z dowolnej strony z wyników Google News trafiał dosłownie do alarmu.
- Treści z zewnętrznych źródeł w panelu sygnałów i w karcie samolotu są dokładniej zabezpieczone.
- Serwer odrzuca zbyt duże zapytania i zalew zapisów do powiadomień, a wysyłka alarmów do aplikacji ma osobną kolejkę.
