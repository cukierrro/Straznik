# Wydanie 1.7.92 — poprawka bezpieczeństwa

versionCode 121, versionName 1.7.92. 10 października 2026.

<!-- zmiany -->
- Poprawka bezpieczeństwa — zalecamy aktualizację. Silnik aplikacji (Capacitor) podniesiony do wersji, która naprawia publicznie ogłoszoną lukę.
- Linki ze źródeł zewnętrznych — artykułów, sygnałów i zdjęć samolotów — nie mogą już prowadzić do wnętrza aplikacji.
- Wygląd, punktacja, progi alarmów i treść powiadomień bez zmian.
<!-- /zmiany -->

## Co się stało

W sobotę rano nasze cotygodniowe sprawdzanie zależności w bazie OSV zgłosiło
lukę w Capacitorze — bibliotece, na której stoi aplikacja na Androida.
Ogłoszono ją 5 października, wydanie 1.7.91 miało jeszcze wersję sprzed
poprawki. Opis luki jest publiczny: GHSA-rvm3-566m-v7fv.

## Co zmieniliśmy

- Capacitor 8.4.2 → **8.4.3**, czyli najmniejszy krok, który zawiera
  poprawkę. Świadomie nie przeskakujemy do linii 8.5 w wydaniu, którego
  jedynym celem jest bezpieczeństwo.
- **Obrona w głąb:** filtr linków odrzuca teraz adresy prowadzące do samej
  aplikacji. Link z zewnętrznego źródła nie ma po co tam prowadzić, więc
  podobna luka w przyszłości nie znajdzie u nas tej drogi.
- Ten sam filtr obejmuje teraz linki do źródła i licencji zdjęć samolotów —
  dotąd szły bez żadnego sprawdzenia.
- Na serwerze: biblioteka multidict 6.7.1 → 6.9.1 (GHSA-54p9-h82j-f925).
  Naszego serwera ta luka nie dotyczyła — wywołuje ją inny typ serwera niż
  nasz — ale nie zostawiamy znanych dziur w zależnościach.

## iPhone i strona

Aplikacja na iPhone'a była już na wersji Capacitora spoza zakresu luki.
Strona w przeglądarce Capacitora nie używa. Filtr linków działa wszędzie.

## Testy

Nowy test `scripts/test_linki_zewnetrzne.cjs` wykonuje prawdziwy filtr z
`app.js` i sprawdza wersję Capacitora w locku. Kontrola dodatnia: na kodzie
sprzed poprawki zgłasza siedem błędów.
