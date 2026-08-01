package pl.straznik.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Silnik fuzji dla usługi w tle — ta sama reguła co w backendzie i engine.js:
 * okno 60 min, pełna waga przez 30 min, potem liniowe wygaszanie; limit wkładu
 * jednej klasy źródła; progi 2 / 4 pkt.
 *
 * Stan trzymamy w SharedPreferences, żeby przetrwał ubicie procesu przez system.
 */
class Fusion {
    static final int WINDOW_MIN = 60, FULL_MIN = 30;
    static final double TH_ELEVATED = 2.0, TH_HIGH = 4.0;
    static final long COOLDOWN_MS = 10 * 60 * 1000L;

    /* Propagacja kaskadowa — te same reguły co w backendzie i engine.js:
       każdy kolejny krąg sąsiedztwa dostaje 40% tego, co poprzedni. */
    static final double SPILLOVER_FACTOR = 0.4, SPILLOVER_MIN = 2.0;
    static final double SPILLOVER_MIN_CONTRIB = 0.1;
    static final int SPILLOVER_MAX_DEPTH = 5;

    /** Sąsiedztwo po indeksach w Sources.VOIVS (kopia VOIV_NEIGHBORS z backendu). */
    private static final int[][] NEIGHBORS = {
        /* 0  lubelskie          */ {1, 4, 3, 2},
        /* 1  podkarpackie       */ {5, 4, 0},
        /* 2  podlaskie          */ {6, 3, 0},
        /* 3  mazowieckie        */ {6, 2, 0, 4, 7, 9},
        /* 4  świętokrzyskie     */ {7, 3, 0, 1, 5, 8},
        /* 5  małopolskie        */ {8, 4, 1},
        /* 6  warmińsko-mazurskie*/ {10, 9, 3, 2},
        /* 7  łódzkie            */ {3, 9, 13, 15, 8, 4},
        /* 8  śląskie            */ {15, 7, 4, 5},
        /* 9  kujawsko-pomorskie */ {10, 6, 3, 7, 13},
        /* 10 pomorskie          */ {11, 13, 9, 6},
        /* 11 zachodniopomorskie */ {10, 13, 12},
        /* 12 lubuskie           */ {11, 13, 14},
        /* 13 wielkopolskie      */ {11, 10, 9, 7, 15, 14, 12},
        /* 14 dolnośląskie       */ {12, 13, 15},
        /* 15 opolskie           */ {14, 13, 7, 8},
    };

    private static final String PREFS = "straznik_bg";
    private static final String KEY_SIGNALS = "signals";
    private static final String KEY_SEEN = "seen";
    private static final String KEY_LEVEL = "levels";
    private static final String KEY_NOTIF = "notif";

    static class Signal {
        final String source; final int voiv; final double points;
        final String title; final String key; long ts;
        Signal(String source, int voiv, double points, String title, String key) {
            this.source = source; this.voiv = voiv; this.points = points;
            this.title = title; this.key = key; this.ts = System.currentTimeMillis();
        }
    }

    static class Result {
        final double[] scores = new double[Sources.VOIVS.length];
        final String[] levels = new String[Sources.VOIVS.length];
        final List<String>[] reasons = new List[Sources.VOIVS.length];
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Dopisuje nowe sygnały (z deduplikacją) i zwraca liczbę faktycznie dodanych. */
    static int ingest(Context c, List<Signal> incoming, boolean bootstrapOnly) {
        if (incoming == null || incoming.isEmpty()) return 0;
        SharedPreferences p = prefs(c);
        int added = 0;
        try {
            JSONArray seen = new JSONArray(p.getString(KEY_SEEN, "[]"));
            JSONObject seenMap = new JSONObject();
            for (int i = 0; i < seen.length(); i++) seenMap.put(seen.getString(i), true);
            JSONArray sigs = new JSONArray(p.getString(KEY_SIGNALS, "[]"));

            for (Signal s : incoming) {
                if (seenMap.has(s.key)) continue;
                seenMap.put(s.key, true);
                if (bootstrapOnly) continue;   // pierwszy przebieg tylko zapamiętuje
                JSONObject o = new JSONObject();
                o.put("src", s.source); o.put("v", s.voiv); o.put("p", s.points);
                o.put("t", s.ts); o.put("title", s.title);
                // klucz deduplikacji wędruje razem z sygnałem: aplikacja wczytuje
                // sygnały usługi (patrz BackgroundPlugin.signals) i bez klucza
                // nie umiałaby odróżnić tego samego zdarzenia od nowego
                o.put("k", s.key);
                sigs.put(o);
                added++;
            }
            // sprzątanie: sygnały starsze niż okno + zapas, klucze starsze niż doba
            long cut = System.currentTimeMillis() - (WINDOW_MIN + 30) * 60_000L;
            JSONArray kept = new JSONArray();
            for (int i = 0; i < sigs.length(); i++) {
                JSONObject o = sigs.getJSONObject(i);
                if (o.getLong("t") >= cut) kept.put(o);
            }
            JSONArray seenOut = new JSONArray();
            java.util.Iterator<String> it = seenMap.keys();
            int n = 0;
            while (it.hasNext() && n++ < 800) seenOut.put(it.next());

            p.edit().putString(KEY_SIGNALS, kept.toString())
                    .putString(KEY_SEEN, seenOut.toString()).apply();
        } catch (Exception ignored) {}
        return added;
    }

