# -*- coding: utf-8 -*-
"""Pełna instrukcja modułu GROTA (docs/grota.html, docs/grota-en.html).

Zrzuty w docs/screens/grota/ (720 px szerokości) zrobiono 22.09.2026 na emulatorze
(Android 12, Strażnik 1.7.68) z pozycją ustawioną na Stare Miasto w Lublinie.
Zdjęcie z góry na zrzutach pochodzi z usługi GUGiK pobranej na komputerze — w 1.7.68
usługa zmieniła adres i zdjęcie się nie wyświetla (poprawka w kolejnym wydaniu).

Wersja angielska opisuje ten sam, polskojęzyczny ekran: przy każdym napisie podaje
polski oryginał i tłumaczenie, żeby dało się trafić w przycisk bez znajomości języka.

Uruchomienie:  py scripts/zbuduj_instrukcje_grota.py
"""
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
WERSJA = "1.7.68"
APK = "https://github.com/cukierrro/Straznik/releases/latest/download/Straznik.apk"


def fig(plik, alt, podpis, h=1560):
    src = f"screens/grota/{plik}.jpg"
    return (f'<figure><a class="shot-link" href="{src}"><img loading="lazy" src="{src}" width="720" height="{h}" '
            f'alt="{alt}"></a><figcaption>{podpis}</figcaption></figure>')


def shots(*figs):
    return '<div class="shots">' + "".join(figs) + "</div>"


def strona(L):
    nav = "".join(f'<a href="#{i}">{t}</a>' for i, t in L["nav"])
    sekcje = "\n".join(f'<section id="{i}">\n  <h2>{t}</h2>\n{tresc.strip()}\n</section>\n' for i, t, tresc in L["sekcje"])
    return f"""<!DOCTYPE html>
<html lang="{L['lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{L['title']}</title>
<meta name="description" content="{L['desc']}">
<link rel="canonical" href="https://cukierrro.github.io/Straznik/{L['plik']}">
<link rel="alternate" hreflang="pl" href="https://cukierrro.github.io/Straznik/grota.html">
<link rel="alternate" hreflang="en" href="https://cukierrro.github.io/Straznik/grota-en.html">
<link rel="icon" href="ikona.png">
<link rel="stylesheet" href="guide.css">
<meta property="og:type" content="website">
<meta property="og:url" content="https://cukierrro.github.io/Straznik/{L['plik']}">
<meta property="og:title" content="{L['og']}">
<meta property="og:description" content="{L['desc']}">
<meta name="twitter:card" content="summary">
</head>
<body id="top">
<a class="skip" href="#content">{L['skip']}</a>
<nav aria-label="{L['navlabel']}"><div class="nav-in">
  <a class="brand" href="{L['glowna']}">STRAŻNIK</a>
  <div class="nav-links">{nav}</div>
  <div class="languages" aria-label="{L['jezyk']}">{L['jezyki']}</div>
</div></nav>
<header class="hero"><div class="wrap hero-grid">
{L['hero'].strip()}
</div></header>
<main id="content" class="wrap">
{sekcje}
</main>
<footer><div class="wrap">
{L['stopka'].strip()}
  <a class="back-top" href="#top">{L['gora']}</a>
</div></footer>
</body>
</html>
"""


