# -*- coding: utf-8 -*-
"""Pełna instrukcja modułu GROTA (docs/grota.html, grota-en.html, grota-uk.html).

Zrzuty w docs/screens/grota/ (720 px szerokości) zrobiono 22.09.2026 na emulatorze
(Android 12, Strażnik 1.7.68) z pozycją ustawioną na Stare Miasto w Lublinie.
Zdjęcie z góry na zrzutach pochodzi z usługi GUGiK pobranej na komputerze — w 1.7.68
usługa zmieniła adres i zdjęcie się nie wyświetla (poprawka w kolejnym wydaniu).

Od 1.7.72 GROTA mówi po polsku, angielsku i ukraińsku. Każda wersja instrukcji używa
zrzutów w swoim języku (plik z przyrostkiem -en / -uk), a gdy takiego brak — polskiego.
Napisy przycisków w wersjach EN i UK są przepisane ze słowników grota/jezyk-en.js i jezyk-uk.js.
Strażnik (poza GROTĄ) nie ma ukraińskiego, więc w wersji UK jego przyciski podajemy po polsku.

Uruchomienie:  py scripts/zbuduj_instrukcje_grota.py
"""
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
WERSJA = "1.7.72"
WERSJA_ZRZUTOW = "1.7.68"
PRZYROSTEK = {"pl": "", "en": "-en", "uk": "-uk"}
APK = "https://github.com/cukierrro/Straznik/releases/latest/download/Straznik.apk"


def fig(plik, alt, podpis, h=1560):
    src = f"@@{plik}@@"                     # strona() podstawia zrzut w języku strony
    return (f'<figure><a class="shot-link" href="{src}"><img loading="lazy" src="{src}" width="720" height="{h}" '
            f'alt="{alt}"></a><figcaption>{podpis}</figcaption></figure>')


def shots(*figs):
    return '<div class="shots">' + "".join(figs) + "</div>"


def zrzut(plik, jezyk):
    """Zrzut w języku strony, a gdy go nie ma — polski."""
    wlasny = f"screens/grota/{plik}{PRZYROSTEK[jezyk]}.jpg"
    return wlasny if (DOCS / wlasny).exists() else f"screens/grota/{plik}.jpg"


def strona(L):
    nav = "".join(f'<a href="#{i}">{t}</a>' for i, t in L["nav"])
    sekcje = "\n".join(f'<section id="{i}">\n  <h2>{t}</h2>\n{tresc.strip()}\n</section>\n' for i, t, tresc in L["sekcje"])
    html = f"""<!DOCTYPE html>
<html lang="{L['lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{L['title']}</title>
<meta name="description" content="{L['desc']}">
<link rel="canonical" href="https://cukierrro.github.io/Straznik/{L['plik']}">
<link rel="alternate" hreflang="pl" href="https://cukierrro.github.io/Straznik/grota.html">
<link rel="alternate" hreflang="en" href="https://cukierrro.github.io/Straznik/grota-en.html">
<link rel="alternate" hreflang="uk" href="https://cukierrro.github.io/Straznik/grota-uk.html">
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
    return re.sub(r"@@([\w-]+)@@", lambda m: zrzut(m.group(1), L["lang"]), html)



# ─────────────────────────────── PL ───────────────────────────────
PL = dict(
    lang="pl", plik="grota.html", glowna="index.html",
    title="GROTA — gdzie się schronić · instrukcja",
    desc="Pełna instrukcja GROTY w Strażniku: najbliższe punkty schronienia przy alarmie, trasa, moje miejsca, mapa offline i listy przygotowań. Zrzuty każdej funkcji.",
    og="GROTA — gdzie się schronić · instrukcja",
    skip="Przejdź do treści", navlabel="Nawigacja instrukcji GROTY", jezyk="Język instrukcji",
    jezyki='<a href="grota.html" lang="pl" aria-current="page">PL</a><a href="grota-en.html" lang="en" hreflang="en">EN</a><a href="grota-uk.html" lang="uk" hreflang="uk">UA</a>',
    gora="↑ Wróć na górę",
    nav=[("start", "Na start"), ("alarm", "Przy alarmie"), ("mapa", "Mapa"), ("miejsca", "Miejsca"),
         ("przygotuj", "Przygotuj"), ("offline", "Bez internetu"), ("pytania", "Pytania")],
    hero=f"""
  <div><div class="eyebrow">Instrukcja GROTY · Strażnik {WERSJA} na Androida</div>
    <h1>GROTA — gdzie się schronić</h1>
    <p class="lead">GROTA to część aplikacji Strażnik. Przy alarmie pokazuje <b>najbliższe miejsca schronienia</b> z publicznego wykazu Państwowej Straży Pożarnej i prowadzi do nich. Zawczasu pomaga zapisać schronienia przy domu, pracy i szkole, pobrać mapę na wypadek braku internetu i przygotować się według „Poradnika bezpieczeństwa”.</p>
    <div class="actions"><a class="button primary" href="{APK}">↓ Pobierz Strażnika na Androida</a><a class="button" href="index.html">Instrukcja Strażnika</a></div>
    <p class="fineprint">Zrzuty zrobiono 22 września 2026 w Strażniku {WERSJA_ZRZUTOW}, z pozycją na Starym Mieście w Lublinie. Adresy na zrzutach pochodzą z publicznego wykazu PSP. GROTA jest na razie <b>tylko na Androidzie</b> (iPhone — w kolejnym wydaniu). Od wersji 1.7.72 mówi po polsku, angielsku i ukraińsku (rozdział 8). Dotknij zdjęcia, aby otworzyć je w pełnym rozmiarze.</p>
  </div>
  <a class="shot-link" href="@@g04-teraz-propozycja@@"><img src="@@g04-teraz-propozycja@@" width="720" height="1560" alt="Ekran TERAZ w GROCIE: mapa Starego Miasta w Lublinie z trasą od „Tu jesteś” do celu, a pod nią karta „Najbliższe sprawdzone miejsce schronienia — ul. Złota 2, Lublin, 218 m, ok. 3 min trasą” i duży zielony przycisk PROWADŹ"></a>
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
        ("jezyk", "8. Język GROTY", f"""
  <p>GROTA mówi po <b>polsku, angielsku i ukraińsku</b>. Język wybiera sama, w tej kolejności:</p>
  <ol>
    <li>język wybrany w GROCIE: <kbd>Zasady</kbd> → karta <b>„Język · Language · Мова”</b> → <kbd>Polski</kbd>, <kbd>English</kbd> albo <kbd>Українська</kbd>;</li>
    <li>jeśli nie wybrano — język Strażnika (⚙ → Aplikacja → język: polski albo angielski);</li>
    <li>jeśli i tego nie ustawiono — język telefonu: ukraiński daje ukraiński, inny niż polski — angielski.</li>
  </ol>
  <p>Zmiana działa od razu, bez ponownego uruchamiania. Cytaty z „Poradnika bezpieczeństwa” w wersji angielskiej i ukraińskiej są naszym tłumaczeniem — pod każdym jest dopisek, że oryginał jest po polsku. Adresy i nazwy miejsc zostają po polsku, tak jak w wykazie PSP. Sam Strażnik (poza GROTĄ) ma wersję polską i angielską.</p>
  {shots(fig("g27-zasady", "Zakładka Zasady z kartą Język · Language · Мова na górze", "Wybór języka w <kbd>Zasady</kbd>."))}
"""),
        ("bez-internetu", "9. Co działa bez internetu", """
  <div class="tw"><table><thead><tr><th>Funkcja</th><th>Bez internetu</th></tr></thead><tbody>
    <tr><td>Punkty schronienia, najbliższy punkt, odległość</td><td>działa zawsze</td></tr>
    <tr><td>Moje miejsca, notatki, nagrane trasy, listy przygotowań</td><td>działa zawsze</td></tr>
    <tr><td>Mapa z ulicami</td><td>tylko po pobraniu mapy offline</td></tr>
    <tr><td>Trasa po drogach</td><td>tylko po pobraniu wariantu <kbd>Mapa i trasy</kbd>; inaczej linia prosta</td></tr>
    <tr><td>Wyszukiwanie adresu</td><td>zna tylko miejscowości (pozycja to środek miejscowości)</td></tr>
    <tr><td><kbd>PROWADŹ</kbd> (Google Maps), <kbd>Street View</kbd>, zdjęcie z góry</td><td>nie działa</td></tr>
  </tbody></table></div>
"""),
        ("pytania", "10. Pytania i problemy", """
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
  <p>Zdjęcie pobiera się na bieżąco z Geoportalu GUGiK, który bywa wolny — czasem trwa to kilkanaście sekund. Bez internetu zdjęcia nie ma. W wersji 1.7.68 nie wyświetlało się wcale (GUGiK zmienił usługę); od <b>1.7.70</b> działa, także na starszych Androidach — zaktualizuj aplikację.</p>
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
  <h3>Kiedy GROTA będzie na iPhonie?</h3>
  <p>W kolejnym wydaniu, po przeglądzie Apple. Na stronie WWW GROTY nie będzie: wykaz punktów to kilkanaście MB danych, które mają sens w telefonie.</p>
"""),
        ("prywatnosc", "11. Prywatność i źródła", """
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
  <p><a href="index.html">Instrukcja Strażnika</a> · <a href="iphone.html">Instrukcja dla iPhone'a</a> · <a href="zmiany.html">Historia zmian</a> · <a href="prywatnosc.html">Polityka prywatności</a> · <a href="grota-en.html" lang="en">GROTA guide in English</a> · <a href="grota-uk.html" lang="uk">Посібник GROTA українською</a></p>
""",
)


