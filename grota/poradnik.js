/* Dwa rządowe źródła cytowane przez Grotę — nic więcej tu nie dopisujemy.

   1. „Poradnik bezpieczeństwa”: MSWiA, MON, RCB, nr publikacji 1/2025, ISBN 978-83-976775-0-0,
      wersja internetowa gov.pl/web/poradnikbezpieczenstwa (stan z 16.09.2026).
   2. „Zagrożenie atakiem z powietrza. Instrukcja reagowania”: MSWiA z Państwową Strażą Pożarną,
      opublikowana 25.09.2026 na gov.pl/web/olioc/instrukcja-reagowania. MSWiA nazywa ją rozwinięciem
      Poradnika; mówi to, czego w Poradniku nie ma — zasada dwóch ścian, wybór pomieszczenia, warunki
      piwnicy i garażu. Instrukcja jest złożona wersalikami; cytaty przepisujemy zwykłym pismem,
      bez zmiany słów (tak samo jak w Poradniku poprawiliśmy odstępy przed przecinkami).

   Licencja treści tekstowych serwisu gov.pl: CC BY-SA 4.0. Grafik, zdjęć i infografik z obu materiałów
   NIE używamy (CC BY-NC-ND 4.0) — ikony w Grocie są własne (Lucide, ISC).
   Numery stron = strony drukowane w wersji PDF. Nie dopisywać tu własnych zaleceń. */