# ─────────────────────────────── PL ───────────────────────────────
PL = dict(
    lang="pl", plik="grota.html", glowna="index.html",
    title="GROTA — gdzie się schronić · instrukcja",
    desc="Pełna instrukcja GROTY w Strażniku: najbliższe punkty schronienia przy alarmie, trasa, moje miejsca, mapa offline i listy przygotowań. Zrzuty każdej funkcji.",
    og="GROTA — gdzie się schronić · instrukcja",
    skip="Przejdź do treści", navlabel="Nawigacja instrukcji GROTY", jezyk="Język instrukcji",
    jezyki='<a href="grota.html" lang="pl" aria-current="page">PL</a><a href="grota-en.html" lang="en" hreflang="en">EN</a>',
    gora="↑ Wróć na górę",
    nav=[("start", "Na start"), ("alarm", "Przy alarmie"), ("mapa", "Mapa"), ("miejsca", "Miejsca"),
         ("przygotuj", "Przygotuj"), ("offline", "Bez internetu"), ("pytania", "Pytania")],
    hero=f"""
  <div><div class="eyebrow">Instrukcja GROTY · Strażnik {WERSJA} na Androida</div>
    <h1>GROTA — gdzie się schronić</h1>
    <p class="lead">GROTA to część aplikacji Strażnik. Przy alarmie pokazuje <b>najbliższe miejsca schronienia</b> z publicznego wykazu Państwowej Straży Pożarnej i prowadzi do nich. Zawczasu pomaga zapisać schronienia przy domu, pracy i szkole, pobrać mapę na wypadek braku internetu i przygotować się według „Poradnika bezpieczeństwa”.</p>
    <div class="actions"><a class="button primary" href="{APK}">↓ Pobierz Strażnika na Androida</a><a class="button" href="index.html">Instrukcja Strażnika</a></div>
    <p class="fineprint">Zrzuty zrobiono 22 września 2026 w Strażniku {WERSJA}, z pozycją na Starym Mieście w Lublinie. Adresy na zrzutach pochodzą z publicznego wykazu PSP. GROTA jest na razie <b>tylko na Androidzie i tylko po polsku</b> — wersje angielska i ukraińska oraz iPhone są w przygotowaniu. Dotknij zdjęcia, aby otworzyć je w pełnym rozmiarze.</p>
  </div>
  <a class="shot-link" href="screens/grota/g04-teraz-propozycja.jpg"><img src="screens/grota/g04-teraz-propozycja.jpg" width="720" height="1560" alt="Ekran TERAZ w GROCIE: mapa Starego Miasta w Lublinie z trasą od „Tu jesteś” do celu, a pod nią karta „Najbliższe sprawdzone miejsce schronienia — ul. Złota 2, Lublin, 218 m, ok. 3 min trasą” i duży zielony przycisk PROWADŹ"></a>
""",
    sekcje=[
        ("start", "Najważniejsze w 30 sekund", """
  <div class="note"><ol>
    <li><b>Przy alarmie:</b> dotknij <kbd>POTWIERDZAM — wycisz syrenę</kbd>, potem <kbd>Gdzie się schronić</kbd>. GROTA od razu pokaże najbliższe miejsce i trasę. Dotknij <kbd>PROWADŹ ➜</kbd>.</li>
    <li><b>Zawczasu, w spokoju:</b> w zakładce <kbd>Miejsca</kbd> dodaj dom, pracę albo szkołę dziecka i wybierz dla każdego do trzech schronień. Zapytaj zarządcę budynku, czy i kiedy są otwarte.</li>
    <li><b>Na wypadek braku internetu:</b> w zakładce <kbd>Przygotuj</kbd> pobierz mapę swojego województwa (<kbd>Mapa i trasy</kbd>).</li>
    <li><b>Pamiętaj:</b> GROTA to wykaz miejsc, a nie gwarancja, że będą otwarte. Gdy słychać syreny albo przyszedł Alert RCB, działaj według komunikatu.</li>
  </ol></div>
  <h3>Czym są punkty w GROCIE</h3>
  <p>To <b>85 837 punktów schronienia</b> z publicznego wykazu Komendy Głównej PSP („Punkty schronienia w Polsce”, dane.gov.pl). Wykaz nie mówi, czy to schron, ukrycie czy miejsce doraźnego schronienia, ani ile osób się zmieści — pełna ewidencja nie jest jawna. Mówi za to, <b>kiedy punkt jest dostępny</b>, i to widać po kolorze kropki:</p>
  <div class="cards">
    <div class="card"><h3>🟢 Całodobowo</h3><p>Dostępny przez całą dobę, np. przejścia podziemne, stacje metra, część parkingów podziemnych.</p></div>
    <div class="card"><h3>🟠 W określonych godzinach</h3><p>Otwarty w czasie pracy obiektu albo obecności obsługi — np. szkoła, urząd, galeria. Godzin nie ma w danych: sprawdź je wcześniej.</p></div>
    <div class="card"><h3>🔵 Na żądanie</h3><p>Zwykle zamknięty (piwnica bloku, garaż wspólnoty). W razie zagrożenia otwiera go zarządca albo mieszkańcy. Zapytaj zawczasu, kto ma klucz.</p></div>
  </div>
  <p>GROTA działa w <b>całej Polsce</b> i tylko w Polsce. Wykaz punktów jest w telefonie, więc wyszukiwanie najbliższego działa także bez internetu.</p>
"""),
        ("otwieranie", "1. Jak otworzyć GROTĘ", f"""
  <p><b>Przy alarmie:</b> na ekranie alarmu dotknij <kbd>POTWIERDZAM — wycisz syrenę</kbd>. Syrena milknie i pojawiają się trzy przyciski: <kbd>Gdzie się schronić</kbd>, <kbd>Obserwuj mapę</kbd> i <kbd>Jestem bezpieczny</kbd>. Strażnik nigdy sam nie przełącza ekranu — wybierasz Ty. <kbd>Gdzie się schronić</kbd> otwiera GROTĘ od razu na zakładce <b>TERAZ</b> i ustala Twoją pozycję. GROTA zaczyna się wczytywać już w chwili alarmu, więc otwiera się natychmiast.</p>
  <p><b>W każdej chwili:</b> dolna zakładka <kbd>Więcej</kbd> → <kbd>Schronienie — gdzie najbliżej</kbd>. Otwiera się wtedy zakładka <b>Mapa</b>.</p>
  <p><b>Powrót do Strażnika:</b> przycisk <kbd>‹ Strażnik</kbd> w lewym górnym rogu albo systemowy przycisk „wstecz”. „Wstecz” najpierw cofa krok w GROCIE (zamyka kartę punktu, panel), a dopiero potem wraca do Strażnika.</p>
  <p>Na dole GROTY jest pięć zakładek: <kbd>Mapa</kbd>, <kbd>Miejsca</kbd>, czerwona <kbd>TERAZ</kbd>, <kbd>Przygotuj</kbd> i <kbd>Zasady</kbd>.</p>
  {shots(fig("g01-wiecej", "Menu Więcej w Strażniku z pierwszą pozycją „Schronienie — gdzie najbliżej”", "<kbd>Więcej</kbd> → <kbd>Schronienie — gdzie najbliżej</kbd>."),
         fig("g02-alarm", "Ekran alarmu po potwierdzeniu: czerwony przycisk „Gdzie się schronić” oraz „Obserwuj mapę” i „Jestem bezpieczny”", "Ekran alarmu po <kbd>POTWIERDZAM</kbd>: trzy przyciski.", 631))}
  <div class="warn"><b>Przy pierwszym otwarciu</b> Android zapyta o zgodę na lokalizację. Wybierz „Podczas korzystania z aplikacji”. Jeśli odmówisz, GROTA działa dalej — wtedy sam wskazujesz, gdzie jesteś (zapisane miejsce, adres albo punkt na mapie). Najlepiej otwórz GROTĘ raz w spokoju, żeby przy alarmie nie odpowiadać na to pytanie w pośpiechu.</div>
"""),
        ("alarm", "2. Przy alarmie — zakładka TERAZ", f"""
  <p>TERAZ to ekran na chwilę zagrożenia. Po otwarciu ustala Twoją pozycję i od razu pokazuje wynik. Nic nie trzeba ustawiać.</p>
  <h3>Krok 1. Skąd szukam</h3>
  <p>Pod cytatem z „Poradnika bezpieczeństwa” widać <b>„Szukam od: GPS ±5 m”</b> — skąd GROTA liczy odległość. Jeśli pozycja jest zła albo GPS nie działa: <kbd>Pozycja z GPS</kbd> (spróbuj jeszcze raz), <kbd>Wpisz adres</kbd> albo <kbd>Jestem w: Dom</kbd> (Twoje zapisane miejsce). Niżej wybierasz, jak się poruszasz: <kbd>Pieszo</kbd>, <kbd>Rower</kbd> albo <kbd>Samochód</kbd>. <kbd>Zakończ</kbd> czyści pozycję i trasę.</p>
  <h3>Krok 2. Najbliższe miejsce i trasa</h3>
  <p>Duża karta <b>„Najbliższe sprawdzone miejsce schronienia”</b> podaje adres, odległość, czas dojścia i rodzaj dostępu. Na mapie jest trasa od „Tu jesteś” do „Cel”. <kbd>PROWADŹ ➜</kbd> otwiera nawigację Google Maps w telefonie. Pod spodem jest zdjęcie z góry (punkt w środku), <kbd>Street View</kbd> i <kbd>Pokaż na mapie</kbd>.</p>
  {shots(fig("g03-teraz", "Górna część ekranu TERAZ: mapa z trasą, cytat z poradnika, Szukam od GPS ±5 m, przyciski Pozycja z GPS, Wpisz adres, Pieszo, Rower, Samochód", "Pozycja, sposób poruszania się."),
         fig("g04-teraz-propozycja", "Karta najbliższego miejsca schronienia: ul. Złota 2, Lublin, 218 m, ok. 3 min trasą, W określonych godzinach, przycisk PROWADŹ i zdjęcie z góry", "Najbliższe miejsce i <kbd>PROWADŹ ➜</kbd>."),
         fig("g05-teraz-rodzaje", "Sekcja Prowadź do punktów: Całodobowo 1,1 km, W godzinach 168 m, Na żądanie 118 m oraz rodzaje budynków", "Wybór rodzaju punktów."),
         fig("g06-teraz-inne", "Inne opcje: ul. Jezuicka 6 i ul. Rynek 7 z przyciskami Prowadź, niżej karta Umówione miejsce", "Inne opcje i umówione miejsce."))}
  <h3>Krok 3. Gdy pierwsza propozycja nie pasuje</h3>
  <p>W <b>„Prowadź do punktów”</b> widać, jak daleko jest najbliższy punkt każdego rodzaju — np. „Całodobowo 1,1 km”, „Na żądanie 118 m”. Wyłącz rodzaj, który Ci nie pasuje (np. zamknięte „na żądanie” w nocy), a GROTA od razu wskaże najbliższy z pozostałych. Tak samo działają skróty rodzajów budynków (parkingi podziemne, bloki, szkoły) i <kbd>Rodzaj budynku: wszystkie</kbd>.</p>
  <p>Niżej, w <b>„Inne opcje”</b>, są kolejne punkty z numerami 2, 3… Dotknięcie punktu stawia go na pierwszym miejscu, z trasą. Przydaje się, gdy pierwszy jest za ruchliwą ulicą albo okazał się zamknięty.</p>
  <p>GROTA prowadzi tylko do punktów o <b>sprawdzonym położeniu</b>. Jeśli bliżej stoi punkt o wątpliwym położeniu (szpilka na trawniku, nie na budynku), GROTA pisze o nim pod propozycją, ale do niego nie prowadzi.</p>
  <h3>Czy zdążę? — alarm z czasem</h3>
  <p>Gdy Strażnik zna czas do zagrożenia (np. obiekt leci w stronę Twojego województwa), GROTA porównuje go z czasem dojścia. Jeśli według szacunku nie zdążysz, na górze pojawia się czerwona ramka <b>„Według szacunku nie zdążysz”</b>, a trasa na mapie jest czerwona. Wtedy stosuj się do zasad z poradnika z tej ramki: zostań w budynku, z dala od okien, przy ścianach nośnych, w najniższej kondygnacji.</p>
  {shots(fig("g07-teraz-alarm", "TERAZ w czasie alarmu: czerwona ramka Według szacunku nie zdążysz: dojście trasą ok. 3 min, zagrożenie za 2 min", "Czerwona ramka: nie zdążysz."),
         fig("g08-teraz-alarm-czas", "Karta Czas z alarmu Strażnika: zagrożenie za 2 min, lubelskie, i objaśnienie, że to szacunek", "„Czas z alarmu Strażnika”."))}
  <div class="tw"><table><thead><tr><th>Kolor trasy</th><th>Co znaczy</th></tr></thead><tbody>
    <tr><td>zielona</td><td>według szacunku zdążysz</td></tr>
    <tr><td>czerwona</td><td>według szacunku nie zdążysz</td></tr>
    <tr><td>fioletowa, turkusowa, niebieska</td><td>pieszo, rowerem, samochodem — bez porównania z czasem (nie ma alarmu albo Strażnik nie zna czasu)</td></tr>
    <tr><td>pomarańczowa</td><td>Twoja nagrana trasa (rozdział 5)</td></tr>
    <tr><td>przerywana prosta</td><td>sam kierunek, w linii prostej</td></tr>
  </tbody></table></div>
  <div class="warn"><b>To szacunek, nie wyrok.</b> Czas do zagrożenia to wyliczenie z zagrożeń widocznych w Strażniku. Alert RCB może dotyczyć czegoś, czego Strażnik nie widzi — wtedy realnie jest mniej czasu. Gdy przyszedł Alert RCB albo słychać syreny, nie licz minut: działaj według komunikatu. Gdy alarm w Strażniku opiera się tylko na źródłach pośrednich (np. media), GROTA nie ocenia „zdążysz / nie zdążysz” i nie ponagla.</div>
  <h3>Gdy GPS nie działa, jest niedokładny albo pokazuje zagranicę</h3>
  <ul>
    <li><b>Ustalanie pozycji trwa:</b> nie czekaj — dotknij <kbd>Jestem w: Dom</kbd>, wpisz adres albo <kbd>Wskaż na mapie</kbd>.</li>
    <li><b>Brak zgody na lokalizację:</b> GROTA podpowie, gdzie ją włączyć (Ustawienia → Aplikacje → Strażnik → Uprawnienia → Lokalizacja), a do tego czasu wybierzesz miejsce ręcznie.</li>
    <li><b>Pozycja bardzo przybliżona</b> (np. ±3 km): GROTA pyta, czy wybierzesz miejsce, czy pokazać wynik mimo to, i oznacza go jako przybliżony.</li>
    <li><b>Poza Polską:</b> GROTA zna tylko punkty w Polsce, więc zamiast trasy pisze „Jesteś poza zasięgiem danych Groty”. Jeśli jesteś w Polsce tuż przy granicy, a telefon pokazał drugą stronę rzeki, wybierz pozycję ręcznie.</li>
  </ul>
  {shots(fig("g21-teraz-jestem-w", "TERAZ podczas ustalania pozycji: Ustalam Twoją pozycję, Nie chcesz czekać? Wybierz, gdzie jesteś: Jestem w Dom, Praca, pole adresu i Wskaż na mapie", "Nie czekaj na GPS: <kbd>Jestem w: Dom</kbd>."),
         fig("g10-poza-zasiegiem", "Komunikat Jesteś poza zasięgiem danych Groty przy pozycji we Frankfurcie nad Odrą, z wyborem miejsca", "Poza Polską: komunikat zamiast trasy."))}
  <p><b>Gdy <kbd>PROWADŹ</kbd> nic nie robi</b> (brak Google Maps albo internetu): na karcie punktu dotknij <kbd>Narysuj trasę tutaj, na mapie Groty</kbd>. GROTA narysuje trasę orientacyjną z tego, co ma w telefonie — z pobraną mapą offline ulicami, bez niej w linii prostej.</p>
"""),
        ("umowione", "3. Umówione miejsce", f"""
  <p>Jeśli umówiliście się z bliskimi na konkretne miejsce spotkania, wpisz je w karcie <b>„Umówione miejsce”</b> na dole TERAZ: <kbd>Wskaż miejsce</kbd> → adres albo punkt na mapie. GROTA pokaże odległość i czas pieszo i samochodem, trasę (<kbd>Pokaż trasę</kbd>, <kbd>Prowadź</kbd>) i ostrzeże, gdy miejsce jest za daleko, by zdążyć. <kbd>Usuń</kbd> je kasuje.</p>
  {shots(fig("g09-umowione", "Karta Umówione miejsce: Dworzec Lublin, 1,4 km, pieszo ok. 22 min, samochodem ok. 4 min, ostrzeżenie To miejsce jest za daleko", "Umówione miejsce z ostrzeżeniem."))}
"""),
        ("mapa", "4. Zakładka Mapa", f"""
  <p>Mapa pokazuje wszystkie punkty w Polsce. <b>Kolor kropki</b> to dostęp (zielony — całodobowo, pomarańczowy — w godzinach, niebieski — na żądanie), a <b>obwódka</b> to pewność położenia (szara — sprawdzone, żółta — do sprawdzenia, czerwona — wątpliwe). Przyciski na mapie: <kbd>+</kbd>/<kbd>−</kbd> przybliżenie, księżyc/słońce przełącza mapę jasną i ciemną, celownik pokazuje Twoją pozycję.</p>
  <p><b>Dotknij kropki</b>, a pod mapą pojawi się karta punktu: adres, gmina, rodzaj budynku (z OpenStreetMap), dostęp z objaśnieniem, odległość i czas, pewność położenia, zdjęcie z góry, <kbd>Prowadź</kbd>, <kbd>Street View</kbd> i <kbd>Narysuj trasę tutaj, na mapie Groty</kbd>. Jeśli masz zapisane miejsca, zobaczysz też <b>„Zapisz jako schronienie dla:”</b> z przyciskami Twoich miejsc.</p>
  {shots(fig("g11-mapa", "Zakładka Mapa: kropki punktów schronienia na Starym Mieście w Lublinie, karta Czemu nie ma tu schronów? i Filtry i widok", "Mapa z punktami."),
         fig("g12-mapa-punkt", "Karta wybranego punktu: ul. Złota 2, Lublin, W określonych godzinach, 168 m od Ciebie, położenie sprawdzone, zdjęcie z góry", "Karta punktu ze zdjęciem z góry."),
         fig("g15-mapa-ciemna", "Ta sama mapa w trybie ciemnym", "Mapa ciemna (księżyc/słońce)."))}
  <h3>Filtry i widok</h3>
  <p><kbd>Filtry i widok</kbd> pod mapą pozwala pokazać tylko wybrane punkty: według dostępu (<kbd>Całodobowo</kbd>, <kbd>W godzinach</kbd>, <kbd>Na żądanie</kbd>), pewności położenia (<kbd>Sprawdzone</kbd>, <kbd>Do sprawdzenia</kbd>, <kbd>Wątpliwe</kbd>) i <b>rodzaju budynku</b> (11 grup, np. parkingi podziemne, bloki, szkoły, szpitale). Każdy przycisk włącza albo wyłącza swoją grupę; <kbd>Pokaż wszystkie</kbd> zaznacza wszystko, a naciśnięte ponownie — odznacza. Tu też wybierasz <kbd>Pieszo</kbd>, <kbd>Rower</kbd> albo <kbd>Samochód</kbd>.</p>
  {shots(fig("g13-mapa-filtry", "Filtry: Całodobowo 19 617, W godzinach 7011, Na żądanie 59 209, Sprawdzone 83 665, Do sprawdzenia 888, Wątpliwe 1284", "Filtry dostępu i pewności."),
         fig("g14-mapa-rodzaje", "Rodzaj budynku wg OpenStreetMap: parkingi podziemne, centra handlowe, dworce, bloki, domy, szkoły, szpitale, urzędy, biura, kultura, rodzaj nieznany", "Rodzaj budynku."))}
  <div class="note">Filtr mapy dotyczy <b>tylko mapy</b>. TERAZ zawsze szuka wśród wszystkich sprawdzonych punktów, chyba że sam zawęzisz wybór w „Prowadź do punktów”.</div>
  <p><b>Czemu nie ma tu „schronów”?</b> Przy pierwszym wejściu GROTA wyjaśnia, że publiczne dane PSP nie rozróżniają schronu, ukrycia i miejsca doraźnego schronienia, a pełna ewidencja z mocy ustawy nie jest jawna. <kbd>Wyjaśnienie i źródła</kbd> prowadzi do Zasad.</p>
"""),
        ("miejsca", "5. Zakładka Miejsca — przygotuj się zawczasu", f"""
  <p>Tu zapisujesz swoje stałe miejsca — dom, pracę, szkołę dziecka, rodzinę — i <b>z góry wybierasz dla nich schronienia</b>. Przy alarmie wystarczy dotknąć <kbd>Jestem w: Dom</kbd>, a wynik jest od razu, nawet bez GPS. Miejsca zapisują się tylko w tym telefonie.</p>
  <h3>Dodawanie miejsca</h3>
  <ol>
    <li>W <b>„Dodaj miejsce”</b> wybierz rodzaj: <kbd>Dom</kbd>, <kbd>Praca</kbd>, <kbd>Szkoła / uczelnia</kbd>, <kbd>Przedszkole / żłobek</kbd>, <kbd>Rodzina / bliscy</kbd>, <kbd>Działka / domek</kbd> albo <kbd>Inne</kbd>.</li>
    <li>Wpisz nazwę i adres, potem <kbd>Szukaj</kbd> — albo <kbd>Moja pozycja</kbd> / <kbd>Wskaż na mapie</kbd>.</li>
    <li>Dotknij kafla miejsca i w <b>„Wybierz miejsca schronienia”</b> zaznacz do trzech punktów z listy najbliższych.</li>
  </ol>
  {shots(fig("g16-miejsca", "Lista Moje stałe miejsca: Dom — schronienia 2/3, nagrane trasy 1, Pieszo; Praca — schronienia 0/3", "Lista miejsc."),
         fig("g20-dodaj-miejsce", "Nowe miejsce: Szkoła / uczelnia, pola Nazwa i Adres miejsca, przyciski Szukaj, Moja pozycja, Wskaż na mapie", "Dodawanie miejsca."),
         fig("g19-miejsce-wybor", "Wybierz miejsca schronienia: filtr Pokaż punkty i lista najbliższych punktów z polem wyboru", "Wybór do trzech schronień."))}
  <h3>Szczegóły, notatki i edycja</h3>
  <p>W szczegółach miejsca widać położenie, <b>„Moje miejsce w budynku”</b> (np. „korytarz na parterze, bez okien” — gdzie się schować, gdy nie zdążysz wyjść) i wybrane schronienia. Przy każdym schronieniu jest pole <b>„Jak wejść — godziny, kto otwiera, kontakt do zarządcy (Twoja notatka)”</b>. Warto je wypełnić po rozmowie z zarządcą. Ołówek otwiera edycję: nazwa, położenie, rodzaj, miejsce w budynku z polem „Sprawdziłem to miejsce na miejscu”, skrócona lista kontrolna i środek transportu. Zmiany zapisują się same („✓ Zapisano”). Kosz usuwa miejsce, a uchwyt ⋮⋮ zmienia kolejność.</p>
  {shots(fig("g17-miejsce-szczegoly", "Szczegóły miejsca Dom: położenie Lublin, ul. Królewska 4, moje miejsce w budynku korytarz na parterze bez okien, sprawdzone, środek transportu Pieszo", "Szczegóły miejsca."),
         fig("g18-miejsce-schronienia", "Moje miejsca schronienia 2/3: ul. Złota 2 z notatką Czynne 8–20, klucz u portiera i nagraną trasą 240 m, 3 min 25 s", "Schronienie z notatką i nagraną trasą."))}
  <h3>Nagraj swoją trasę</h3>
  <p>Przy każdym schronieniu możesz <b>nagrać trasę, przechodząc ją raz na spokojnie</b>: <kbd>Nagraj swoją trasę</kbd>, potem idź, a na koniec <kbd>Zakończ i zapisz</kbd>. W czasie nagrywania ekran musi być włączony. Przy alarmie, gdy jesteś do 300 m od tego miejsca, GROTA pokaże Twoją pomarańczową trasę zamiast wyliczonej — z przejściami i skrótami, których nie ma na mapie.</p>
  <div class="note">Gdy zmienisz adres miejsca o więcej niż 3 km (przeprowadzka), GROTA zapyta, czy usunąć schronienia z dawnej okolicy. Adres bez dokładnego numeru daje położenie przybliżone — kafel pokaże wtedy „(przybliżone — popraw w „Edytuj”)”.</div>
"""),
        ("przygotuj", "6. Zakładka Przygotuj", f"""
  <h3 id="offline">Mapa offline — na wypadek braku internetu</h3>
  <p>Przy alarmie sieć bywa przeciążona. <b>Punkty schronienia i odległości działają zawsze</b>, bo wykaz jest w telefonie. Żeby widzieć ulice i mieć trasę bez internetu, pobierz mapę zawczasu:</p>
  <ol>
    <li>Wybierz obszar: <kbd>Wokół miejsca</kbd> (25, 50 albo 75 km wokół Twojej pozycji lub zapisanego miejsca), <kbd>Województwo</kbd> albo <kbd>Cała Polska</kbd> (ok. 2 GB — tylko przez wifi).</li>
    <li>Wybierz, co pobrać: <kbd>Mapa i trasy</kbd> (zalecane; tylko z tym wariantem GROTA poprowadzi bez internetu także na wsi) albo <kbd>Sama mapa</kbd> (mniejsza, bez internetu zamiast trasy zostaje linia prosta).</li>
    <li>Dotknij <kbd>Pobierz mapę</kbd>. GROTA pokazuje wcześniej, ile pobierze i ile zajmie w telefonie. Nie zamykaj aplikacji w trakcie; przerwane pobieranie dobiera potem tylko resztę.</li>
    <li><kbd>Sprawdź bez internetu</kbd> udaje brak sieci, żebyś zobaczył, co będzie działać. <kbd>Zakończ test</kbd> wraca do normalnej pracy.</li>
  </ol>
  {shots(fig("g22-przygotuj-offline", "Karta Mapa offline: wyjaśnienie, że mapa pobrana wcześniej działa bez internetu i zwalnia łącze dla innych", "Mapa offline — po co."),
         fig("g23-offline-gotowe", "Mapa offline ✓: pobrane województwo małopolskie 189 MB, wybór Wokół miejsca, Województwo, Cała Polska, Mapa i trasy, Sama mapa", "Wybór obszaru i gotowa mapa."),
         fig("g24-offline-test", "Test bez internetu: baner Test bez internetu · mapa z pamięci telefonu i przycisk Zakończ test", "<kbd>Sprawdź bez internetu</kbd>."))}
  <p>Rozmiary: województwo od kilkudziesięciu do kilkuset MB (dokładną liczbę pokazuje lista), cała Polska ok. 2 GB. Pobraną mapę usuwasz przyciskiem <kbd>Usuń</kbd> w tej samej karcie. Mapa offline to też <b>miejsce dla innych</b>: każdy, kto ma ją w telefonie, nie obciąża serwera w czasie alarmu.</p>
  <h3>Listy przygotowań</h3>
  <p>Niżej jest <b>7 list kontrolnych</b> cytowanych z „Poradnika bezpieczeństwa”: <b>Dom lub mieszkanie</b>, <b>Zapasy domowe na minimum 3 dni</b>, <b>Plecak ewakuacyjny</b>, <b>Plan na kryzys</b>, <b>Praca</b>, <b>Szkoła</b> i <b>Osoby potrzebujące szczególnej pomocy</b> — razem 36 pozycji. <kbd>Otwórz</kbd> rozwija listę, zaznaczasz, co już masz. Ramka listy jest czerwona, gdy zrobiono mniej niż 40%, żółta w trakcie i zielona przy komplecie. Postęp zostaje tylko w telefonie.</p>
  {shots(fig("g25-przygotuj-listy", "Listy przygotowań: Zrobione 11 z 36, Dom lub mieszkanie 1/8, Zapasy domowe na minimum 3 dni 5/8", "Listy z licznikami."),
         fig("g26-lista-otwarta", "Otwarta lista Zapasy domowe na minimum 3 dni z zaznaczonymi pozycjami: jedzenie i picie, apteczka, środki czystości, oświetlenie i łączność", "Rozwinięta lista."))}
"""),
        ("zasady", "7. Zakładka Zasady", f"""
  <p>GROTA nie tworzy własnych procedur. Każde zalecenie w zakładce <kbd>Zasady</kbd> to cytat z „Poradnika bezpieczeństwa” (Rząd RP, 1/2025) z numerem strony: co robić po usłyszeniu sygnału alarmowego, atak z powietrza, schronienia (co robić, gdy nie zdążysz), ewakuacja, przygotowanie otoczenia i plan na kryzys. Dalej są wyjaśnienia: czego poradnik nie określa, dlaczego w GROCIE nie ma „schronów”, jakie są ograniczenia danych, skąd biorą się przesunięte punkty i źródła. <kbd>Zamknij</kbd> wraca do poprzedniej zakładki.</p>
  {shots(fig("g27-zasady", "Zakładka Zasady Groty: cytaty z Poradnika bezpieczeństwa w sekcjach Sygnały alarmowe i Atak z powietrza", "Zasady z poradnika."))}
"""),
        ("bez-internetu", "8. Co działa bez internetu", """
  <div class="tw"><table><thead><tr><th>Funkcja</th><th>Bez internetu</th></tr></thead><tbody>
    <tr><td>Punkty schronienia, najbliższy punkt, odległość</td><td>działa zawsze</td></tr>
    <tr><td>Moje miejsca, notatki, nagrane trasy, listy przygotowań</td><td>działa zawsze</td></tr>
    <tr><td>Mapa z ulicami</td><td>tylko po pobraniu mapy offline</td></tr>
    <tr><td>Trasa po drogach</td><td>tylko po pobraniu wariantu <kbd>Mapa i trasy</kbd>; inaczej linia prosta</td></tr>
    <tr><td>Wyszukiwanie adresu</td><td>zna tylko miejscowości (pozycja to środek miejscowości)</td></tr>
    <tr><td><kbd>PROWADŹ</kbd> (Google Maps), <kbd>Street View</kbd>, zdjęcie z góry</td><td>nie działa</td></tr>
  </tbody></table></div>
"""),
        ("pytania", "9. Pytania i problemy", """
  <h3>Czy to są schrony?</h3>
  <p>Nie wiadomo. Publiczny wykaz PSP nie odróżnia schronu, ukrycia i miejsca doraźnego schronienia, a pełna ewidencja nie jest jawna.</p>
  <h3>Czy punkt będzie otwarty?</h3>
  <p>GROTA tego nie wie. Punkty „na żądanie” są zwykle zamknięte, a „w godzinach” — otwarte tylko w czasie pracy obiektu. Zapytaj zarządcę budynku zawczasu i zapisz odpowiedź w notatce „Jak wejść” przy swoim miejscu.</p>
  <h3>Dlaczego GROTA prowadzi do dalszego punktu, a nie do najbliższej kropki?</h3>
  <p>Bliższa kropka ma wątpliwe położenie (szpilka obok budynku) albo nie pasuje do wybranego rodzaju. GROTA pisze o tym pod propozycją.</p>
  <h3>Szpilka stoi na trawniku albo na parkingu.</h3>
  <p>To błąd w danych źródłowych PSP, nie w GROCIE. Szukaj budynku obok. Błąd możesz zgłosić gminie albo komendzie PSP — poprawka u źródła naprawia go we wszystkich aplikacjach.</p>
  <h3><kbd>PROWADŹ</kbd> nic nie robi.</h3>
  <p>Brak Google Maps albo internetu. Użyj <kbd>Narysuj trasę tutaj, na mapie Groty</kbd> na karcie punktu.</p>
  <h3>Nie widać zdjęcia z góry.</h3>
  <p>W wersji 1.7.68 zdjęcie z góry się nie wyświetla: GUGiK zmienił adres usługi. Poprawka będzie w najbliższej aktualizacji, także dla starszych telefonów z Androidem. Na zrzutach w tej instrukcji widać, jak karta wygląda po poprawce.</p>
  <h3>Skąd GROTA wie, ile mam czasu? Dlaczego czasem nie ma „zdążysz / nie zdążysz”?</h3>
  <p>Z alarmu Strażnika — z zagrożeń, które Strażnik widzi. Gdy alarm opiera się tylko na źródłach pośrednich albo Strażnik nie zna czasu, GROTA nie ocenia i nie ponagla. Alert RCB może dotyczyć czegoś, czego Strażnik nie widzi, więc przy alercie RCB albo syrenach nie licz minut.</p>
  <h3>Jestem za granicą albo przy granicy.</h3>
  <p>GROTA zna tylko Polskę. Przy granicy, gdy telefon pokazał drugą stronę rzeki, wybierz pozycję ręcznie.</p>
  <h3>Zmieniłem adres domu i zniknęły schronienia.</h3>
  <p>To celowe: po zmianie adresu o więcej niż 3 km GROTA pyta, czy usunąć schronienia z dawnej okolicy.</p>
  <h3>Mam nowy telefon — gdzie moje miejsca?</h3>
  <p>Miejsca, notatki i trasy są tylko w telefonie, na którym je zapisałeś. Na nowym trzeba je dodać ponownie.</p>
  <h3>Jak usunąć wszystko?</h3>
  <p>Mapę offline usuwasz w <kbd>Przygotuj</kbd> → <kbd>Usuń</kbd>, miejsca — koszem w <kbd>Miejsca</kbd>, umówione miejsce — <kbd>Usuń</kbd>. Całość: Ustawienia Androida → Aplikacje → Strażnik → Pamięć → Wyczyść dane (to czyści też ustawienia Strażnika, np. województwo do alarmów).</p>
  <h3>Kiedy GROTA będzie na iPhonie i w innych językach?</h3>
  <p>Wersje angielska i ukraińska są w przygotowaniu, iPhone — w kolejnym wydaniu. Na stronie WWW GROTY nie będzie: wykaz punktów to kilkanaście MB danych, które mają sens w telefonie.</p>
"""),
        ("prywatnosc", "10. Prywatność i źródła", """
  <p>GROTA nie ma konta, reklam ani analityki. Wykaz punktów i wyszukiwanie najbliższego działają <b>w telefonie</b>. Miejsca, notatki, nagrane trasy, listy i mapa offline zostają tylko w telefonie. Poza telefon trafia tylko to, co potrzebne do konkretnej funkcji:</p>
  <ul>
    <li><b>trasa na mapie</b> — pozycja i wybrany punkt idą do publicznego serwera tras FOSSGIS (OSRM, dane OpenStreetMap);</li>
    <li><b>wyszukiwanie adresu</b> — wpisany adres idzie do usługi GUGiK, po naciśnięciu „Szukaj”;</li>
    <li><b>zdjęcie z góry</b> — fragment ortofotomapy z Geoportalu (GUGiK) dla oglądanego punktu;</li>
    <li><b>podkład mapy</b> — kafelki OpenFreeMap dla oglądanego obszaru (z mapą offline nic nie wychodzi);</li>
    <li><b>paczki mapy offline</b> — pobierane z serwera Strażnika;</li>
    <li><b>Google Maps i Street View</b> — tylko po dotknięciu przycisku.</li>
  </ul>
  <p>Szczegóły: <a href="prywatnosc.html#lokalizacja">polityka prywatności</a>.</p>
  <p class="source-links">Dane: Komenda Główna PSP, „Punkty schronienia w Polsce”, <a href="https://dane.gov.pl/pl/dataset/28058">dane.gov.pl</a>, CC BY 4.0 · rodzaje budynków: © OpenStreetMap (ODbL) · zasady i listy: „Poradnik bezpieczeństwa”, Rząd RP, <a href="https://www.gov.pl/web/poradnikbezpieczenstwa/">gov.pl</a>, CC BY-SA 4.0 · mapa: <a href="https://openfreemap.org">OpenFreeMap</a>, © OpenStreetMap · trasy: FOSSGIS (OSRM) · adresy i ortofotomapa: GUGiK.</p>
"""),
    ],
    stopka="""
  <p><b>STRAŻNIK · GROTA</b> — nieoficjalne źródło dodatkowe. Nie zastępuje syren, Alertów RCB ani komunikatów służb.</p>
  <p><a href="index.html">Instrukcja Strażnika</a> · <a href="iphone.html">Instrukcja dla iPhone'a</a> · <a href="zmiany.html">Historia zmian</a> · <a href="prywatnosc.html">Polityka prywatności</a> · <a href="grota-en.html" lang="en">GROTA guide in English</a></p>
""",
)


