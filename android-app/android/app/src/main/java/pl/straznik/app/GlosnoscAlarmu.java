package pl.straznik.app;

/**
 * Decyzje o głośności „Alarmy” wokół czerwonego alarmu — bez Androida, żeby dało się
 * je sprawdzić testem (scripts/test_glosnosc_budzika.py).
 *
 * Zgłoszenie z opinii w Google Play (20.11.2026, Motorola edge 70, 1.8.09): po wyciszeniu
 * alarmu w aplikacji systemowy budzik został wyciszony. Do 1.8.13 zapisana głośność „sprzed
 * alarmu” zostawała w pamięci, gdy jej przywrócenie nie doszło do skutku (np. system zamknął
 * aplikację w trakcie alarmu). Następny alarm jej nie nadpisywał, a po nim aplikacja
 * ustawiała głośność sprzed wielu godzin — choćby 0 z nocy — choć użytkownik zdążył ją
 * w międzyczasie zmienić.
 *
 * Od 1.8.14 zapisujemy też głośność, którą ustawiła aplikacja, i porównujemy z nią:
 * jeżeli obecna jest inna, ktoś ją zmienił ręcznie i jego wybór wygrywa.
 */
final class GlosnoscAlarmu {
    private GlosnoscAlarmu() {}

    static final int BRAK = -1;

    /**
     * Przy podnoszeniu głośności: czy zapisać obecną jako „sprzed alarmu”.
     * Stary zapis zostaje tylko wtedy, gdy obecna głośność to wciąż ta ustawiona przez
     * aplikację (alarm za alarmem, bez przywrócenia pomiędzy). Zapis bez znanej głośności
     * ustawionej przez aplikację (z wersji do 1.8.13) traktujemy jak nieaktualny.
     */
    static boolean zapisac(int zapisana, int ustawionaPrzezNas, int obecna) {
        return zapisana == BRAK || ustawionaPrzezNas == BRAK || obecna != ustawionaPrzezNas;
    }

    /**
     * Przy wyciszeniu: czy przywrócić zapisaną głośność. Tylko gdy obecna to wciąż ta
     * ustawiona przez aplikację — inaczej użytkownik zmienił ją sam i tak zostaje.
     */
    static boolean przywrocic(int zapisana, int ustawionaPrzezNas, int obecna) {
        return zapisana != BRAK && ustawionaPrzezNas != BRAK && obecna == ustawionaPrzezNas;
    }
}