# ─────────────────────────────── EN ───────────────────────────────
EN = dict(
    lang="en", plik="grota-en.html", glowna="en.html",
    title="GROTA — where to take shelter · user guide",
    desc="The full guide to GROTA in Strażnik: the nearest shelter points during an alert, routes, your places, the offline map and preparation checklists. Screenshots of every feature.",
    og="GROTA — where to take shelter · user guide",
    skip="Skip to content", navlabel="GROTA guide navigation", jezyk="Guide language",
    jezyki='<a href="grota.html" lang="pl" hreflang="pl">PL</a><a href="grota-en.html" lang="en" aria-current="page">EN</a><a href="grota-uk.html" lang="uk" hreflang="uk">UA</a>',
    gora="↑ Back to top",
    nav=[("start", "Start"), ("alarm", "During an alert"), ("mapa", "Map"), ("miejsca", "Places"),
         ("przygotuj", "Prepare"), ("offline", "Offline"), ("pytania", "FAQ")],
    hero=f"""
  <div><div class="eyebrow">GROTA guide · Strażnik {WERSJA} for Android</div>
    <h1>GROTA — where to take shelter</h1>
    <p class="lead">GROTA is part of the Strażnik app. During an alert it shows the <b>nearest shelter points</b> from the public list of Poland's State Fire Service (PSP) and guides you there. In advance, it helps you save shelters near your home, work and school, download a map for when there is no internet, and prepare following the Polish government's Safety Guide.</p>
    <div class="actions"><a class="button primary" href="{APK}">↓ Get Strażnik for Android</a><a class="button" href="en.html">Strażnik user guide</a></div>
    <p class="fineprint">Since version 1.7.72 GROTA speaks <b>English, Ukrainian and Polish</b> (section 8). Screenshots: 22 September 2026, emulator, position in Lublin's Old Town; addresses come from the public PSP list and stay in Polish. GROTA is Android only for now; iPhone comes in the next release. Tap a screenshot to open it full size.</p>
  </div>
  <a class="shot-link" href="@@g04-teraz-propozycja@@"><img src="@@g04-teraz-propozycja@@" width="720" height="1560" alt="GROTA's NOW screen: a map of Lublin's Old Town with a route from “You are here” to the goal, and below it the card “Nearest verified shelter — ul. Złota 2, Lublin” with a big green NAVIGATE button"></a>
""",
    sekcje=[
        ("start", "The essentials in 30 seconds", """
  <div class="note"><ol>
    <li><b>During an alert:</b> tap <kbd>ACKNOWLEDGE — silence siren</kbd>, then <kbd>Where to shelter</kbd>. GROTA shows the nearest place and the route at once. Tap <kbd>NAVIGATE ➜</kbd>.</li>
    <li><b>In advance, calmly:</b> in the <kbd>Places</kbd> tab add your home, work or your child's school, and choose up to three shelters for each. Ask the building manager whether and when they are open.</li>
    <li><b>For when there is no internet:</b> in the <kbd>Prepare</kbd> tab download the map of your province (<kbd>Map and routes</kbd>).</li>
    <li><b>Remember:</b> GROTA is a list of places, not a promise they will be open. When you hear sirens or get an RCB alert, follow the official message.</li>
  </ol></div>
  <h3>What the points in GROTA are</h3>
  <p>They are <b>85,837 shelter points</b> from the public list of Poland's State Fire Service (“Punkty schronienia w Polsce”, dane.gov.pl). The list does not say whether a point is a bunker, a shelter or a makeshift refuge, or how many people fit — the full register is not public. It does say <b>when a point is accessible</b>, shown by the dot colour:</p>
  <div class="cards">
    <div class="card"><h3>🟢 24 hours</h3><p>Accessible around the clock, e.g. underpasses, metro stations, some underground car parks.</p></div>
    <div class="card"><h3>🟠 During set hours</h3><p>Open while the building is in use or staffed — a school, an office, a shopping centre. The hours are not in the data: check them in advance.</p></div>
    <div class="card"><h3>🔵 On request</h3><p>Usually locked (a block's basement, a shared garage). In an emergency the manager or residents open it. Ask in advance who has the key.</p></div>
  </div>
  <p>GROTA covers <b>all of Poland</b> and only Poland. The list of points is on the phone, so finding the nearest one works offline too.</p>
"""),
        ("otwieranie", "1. How to open GROTA", f"""
  <p><b>During an alert:</b> on the alert screen tap <kbd>ACKNOWLEDGE — silence siren</kbd>. The siren stops and three buttons appear: <kbd>Where to shelter</kbd>, <kbd>Watch the map</kbd> and <kbd>I am safe</kbd>. Strażnik never switches the screen on its own — you choose. <kbd>Where to shelter</kbd> opens GROTA straight on the <b>NOW</b> tab and finds your position. GROTA starts loading as soon as the alert appears, so it opens at once.</p>
  <p><b>At any time:</b> the bottom tab <kbd>More</kbd> → <kbd>Shelter — nearest</kbd>. This opens the <b>Map</b> tab.</p>
  <p><b>Back to Strażnik:</b> the <kbd>‹ Strażnik</kbd> button top left, or the system “back” button. “Back” first undoes a step inside GROTA (closes a point card or panel), and only then returns to Strażnik.</p>
  <p>At the bottom GROTA has five tabs: <kbd>Map</kbd>, <kbd>Places</kbd>, the red <kbd>NOW</kbd>, <kbd>Prepare</kbd> and <kbd>Rules</kbd>.</p>
  {shots(fig("g01-wiecej", "The More menu in Strażnik with “Shelter — nearest” at the top", "<kbd>More</kbd> → <kbd>Shelter — nearest</kbd>."),
         fig("g02-alarm", "The alert screen after acknowledging: the red “Where to shelter” button plus “Watch the map” and “I am safe”", "The alert screen after acknowledging: three buttons.", 631))}
  <div class="warn"><b>The first time</b> Android asks for location access. Choose “While using the app”. If you refuse, GROTA still works — you then say where you are yourself (a saved place, an address or a point on the map). Open GROTA once when things are calm, so you don't face this question in a hurry during an alert.</div>
"""),
        ("alarm", "2. During an alert — the NOW tab", f"""
  <p>NOW is the screen for the moment of danger. When opened it finds your position and shows the result straight away. There is nothing to set up.</p>
  <h3>Step 1. Where I am searching from</h3>
  <p>Under the quote from the Safety Guide you see <b>“Searching from: GPS ±5 m”</b> — where GROTA measures from. If the position is wrong or GPS fails: <kbd>GPS position</kbd> (try again), <kbd>Enter an address</kbd> or <kbd>I'm at: Home</kbd> (your saved place). Below, choose how you move: <kbd>On foot</kbd>, <kbd>Bike</kbd> or <kbd>Car</kbd>. <kbd>Finish</kbd> clears the position and route.</p>
  <h3>Step 2. The nearest place and the route</h3>
  <p>The big card <b>“Nearest verified shelter”</b> gives the address, distance, time and type of access. The map shows the route from “You are here” to “Goal”. <kbd>NAVIGATE ➜</kbd> opens Google Maps navigation. Below there is an aerial photo (the point in the middle), <kbd>Street View</kbd> and <kbd>Show on map</kbd>.</p>
  {shots(fig("g03-teraz", "Top of the NOW screen: map with route, Safety Guide quote, Searching from GPS ±5 m, buttons GPS position, Enter an address, On foot, Bike, Car", "Position, how you move."),
         fig("g04-teraz-propozycja", "Card of the nearest verified shelter: ul. Złota 2, Lublin, about 3 min, During set hours, NAVIGATE button", "The nearest place and <kbd>NAVIGATE ➜</kbd>."),
         fig("g05-teraz-rodzaje", "Guide to points: 24 hours 1.1 km, During hours 168 m, On request 118 m, and building types", "Choosing the type of point."),
         fig("g06-teraz-inne", "Other options: ul. Jezuicka 6 and ul. Rynek 7 with Navigate buttons; below, the Meeting place card", "Other options and the meeting place."))}
  <h3>Step 3. When the first suggestion does not fit</h3>
  <p><b>“Guide to points”</b> shows how far the nearest point of each type is — e.g. “24 hours 1.1 km”, “On request 118 m”. Switch off a type that does not suit you (e.g. locked “on request” points at night) and GROTA immediately picks the nearest of the rest. The building-type shortcuts (underground car parks, blocks of flats, schools) and <kbd>Building type: all</kbd> work the same way.</p>
  <p>Further down, <b>“Other options”</b> lists the next points, numbered 2, 3… Tapping one moves it to first place, with a route. Useful when the first one is across a busy road or turned out to be locked.</p>
  <p>GROTA only guides you to points with a <b>verified location</b>. If a point with a doubtful location (a pin on a lawn, not on a building) is closer, GROTA mentions it under the suggestion but does not guide you there.</p>
  <h3>Will I make it? — an alert with a time</h3>
  <p>When Strażnik knows the time until the threat (e.g. an object heading for your province), GROTA compares it with the time to get there. If by the estimate you will not make it, you see <b>“By the estimate you won't make it”</b> and the route turns red. Then follow the Safety Guide advice shown with it: stay in the building, away from windows, by load-bearing walls, on the lowest floor.</p>
  {shots(fig("g08-teraz-alarm-czas", "Card Time from Strażnik's alert: threat in 2 min, Lublin province, with a note that it is an estimate", "“Time from Strażnik's alert”."))}
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
    <li><b>Finding the position takes a while:</b> don't wait — tap <kbd>I'm at: Home</kbd>, enter an address or <kbd>Pick on the map</kbd>.</li>
    <li><b>No location permission:</b> GROTA tells you where to turn it on (Settings → Apps → Strażnik → Permissions → Location); meanwhile you pick the place by hand.</li>
    <li><b>A very approximate position</b> (e.g. ±3 km): GROTA asks whether you want to pick a place or <kbd>Show anyway</kbd>, and marks the result as approximate.</li>
    <li><b>Outside Poland:</b> GROTA only knows points in Poland, so instead of a route it says “You are outside Grota's data coverage.” If you are in Poland right by the border and the phone put you on the other side of the river, set your position by hand.</li>
  </ul>
  {shots(fig("g21-teraz-jestem-w", "NOW while finding the position: Finding your position…, Don't want to wait? Choose where you are: I'm at Home, Work, address field and Pick on the map", "Don't wait for GPS: <kbd>I'm at: Home</kbd>."),
         fig("g10-poza-zasiegiem", "Message You are outside Grota's data coverage for a position in Frankfurt (Oder), with a choice of place", "Outside Poland: a message instead of a route."))}
  <p><b>When <kbd>NAVIGATE</kbd> does nothing</b> (no Google Maps or no internet): on the point card tap <kbd>Draw the route here, on Grota's map</kbd>. GROTA draws an approximate route from what the phone has — along streets with an offline map, otherwise in a straight line.</p>
"""),
        ("umowione", "3. Meeting place", f"""
  <p>If you have agreed a meeting place with your family, enter it in the <b>“Meeting place”</b> card at the bottom of NOW: <kbd>Set a place</kbd> → an address or a point on the map. GROTA shows the distance and time on foot and by car, the route (<kbd>Show route</kbd>, <kbd>Navigate</kbd>), and warns you when it is too far to make it in time. <kbd>Delete</kbd> removes it.</p>
  {shots(fig("g09-umowione", "Meeting place card: Dworzec Lublin (Lublin station), 1.4 km, on foot about 22 min, by car about 4 min, with a distance warning", "Meeting place with a warning."))}
"""),
        ("mapa", "4. The Map tab", f"""
  <p>The map shows every point in Poland. The <b>dot colour</b> is access (green — 24 hours, orange — during set hours, blue — on request) and the <b>outline</b> is how sure the location is (grey — verified, yellow — to check, red — doubtful). Map buttons: <kbd>+</kbd>/<kbd>−</kbd> zoom, moon/sun switches the light and dark map, the crosshair shows your position.</p>
  <p><b>Tap a dot</b> and the point card appears under the map: address, municipality, building type (from OpenStreetMap), access with an explanation, distance and time, location certainty, an aerial photo, <kbd>Navigate</kbd>, <kbd>Street View</kbd> and <kbd>Draw the route here, on Grota's map</kbd>. If you have saved places, you also see <b>“Save as a shelter for:”</b> with buttons for your places.</p>
  {shots(fig("g11-mapa", "The Map tab: shelter dots in Lublin's Old Town, the card Why are there no bunkers here? and Filters and view", "The map with points."),
         fig("g12-mapa-punkt", "Selected point card: ul. Złota 2, Lublin, During set hours, distance from you, location verified, aerial photo", "Point card with an aerial photo."),
         fig("g15-mapa-ciemna", "The same map in dark mode", "Dark map (moon/sun)."))}
  <h3>Filters and view</h3>
  <p><kbd>Filters and view</kbd> under the map shows only selected points: by access (<kbd>24 hours</kbd>, <kbd>During hours</kbd>, <kbd>On request</kbd>), by location certainty (<kbd>Verified</kbd>, <kbd>To check</kbd>, <kbd>Doubtful</kbd>) and by <b>building type</b> (11 groups, e.g. underground car parks, blocks of flats, schools, hospitals). Each button toggles its group; <kbd>Show all</kbd> selects everything, and pressed again — clears it. Here you also choose <kbd>On foot</kbd>, <kbd>Bike</kbd> or <kbd>Car</kbd>.</p>
  {shots(fig("g13-mapa-filtry", "Filters: 24 hours 19,617, During hours 7,011, On request 59,209, Verified 83,665, To check 888, Doubtful 1,284", "Access and certainty filters."),
         fig("g14-mapa-rodzaje", "Building type (per OpenStreetMap): underground car parks, shopping centres, stations, blocks of flats, houses, schools, hospitals, offices, businesses, culture, unknown", "Building type."))}
  <div class="note">The map filter affects <b>only the map</b>. NOW always searches among all verified points, unless you narrow the choice in “Guide to points”.</div>
  <p><b>Why are there no “bunkers” here?</b> On the first visit GROTA explains that the public PSP data does not distinguish a bunker, a shelter and a makeshift refuge, and the full register is not public by law. <kbd>Explanation and sources</kbd> leads to the Rules.</p>
"""),
        ("miejsca", "5. The Places tab — prepare in advance", f"""
  <p>Here you save your regular places — home, work, your child's school, family — and <b>choose their shelters in advance</b>. During an alert, just tap <kbd>I'm at: Home</kbd> and the result is there at once, even without GPS. Places are stored only on this phone.</p>
  <h3>Adding a place</h3>
  <ol>
    <li>In <b>“Add a place”</b> choose the type: <kbd>Home</kbd>, <kbd>Work</kbd>, <kbd>School / university</kbd>, <kbd>Kindergarten / nursery</kbd>, <kbd>Family / relatives</kbd>, <kbd>Allotment / cottage</kbd> or <kbd>Other</kbd>.</li>
    <li>Enter a name and address, then <kbd>Search</kbd> — or <kbd>My position</kbd> / <kbd>Pick on the map</kbd>.</li>
    <li>Tap the place's tile and in <b>“Choose shelters”</b> tick up to three points from the list of the nearest ones.</li>
  </ol>
  {shots(fig("g16-miejsca", "My regular places: Home — shelters 2/3, recorded routes 1, on foot; Work — shelters 0/3", "The list of places."),
         fig("g20-dodaj-miejsce", "New place: School / university, Name and address fields, Search, My position, Pick on the map", "Adding a place."),
         fig("g19-miejsce-wybor", "Choose shelters: filter and the list of nearest points with tick boxes", "Choosing up to three shelters."))}
  <h3>Details, notes and editing</h3>
  <p>A place's details show its location, <b>“My spot in the building”</b> (e.g. “ground-floor corridor, no windows” — where to hide if you can't get out in time) and the chosen shelters. Each shelter has a field <b>“How to get in — hours, who opens it, building manager's contact (your note)”</b>. It is worth filling in after talking to the manager. The pencil opens editing: name, location, type, your spot in the building with a tick <b>“I have checked this spot on site”</b>, a short checklist and the means of transport. Changes save themselves. The bin deletes a place, and the ⋮⋮ handle changes the order.</p>
  {shots(fig("g17-miejsce-szczegoly", "Details of the place Home: location, my spot in the building, verified; transport on foot", "Place details."),
         fig("g18-miejsce-schronienia", "My shelters 2/3: ul. Złota 2 with a note and a recorded route", "A shelter with a note and a recorded route."))}
  <h3>Record your own route</h3>
  <p>For each shelter you can <b>record the route by walking it once, calmly</b>: <kbd>Record your route</kbd>, walk, then <kbd>Finish and save</kbd>. Keep the screen on while recording. During an alert, when you are within 300 m of that place, GROTA shows your orange route instead of the calculated one — with passages and shortcuts that are not on the map.</p>
  <div class="note">If you move a place's address by more than 3 km (moving house), GROTA asks whether to remove the shelters from the old area. An address without an exact house number gives an approximate location, marked on the tile.</div>
"""),
        ("przygotuj", "6. The Prepare tab", f"""
  <h3 id="offline">Offline map — for when there is no internet</h3>
  <p>During an alert the network may be overloaded. <b>Shelter points and distances always work</b>, because the list is on the phone. To see streets and get a route offline, download a map in advance:</p>
  <ol>
    <li>Choose the area: <kbd>Around a place</kbd> (25, 50 or 75 km around your position or a saved place), <kbd>Province</kbd> or <kbd>All of Poland</kbd> (about 2 GB — Wi-Fi only).</li>
    <li>Choose what to download: <kbd>Map and routes</kbd> (recommended; only this lets GROTA guide you offline in the countryside too) or <kbd>Map only</kbd> (smaller; offline you get a straight line instead of a route).</li>
    <li>Tap <kbd>Download map</kbd>. GROTA shows beforehand how much it will download and how much space it takes. Keep the app open while downloading; an interrupted download later fetches only the rest.</li>
    <li><kbd>Test offline</kbd> pretends there is no network, so you can see what will work. <kbd>End test</kbd> returns to normal.</li>
  </ol>
  {shots(fig("g22-przygotuj-offline", "Offline map card: a downloaded map works without internet and frees the connection for others", "Offline map — why."),
         fig("g23-offline-gotowe", "Offline map ✓: a downloaded province; area choice Around a place, Province, All of Poland; Map and routes, Map only", "Choosing the area; the map is ready."),
         fig("g24-offline-test", "Offline test banner with the End test button", "<kbd>Test offline</kbd>."))}
  <p>Sizes: a province from a few dozen to a few hundred MB (the list shows the exact number), all of Poland about 2 GB. Remove a downloaded map with <kbd>Delete</kbd> in the same card. An offline map also <b>leaves room for others</b>: everyone who has it on their phone takes load off the server during an alert.</p>
  <h3>Preparation checklists</h3>
  <p>Below are <b>7 checklists</b> quoted from the Safety Guide: <b>House or flat</b>, <b>Household supplies for at least 3 days</b>, <b>Emergency backpack</b>, <b>Crisis plan</b>, <b>Work</b>, <b>School</b> and <b>People who need special help</b> — 36 items in all. <kbd>Open</kbd> expands a list; tick what you already have. A list's frame is red below 40%, yellow in progress and green when complete. Progress stays on the phone.</p>
  {shots(fig("g25-przygotuj-listy", "Checklists with counters: done 11 of 36", "Checklists with counters."),
         fig("g26-lista-otwarta", "The open list Household supplies for at least 3 days with ticked items", "An expanded list."))}
"""),
        ("zasady", "7. The Rules tab", f"""
  <p>GROTA does not make up its own procedures. Every recommendation in the <kbd>Rules</kbd> tab is a quote from the Polish government's Safety Guide (“Poradnik bezpieczeństwa”, 1/2025) with its page number: what to do when you hear an alert signal, an air attack, shelters (what to do if you can't make it in time), evacuation, preparing your surroundings and a crisis plan. Then come explanations: what the guide does not specify, why GROTA has no “bunkers”, the limits of the data, where misplaced points come from, and the sources. <kbd>Close</kbd> returns to the previous tab.</p>
"""),
        ("jezyk", "8. GROTA's language", f"""
  <p>GROTA speaks <b>English, Ukrainian and Polish</b>. It picks the language in this order:</p>
  <ol>
    <li>the language chosen in GROTA: <kbd>Rules</kbd> → the <b>“Język · Language · Мова”</b> card → <kbd>Polski</kbd>, <kbd>English</kbd> or <kbd>Українська</kbd>;</li>
    <li>if none was chosen — Strażnik's language (⚙ → App → language: Polish or English);</li>
    <li>if that isn't set either — the phone's language: Ukrainian gives Ukrainian, anything other than Polish gives English.</li>
  </ol>
  <p>The change works at once, without restarting. Quotes from the Safety Guide in English and Ukrainian are our translation — each says under it that the original is Polish. Addresses and place names stay in Polish, as in the PSP list. Strażnik itself (outside GROTA) has Polish and English.</p>
  {shots(fig("g27-zasady", "The Rules tab with the Język · Language · Мова card at the top", "Choosing the language in <kbd>Rules</kbd>."))}
"""),
        ("bez-internetu", "9. What works offline", """
  <div class="tw"><table><thead><tr><th>Feature</th><th>Without internet</th></tr></thead><tbody>
    <tr><td>Shelter points, the nearest point, distance</td><td>always works</td></tr>
    <tr><td>My places, notes, recorded routes, checklists</td><td>always works</td></tr>
    <tr><td>Map with streets</td><td>only after downloading an offline map</td></tr>
    <tr><td>Route along roads</td><td>only with <kbd>Map and routes</kbd> downloaded; otherwise a straight line</td></tr>
    <tr><td>Address search</td><td>knows only towns and villages (the position is the centre of the place)</td></tr>
    <tr><td><kbd>NAVIGATE</kbd> (Google Maps), <kbd>Street View</kbd>, aerial photo</td><td>does not work</td></tr>
  </tbody></table></div>
"""),
        ("pytania", "10. Questions and problems", """
  <h3>Are these bunkers?</h3>
  <p>Unknown. The public PSP list does not distinguish a bunker, a shelter and a makeshift refuge, and the full register is not public.</p>
  <h3>Will the point be open?</h3>
  <p>GROTA does not know. “On request” points are usually locked, and “during set hours” ones are open only while the building is in use. Ask the building manager in advance and write the answer in the “How to get in” note at your place.</p>
  <h3>Why does GROTA guide me to a farther point, not the closest dot?</h3>
  <p>The closer dot has a doubtful location (the pin is next to a building) or does not match the type you chose. GROTA says so under the suggestion.</p>
  <h3>The pin is on a lawn or in a car park.</h3>
  <p>That is an error in the PSP source data, not in GROTA. Look for the building next to it. You can report it to the municipality or the fire service — a fix at the source corrects it in every app.</p>
  <h3><kbd>NAVIGATE</kbd> does nothing.</h3>
  <p>No Google Maps or no internet. Use <kbd>Draw the route here, on Grota's map</kbd> on the point card.</p>
  <h3>The aerial photo takes long or does not show.</h3>
  <p>It is loaded live from GUGiK's Geoportal, which can be slow — sometimes over ten seconds. Offline there is no photo. In version 1.7.68 it did not appear at all; from 1.7.70 it works, on older Android phones too — update the app.</p>
  <h3>How does GROTA know how much time I have? Why is “make it / won't make it” sometimes missing?</h3>
  <p>From Strażnik's alert — from the threats Strażnik can see. When the alert rests only on indirect sources or Strażnik does not know the time, GROTA does not judge or urge. An RCB alert may concern something Strażnik cannot see, so with an RCB alert or sirens, don't count minutes.</p>
  <h3>I am abroad or by the border.</h3>
  <p>GROTA knows only Poland. By the border, if the phone put you on the other side of the river, set your position by hand.</p>
  <h3>I changed my home address and the shelters disappeared.</h3>
  <p>That is on purpose: after moving an address by more than 3 km GROTA asks whether to remove the shelters from the old area.</p>
  <h3>I have a new phone — where are my places?</h3>
  <p>Places, notes and routes stay only on the phone where you saved them. On a new one, add them again.</p>
  <h3>How do I delete everything?</h3>
  <p>Remove the offline map in <kbd>Prepare</kbd> → <kbd>Delete</kbd>, places with the bin in <kbd>Places</kbd>, the meeting place with <kbd>Delete</kbd>. Everything: Android Settings → Apps → Strażnik → Storage → Clear data (this also clears Strażnik's settings, e.g. the province for alerts).</p>
  <h3>When will GROTA be on iPhone?</h3>
  <p>In the next release, after Apple's review. GROTA will not be on the website: the list of points is well over ten MB of data that makes sense on a phone.</p>
"""),
        ("prywatnosc", "11. Privacy and sources", """
  <p>GROTA has no account, no ads and no analytics. The list of points and the search for the nearest one run <b>on the phone</b>. Places, notes, recorded routes, checklists and the offline map stay on the phone. Only what a given feature needs leaves the phone:</p>
  <ul>
    <li><b>a route on the map</b> — your position and the chosen point go to the public FOSSGIS routing server (OSRM, OpenStreetMap data);</li>
    <li><b>address search</b> — the typed address goes to the GUGiK service, after you press “Search”;</li>
    <li><b>aerial photo</b> — an orthophoto tile from Geoportal (GUGiK) for the point you view;</li>
    <li><b>the base map</b> — OpenFreeMap tiles for the area you view (nothing is sent with an offline map);</li>
    <li><b>offline map packages</b> — downloaded from Strażnik's server;</li>
    <li><b>Google Maps and Street View</b> — only when you tap the button.</li>
  </ul>
  <p>Details: <a href="prywatnosc-en.html#location">privacy policy</a>.</p>
  <p class="source-links">Data: Polish State Fire Service HQ, “Punkty schronienia w Polsce”, <a href="https://dane.gov.pl/pl/dataset/28058">dane.gov.pl</a>, CC BY 4.0 · building types: © OpenStreetMap (ODbL) · rules and checklists: “Poradnik bezpieczeństwa”, Government of Poland, <a href="https://www.gov.pl/web/poradnikbezpieczenstwa/">gov.pl</a>, CC BY-SA 4.0 (our translation) · map: <a href="https://openfreemap.org">OpenFreeMap</a>, © OpenStreetMap · routes: FOSSGIS (OSRM) · addresses and orthophoto: GUGiK.</p>
"""),
    ],
    stopka="""
  <p><b>STRAŻNIK · GROTA</b> — an unofficial additional source. It does not replace sirens, RCB alerts or messages from the emergency services.</p>
  <p><a href="en.html">Strażnik user guide</a> · <a href="iphone-en.html">iPhone guide</a> · <a href="zmiany-en.html">Changelog</a> · <a href="prywatnosc-en.html">Privacy policy</a> · <a href="grota.html" lang="pl">Instrukcja GROTY po polsku</a> · <a href="grota-uk.html" lang="uk">Посібник GROTA українською</a></p>
""",
)