    /**
     * Surowe sygnały usługi w formacie zrozumiałym dla silnika w WebView.
     *
     * Aplikacja i usługa liczyły dotąd punkty z dwóch niezależnych zbiorów:
     * usługa ze SharedPreferences, aplikacja z localStorage. Efekt był taki,
     * że pasek powiadomień pokazywał punkty, o których aplikacja nic nie
     * wiedziała (i odwrotnie). Odkąd usługa działa, to ona ma komplet sygnałów
     * — aplikacja je stąd wczytuje i scala ze swoimi po kluczu `key`.
     */
    static JSONArray export(Context c) {
        JSONArray out = new JSONArray();
        try {
            JSONArray sigs = new JSONArray(prefs(c).getString(KEY_SIGNALS, "[]"));
            for (int i = 0; i < sigs.length(); i++) {
                JSONObject o = sigs.getJSONObject(i);
                int v = o.optInt("v", -1);
                if (v < 0 || v >= Sources.VOIVS.length) continue;
                String key = o.optString("k", "");
                if (key.isEmpty()) continue;   // rekord sprzed tej wersji — bez klucza nie scalimy
                JSONObject e = new JSONObject();
                e.put("source", o.optString("src"));
                e.put("voivodeship", Sources.VOIVS[v]);
                e.put("points", o.optDouble("p", 0));
                e.put("t", o.optLong("t", 0));
                e.put("title", o.optString("title"));
                e.put("key", key);
                out.put(e);
            }
        } catch (Exception ignored) {}
        return out;
    }

    static Result evaluate(Context c) {
        Result r = new Result();
        for (int i = 0; i < r.levels.length; i++) { r.levels[i] = "none"; r.reasons[i] = new ArrayList<>(); }
        try {
            JSONArray sigs = new JSONArray(prefs(c).getString(KEY_SIGNALS, "[]"));
            Map<String, Double> perSource = new HashMap<>();
            long now = System.currentTimeMillis();
            for (int i = 0; i < sigs.length(); i++) {
                JSONObject o = sigs.getJSONObject(i);
                int v = o.getInt("v");
                if (v < 0 || v >= r.scores.length) continue;
                double pts = o.getDouble("p");
                double ageMin = (now - o.getLong("t")) / 60000.0;
                if (ageMin > WINDOW_MIN) continue;

                String src = o.getString("src");
                String k = v + "|" + src;
                // Neptun ma wyższy limit niż reszta (każdy track to osobny obiekt),
                // ale nie nieograniczony — przy kilkudziesięciu obiektach suma i tak
                // dawno przekroczyła próg alarmu
                double cap = "media".equals(src) || "rcb".equals(src) ? 2.0
                           : "adsb".equals(src) || "pansa".equals(src) ? 1.0
                           : "neptun".equals(src) ? 8.0 : Double.MAX_VALUE;
                double already = perSource.containsKey(k) ? perSource.get(k) : 0.0;
                double counted = Math.max(0, Math.min(cap - already, pts));
                perSource.put(k, already + pts);

                double w = ageMin <= FULL_MIN ? 1.0
                    : Math.max(0, 1 - (ageMin - FULL_MIN) / (double) (WINDOW_MIN - FULL_MIN));
                counted *= w;
                if (counted <= 0) continue;
                r.scores[v] += counted;
                r.reasons[v].add("• " + o.getString("title"));
            }
        } catch (Exception ignored) {}

        // Propagacja kaskadowa: zdarzenie na wschodzie podnosi czujność najpierw
        // u sąsiadów, potem słabiej w kolejnych kręgach, aż po ścianę zachodnią.
        double[] base = r.scores.clone();
        for (int src = 0; src < base.length; src++) {
            if (base[src] < SPILLOVER_MIN) continue;
            int[] depth = cascadeDepths(src);
            for (int t = 0; t < depth.length; t++) {
                if (depth[t] <= 0) continue;
                double spill = Math.round(base[src] * Math.pow(SPILLOVER_FACTOR, depth[t]) * 10) / 10.0;
                if (spill < SPILLOVER_MIN_CONTRIB) continue;
                r.scores[t] += spill;
                r.reasons[t].add("• Przeniesienie z woj. " + Sources.VOIVS[src]
                    + " (" + base[src] + " pkt, "
                    + (depth[t] == 1 ? "sąsiad" : depth[t] + ". krąg") + ")");
            }
        }

        for (int i = 0; i < r.scores.length; i++) {
            r.scores[i] = Math.round(r.scores[i] * 10) / 10.0;
            r.levels[i] = r.scores[i] >= TH_HIGH ? "high"
                        : r.scores[i] >= TH_ELEVATED ? "elevated" : "none";
        }
        return r;
    }

