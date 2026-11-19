package pl.straznik.app;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Łączenie alarmów powiatowych z kilku zapisanych miejsc (etap 3, 19.11.2026).
 *
 * Telefon z miejscami w kilku powiatach dostaje przy jednym zdarzeniu kilka wiadomości —
 * po jednej na temat pow_&lt;TERYT&gt;. Serwer daje każdej KLUCZ ZDARZENIA
 * „&lt;poziom&gt;|&lt;początek sesji alarmowej&gt;” (app/powiaty.py), wspólny dla powiatów
 * jednego zdarzenia. Zasada (decyzja usera 18.11.2026):
 *  - pierwsze powiadomienie dzwoni;
 *  - kolejne tego samego (albo niższego) poziomu w ciągu {@link #OKNO_MS} od dzwonka
 *    dopisują się bez dźwięku;
 *  - wyższy poziom i ponowienie (znacznik `ponowienie`) dzwonią zawsze.
 * Wiadomość bez klucza (województwa, test) dzwoni jak dotąd — ta klasa jej nie dotyka.
 *
 * Czysta Java bez Androida: stan to napis w SharedPreferences, a logikę sprawdza
 * scripts/test_laczenie_powiadomien.cjs, kompilując tę klasę javakiem z Android Studio.
 * Ta sama zasada siedzi w rozszerzeniu powiadomień iOS (NotificationService.swift).
 */
final class Laczenie {
    private Laczenie() {}

    static final long OKNO_MS = 10 * 60 * 1000L;
    /** Wpisy starsze niż tyle wypadają ze stanu. */
    static final long TRZYMAJ_MS = 3 * 60 * 60 * 1000L;
    private static final String SEP_WPIS = "\u001e", SEP_POLE = "\u001f", SEP_MIEJSCE = "\u001d";

    /** Dzwonek dla klucza: kiedy zadzwonił i jakie miejsca od tej chwili dopisano. */
    static final class Wpis {
        long dzwonek;
        final List<String> miejsca = new ArrayList<>();
        Wpis(long dzwonek) { this.dzwonek = dzwonek; }
    }

    static final class Wynik {
        final boolean dzwoni;
        /** Klucz wpisu, do którego dopisano (przy dzwonku — własny). */
        final String kluczGlowny;
        final long dzwonekAt;
        final List<String> miejsca;
        Wynik(boolean dzwoni, String kluczGlowny, long dzwonekAt, List<String> miejsca) {
            this.dzwoni = dzwoni; this.kluczGlowny = kluczGlowny;
            this.dzwonekAt = dzwonekAt; this.miejsca = miejsca;
        }
    }

    static int ranga(String level) {
        if ("high".equals(level)) return 2;
        if ("elevated".equals(level)) return 1;
        return 0;
    }

    /** „elevated|2026-11-17T09:10:00+00:00” → „2026-11-17T09:10:00+00:00” (zdarzenie bez poziomu). */
    static String zdarzenie(String klucz) {
        int i = klucz.indexOf('|');
        return i < 0 ? klucz : klucz.substring(i + 1);
    }

    /**
     * Decyzja dla jednej wiadomości; `stan` zmienia się w miejscu.
     * Poziom bierzemy z pola `level`, nie z klucza — wyższy poziom dzwoni nawet wtedy,
     * gdyby serwer kiedyś zmienił budowę klucza.
     */
    static Wynik decyzja(Map<String, Wpis> stan, String klucz, String level, boolean ponowienie,
                         boolean test, String miejsce, long teraz) {
        for (Iterator<Map.Entry<String, Wpis>> it = stan.entrySet().iterator(); it.hasNext(); ) {
            Wpis w = it.next().getValue();
            if (teraz - w.dzwonek > TRZYMAJ_MS || w.dzwonek - teraz > OKNO_MS) it.remove();
        }
        List<String> tylkoTo = new ArrayList<>();
        if (miejsce != null && !miejsce.isEmpty()) tylkoTo.add(miejsce);
        if (klucz == null || klucz.isEmpty() || test) return new Wynik(true, null, teraz, tylkoTo);
        String wlasny = ranga(level) + "#" + klucz;
        if (!ponowienie) {
            String zd = zdarzenie(klucz);
            for (Map.Entry<String, Wpis> e : stan.entrySet()) {
                String k = e.getKey();
                int hash = k.indexOf('#');
                if (hash < 0) continue;
                int r;
                try { r = Integer.parseInt(k.substring(0, hash)); } catch (NumberFormatException ex) { continue; }
                Wpis w = e.getValue();
                long wiek = teraz - w.dzwonek;
                // wyższy poziom niż wszystko, co dzwoniło — dzwoni
                if (r < ranga(level) || wiek < 0 || wiek >= OKNO_MS) continue;
                if (!zd.equals(zdarzenie(k.substring(hash + 1)))) continue;
                if (miejsce != null && !miejsce.isEmpty() && !w.miejsca.contains(miejsce)) w.miejsca.add(miejsce);
                return new Wynik(false, k, w.dzwonek, new ArrayList<>(w.miejsca));
            }
        }
        Wpis nowy = new Wpis(teraz);
        if (miejsce != null && !miejsce.isEmpty()) nowy.miejsca.add(miejsce);
        stan.put(wlasny, nowy);
        return new Wynik(true, wlasny, teraz, new ArrayList<>(nowy.miejsca));
    }

    static Map<String, Wpis> wczytaj(String zapis) {
        Map<String, Wpis> stan = new LinkedHashMap<>();
        if (zapis == null || zapis.isEmpty()) return stan;
        for (String wpis : zapis.split(SEP_WPIS)) {
            String[] p = wpis.split(SEP_POLE, -1);
            if (p.length < 2) continue;
            try {
                Wpis w = new Wpis(Long.parseLong(p[1]));
                if (p.length > 2 && !p[2].isEmpty())
                    for (String m : p[2].split(SEP_MIEJSCE)) if (!m.isEmpty()) w.miejsca.add(m);
                stan.put(p[0], w);
            } catch (NumberFormatException ignored) {}
        }
        return stan;
    }

    static String zapisz(Map<String, Wpis> stan) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Wpis> e : stan.entrySet()) {
            if (sb.length() > 0) sb.append(SEP_WPIS);
            sb.append(e.getKey()).append(SEP_POLE).append(e.getValue().dzwonek).append(SEP_POLE);
            // bez String.join — to API 26, a minSdk to 24
            List<String> m = e.getValue().miejsca;
            for (int i = 0; i < m.size(); i++) sb.append(i > 0 ? SEP_MIEJSCE : "").append(m.get(i));
        }
        return sb.toString();
    }
}
