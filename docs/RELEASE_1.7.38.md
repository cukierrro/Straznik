# Strażnik 1.7.38 — czytelny kurs dronów, puls liczonych obiektów, obwody UA i Bałtyk

- BpSP ma czerwony dziób i czerwony grot przed nim — widać, dokąd leci.
- Obiekt bez znanego kursu nie jest już obracany dziobem na północ: przerywana obwódka i znak zapytania, dla każdego typu.
- Obiekty, które w tej chwili dodają punkty któremuś województwu, pulsują czerwonym pierścieniem.
- Obwód Ukrainy z alarmem powietrznym, który daje punkty, jest delikatnie podświetlony; dotknięcie pokazuje punkty dla województw.
- Litwa, Łotwa, Estonia: działające kanały (LRT, 15min, LSM, ERR). Ogłoszony tam alarm to ślad za 0,12–0,3 pkt, a okno Źródła pokazuje stan kanałów i ostatni alarm.
- Dron rozpoznawczy jest biało-szary, żeby nie mylił się z nowym BpSP.
- Karta drona podaje poprawne odchylenie kursu (było np. 297° zamiast 63°).
- Okno aktualizacji pokazuje pełną listę zmian.

## Dlaczego

13 września Litwa ogłosiła alarm powietrzny dla Wilna, a Strażnik nic nie zanotował:
kanał delfi.lt po zmianie adresu zwracał same nazwy działów, a kolektor miał status
„ok”. Żaden z krajów bałtyckich nie ma publicznego API alarmów, więc śledzimy media
publiczne, które przetytułowują ten sam artykuł z „alarm” na „odwołany”.

Dawny znak BpSP był symetrycznym krzyżykiem — przy małym przybliżeniu nie było widać
przodu, a obiekt bez kursu wyglądał, jakby leciał na północ.