    /**
     * Odległość w krokach sąsiedztwa od `src` do każdego województwa (BFS).
     * 0 oznacza samo źródło albo brak połączenia — liczy się najkrótsza droga,
     * bo to ona decyduje, jak mocno sygnał osłabnie, zanim tam dotrze.
     */
    private static int[] cascadeDepths(int src) {
        int[] depth = new int[NEIGHBORS.length];
        boolean[] seen = new boolean[NEIGHBORS.length];
        seen[src] = true;
        List<Integer> frontier = new ArrayList<>();
        frontier.add(src);
        for (int d = 1; d <= SPILLOVER_MAX_DEPTH && !frontier.isEmpty(); d++) {
            List<Integer> next = new ArrayList<>();
            for (int node : frontier)
                for (int nb : NEIGHBORS[node]) {
                    if (seen[nb]) continue;
                    seen[nb] = true;
                    depth[nb] = d;
                    next.add(nb);
                }
            frontier = next;
        }
        return depth;
    }

    private static final String KEY_HOME = "home_voiv";
    /** Bez wybranego regionu pilnujemy ściany wschodniej — tam ryzyko jest największe. */
    private static final int[] DEFAULT_WATCH = {0, 1, 2, 6};

    static void setHomeVoivodeship(Context c, String name) {
        prefs(c).edit().putString(KEY_HOME, name == null ? "" : name).apply();
    }

    /**
     * Czy alarmować o tym województwie.
     *
     * Odkąd fuzja obejmuje całą Polskę, powiadamianie o każdym z 16 regionów
     * zasypałoby telefon alertami o zdarzeniach po drugiej stronie kraju.
     * Alarmujemy więc o regionie użytkownika — a że kaskada dolicza mu wkład
     * z sąsiedztwa, zdarzenie na wschodzie i tak podniesie jego poziom.
     */
    private static boolean watched(Context c, int voiv) {
        String home = prefs(c).getString(KEY_HOME, "");
        if (home != null && !home.isEmpty()) {
            for (int i = 0; i < Sources.VOIVS.length; i++)
                if (Sources.VOIVS[i].equalsIgnoreCase(home)) return i == voiv;
        }
        for (int d : DEFAULT_WATCH) if (d == voiv) return true;
        return false;
    }

    /** Zwraca true, gdy poziom właśnie wzrósł i minął cooldown (czyli: powiadom). */
    static boolean shouldNotify(Context c, int voiv, String level) {
        if ("none".equals(level)) { setLevel(c, voiv, level); return false; }
        if (!watched(c, voiv)) { setLevel(c, voiv, level); return false; }
        SharedPreferences p = prefs(c);
        String prev = levelOf(p.getString(KEY_LEVEL, ""), voiv);
        int prevRank = rank(prev), newRank = rank(level);
        setLevel(c, voiv, level);
        if (newRank <= prevRank) return false;
        long last = p.getLong(KEY_NOTIF + voiv + level, 0);
        if (System.currentTimeMillis() - last < COOLDOWN_MS) return false;
        p.edit().putLong(KEY_NOTIF + voiv + level, System.currentTimeMillis()).apply();
        return true;
    }

    private static int rank(String l) {
        return "high".equals(l) ? 2 : "elevated".equals(l) ? 1 : 0;
    }

    private static String levelOf(String packed, int voiv) {
        String[] parts = packed.split(",");
        return voiv < parts.length && !parts[voiv].isEmpty() ? parts[voiv] : "none";
    }

    private static void setLevel(Context c, int voiv, String level) {
        SharedPreferences p = prefs(c);
        String[] parts = p.getString(KEY_LEVEL, "").split(",");
        String[] out = new String[Sources.VOIVS.length];
        for (int i = 0; i < out.length; i++)
            out[i] = i < parts.length && !parts[i].isEmpty() ? parts[i] : "none";
        out[voiv] = level;
        p.edit().putString(KEY_LEVEL, String.join(",", out)).apply();
    }
}