(function (global) {
  "use strict";
  const BASE = "https://www.gov.pl/web/poradnikbezpieczenstwa/";
  const INSTRUKCJA_URL = "https://www.gov.pl/web/olioc/instrukcja-reagowania";

  const SOURCE = {
    title: "Poradnik bezpieczeństwa",
    authors: "MSWiA, MON, RCB",
    edition: "nr publikacji 1/2025",
    url: BASE,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.pl",
    note: "Cytaty bez zmian treści. Grota nie jest publikacją urzędową.",
  };

  const SOURCE_INSTRUKCJA = {
    title: "Zagrożenie atakiem z powietrza. Instrukcja reagowania",
    authors: "MSWiA, Państwowa Straż Pożarna",
    edition: "wydanie z 25 września 2026",
    url: INSTRUKCJA_URL,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.pl",
  };

  // Pojedyncze zasady pokazywane w kontekście (alarm, miejsce, środek transportu).
  /* „title” to nazwa sekcji poradnika (nie zmieniamy jej), „temat” to nasz krótki podtytuł — w poradniku
     kilka różnych zaleceń ma tę samą nazwę sekcji („Schronienia”, „Atak z powietrza”) i bez podtytułu
     wyglądały w aplikacji na powtórzone. */
  const RULES = {
    "P-ALARM": { temat: "co robić po usłyszeniu sygnału", page: "24", slug: "sygnaly-alarmowe-i-komunikaty-ostrzegawcze", title: "Sygnały alarmowe i komunikaty ostrzegawcze",
      text: "Jeśli usłyszysz sygnał alarmowy, włącz radio lub telewizor i stosuj się do komunikatów." },
    "P-POWIETRZE": { temat: "droga do schronienia", page: "34", slug: "atak-z-powietrza", title: "Atak z powietrza",
      text: "Kiedy usłyszysz sygnał alarmowy, idź ustaloną wcześniej drogą ewakuacyjną do miejsca schronienia. Zabierz ze sobą plecak ewakuacyjny. Unikaj wind, idź schodami. Schronienie, do którego się udajesz, powinno być bez okien, mieć grube ściany, gruby strop, dostęp do powietrza i wyjście awaryjne." },
    "P-NIE-ZDAZE": { temat: "gdy nie zdążysz do punktu schronienia", page: "29", slug: "schronienia", title: "Schronienia",
      text: "Jeśli nie możesz ukryć się w oznaczonym miejscu schronienia, zostań w domu – z dala od okien, przy ścianach nośnych, w centralnych pomieszczeniach." },
    "P-POZA-DOMEM": { temat: "gdy jesteś poza domem", page: "29", slug: "schronienia", title: "Schronienia",
      text: "Jeśli jesteś poza domem, szukaj miejsc, które zapewniają przynajmniej minimum ochrony (najniższe kondygnacje budynków, w tym piwnice, garaże podziemne, tunele, przejścia podziemne). Nawet zwykłe zagłębienia terenu zapewniają lepszą ochronę niż przebywanie na otwartej przestrzeni." },
    "P-OTWARTY-TEREN": { temat: "eksplozja w otwartym terenie", page: "34", slug: "atak-z-powietrza", title: "Atak z powietrza",
      text: "Jeśli na otwartym terenie usłyszysz eksplozję, padnij na ziemię – najlepiej w zagłębieniu – i osłoń głowę." },
    "P-NIE-WYCHODZ": { temat: "po ataku", page: "34", slug: "atak-z-powietrza", title: "Atak z powietrza",
      text: "Nie wychodź ze schronienia pochopnie. Nie przeciążaj linii telefonicznych – korzystaj z SMS-ów. Pomóż innym – sprawdź, kto wokół Ciebie potrzebuje wsparcia." },
    "P-AUTO": { temat: "samochód w kryzysie", page: "16", slug: "przygotuj-swoje-otoczenie", title: "Przygotuj swoje otoczenie — Transport",
      text: "W sytuacjach kryzysowych ogranicz korzystanie z samochodu. Drogi powinny być przejezdne dla służb ratowniczych i transportów wojskowych. Miej przy sobie papierową mapę lub atlas samochodowy. Możesz wcześniej pobrać mapy offline. System GPS może nie działać." },
    "P-EWAKUACJA": { temat: "gdy służby zarządzą ewakuację", page: "25", slug: "ewakuacja", title: "Ewakuacja",
      text: "Jeżeli władze lub służby ratownicze zdecydują o ewakuacji, bezwzględnie zastosuj się do poleceń. Informacje będziesz dostawać na bieżąco ze stron rządowych, Alertów RCB, RSO i mediów." },
    "P-ZNAK": { temat: "gdzie szukać miejsc schronienia", page: "29", slug: "schronienia", title: "Schronienia",
      text: "Informacje o lokalizacji miejsc schronienia znajdziesz w urzędzie gminy, jednostce Państwowej lub Ochotniczej Straży Pożarnej oraz na stronie gov.pl/kgpsp. Schronienia są oznaczone specjalnym znakiem graficznym." },
    "P-DEKALOG": { temat: "punkt z dekalogu", page: "52", slug: "plan-na-kryzys", title: "Dekalog bezpieczeństwa",
      text: "Sprawdź, gdzie jest najbliższe miejsce schronienia." },
    "P-DOM": { temat: "najbezpieczniejsze miejsce w domu", page: "18", slug: "przygotuj-swoje-otoczenie", title: "Przygotuj swoje otoczenie — Dom lub mieszkanie",
      text: "Sprawdź, które miejsce w domu jest najbezpieczniejsze: z dala od okien, przy ścianach nośnych, w centralnych pomieszczeniach." },

    /* Zasady z „Instrukcji reagowania” (zrodlo: "instrukcja"). Numery stron z tego samego PDF-u. */
    "I-PUNKT": { zrodlo: "instrukcja", temat: "gdy zdążysz do punktu schronienia", page: "4", title: "Decyzja podczas alarmu",
      text: "Jeżeli oznaczony punkt schronienia jest dostępny, droga do niego jest bezpieczna i masz czas – idź tam. Zabierz przygotowany wcześniej plecak ewakuacyjny oraz niezbędne leki. Nie używaj wind – poruszaj się wyłącznie schodami." },
    "I-NIE-RYZYKUJ": { zrodlo: "instrukcja", temat: "gdy droga zajęłaby za dużo czasu", page: "4", title: "Decyzja podczas alarmu",
      text: "Jeżeli dotarcie do punktu schronienia wymagałoby długiego przebywania na zewnątrz, nie próbuj za wszelką cenę tam dotrzeć. Pozostań w budynku, jeżeli ściany i stropy są solidne, bez widocznych uszkodzeń, albo wejdź do najbliższego takiego obiektu." },
    "I-DWIE-SCIANY": { zrodlo: "instrukcja", temat: "zasada dwóch ścian", page: "7", title: "Wybór pomieszczenia",
      text: "Co najmniej dwie solidne ściany powinny znajdować się między Tobą a przestrzenią zewnętrzną." },
    "I-POMIESZCZENIE": { zrodlo: "instrukcja", temat: "jakie pomieszczenie wybrać", page: "6", title: "Wybór pomieszczenia",
      text: "Wybierz pomieszczenie: bez okien albo z jak najmniejszą powierzchnią przeszkleń, położone możliwie blisko środka budynku, oddalone od balkonów i ścian zewnętrznych, pozbawione kotła, piecyka gazowego, butli gazowych, dużych luster i ciężkich przedmiotów wiszących." },
    "I-POKOJE": { zrodlo: "instrukcja", temat: "które pomieszczenia mogą się nadać", page: "7", title: "Wybór pomieszczenia",
      text: "Odpowiednie mogą być: wewnętrzny korytarz, przedpokój lub przedsionek, łazienka, garderoba, komórka bez okien, piwnica, garaż podziemny. Łazienkę wybierz tylko wtedy, gdy nie ma okna, kotła ani piecyka gazowego. Klatka schodowa służy przede wszystkim do przemieszczania się – nie wybieraj jej jako miejsca schronienia, jeżeli ma duże okna." },
    "I-PODZIEMIA": { zrodlo: "instrukcja", temat: "nie każde podziemie jest bezpieczne", page: "9", title: "Piwnica lub garaż podziemny",
      text: "Nie każde pomieszczenie podziemne jest bezpieczne. Jeżeli nie masz pewności, czy piwnica lub garaż są bezpieczne albo budynek ich nie posiada, pozostań w centralnym pomieszczeniu mieszkania lub domu." },
    "I-PIWNICA-NIE": { zrodlo: "instrukcja", temat: "kiedy nie schodzić do piwnicy", page: "8", title: "Piwnica lub garaż podziemny",
      text: "Nie korzystaj z piwnicy, która ma: uszkodzony strop, pęknięcia konstrukcyjne, tylko jedno łatwe do zablokowania wyjście, przebiega przez nią instalacja gazowa." },
    "I-GARAZ": { zrodlo: "instrukcja", temat: "gdzie stanąć w garażu podziemnym", page: "9", title: "Piwnica lub garaż podziemny",
      text: "W piwnicy lub w garażu podziemnym wybierz strefę: możliwie daleko od bramy i rampy wjazdowej, wolną od paliw, butli gazowych, chemikaliów i innych materiałów łatwopalnych, z dala od ładowarek i pomieszczeń technicznych. Nie uruchamiaj silników. Nie blokuj przejść ani dróg wyjazdowych." },
    "I-SAMOCHOD": { zrodlo: "instrukcja", temat: "gdy jesteś w samochodzie", page: "5", title: "Decyzja podczas alarmu",
      text: "Opuść pojazd i udaj się do najbliższego miejsca schronienia, zgodnie z przekazywanymi komunikatami i poleceniami służb. Samochód zaparkuj w sposób, który nie utrudnia przejazdu pojazdom służb ratowniczych i innym pojazdom uprzywilejowanym." },
    "I-PRZYGOTUJ": { zrodlo: "instrukcja", temat: "zanim wystąpi zagrożenie", page: "2", title: "Przygotuj się, zanim wystąpi zagrożenie",
      text: "Przed wystąpieniem zagrożenia sprawdź drogę do punktu schronienia i sposób wejścia do niego. Wybierz co najmniej jeden punkt schronienia, jeżeli nie ma takiego w bliskiej okolicy, zaplanuj inne miejsce, gdzie się schronisz." },
  };

  // Listy kontrolne — każdy punkt to jedno zdanie lub akapit z poradnika, bez zmian.
  const CHECKLISTS = [
    { id: "piwnica", title: "Piwnica lub garaż — sprawdź, zanim się tam schowasz", zrodlo: "instrukcja", page: "8–10", ikona: "brick-wall",
      intro: "Piwnica lub garaż podziemny odpowiednio przygotowane mogą zapewnić ochronę.", items: [
        { tekst: "Solidne ściany i stropy, bez widocznych uszkodzeń.", ikona: "brick-wall" },
        { tekst: "Drożne wejście.", ikona: "door-open" },
        { tekst: "Sprawna wentylacja.", ikona: "fan" },
        { tekst: "Oświetlenie awaryjne.", ikona: "lightbulb" },
        { tekst: "Bezpieczna droga wyjścia.", ikona: "log-out" },
        { tekst: "Z miejsca schronienia i z przejść do niego usunięte: benzyna i inne paliwa, farby i rozpuszczalniki, butle gazowe, materiały pirotechniczne, duże ilości drewna, papieru i innych materiałów łatwopalnych.", ikona: "flame" },
        { tekst: "Usunięte przedmioty, które mogą spaść, stłuc się albo zablokować wyjście.", ikona: "triangle-alert" },
        { tekst: "Drogi prowadzące do miejsca schronienia oraz wyjścia podstawowe i wyjścia awaryjne pozostają drożne.", ikona: "log-out" },
      ] },
    { id: "dom", title: "Dom lub mieszkanie", page: "17–18", slug: "przygotuj-swoje-otoczenie", ikona: "house", items: [
      "Sprawdź, które miejsce w domu jest najbezpieczniejsze: z dala od okien, przy ścianach nośnych, w centralnych pomieszczeniach.",
      "Przygotuj się na przerwy w dostawach wody, prądu, gazu i na brak dostępu do telefonu i internetu.",
      "Przygotuj przedmioty do uszczelniania i zabezpieczania okien i drzwi, np. koce, ręczniki, taśmy.",
      "Usuń z korytarzy i klatek schodowych niepotrzebne przedmioty.",
      "Oznacz w widoczny sposób, np. kolorowymi taśmami, miejsca odcięcia gazu, prądu i wody. Przećwicz z najbliższymi ich wyłączanie.",
      "Zamontuj czujki dymu, czadu i gazu. Regularnie sprawdzaj ich stan techniczny. Dokładnie sprawdź umiejscowienie czujek.",
      "Wyposaż dom w gaśnicę i koc gaśniczy.",
      "Pamiętaj o regularnych przeglądach instalacji: kominowej, wentylacyjnej, gazowej i elektrycznej oraz o ubezpieczeniu domu/mieszkania.",
    ] },
    { id: "zapasy", title: "Zapasy domowe na minimum 3 dni", page: "20–22", slug: "przygotuj-swoje-otoczenie", ikona: "package", items: [
      "Jedzenie i picie: minimum 3 litry wody na osobę na dobę, żywność gotowa do spożycia.",
      "Apteczka: leki przyjmowane na stałe, przeciwbólowe, przeciwzapalne, przeciwwymiotne, przeciwbiegunkowe, gaza, bandaże, opatrunki na oparzenia, rękawiczki jednorazowe, środki antyseptyczne, opaska do tamowania krwotoków, termometr i nożyczki, maseczki FFP3, folia termiczna.",
      "Środki czystości i higieny osobistej: papier toaletowy, chusteczki nawilżane, podpaski, pieluchy, środki dezynfekujące, worki na śmieci, wiadro z pokrywą.",
      "Oświetlenie i łączność: latarka i radio na baterie lub na korbkę, naładowany telefon, ładowarka, naładowany powerbank, pasujące kable i baterie, świeczki do użytku domowego, zapalniczka.",
      "Koce, śpiwory i ciepła odzież.",
      "Gotówka w różnych nominałach.",
      "Narzędzia i sprzęt: taśmy, folie, zestawy do uszczelniania.",
      "Alternatywne źródło ogrzewania, które nie działa na prąd.",
    ] },
    { id: "plecak", title: "Plecak ewakuacyjny", page: "26–27", slug: "ewakuacja", ikona: "backpack",
      intro: "Przygotuj podręczny zestaw najbardziej potrzebnych rzeczy. Skorzystaj z naszej listy i dopasuj ją do swoich potrzeb. Plecak ewakuacyjny powinien mieć każdy domownik, nawet dzieci.", items: [
      "Woda butelkowana. Filtry lub tabletki do uzdatniania wody.",
      "Apteczka i leki osobiste, środki higieniczne i do dezynfekcji.",
      "Dokumenty, kopie na pendrivie i gotówka w różnych nominałach.",
      "Latarka i radio na baterie lub na korbkę, naładowany telefon i powerbank, ładowarka, pasujące kable i zapasowe baterie.",
      "Scyzoryk lub multitool, zapalniczka, worki na śmieci, mapy drukowane.",
      "Żywność wysokoodżywcza gotowa do spożycia (batony energetyczne, suszone owoce, bakalie itp.).",
      "Ważna rzecz osobista, np. zdjęcie, pamiątka rodzinna.",
      "Ubranie dopasowane do pory roku, odzież przeciwdeszczowa, śpiwór, karimata, folia termiczna.",
      "Alternatywna łączność (np. walkie-talkie).",
    ] },
    { id: "plan", title: "Plan na kryzys", page: "46–47", slug: "plan-na-kryzys", ikona: "clipboard-list", items: [
      "Opracuj rodzinny plan na wypadek kryzysu.",
      "Ustal dane kontaktowe oraz miejsca i terminy spotkań – w okolicy i poza miejscowością zamieszkania. To ważne na wypadek rozdzielenia i braku łączności.",
      "Regularnie go aktualizuj i ćwicz z domownikami.",
    ] },
    { id: "praca", title: "Praca", page: "19", slug: "przygotuj-swoje-otoczenie", ikona: "briefcase-business", items: [
      "Sprawdź, gdzie są wyjścia ewakuacyjne, miejsca zbiórki, gaśnice, defibrylatory (AED) i apteczki.",
      "Zgłaszaj natychmiast nieprawidłowości, które zauważysz, np. uszkodzoną instalację elektryczną, zablokowane drogi ewakuacyjne, niesprawne windy.",
      "Przećwiczcie ze współpracownikami plan awaryjny i ewakuację. Upewnij się, że wiesz, jak rozpoznawać, zapobiegać, alarmować i reagować na zagrożenia w Twojej pracy.",
    ] },
    { id: "szkola", title: "Szkoła", page: "19", slug: "przygotuj-swoje-otoczenie", ikona: "school", items: [
      "Jeżeli uczysz się w szkole, bierz udział w próbnych alarmach. Informuj nauczycieli o podejrzanych zachowaniach lub przedmiotach.",
      "Jeżeli Twoje dziecko jest uczniem, zapisz kontakt do osoby wyznaczonej przez szkołę w sprawie odbioru dzieci w sytuacji zagrożenia.",
    ] },
    { id: "pomoc", title: "Osoby potrzebujące szczególnej pomocy", page: "12", slug: "osoby-potrzebujace-szczegolnej-pomocy", ikona: "heart-handshake",
      intro: "W sytuacjach kryzysowych pomóż osobom starszym, chorym czy z niepełnosprawnościami. Nie wszyscy mogą być świadomi nadchodzącego zagrożenia, dlatego przekaż im najważniejsze informacje i wyjaśnij, co trzeba zrobić.", items: [
      "Ustal z osobą, którą wspierasz, sposób działania w sytuacji kryzysowej.",
      "Pomóż w przygotowaniach, np. spakuj plecak ewakuacyjny dla osoby wspieranej, upewnij się, że ma zapas niezbędnych leków i baterii do urządzeń wspomagających (aparat słuchowy, sensor do pomiaru cukru itp.).",
      "W razie nagłego zagrożenia poinformuj służby ratownicze o osobie, która wymaga szczególnej pomocy podczas ewakuacji.",
    ] },
  ];

  // Które listy pasują do rodzaju zapisanego miejsca.
  const PLACE_KINDS = {
    dom: { label: "Dom", checklist: "dom", rule: "P-DOM" },
    praca: { label: "Praca", checklist: "praca", rule: null },
    szkola: { label: "Szkoła / uczelnia", checklist: "szkola", rule: null },
    przedszkole: { label: "Przedszkole / żłobek", checklist: null, rule: null },
    bliscy: { label: "Rodzina / bliscy", checklist: null, rule: null },
    dzialka: { label: "Działka / domek", checklist: null, rule: null },
    inne: { label: "Inne", checklist: null, rule: null },
  };

  global.GrotaPoradnik = { SOURCE, SOURCE_INSTRUKCJA, RULES, CHECKLISTS, PLACE_KINDS,
    url: (slug) => BASE + slug, urlInstrukcji: () => INSTRUKCJA_URL };
})(window);
