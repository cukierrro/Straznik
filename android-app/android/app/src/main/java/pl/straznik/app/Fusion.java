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
                double cap = "media".equals(src) || "rcb".equals(src) ? 2.0
                           : "adsb".equals(src) || "pansa".equals(src) ? 1.0 : Double.MAX_VALUE;
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

        // propagacja do sąsiadów pominięta w tle — usługa pilnuje wyłącznie
        // województw przygranicznych, dla nich liczy się sygnał własny
        for (int i = 0; i < r.scores.length; i++) {
            r.scores[i] = Math.round(r.scores[i] * 10) / 10.0;
            r.levels[i] = r.scores[i] >= TH_HIGH ? "high"
                        : r.scores[i] >= TH_ELEVATED ? "elevated" : "none";
        }
        return r;
    }

    /** Zwraca true, gdy poziom właśnie wzrósł i minął cooldown (czyli: powiadom). */
    static boolean shouldNotify(Context c, int voiv, String level) {
        if ("none".equals(level)) { setLevel(c, voiv, level); return false; }
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