# ─────────────────────────────── UK ───────────────────────────────
# Strażnik poza GROTĄ nie ma ukraińskiego: jego przyciski podajemy po polsku, a w nawiasie po angielsku.
UK = dict(
    lang="uk", plik="grota-uk.html", glowna="en.html",
    title="GROTA — де сховатися · посібник",
    desc="Повний посібник GROTA в застосунку Strażnik: найближчі укриття під час тривоги, маршрут, мої місця, офлайн-мапа і списки підготовки. Знімки кожної функції.",
    og="GROTA — де сховатися · посібник",
    skip="Перейти до змісту", navlabel="Навігація посібником GROTA", jezyk="Мова посібника",
    jezyki='<a href="grota.html" lang="pl" hreflang="pl">PL</a><a href="grota-en.html" lang="en" hreflang="en">EN</a><a href="grota-uk.html" lang="uk" aria-current="page">UA</a>',
    gora="↑ Нагору",
    nav=[("start", "Коротко"), ("alarm", "Під час тривоги"), ("mapa", "Мапа"), ("miejsca", "Місця"),
         ("przygotuj", "Підготовка"), ("offline", "Офлайн"), ("pytania", "Питання")],
    hero=f"""
  <div><div class="eyebrow">Посібник GROTA · Strażnik {WERSJA} для Android</div>
    <h1>GROTA — де сховатися</h1>
    <p class="lead">GROTA — частина застосунку Strażnik («Вартовий»). Під час повітряної тривоги вона показує <b>найближчі місця укриття</b> з публічного переліку Державної пожежної служби Польщі (PSP) і веде до них. Заздалегідь допомагає зберегти укриття біля дому, роботи й школи, завантажити мапу на випадок відсутності інтернету та підготуватися за польським урядовим «Порадником безпеки».</p>
    <div class="actions"><a class="button primary" href="{APK}">↓ Завантажити Strażnik для Android</a><a class="button" href="en.html">Посібник Strażnik (англійською)</a></div>
    <p class="fineprint">З версії 1.7.72 GROTA працює <b>українською</b>, англійською та польською (розділ 8). Сам Strażnik (поза GROTA) має польську й англійську мови, тому його кнопки подаємо польською, а в дужках — англійською. Знімки: 22 вересня 2026, емулятор, позиція в Старому місті Любліна; адреси з переліку PSP залишаються польською. GROTA поки що лише для Android, iPhone — у наступному випуску. Торкніться знімка, щоб відкрити його повністю. Переклад посібника — машинний з перевіркою; якщо помітите помилку, напишіть нам.</p>
  </div>
  <a class="shot-link" href="@@g04-teraz-propozycja@@"><img src="@@g04-teraz-propozycja@@" width="720" height="1560" alt="Екран ЗАРАЗ у GROTA: мапа Старого міста Любліна з маршрутом від «Ви тут» до мети, під нею картка «Найближче перевірене укриття — ul. Złota 2, Lublin» і велика зелена кнопка ВЕСТИ"></a>
""",
    sekcje=[
        ("start", "Найважливіше за 30 секунд", """
  <div class="note"><ol>
    <li><b>Під час тривоги:</b> натисніть <kbd>POTWIERDZAM — wycisz syrenę</kbd> (ACKNOWLEDGE — підтверджую, вимкнути сирену), потім <kbd>Gdzie się schronić</kbd> (Where to shelter — де сховатися). GROTA одразу покаже найближче місце і маршрут. Натисніть <kbd>ВЕСТИ ➜</kbd>.</li>
    <li><b>Заздалегідь, спокійно:</b> у вкладці <kbd>Місця</kbd> додайте дім, роботу або школу дитини та виберіть для кожного до трьох укриттів. Запитайте управителя будинку, чи і коли вони відчинені.</li>
    <li><b>На випадок відсутності інтернету:</b> у вкладці <kbd>Підготовка</kbd> завантажте мапу свого воєводства (<kbd>Мапа й маршрути</kbd>).</li>
    <li><b>Пам'ятайте:</b> GROTA — це перелік місць, а не гарантія, що вони будуть відчинені. Коли чути сирени або прийшов Alert RCB, дійте за офіційним повідомленням.</li>
  </ol></div>
  <h3>Що таке пункти в GROTA</h3>
  <p>Це <b>85 837 пунктів укриття</b> з публічного переліку Головного управління PSP («Punkty schronienia w Polsce», dane.gov.pl). Перелік не вказує, чи це сховище, укриття чи тимчасове місце захисту, і скільки людей там поміститься — повний реєстр не є публічним. Зате він вказує, <b>коли пункт доступний</b>, і це видно за кольором крапки:</p>
  <div class="cards">
    <div class="card"><h3>🟢 Цілодобово</h3><p>Доступний цілодобово, наприклад підземні переходи, станції метро, частина підземних паркінгів.</p></div>
    <div class="card"><h3>🟠 У визначені години</h3><p>Відчинений, коли будівля працює або є персонал — школа, установа, торговий центр. Годин у даних немає: перевірте заздалегідь.</p></div>
    <div class="card"><h3>🔵 На вимогу</h3><p>Зазвичай зачинений (підвал багатоквартирного будинку, спільний гараж). У разі загрози його відчиняє управитель або мешканці. Запитайте заздалегідь, у кого ключ.</p></div>
  </div>
  <p>GROTA охоплює <b>усю Польщу</b> і лише Польщу. Перелік пунктів зберігається в телефоні, тому пошук найближчого працює й без інтернету.</p>
"""),
        ("otwieranie", "1. Як відкрити GROTA", f"""
  <p><b>Під час тривоги:</b> на екрані тривоги натисніть <kbd>POTWIERDZAM — wycisz syrenę</kbd> (підтверджую, вимкнути сирену). Сирена замовкне, і з'являться три кнопки: <kbd>Gdzie się schronić</kbd> (де сховатися), <kbd>Obserwuj mapę</kbd> (стежити за мапою) і <kbd>Jestem bezpieczny</kbd> (я в безпеці). Strażnik ніколи сам не перемикає екран — вибираєте ви. <kbd>Gdzie się schronić</kbd> відкриває GROTA одразу на вкладці <b>ЗАРАЗ</b> і визначає вашу позицію. GROTA починає завантажуватися вже в момент тривоги, тому відкривається миттєво.</p>
  <p><b>Будь-коли:</b> нижня вкладка <kbd>Więcej</kbd> (More — більше) → <kbd>Schronienie — gdzie najbliżej</kbd> (Shelter — nearest — найближче укриття). Відкриється вкладка <b>Мапа</b>.</p>
  <p><b>Повернення до Strażnik:</b> кнопка <kbd>‹ Strażnik</kbd> угорі ліворуч або системна кнопка «назад». «Назад» спершу скасовує крок у GROTA (закриває картку пункту чи панель), а вже потім повертає до Strażnik.</p>
  <p>Унизу GROTA має п'ять вкладок: <kbd>Мапа</kbd>, <kbd>Місця</kbd>, червону <kbd>ЗАРАЗ</kbd>, <kbd>Підготовка</kbd> і <kbd>Правила</kbd>.</p>
  {shots(fig("g01-wiecej", "Меню Więcej у Strażnik з першим пунктом Schronienie — gdzie najbliżej", "<kbd>Więcej</kbd> → <kbd>Schronienie — gdzie najbliżej</kbd>."),
         fig("g02-alarm", "Екран тривоги після підтвердження: червона кнопка Gdzie się schronić, а також Obserwuj mapę і Jestem bezpieczny", "Екран тривоги після підтвердження: три кнопки.", 631))}
  <div class="warn"><b>Першого разу</b> Android запитає дозвіл на геолокацію. Виберіть «Під час використання застосунку». Якщо відмовите, GROTA працюватиме далі — тоді ви самі вказуєте, де перебуваєте (збережене місце, адреса або точка на мапі). Відкрийте GROTA один раз у спокійний час, щоб під час тривоги не відповідати на це питання поспіхом.</div>
"""),
        ("alarm", "2. Під час тривоги — вкладка ЗАРАЗ", f"""
  <p>ЗАРАЗ — екран на момент небезпеки. Після відкриття він визначає вашу позицію і одразу показує результат. Нічого налаштовувати не треба.</p>
  <h3>Крок 1. Звідки шукаю</h3>
  <p>Під цитатою з «Порадника безпеки» видно <b>«Шукаю від: GPS ±5 м»</b> — звідки GROTA рахує відстань. Якщо позиція неправильна або GPS не працює: <kbd>Позиція з GPS</kbd> (спробувати ще раз), <kbd>Ввести адресу</kbd> або <kbd>Я в: Дім</kbd> (ваше збережене місце). Нижче виберіть, як пересуваєтеся: <kbd>Пішки</kbd>, <kbd>Велосипед</kbd> або <kbd>Автомобіль</kbd>. <kbd>Завершити</kbd> очищає позицію і маршрут.</p>
  <h3>Крок 2. Найближче місце і маршрут</h3>
  <p>Велика картка <b>«Найближче перевірене укриття»</b> показує адресу, відстань, час і вид доступу. На мапі — маршрут від «Ви тут» до мети. <kbd>ВЕСТИ ➜</kbd> відкриває навігацію Google Maps. Нижче — знімок згори (пункт у центрі), <kbd>Street View</kbd> і <kbd>Показати на мапі</kbd>.</p>
  {shots(fig("g03-teraz", "Верх екрана ЗАРАЗ: мапа з маршрутом, цитата з порадника, Шукаю від GPS ±5 м, кнопки Позиція з GPS, Ввести адресу, Пішки, Велосипед, Автомобіль", "Позиція, спосіб пересування."),
         fig("g04-teraz-propozycja", "Картка найближчого перевіреного укриття: ul. Złota 2, Lublin, близько 3 хв, У визначені години, кнопка ВЕСТИ", "Найближче місце і <kbd>ВЕСТИ ➜</kbd>."),
         fig("g05-teraz-rodzaje", "Вести до пунктів: Цілодобово 1,1 км, У години 168 м, На вимогу 118 м і типи будівель", "Вибір виду пунктів."),
         fig("g06-teraz-inne", "Інші варіанти: ul. Jezuicka 6 і ul. Rynek 7 з кнопками Вести; нижче картка Домовлене місце", "Інші варіанти і домовлене місце."))}
  <h3>Крок 3. Коли перша пропозиція не підходить</h3>
  <p><b>«Вести до пунктів»</b> показує, як далеко найближчий пункт кожного виду — наприклад «Цілодобово 1,1 км», «На вимогу 118 м». Вимкніть вид, який вам не підходить (наприклад, зачинені вночі пункти «на вимогу»), і GROTA одразу вкаже найближчий з решти. Так само працюють швидкі кнопки типів будівель (підземні паркінги, багатоквартирні будинки, школи) і <kbd>Тип будівлі: усі</kbd>.</p>
  <p>Нижче, в <b>«Інші варіанти»</b>, — наступні пункти з номерами 2, 3… Натискання ставить пункт на перше місце з маршрутом. Знадобиться, коли перший — за жвавою вулицею або виявився зачиненим.</p>
  <p>GROTA веде лише до пунктів з <b>перевіреним розташуванням</b>. Якщо ближче є пункт із сумнівним розташуванням (шпилька на газоні, а не на будівлі), GROTA пише про нього під пропозицією, але не веде до нього.</p>
  <h3>Чи встигну? — тривога з часом</h3>
  <p>Коли Strażnik знає час до загрози (наприклад, об'єкт летить у бік вашого воєводства), GROTA порівнює його з часом дороги. Якщо за оцінкою ви не встигаєте, з'являється <b>«За оцінкою ви не встигнете»</b>, а маршрут стає червоним. Тоді дійте за порадами з «Порадника безпеки», які показано поруч: залишайтеся в будівлі, подалі від вікон, біля несучих стін, на найнижчому поверсі.</p>
  {shots(fig("g08-teraz-alarm-czas", "Картка Час із тривоги Strażnik: загроза за 2 хв, Люблінське воєводство, з приміткою, що це оцінка", "«Час із тривоги Strażnik»."))}
  <div class="tw"><table><thead><tr><th>Колір маршруту</th><th>Що означає</th></tr></thead><tbody>
    <tr><td>зелений</td><td>за оцінкою встигнете</td></tr>
    <tr><td>червоний</td><td>за оцінкою не встигнете</td></tr>
    <tr><td>фіолетовий, бірюзовий, синій</td><td>пішки, велосипедом, автомобілем — без порівняння з часом (немає тривоги або Strażnik не знає часу)</td></tr>
    <tr><td>помаранчевий</td><td>ваш записаний маршрут (розділ 5)</td></tr>
    <tr><td>пунктирна пряма</td><td>лише напрямок, по прямій</td></tr>
  </tbody></table></div>
  <div class="warn"><b>Це оцінка, а не вирок.</b> Час до загрози обчислено із загроз, які бачить Strażnik. Alert RCB може стосуватися того, чого Strażnik не бачить, — тоді часу насправді менше. Коли прийшов Alert RCB або чути сирени, не рахуйте хвилин: дійте за повідомленням. Коли тривога в Strażnik спирається лише на непрямі джерела (наприклад, медіа), GROTA не оцінює «встигнете / не встигнете» і не підганяє.</div>
  <h3>Коли GPS не працює, неточний або показує іншу країну</h3>
  <ul>
    <li><b>Визначення позиції триває:</b> не чекайте — натисніть <kbd>Я в: Дім</kbd>, введіть адресу або <kbd>Вказати на мапі</kbd>.</li>
    <li><b>Немає дозволу на геолокацію:</b> GROTA підкаже, де його ввімкнути (Налаштування → Застосунки → Strażnik → Дозволи → Геодані); доти ви вибираєте місце вручну.</li>
    <li><b>Дуже приблизна позиція</b> (наприклад ±3 км): GROTA запитає, чи вибрати місце, чи <kbd>Усе одно показати</kbd>, і позначить результат як приблизний.</li>
    <li><b>Поза Польщею:</b> GROTA знає лише пункти в Польщі, тому замість маршруту пише «Ви поза зоною даних Grota.». Якщо ви в Польщі біля самого кордону, а телефон показав інший берег річки, вкажіть позицію вручну.</li>
  </ul>
  {shots(fig("g21-teraz-jestem-w", "ЗАРАЗ під час визначення позиції: Визначаю вашу позицію…, Не хочете чекати? Виберіть, де ви: Я в Дім, Робота, поле адреси і Вказати на мапі", "Не чекайте на GPS: <kbd>Я в: Дім</kbd>."),
         fig("g10-poza-zasiegiem", "Повідомлення Ви поза зоною даних Grota для позиції у Франкфурті-на-Одері з вибором місця", "Поза Польщею: повідомлення замість маршруту."))}
  <p><b>Коли <kbd>ВЕСТИ</kbd> нічого не робить</b> (немає Google Maps або інтернету): на картці пункту натисніть <kbd>Накреслити маршрут тут, на мапі Grota</kbd>. GROTA накреслить орієнтовний маршрут з того, що є в телефоні, — вулицями з офлайн-мапою, без неї по прямій.</p>
"""),
        ("umowione", "3. Домовлене місце", f"""
  <p>Якщо ви домовилися з близькими про конкретне місце зустрічі, введіть його в картці <b>«Домовлене місце»</b> внизу ЗАРАЗ: <kbd>Вказати місце</kbd> → адреса або точка на мапі. GROTA покаже відстань і час пішки й автомобілем, маршрут (<kbd>Показати маршрут</kbd>, <kbd>Вести</kbd>) і попередить, якщо місце задалеко, щоб устигнути. <kbd>Видалити</kbd> прибирає його.</p>
  {shots(fig("g09-umowione", "Картка Домовлене місце: Dworzec Lublin (вокзал Люблін), 1,4 км, пішки близько 22 хв, автомобілем близько 4 хв, з попередженням", "Домовлене місце з попередженням."))}
"""),
        ("mapa", "4. Вкладка Мапа", f"""
  <p>Мапа показує всі пункти в Польщі. <b>Колір крапки</b> — доступ (зелений — цілодобово, помаранчевий — у визначені години, синій — на вимогу), а <b>обведення</b> — наскільки певне розташування (сіре — перевірене, жовте — перевірити, червоне — сумнівне). Кнопки на мапі: <kbd>+</kbd>/<kbd>−</kbd> масштаб, місяць/сонце перемикає світлу й темну мапу, приціл показує вашу позицію.</p>
  <p><b>Торкніться крапки</b> — під мапою з'явиться картка пункту: адреса, гміна, тип будівлі (з OpenStreetMap), доступ з поясненням, відстань і час, певність розташування, знімок згори, <kbd>Вести</kbd>, <kbd>Street View</kbd> і <kbd>Накреслити маршрут тут, на мапі Grota</kbd>. Якщо у вас є збережені місця, побачите також <b>«Зберегти як укриття для:»</b> з кнопками ваших місць.</p>
  {shots(fig("g11-mapa", "Вкладка Мапа: крапки укриттів у Старому місті Любліна, картка Чому тут немає «сховищ»? і Фільтри й вигляд", "Мапа з пунктами."),
         fig("g12-mapa-punkt", "Картка вибраного пункту: ul. Złota 2, Lublin, У визначені години, відстань, розташування перевірене, знімок згори", "Картка пункту зі знімком згори."),
         fig("g15-mapa-ciemna", "Та сама мапа в темному режимі", "Темна мапа (місяць/сонце)."))}
  <h3>Фільтри й вигляд</h3>
  <p><kbd>Фільтри й вигляд</kbd> під мапою дозволяє показати лише вибрані пункти: за доступом (<kbd>Цілодобово</kbd>, <kbd>У години</kbd>, <kbd>На вимогу</kbd>), за певністю розташування (<kbd>Перевірені</kbd>, <kbd>Перевірити</kbd>, <kbd>Сумнівні</kbd>) і за <b>типом будівлі</b> (11 груп, наприклад підземні паркінги, багатоквартирні будинки, школи, лікарні). Кожна кнопка вмикає або вимикає свою групу; <kbd>Показати всі</kbd> позначає все, а натиснута ще раз — знімає позначки. Тут також вибираєте <kbd>Пішки</kbd>, <kbd>Велосипед</kbd> або <kbd>Автомобіль</kbd>.</p>
  {shots(fig("g13-mapa-filtry", "Фільтри: Цілодобово, У години, На вимогу, Перевірені, Перевірити, Сумнівні з кількостями", "Фільтри доступу і певності."),
         fig("g14-mapa-rodzaje", "Тип будівлі (за OpenStreetMap): підземні паркінги, торгові центри, вокзали, багатоквартирні будинки, будинки, школи, лікарні, установи, офіси, культура, невідомий", "Тип будівлі."))}
  <div class="note">Фільтр мапи діє <b>лише на мапу</b>. ЗАРАЗ завжди шукає серед усіх перевірених пунктів, якщо ви самі не звузили вибір у «Вести до пунктів».</div>
  <p><b>Чому тут немає «сховищ»?</b> Під час першого відкриття GROTA пояснює, що публічні дані PSP не розрізняють сховище, укриття і тимчасове місце захисту, а повний реєстр за законом не є публічним. <kbd>Пояснення й джерела</kbd> веде до Правил.</p>
"""),
        ("miejsca", "5. Вкладка Місця — підготуйтеся заздалегідь", f"""
  <p>Тут ви зберігаєте свої постійні місця — дім, роботу, школу дитини, родину — і <b>заздалегідь вибираєте для них укриття</b>. Під час тривоги досить натиснути <kbd>Я в: Дім</kbd> — і результат одразу, навіть без GPS. Місця зберігаються лише в цьому телефоні.</p>
  <h3>Додавання місця</h3>
  <ol>
    <li>У <b>«Додати місце»</b> виберіть вид: <kbd>Дім</kbd>, <kbd>Робота</kbd>, <kbd>Школа / університет</kbd>, <kbd>Дитсадок / ясла</kbd>, <kbd>Родина / близькі</kbd>, <kbd>Дача / будиночок</kbd> або <kbd>Інше</kbd>.</li>
    <li>Введіть назву й адресу, потім <kbd>Шукати</kbd> — або <kbd>Моя позиція</kbd> / <kbd>Вказати на мапі</kbd>.</li>
    <li>Торкніться плитки місця і в <b>«Виберіть укриття»</b> позначте до трьох пунктів зі списку найближчих.</li>
  </ol>
  {shots(fig("g16-miejsca", "Мої постійні місця: Дім — укриття 2/3, записані маршрути 1, пішки; Робота — укриття 0/3", "Список місць."),
         fig("g20-dodaj-miejsce", "Нове місце: Школа / університет, поля назви й адреси, Шукати, Моя позиція, Вказати на мапі", "Додавання місця."),
         fig("g19-miejsce-wybor", "Виберіть укриття: фільтр і список найближчих пунктів із прапорцями", "Вибір до трьох укриттів."))}
  <h3>Подробиці, нотатки й редагування</h3>
  <p>У подробицях місця видно розташування, <b>«Моє місце в будівлі»</b> (наприклад «коридор на першому поверсі, без вікон» — де сховатися, якщо не встигнете вийти) і вибрані укриття. Біля кожного укриття є поле <b>«Як увійти — години, хто відчиняє, контакт управителя (ваша нотатка)»</b>. Його варто заповнити після розмови з управителем. Олівець відкриває редагування: назва, розташування, вид, ваше місце в будівлі з прапорцем <b>«Я перевірив це місце на місці»</b>, короткий список підготовки і спосіб пересування. Зміни зберігаються самі. Кошик видаляє місце, а ручка ⋮⋮ змінює порядок.</p>
  {shots(fig("g17-miejsce-szczegoly", "Подробиці місця Дім: розташування, моє місце в будівлі, перевірене; пересування пішки", "Подробиці місця."),
         fig("g18-miejsce-schronienia", "Мої укриття 2/3: ul. Złota 2 з нотаткою і записаним маршрутом", "Укриття з нотаткою і записаним маршрутом."))}
  <h3>Запишіть свій маршрут</h3>
  <p>Для кожного укриття можна <b>записати маршрут, пройшовши його один раз спокійно</b>: <kbd>Записати свій маршрут</kbd>, ідіть, а наприкінці <kbd>Завершити й зберегти</kbd>. Під час запису екран має бути ввімкнений. Під час тривоги, коли ви не далі ніж за 300 м від цього місця, GROTA покаже ваш помаранчевий маршрут замість обчисленого — з проходами і скороченнями, яких немає на мапі.</p>
  <div class="note">Якщо змінити адресу місця більш ніж на 3 км (переїзд), GROTA запитає, чи видалити укриття зі старого району. Адреса без точного номера будинку дає приблизне розташування, позначене на плитці.</div>
"""),
        ("przygotuj", "6. Вкладка Підготовка", f"""
  <h3 id="offline">Офлайн-мапа — на випадок відсутності інтернету</h3>
  <p>Під час тривоги мережа буває перевантажена. <b>Пункти укриття й відстані працюють завжди</b>, бо перелік є в телефоні. Щоб бачити вулиці й мати маршрут без інтернету, завантажте мапу заздалегідь:</p>
  <ol>
    <li>Виберіть район: <kbd>Навколо місця</kbd> (25, 50 або 75 км навколо вашої позиції чи збереженого місця), <kbd>Воєводство</kbd> або <kbd>Уся Польща</kbd> (близько 2 ГБ — лише через Wi-Fi).</li>
    <li>Виберіть, що завантажити: <kbd>Мапа й маршрути</kbd> (рекомендовано; лише з цим варіантом GROTA поведе без інтернету і в селі) або <kbd>Лише мапа</kbd> (менше, але без інтернету замість маршруту буде пряма лінія).</li>
    <li>Натисніть <kbd>Завантажити мапу</kbd>. GROTA заздалегідь показує, скільки завантажить і скільки місця займе. Не закривайте застосунок під час завантаження; перерване завантаження потім докачує лише решту.</li>
    <li><kbd>Перевірити без інтернету</kbd> імітує відсутність мережі, щоб ви побачили, що працюватиме. <kbd>Завершити тест</kbd> повертає звичайну роботу.</li>
  </ol>
  {shots(fig("g22-przygotuj-offline", "Картка Мапа офлайн: завантажена мапа працює без інтернету і звільняє зв'язок для інших", "Офлайн-мапа — навіщо."),
         fig("g23-offline-gotowe", "Мапа офлайн ✓: завантажене воєводство; вибір Навколо місця, Воєводство, Уся Польща; Мапа й маршрути, Лише мапа", "Вибір району; мапа готова."),
         fig("g24-offline-test", "Банер тесту без інтернету з кнопкою Завершити тест", "<kbd>Перевірити без інтернету</kbd>."))}
  <p>Розміри: воєводство — від кількох десятків до кількох сотень МБ (точне число показує список), уся Польща — близько 2 ГБ. Завантажену мапу видаляєте кнопкою <kbd>Видалити</kbd> в тій самій картці. Офлайн-мапа — це ще й <b>місце для інших</b>: кожен, хто має її в телефоні, не навантажує сервер під час тривоги.</p>
  <h3>Списки підготовки</h3>
  <p>Нижче — <b>7 списків</b>, процитованих з «Порадника безпеки»: <b>Будинок або квартира</b>, <b>Домашні запаси щонайменше на 3 дні</b>, <b>Тривожний рюкзак</b>, <b>План на випадок кризи</b>, <b>Робота</b>, <b>Школа</b> і <b>Люди, які потребують особливої допомоги</b> — разом 36 пунктів. <kbd>Відкрити</kbd> розгортає список; позначайте, що вже маєте. Рамка списку червона, коли зроблено менше 40 %, жовта в процесі і зелена, коли все готово. Прогрес зберігається лише в телефоні.</p>
  {shots(fig("g25-przygotuj-listy", "Списки підготовки з лічильниками", "Списки з лічильниками."),
         fig("g26-lista-otwarta", "Відкритий список Домашні запаси щонайменше на 3 дні з позначеними пунктами", "Розгорнутий список."))}
"""),
        ("zasady", "7. Вкладка Правила", f"""
  <p>GROTA не створює власних процедур. Кожна порада у вкладці <kbd>Правила</kbd> — цитата з польського урядового «Порадника безпеки» («Poradnik bezpieczeństwa», 1/2025) з номером сторінки: що робити, почувши сигнал тривоги, повітряна атака, укриття (що робити, якщо не встигаєте), евакуація, підготовка оточення і план на випадок кризи. Далі пояснення: чого порадник не визначає, чому в GROTA немає «сховищ», обмеження даних, звідки беруться зміщені пункти, і джерела. <kbd>Закрити</kbd> повертає до попередньої вкладки.</p>
"""),
        ("jezyk", "8. Мова GROTA", f"""
  <p>GROTA працює <b>українською, англійською та польською</b>. Мову вона вибирає в такому порядку:</p>
  <ol>
    <li>мова, вибрана в GROTA: <kbd>Правила</kbd> → картка <b>«Język · Language · Мова»</b> → <kbd>Polski</kbd>, <kbd>English</kbd> або <kbd>Українська</kbd>;</li>
    <li>якщо не вибрано — мова Strażnik (⚙ → Aplikacja → мова: польська або англійська);</li>
    <li>якщо й цього не налаштовано — мова телефону: українська дає українську, будь-яка інша, крім польської, — англійську.</li>
  </ol>
  <p>Зміна діє одразу, без перезапуску. Цитати з «Порадника безпеки» українською — наш переклад; під кожною є примітка, що оригінал польською. Адреси й назви місць залишаються польською, як у переліку PSP. Сам Strażnik (поза GROTA) має польську й англійську версії.</p>
  {shots(fig("g27-zasady", "Вкладка Правила з карткою Język · Language · Мова вгорі", "Вибір мови в <kbd>Правила</kbd>."))}
"""),
        ("bez-internetu", "9. Що працює без інтернету", """
  <div class="tw"><table><thead><tr><th>Функція</th><th>Без інтернету</th></tr></thead><tbody>
    <tr><td>Пункти укриття, найближчий пункт, відстань</td><td>працює завжди</td></tr>
    <tr><td>Мої місця, нотатки, записані маршрути, списки підготовки</td><td>працює завжди</td></tr>
    <tr><td>Мапа з вулицями</td><td>лише після завантаження офлайн-мапи</td></tr>
    <tr><td>Маршрут дорогами</td><td>лише із завантаженим варіантом <kbd>Мапа й маршрути</kbd>; інакше пряма лінія</td></tr>
    <tr><td>Пошук адреси</td><td>знає лише населені пункти (позиція — центр населеного пункту)</td></tr>
    <tr><td><kbd>ВЕСТИ</kbd> (Google Maps), <kbd>Street View</kbd>, знімок згори</td><td>не працює</td></tr>
  </tbody></table></div>
"""),
        ("pytania", "10. Питання і проблеми", """
  <h3>Це сховища?</h3>
  <p>Невідомо. Публічний перелік PSP не розрізняє сховище, укриття і тимчасове місце захисту, а повний реєстр не є публічним.</p>
  <h3>Чи буде пункт відчинений?</h3>
  <p>GROTA цього не знає. Пункти «на вимогу» зазвичай зачинені, а «у визначені години» — відчинені лише під час роботи будівлі. Запитайте управителя будинку заздалегідь і запишіть відповідь у нотатці «Як увійти» біля свого місця.</p>
  <h3>Чому GROTA веде до дальшого пункту, а не до найближчої крапки?</h3>
  <p>Ближча крапка має сумнівне розташування (шпилька біля будівлі) або не відповідає вибраному виду. GROTA пише про це під пропозицією.</p>
  <h3>Шпилька стоїть на газоні або на парковці.</h3>
  <p>Це помилка у вихідних даних PSP, а не в GROTA. Шукайте будівлю поруч. Помилку можна повідомити гміні або пожежній службі — виправлення в джерелі виправляє її в усіх застосунках.</p>
  <h3><kbd>ВЕСТИ</kbd> нічого не робить.</h3>
  <p>Немає Google Maps або інтернету. Скористайтеся кнопкою <kbd>Накреслити маршрут тут, на мапі Grota</kbd> на картці пункту.</p>
  <h3>Знімок згори довго вантажиться або не з'являється.</h3>
  <p>Він завантажується наживо з Геопорталу GUGiK, який буває повільним — іноді понад десять секунд. Без інтернету знімка немає. У версії 1.7.68 він не з'являвся зовсім; з 1.7.70 працює, також на старших телефонах з Android — оновіть застосунок.</p>
  <h3>Звідки GROTA знає, скільки в мене часу? Чому іноді немає «встигнете / не встигнете»?</h3>
  <p>З тривоги Strażnik — із загроз, які Strażnik бачить. Коли тривога спирається лише на непрямі джерела або Strażnik не знає часу, GROTA не оцінює і не підганяє. Alert RCB може стосуватися того, чого Strażnik не бачить, тож при Alert RCB або сиренах не рахуйте хвилин.</p>
  <h3>Я за кордоном або біля кордону.</h3>
  <p>GROTA знає лише Польщу. Біля кордону, якщо телефон показав інший берег річки, вкажіть позицію вручну.</p>
  <h3>Я змінив адресу дому, і укриття зникли.</h3>
  <p>Так задумано: після зміни адреси більш ніж на 3 км GROTA запитує, чи видалити укриття зі старого району.</p>
  <h3>У мене новий телефон — де мої місця?</h3>
  <p>Місця, нотатки й маршрути зберігаються лише в телефоні, де ви їх записали. На новому додайте їх знову.</p>
  <h3>Як видалити все?</h3>
  <p>Офлайн-мапу — в <kbd>Підготовка</kbd> → <kbd>Видалити</kbd>, місця — кошиком у <kbd>Місця</kbd>, домовлене місце — <kbd>Видалити</kbd>. Усе разом: Налаштування Android → Застосунки → Strażnik → Пам'ять → Очистити дані (це очищає також налаштування Strażnik, наприклад воєводство для тривог).</p>
  <h3>Коли GROTA буде на iPhone?</h3>
  <p>У наступному випуску, після перевірки Apple. На вебсайті GROTA не буде: перелік пунктів — це понад десять МБ даних, які мають сенс у телефоні.</p>
"""),
        ("prywatnosc", "11. Приватність і джерела", """
  <p>GROTA не має облікового запису, реклами чи аналітики. Перелік пунктів і пошук найближчого працюють <b>у телефоні</b>. Місця, нотатки, записані маршрути, списки й офлайн-мапа залишаються в телефоні. За межі телефону йде лише те, що потрібно конкретній функції:</p>
  <ul>
    <li><b>маршрут на мапі</b> — ваша позиція і вибраний пункт ідуть на публічний сервер маршрутів FOSSGIS (OSRM, дані OpenStreetMap);</li>
    <li><b>пошук адреси</b> — введена адреса йде до сервісу GUGiK після натискання «Шукати»;</li>
    <li><b>знімок згори</b> — фрагмент ортофотомапи з Геопорталу (GUGiK) для пункту, який ви переглядаєте;</li>
    <li><b>основа мапи</b> — плитки OpenFreeMap для району, який ви переглядаєте (з офлайн-мапою нічого не надсилається);</li>
    <li><b>пакети офлайн-мапи</b> — завантажуються із сервера Strażnik;</li>
    <li><b>Google Maps і Street View</b> — лише після натискання кнопки.</li>
  </ul>
  <p>Подробиці: <a href="prywatnosc-en.html#location">політика приватності</a> (англійською).</p>
  <p class="source-links">Дані: Головне управління PSP, «Punkty schronienia w Polsce», <a href="https://dane.gov.pl/pl/dataset/28058">dane.gov.pl</a>, CC BY 4.0 · типи будівель: © OpenStreetMap (ODbL) · правила і списки: «Poradnik bezpieczeństwa», уряд Польщі, <a href="https://www.gov.pl/web/poradnikbezpieczenstwa/">gov.pl</a>, CC BY-SA 4.0 (наш переклад) · мапа: <a href="https://openfreemap.org">OpenFreeMap</a>, © OpenStreetMap · маршрути: FOSSGIS (OSRM) · адреси й ортофотомапа: GUGiK.</p>
"""),
    ],
    stopka="""
  <p><b>STRAŻNIK · GROTA</b> — неофіційне додаткове джерело. Не замінює сирен, Alert RCB і повідомлень служб.</p>
  <p><a href="en.html">Посібник Strażnik (англійською)</a> · <a href="zmiany-en.html">Історія змін (англійською)</a> · <a href="prywatnosc-en.html">Політика приватності (англійською)</a> · <a href="grota.html" lang="pl">Instrukcja GROTY po polsku</a> · <a href="grota-en.html" lang="en">GROTA guide in English</a></p>
""",
)


if __name__ == "__main__":
    for L in (PL, EN, UK):
        html = strona(L)
        for plik in re.findall(r'src="(screens/grota/[^"]+)"', html):
            if not (DOCS / plik).exists():
                raise SystemExit(f"Brak zrzutu: {plik}")
        if "@@" in html:
            raise SystemExit(f"Niepodstawiony zrzut w {L['plik']}")
        (DOCS / L["plik"]).write_text(html, encoding="utf-8")
        print(f"zapisano {L['plik']} {len(html) // 1024} KB")
