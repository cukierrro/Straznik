# Strażnik 1.7.64 — aktualizacja działa na Androidzie 9 i 10

- Naprawiona aktualizacja na Androidzie 9 i 10. Błąd „Podpis aktualizacji nie zgadza się” nie był włamaniem — podpis zawsze był w porządku, to aplikacja źle go odczytywała.
- Jeśli masz Androida 9 lub 10 i zobaczysz ten błąd: wpisz w przeglądarce telefonu straznik.eu/pobierz i otwórz pobrany plik. Instaluje się na starej wersji, ustawienia i miejsca zostają.
- Na Androidzie 11 i nowszym aktualizujesz jak zwykle, z aplikacji.

## Co było nie tak

Na telefonach z **Androidem 9 i 10** aktualizacja z aplikacji kończyła się błędem „Podpis aktualizacji nie zgadza się z zainstalowaną aplikacją”.

**Podpis był w porządku** — wszystkie wydania są podpisane tym samym kluczem i nikt niczego nie podmienił. Aplikacja źle go odczytywała: Android 9 i 10 podają certyfikat pobranego pliku tylko przy starszym sposobie pytania, który od wersji 1.7.54 pomijaliśmy. Android 11 i nowsze działały poprawnie.

## Dlaczego tę jedną trzeba zainstalować ręcznie

Błąd siedzi w aplikacji, która już jest na telefonie — to ona sprawdza aktualizację. Wersje od 1.7.54 do 1.7.63 na Androidzie 9 i 10 odrzucą więc także tę poprawkę. Po jednej ręcznej instalacji kolejne aktualizacje zadziałają już normalnie z aplikacji.

## Bezpieczeństwo bez zmian

Aplikacja nadal sprawdza sumę kontrolną i certyfikat każdej aktualizacji, zanim ją zainstaluje. Poprawka nie luzuje tej kontroli — naprawia tylko sposób odczytu certyfikatu na Androidzie 9 i 10.