# ─────────────────────────────── EN ───────────────────────────────
EN = dict(
    lang="en", plik="grota-en.html", glowna="en.html",
    title="GROTA — where to shelter · user guide",
    desc="The full guide to GROTA in Strażnik: the nearest shelter points during an alert, routes, your places, the offline map and preparation checklists. Screenshots of every feature.",
    og="GROTA — where to shelter · user guide",
    skip="Skip to content", navlabel="GROTA guide navigation", jezyk="Guide language",
    jezyki='<a href="grota.html" lang="pl" hreflang="pl">PL</a><a href="grota-en.html" lang="en" aria-current="page">EN</a>',
    gora="↑ Back to top",
    nav=[("start", "Start"), ("alarm", "During an alert"), ("mapa", "Map"), ("miejsca", "Places"),
         ("przygotuj", "Prepare"), ("offline", "Offline"), ("pytania", "FAQ")],
    hero=f"""
  <div><div class="eyebrow">GROTA guide · Strażnik {WERSJA} for Android</div>
    <h1>GROTA — where to shelter</h1>
    <p class="lead">GROTA is part of the Strażnik app. During an alert it shows the <b>nearest shelter points</b> from the public list of Poland's State Fire Service (PSP) and guides you there. In advance, it helps you save shelters near your home, work and school, download a map for when there is no internet, and prepare following the government's “Safety Guide”.</p>
    <div class="actions"><a class="button primary" href="{APK}">↓ Get Strażnik for Android</a><a class="button" href="en.html">Strażnik user guide</a></div>
    <p class="fineprint"><b>GROTA's screens are in Polish only for now</b> — English and Ukrainian versions are on the way. This guide gives every Polish label in the form <kbd>Polish</kbd> (English), so you can find the right button without speaking Polish. Screenshots: 22 September 2026, Strażnik {WERSJA}, position in Lublin's Old Town; addresses come from the public PSP list. GROTA is Android only for now; iPhone will follow. Tap a screenshot to open it full size.</p>
  </div>
  <a class="shot-link" href="screens/grota/g04-teraz-propozycja.jpg"><img src="screens/grota/g04-teraz-propozycja.jpg" width="720" height="1560" alt="GROTA's TERAZ (now) screen: a map of Lublin's Old Town with a route from “Tu jesteś” (you are here) to the destination, and below it the card for the nearest checked shelter — ul. Złota 2, Lublin, 218 m, about 3 min — with a big green PROWADŹ (navigate) button"></a>
""",
    sekcje=[
        ("start", "The essentials in 30 seconds", """
  <div class="note"><ol>
    <li><b>During an alert:</b> tap <kbd>POTWIERDZAM — wycisz syrenę</kbd> (acknowledge — silence siren; in English mode <kbd>ACKNOWLEDGE — silence siren</kbd>), then <kbd>Gdzie się schronić</kbd> (where to shelter). GROTA shows the nearest place and the route at once. Tap <kbd>PROWADŹ ➜</kbd> (navigate).</li>
    <li><b>In advance, calmly:</b> in the <kbd>Miejsca</kbd> (places) tab add your home, work or your child's school, and pick up to three shelters for each. Ask the building manager whether and when they are open.</li>
    <li><b>For when there is no internet:</b> in the <kbd>Przygotuj</kbd> (prepare) tab download the map of your province (<kbd>Mapa i trasy</kbd> — map and routes).</li>
    <li><b>Remember:</b> GROTA is a list of places, not a promise they will be open. When you hear sirens or get an RCB alert, follow the official message.</li>
  </ol></div>
  <h3>What the points in GROTA are</h3>
  <p>They are <b>85,837 shelter points</b> from the public list of Poland's State Fire Service (“Punkty schronienia w Polsce”, dane.gov.pl). The list does not say whether a point is a bunker, a shelter or a makeshift refuge, or how many people fit — the full register is not public. It does say <b>when a point is accessible</b>, shown by the dot colour:</p>
  <div class="cards">
    <div class="card"><h3>🟢 Całodobowo (24/7)</h3><p>Accessible around the clock, e.g. underpasses, metro stations, some underground car parks.</p></div>
    <div class="card"><h3>🟠 W określonych godzinach (set hours)</h3><p>Open while the building is in use or staffed — a school, an office, a shopping centre. The hours are not in the data: check them in advance.</p></div>
    <div class="card"><h3>🔵 Na żądanie (on request)</h3><p>Usually locked (a block's basement, a shared garage). In an emergency the manager or residents open it. Ask in advance who has the key.</p></div>
  </div>
  <p>GROTA covers <b>all of Poland</b> and only Poland. The list of points is on the phone, so finding the nearest one works offline too.</p>
"""),
        ("otwieranie", "1. How to open GROTA", f"""
  <p><b>During an alert:</b> on the alert screen tap <kbd>POTWIERDZAM — wycisz syrenę</kbd> (acknowledge). The siren stops and three buttons appear: <kbd>Gdzie się schronić</kbd> (where to shelter), <kbd>Obserwuj mapę</kbd> (watch the map) and <kbd>Jestem bezpieczny</kbd> (I am safe). Strażnik never switches the screen on its own — you choose. <kbd>Gdzie się schronić</kbd> opens GROTA straight on the <b>TERAZ</b> (now) tab and finds your position. GROTA starts loading as soon as the alert appears, so it opens at once.</p>
  <p><b>At any time:</b> the bottom tab <kbd>Więcej</kbd> (more) → <kbd>Schronienie — gdzie najbliżej</kbd> (shelter — nearest; in English mode “Shelter — nearest (in Polish)”). This opens the <b>Mapa</b> (map) tab.</p>
  <p><b>Back to Strażnik:</b> the <kbd>‹ Strażnik</kbd> button top left, or the system “back” button. “Back” first undoes a step inside GROTA (closes a point card or panel), and only then returns to Strażnik.</p>
  <p>At the bottom GROTA has five tabs: <kbd>Mapa</kbd> (map), <kbd>Miejsca</kbd> (places), the red <kbd>TERAZ</kbd> (now), <kbd>Przygotuj</kbd> (prepare) and <kbd>Zasady</kbd> (rules).</p>
  {shots(fig("g01-wiecej", "The Więcej (more) menu in Strażnik with “Schronienie — gdzie najbliżej” (shelter — nearest) at the top", "<kbd>Więcej</kbd> → <kbd>Schronienie — gdzie najbliżej</kbd>."),
         fig("g02-alarm", "The alert screen after acknowledging: the red “Gdzie się schronić” (where to shelter) button plus “Obserwuj mapę” and “Jestem bezpieczny”", "The alert screen after acknowledging: three buttons.", 631))}
  <div class="warn"><b>The first time</b> Android asks for location access. Choose “While using the app”. If you refuse, GROTA still works — you then say where you are yourself (a saved place, an address or a point on the map). Open GROTA once when things are calm, so you don't face this question in a hurry during an alert.</div>
"""),
        ("alarm", "2. During an alert — the TERAZ (now) tab", f"""
  <p>TERAZ is the screen for the moment of danger. When opened it finds your position and shows the result straight away. There is nothing to set up.</p>
  <h3>Step 1. Where I am searching from</h3>
  <p>Under the quote from the Safety Guide you see <b>“Szukam od: GPS ±5 m”</b> (searching from: GPS ±5 m) — where GROTA measures from. If the position is wrong or GPS fails: <kbd>Pozycja z GPS</kbd> (GPS position — try again), <kbd>Wpisz adres</kbd> (type an address) or <kbd>Jestem w: Dom</kbd> (I am at: home — your saved place). Below, choose how you move: <kbd>Pieszo</kbd> (on foot), <kbd>Rower</kbd> (bike) or <kbd>Samochód</kbd> (car). <kbd>Zakończ</kbd> (finish) clears the position and route.</p>
  <h3>Step 2. The nearest place and the route</h3>
  <p>The big card <b>“Najbliższe sprawdzone miejsce schronienia”</b> (nearest checked shelter) gives the address, distance, time and type of access. The map shows the route from “Tu jesteś” (you are here) to “Cel” (destination). <kbd>PROWADŹ ➜</kbd> (navigate) opens Google Maps navigation. Below there is an aerial photo (the point in the middle), <kbd>Street View</kbd> and <kbd>Pokaż na mapie</kbd> (show on map).</p>
  {shots(fig("g03-teraz", "Top of the TERAZ screen: map with route, Safety Guide quote, Szukam od GPS ±5 m, buttons Pozycja z GPS, Wpisz adres, Pieszo, Rower, Samochód", "Position, how you move."),
         fig("g04-teraz-propozycja", "Card of the nearest shelter: ul. Złota 2, Lublin, 218 m, about 3 min, W określonych godzinach (set hours), PROWADŹ button and aerial photo", "The nearest place and <kbd>PROWADŹ ➜</kbd>."),
         fig("g05-teraz-rodzaje", "Prowadź do punktów (guide me to points): Całodobowo 1.1 km, W godzinach 168 m, Na żądanie 118 m, and building types", "Choosing the type of point."),
         fig("g06-teraz-inne", "Inne opcje (other options): ul. Jezuicka 6 and ul. Rynek 7 with Prowadź buttons; below, the Umówione miejsce (meeting place) card", "Other options and the meeting place."))}
  <h3>Step 3. When the first suggestion does not fit</h3>
  <p><b>“Prowadź do punktów”</b> (guide me to points) shows how far the nearest point of each type is — e.g. “Całodobowo 1,1 km”, “Na żądanie 118 m”. Switch off a type that does not suit you (e.g. locked “on request” points at night) and GROTA immediately picks the nearest of the rest. The building-type shortcuts (underground car parks, blocks of flats, schools) and <kbd>Rodzaj budynku: wszystkie</kbd> (building type: all) work the same way.</p>
  <p>Further down, <b>“Inne opcje”</b> (other options) lists the next points, numbered 2, 3… Tapping one moves it to first place, with a route. Useful when the first one is across a busy road or turned out to be locked.</p>
  <p>GROTA only guides you to points with a <b>checked location</b>. If a point with a doubtful location (a pin on a lawn, not on a building) is closer, GROTA mentions it under the suggestion but does not guide you there.</p>
  <h3>Will I make it? — an alert with a time</h3>
  <p>When Strażnik knows the time until the threat (e.g. an object heading for your province), GROTA compares it with the time to get there. If by the estimate you will not make it, a red box <b>“Według szacunku nie zdążysz”</b> (by the estimate you won't make it) appears at the top and the route turns red. Then follow the Safety Guide advice in that box: stay in the building, away from windows, by load-bearing walls, on the lowest floor.</p>
  {shots(fig("g07-teraz-alarm", "TERAZ during an alert: red box Według szacunku nie zdążysz — about 3 min to walk, threat in 2 min", "Red box: you won't make it."),
         fig("g08-teraz-alarm-czas", "Card Czas z alarmu Strażnika (time from Strażnik's alert): threat in 2 min, Lublin province, with a note that it is an estimate", "“Czas z alarmu Strażnika”."))}
  <div class="tw"><table><thead><tr><th>Route colour</th><th>Meaning</th></tr></thead><tbody>
    <tr><td>green</td><td>by the estimate you will make it</td></tr>
    <tr><td>red</td><td>by the estimate you won't make it</td></tr>
    <tr><td>purple, teal, blue</td><td>on foot, by bike, by car — no time comparison (no alert, or Strażnik does not know the time)</td></tr>
    <tr><td>orange</td><td>your recorded route (section 5)</td></tr>
    <tr><td>dashed straight line</td><td>direction only, as the crow flies</td></tr>
  </tbody></table></div>
  <div class="warn"><b>It is an estimate, not a verdict.</b> The time to the threat is calculated from the threats Strażnik can see. An RCB alert may concern something Strażnik cannot see — then there is really less time. When an RCB alert arrives or sirens sound, don't count minutes: act on the message. When Strażnik's alert rests only on indirect sources (e.g. the media), GROTA does not judge “make it / won't make it” and does not urge you.</div>
  <h3>When GPS fails, is inaccurate or shows another country</h3>
  <ul>
    <li><b>Finding the position takes a while:</b> don't wait — tap <kbd>Jestem w: Dom</kbd> (I am at: home), type an address or <kbd>Wskaż na mapie</kbd> (point on the map).</li>
    <li><b>No location permission:</b> GROTA tells you where to turn it on (Settings → Apps → Strażnik → Permissions → Location); meanwhile you pick the place by hand.</li>
    <li><b>A very approximate position</b> (e.g. ±3 km): GROTA asks whether you want to pick a place or see the result anyway, and marks it as approximate.</li>
    <li><b>Outside Poland:</b> GROTA only knows points in Poland, so instead of a route it says “Jesteś poza zasięgiem danych Groty” (you are outside GROTA's data range). If you are in Poland right by the border and the phone put you on the other side of the river, set your position by hand.</li>
  </ul>
  {shots(fig("g21-teraz-jestem-w", "TERAZ while finding the position: Ustalam Twoją pozycję (finding your position), Nie chcesz czekać? (don't want to wait?), Jestem w Dom, Praca, address field and Wskaż na mapie", "Don't wait for GPS: <kbd>Jestem w: Dom</kbd>."),
         fig("g10-poza-zasiegiem", "Message Jesteś poza zasięgiem danych Groty for a position in Frankfurt (Oder), with a choice of place", "Outside Poland: a message instead of a route."))}
  <p><b>When <kbd>PROWADŹ</kbd> does nothing</b> (no Google Maps or no internet): on the point card tap <kbd>Narysuj trasę tutaj, na mapie Groty</kbd> (draw the route here, on GROTA's map). GROTA draws an approximate route from what the phone has — along streets with an offline map, otherwise in a straight line.</p>
"""),
        ("umowione", "3. Meeting place", f"""
  <p>If you have agreed a meeting place with your family, enter it in the <b>“Umówione miejsce”</b> (meeting place) card at the bottom of TERAZ: <kbd>Wskaż miejsce</kbd> (set the place) → an address or a point on the map. GROTA shows the distance and time on foot and by car, the route (<kbd>Pokaż trasę</kbd> — show route, <kbd>Prowadź</kbd> — navigate), and warns you when it is too far to make it in time. <kbd>Usuń</kbd> (remove) deletes it.</p>
  {shots(fig("g09-umowione", "Umówione miejsce card: Dworzec Lublin (Lublin station), 1.4 km, about 22 min on foot, about 4 min by car, warning To miejsce jest za daleko (this place is too far)", "Meeting place with a warning."))}
"""),
        ("mapa", "4. The Mapa (map) tab", f"""
  <p>The map shows every point in Poland. The <b>dot colour</b> is access (green — 24/7, orange — set hours, blue — on request) and the <b>outline</b> is how sure the location is (grey — checked, yellow — to be checked, red — doubtful). Map buttons: <kbd>+</kbd>/<kbd>−</kbd> zoom, moon/sun switches the light and dark map, the crosshair shows your position.</p>
  <p><b>Tap a dot</b> and the point card appears under the map: address, municipality, building type (from OpenStreetMap), access with an explanation, distance and time, location certainty, an aerial photo, <kbd>Prowadź</kbd> (navigate), <kbd>Street View</kbd> and <kbd>Narysuj trasę tutaj, na mapie Groty</kbd> (draw the route on GROTA's map). If you have saved places, you also see <b>“Zapisz jako schronienie dla:”</b> (save as a shelter for:) with buttons for your places.</p>
  {shots(fig("g11-mapa", "The Mapa tab: shelter dots in Lublin's Old Town, the card Czemu nie ma tu schronów? (why are there no bunkers here?) and Filtry i widok (filters and view)", "The map with points."),
         fig("g12-mapa-punkt", "Selected point card: ul. Złota 2, Lublin, W określonych godzinach (set hours), 168 m from you, location checked, aerial photo", "Point card with an aerial photo."),
         fig("g15-mapa-ciemna", "The same map in dark mode", "Dark map (moon/sun)."))}
  <h3>Filtry i widok (filters and view)</h3>
  <p><kbd>Filtry i widok</kbd> under the map shows only selected points: by access (<kbd>Całodobowo</kbd> 24/7, <kbd>W godzinach</kbd> set hours, <kbd>Na żądanie</kbd> on request), by location certainty (<kbd>Sprawdzone</kbd> checked, <kbd>Do sprawdzenia</kbd> to be checked, <kbd>Wątpliwe</kbd> doubtful) and by <b>building type</b> (11 groups, e.g. underground car parks, blocks of flats, schools, hospitals). Each button toggles its group; <kbd>Pokaż wszystkie</kbd> (show all) selects everything, and pressed again — clears it. Here you also choose <kbd>Pieszo</kbd>, <kbd>Rower</kbd> or <kbd>Samochód</kbd>.</p>
  {shots(fig("g13-mapa-filtry", "Filters: Całodobowo 19,617, W godzinach 7,011, Na żądanie 59,209, Sprawdzone 83,665, Do sprawdzenia 888, Wątpliwe 1,284", "Access and certainty filters."),
         fig("g14-mapa-rodzaje", "Building type from OpenStreetMap: underground car parks, shopping centres, stations, blocks of flats, houses, schools, hospitals, offices, businesses, culture, unknown", "Building type."))}
  <div class="note">The map filter affects <b>only the map</b>. TERAZ always searches among all checked points, unless you narrow the choice in “Prowadź do punktów”.</div>
  <p><b>Why are there no “bunkers” here?</b> On the first visit GROTA explains that the public PSP data does not distinguish a bunker, a shelter and a makeshift refuge, and the full register is not public by law. <kbd>Wyjaśnienie i źródła</kbd> (explanation and sources) leads to the Rules.</p>
"""),
        ("miejsca", "5. The Miejsca (places) tab — prepare in advance", f"""
  <p>Here you save your regular places — home, work, your child's school, family — and <b>choose their shelters in advance</b>. During an alert, just tap <kbd>Jestem w: Dom</kbd> (I am at: home) and the result is there at once, even without GPS. Places are stored only on this phone.</p>
  <h3>Adding a place</h3>
  <ol>
    <li>In <b>“Dodaj miejsce”</b> (add a place) choose the type: <kbd>Dom</kbd> (home), <kbd>Praca</kbd> (work), <kbd>Szkoła / uczelnia</kbd> (school / university), <kbd>Przedszkole / żłobek</kbd> (kindergarten / nursery), <kbd>Rodzina / bliscy</kbd> (family), <kbd>Działka / domek</kbd> (allotment / cottage) or <kbd>Inne</kbd> (other).</li>
    <li>Enter a name and address, then <kbd>Szukaj</kbd> (search) — or <kbd>Moja pozycja</kbd> (my position) / <kbd>Wskaż na mapie</kbd> (point on the map).</li>
    <li>Tap the place's tile and in <b>“Wybierz miejsca schronienia”</b> (choose shelters) tick up to three points from the list of the nearest ones.</li>
  </ol>
  {shots(fig("g16-miejsca", "Moje stałe miejsca (my places): Dom — shelters 2/3, recorded routes 1, on foot; Praca — shelters 0/3", "The list of places."),
         fig("g20-dodaj-miejsce", "Nowe miejsce (new place): Szkoła / uczelnia, Nazwa (name) and Adres miejsca (address) fields, Szukaj, Moja pozycja, Wskaż na mapie", "Adding a place."),
         fig("g19-miejsce-wybor", "Wybierz miejsca schronienia (choose shelters): Pokaż punkty filter and the list of nearest points with tick boxes", "Choosing up to three shelters."))}
  <h3>Details, notes and editing</h3>
  <p>A place's details show its location, <b>“Moje miejsce w budynku”</b> (my spot in the building — e.g. “ground-floor corridor, no windows”: where to hide if you can't get out in time) and the chosen shelters. Each shelter has a field <b>“Jak wejść — godziny, kto otwiera, kontakt do zarządcy”</b> (how to get in — hours, who opens it, the manager's contact — your note). It is worth filling in after talking to the manager. The pencil opens editing: name, location, type, your spot in the building with a tick “Sprawdziłem to miejsce na miejscu” (I checked this spot in person), a short checklist and the means of transport. Changes save themselves (“✓ Zapisano” — saved). The bin deletes a place, and the ⋮⋮ handle changes the order.</p>
  {shots(fig("g17-miejsce-szczegoly", "Details of the place Dom (home): location Lublin, ul. Królewska 4, my spot in the building: ground-floor corridor with no windows, checked; transport on foot", "Place details."),
         fig("g18-miejsce-schronienia", "Moje miejsca schronienia 2/3 (my shelters): ul. Złota 2 with the note “open 8–20, key at the reception” and a recorded route 240 m, 3 min 25 s", "A shelter with a note and a recorded route."))}
  <h3>Record your own route</h3>
  <p>For each shelter you can <b>record the route by walking it once, calmly</b>: <kbd>Nagraj swoją trasę</kbd> (record your route), walk, then <kbd>Zakończ i zapisz</kbd> (finish and save). Keep the screen on while recording. During an alert, when you are within 300 m of that place, GROTA shows your orange route instead of the calculated one — with passages and shortcuts that are not on the map.</p>
  <div class="note">If you move a place's address by more than 3 km (moving house), GROTA asks whether to remove the shelters from the old area. An address without an exact house number gives an approximate location — the tile then says “(przybliżone — popraw w „Edytuj”)” (approximate — fix it in Edit).</div>
"""),
        ("przygotuj", "6. The Przygotuj (prepare) tab", f"""
  <h3 id="offline">Offline map — for when there is no internet</h3>
  <p>During an alert the network may be overloaded. <b>Shelter points and distances always work</b>, because the list is on the phone. To see streets and get a route offline, download a map in advance:</p>
  <ol>
    <li>Choose the area: <kbd>Wokół miejsca</kbd> (around a place — 25, 50 or 75 km around your position or a saved place), <kbd>Województwo</kbd> (a province) or <kbd>Cała Polska</kbd> (all of Poland, about 2 GB — Wi-Fi only).</li>
    <li>Choose what to download: <kbd>Mapa i trasy</kbd> (map and routes — recommended; only this lets GROTA guide you offline in the countryside too) or <kbd>Sama mapa</kbd> (map only — smaller; offline you get a straight line instead of a route).</li>
    <li>Tap <kbd>Pobierz mapę</kbd> (download the map). GROTA shows beforehand how much it will download and how much space it takes. Keep the app open while downloading; an interrupted download later fetches only the rest.</li>
    <li><kbd>Sprawdź bez internetu</kbd> (check offline) pretends there is no network, so you can see what will work. <kbd>Zakończ test</kbd> (end test) returns to normal.</li>
  </ol>
  {shots(fig("g22-przygotuj-offline", "Mapa offline card: an explanation that a map downloaded earlier works without internet and frees the connection for others", "Offline map — why."),
         fig("g23-offline-gotowe", "Mapa offline ✓: Małopolska province downloaded, 189 MB; area choice Wokół miejsca, Województwo, Cała Polska; Mapa i trasy, Sama mapa", "Choosing the area; the map is ready."),
         fig("g24-offline-test", "Offline test: banner Test bez internetu · mapa z pamięci telefonu (offline test · map from the phone's memory) and Zakończ test", "<kbd>Sprawdź bez internetu</kbd>."))}
  <p>Sizes: a province from a few dozen to a few hundred MB (the list shows the exact number), all of Poland about 2 GB. Remove a downloaded map with <kbd>Usuń</kbd> (remove) in the same card. An offline map also <b>leaves room for others</b>: everyone who has it on their phone takes load off the server during an alert.</p>
  <h3>Preparation checklists</h3>
  <p>Below are <b>7 checklists</b> quoted from the Safety Guide: <b>Dom lub mieszkanie</b> (house or flat), <b>Zapasy domowe na minimum 3 dni</b> (home supplies for at least 3 days), <b>Plecak ewakuacyjny</b> (evacuation backpack), <b>Plan na kryzys</b> (crisis plan), <b>Praca</b> (work), <b>Szkoła</b> (school) and <b>Osoby potrzebujące szczególnej pomocy</b> (people who need special help) — 36 items in all. <kbd>Otwórz</kbd> (open) expands a list; tick what you already have. A list's frame is red below 40%, yellow in progress and green when complete. Progress stays on the phone.</p>
  {shots(fig("g25-przygotuj-listy", "Checklists: Zrobione 11 z 36 (done 11 of 36), Dom lub mieszkanie 1/8, Zapasy domowe na minimum 3 dni 5/8", "Checklists with counters."),
         fig("g26-lista-otwarta", "The open list Zapasy domowe na minimum 3 dni with ticked items: food and drink, first-aid kit, hygiene, lighting and communication", "An expanded list."))}
"""),
        ("zasady", "7. The Zasady (rules) tab", f"""
  <p>GROTA does not make up its own procedures. Every recommendation in the <kbd>Zasady</kbd> tab is a quote from the government's Safety Guide (“Poradnik bezpieczeństwa”, 1/2025) with its page number: what to do when you hear an alert signal, an air attack, shelters (what to do if you can't make it in time), evacuation, preparing your surroundings and a crisis plan. Then come explanations: what the guide does not specify, why GROTA has no “bunkers”, the limits of the data, where shifted points come from, and the sources. <kbd>Zamknij</kbd> (close) returns to the previous tab.</p>
  {shots(fig("g27-zasady", "The Zasady Groty tab: quotes from the Safety Guide under Sygnały alarmowe (alert signals) and Atak z powietrza (air attack)", "Rules from the Safety Guide."))}
"""),
        ("bez-internetu", "8. What works offline", """
  <div class="tw"><table><thead><tr><th>Feature</th><th>Without internet</th></tr></thead><tbody>
    <tr><td>Shelter points, the nearest point, distance</td><td>always works</td></tr>
    <tr><td>My places, notes, recorded routes, checklists</td><td>always works</td></tr>
    <tr><td>Map with streets</td><td>only after downloading an offline map</td></tr>
    <tr><td>Route along roads</td><td>only with <kbd>Mapa i trasy</kbd> (map and routes) downloaded; otherwise a straight line</td></tr>
    <tr><td>Address search</td><td>knows only towns and villages (the position is the centre of the place)</td></tr>
    <tr><td><kbd>PROWADŹ</kbd> (Google Maps), <kbd>Street View</kbd>, aerial photo</td><td>does not work</td></tr>
  </tbody></table></div>
"""),
        ("pytania", "9. Questions and problems", """
  <h3>Are these bunkers?</h3>
  <p>Unknown. The public PSP list does not distinguish a bunker, a shelter and a makeshift refuge, and the full register is not public.</p>
  <h3>Will the point be open?</h3>
  <p>GROTA does not know. “On request” points are usually locked, and “set hours” ones are open only while the building is in use. Ask the building manager in advance and write the answer in the “Jak wejść” (how to get in) note at your place.</p>
  <h3>Why does GROTA guide me to a farther point, not the closest dot?</h3>
  <p>The closer dot has a doubtful location (the pin is next to a building) or does not match the type you chose. GROTA says so under the suggestion.</p>
  <h3>The pin is on a lawn or in a car park.</h3>
  <p>That is an error in the PSP source data, not in GROTA. Look for the building next to it. You can report it to the municipality or the fire service — a fix at the source corrects it in every app.</p>
  <h3><kbd>PROWADŹ</kbd> does nothing.</h3>
  <p>No Google Maps or no internet. Use <kbd>Narysuj trasę tutaj, na mapie Groty</kbd> (draw the route on GROTA's map) on the point card.</p>
  <h3>The aerial photo does not show.</h3>
  <p>In version 1.7.68 the aerial photo does not appear: the GUGiK service changed its address. The fix comes in the next update, including older Android phones. The screenshots in this guide show how the card looks after the fix.</p>
  <h3>How does GROTA know how much time I have? Why is “make it / won't make it” sometimes missing?</h3>
  <p>From Strażnik's alert — from the threats Strażnik can see. When the alert rests only on indirect sources or Strażnik does not know the time, GROTA does not judge or urge. An RCB alert may concern something Strażnik cannot see, so with an RCB alert or sirens, don't count minutes.</p>
  <h3>I am abroad or by the border.</h3>
  <p>GROTA knows only Poland. By the border, if the phone put you on the other side of the river, set your position by hand.</p>
  <h3>I changed my home address and the shelters disappeared.</h3>
  <p>That is on purpose: after moving an address by more than 3 km GROTA asks whether to remove the shelters from the old area.</p>
  <h3>I have a new phone — where are my places?</h3>
  <p>Places, notes and routes stay only on the phone where you saved them. On a new one, add them again.</p>
  <h3>How do I delete everything?</h3>
  <p>Remove the offline map in <kbd>Przygotuj</kbd> → <kbd>Usuń</kbd>, places with the bin in <kbd>Miejsca</kbd>, the meeting place with <kbd>Usuń</kbd>. Everything: Android Settings → Apps → Strażnik → Storage → Clear data (this also clears Strażnik's settings, e.g. the province for alerts).</p>
  <h3>When will GROTA be on iPhone and in other languages?</h3>
  <p>English and Ukrainian versions are on the way; iPhone comes in a later release. GROTA will not be on the website: the list of points is well over ten MB of data that makes sense on a phone.</p>
"""),
        ("prywatnosc", "10. Privacy and sources", """
  <p>GROTA has no account, no ads and no analytics. The list of points and the search for the nearest one run <b>on the phone</b>. Places, notes, recorded routes, checklists and the offline map stay on the phone. Only what a given feature needs leaves the phone:</p>
  <ul>
    <li><b>a route on the map</b> — your position and the chosen point go to the public FOSSGIS routing server (OSRM, OpenStreetMap data);</li>
    <li><b>address search</b> — the typed address goes to the GUGiK service, after you press “Szukaj”;</li>
    <li><b>aerial photo</b> — an orthophoto tile from Geoportal (GUGiK) for the point you view;</li>
    <li><b>the base map</b> — OpenFreeMap tiles for the area you view (nothing is sent with an offline map);</li>
    <li><b>offline map packages</b> — downloaded from Strażnik's server;</li>
    <li><b>Google Maps and Street View</b> — only when you tap the button.</li>
  </ul>
  <p>Details: <a href="prywatnosc-en.html#location">privacy policy</a>.</p>
  <p class="source-links">Data: Polish State Fire Service HQ, “Punkty schronienia w Polsce”, <a href="https://dane.gov.pl/pl/dataset/28058">dane.gov.pl</a>, CC BY 4.0 · building types: © OpenStreetMap (ODbL) · rules and checklists: “Poradnik bezpieczeństwa”, Government of Poland, <a href="https://www.gov.pl/web/poradnikbezpieczenstwa/">gov.pl</a>, CC BY-SA 4.0 · map: <a href="https://openfreemap.org">OpenFreeMap</a>, © OpenStreetMap · routes: FOSSGIS (OSRM) · addresses and orthophoto: GUGiK.</p>
"""),
    ],
    stopka="""
  <p><b>STRAŻNIK · GROTA</b> — an unofficial additional source. It does not replace sirens, RCB alerts or messages from the emergency services.</p>
  <p><a href="en.html">Strażnik user guide</a> · <a href="iphone-en.html">iPhone guide</a> · <a href="zmiany-en.html">Changelog</a> · <a href="prywatnosc-en.html">Privacy policy</a> · <a href="grota.html" lang="pl">Instrukcja GROTY po polsku</a></p>
""",
)


if __name__ == "__main__":
    for L in (PL, EN):
        html = strona(L)
        for plik in __import__("re").findall(r'src="(screens/grota/[^"]+)"', html):
            if not (DOCS / plik).exists():
                raise SystemExit(f"Brak zrzutu: {plik}")
        (DOCS / L["plik"]).write_text(html, encoding="utf-8")
        print(f"zapisano {L['plik']} {len(html) // 1024} KB")
