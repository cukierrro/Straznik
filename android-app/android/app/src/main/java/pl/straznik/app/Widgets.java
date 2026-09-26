package pl.straznik.app;

import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Widżet na ekranie głównym: STAN obserwowanych województw, nie alarm.
 *
 * Alarmem jest powiadomienie z syreną ({@link Alarms}). Widżet tylko pokazuje, co
 * serwer liczy teraz, i zawsze mówi, że źródło jest nieoficjalne. Tekst poziomu
 * bierze się z `alert_level` — tego samego, od którego zależy powiadomienie — żeby
 * żółte pole na mapie podniesione wyłącznie przez sąsiadów nigdy nie wyglądało na
 * alarm (przeniesienia-alert-level).
 *
 * Odświeżanie bez usługi w tle (ta została celowo wycofana):
 *  - od razu, gdy przyjdzie push alarmowy ({@link StraznikFcmService}),
 *  - co ~30 min zadaniem JobScheduler z wymogiem sieci ({@link WidgetRefreshJob}),
 *  - po zmianie obserwowanych województw w aplikacji.
 * Zapytanie idzie z ETagiem — przy niezmienionym stanie Cloudflare odpowiada 304
 * bez treści, więc tysiące widżetów nie obciążają serwera.
 */
final class Widgets {
    private static final String TAG = "StraznikWidget";
    static final String STATE_URL = "https://straznik.eu/api/state";

    /** Dane starsze niż to widżet szarzeje — nie udaje spokoju na starych danych. */
    static final long STALE_AFTER_MS = 45 * 60 * 1000L;
    /** Najbliższy obiekt pokazujemy tylko wtedy, gdy jest bliżej granicy niż to. */
    static final double NEAR_MAX_KM = 400;
    /** Ile obiektów zapisujemy na mapę widżetu (reszta i tak nie zmieści się czytelnie). */
    static final int MAX_OBIEKTOW = 60;
    static final int JOB_ID = 0x5717;
    static final long PERIOD_MS = 30 * 60 * 1000L;
    static final String NO_WATCHED_HINT =
        "Dotknij i dodaj miejsce z „Obserwuj alerty”";

    // pamięć dostępna przed pierwszym odblokowaniem — push po nocnym restarcie też odświeża widżet
    private static final String KEY_STATE = "widget_state";
    private static final String KEY_ETAG = "widget_etag";
    private static final String KEY_CHECKED = "widget_checked_at";

    private static final AtomicBoolean FETCHING = new AtomicBoolean(false);

    private Widgets() {}

    // ── które widżety istnieją ─────────────────────────────────────────────────

    static int[] ids(Context c, Class<?> provider) {
        try {
            return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, provider));
        } catch (Exception e) {
            return new int[0];
        }
    }

    static boolean anyPlaced(Context c) {
        return ids(c, StraznikWidgetSmall.class).length
            + ids(c, StraznikWidgetMapWide.class).length
            + ids(c, StraznikWidgetMapTall.class).length > 0;
    }

    // ── cykliczne odświeżanie ──────────────────────────────────────────────────

    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (js.getPendingJob(JOB_ID) != null) return;
        JobInfo.Builder b = new JobInfo.Builder(JOB_ID, new ComponentName(c, WidgetRefreshJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true);
        // okno elastyczności pozwala systemowi dokleić zadanie do innych wybudzeń (bateria)
        b.setPeriodic(PERIOD_MS, 10 * 60 * 1000L);
        try { js.schedule(b.build()); } catch (Exception e) { Log.w(TAG, "harmonogram", e); }
    }

    static void unscheduleIfUnused(Context c) {
        if (anyPlaced(c)) return;
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(JOB_ID);
    }

    /** Odświeżenie w tle poza wątkiem głównym (np. z aplikacji albo po dodaniu widżetu). */
    static void refreshAsync(Context ctx, Runnable done) {
        final Context c = ctx.getApplicationContext();
        new Thread(() -> {
            try { refreshNow(c); } finally { if (done != null) done.run(); }
        }, "straznik-widget").start();
    }

    /** Pobiera stan i przerysowuje wszystkie widżety. Blokuje — tylko poza wątkiem głównym. */
    static boolean refreshNow(Context c) {
        if (!anyPlaced(c)) return true;
        if (!FETCHING.compareAndSet(false, true)) return true;
        try {
            boolean ok = fetch(c);
            redrawAll(c);
            return ok;
        } finally {
            FETCHING.set(false);
        }
    }

    private static boolean fetch(Context c) {
        SharedPreferences p = Alarms.prefs(c);
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(STATE_URL).openConnection();
            con.setConnectTimeout(7000);
            con.setReadTimeout(8000);
            con.setRequestProperty("User-Agent", "Straznik-Widget/" + versionName(c));
            String etag = p.getString(KEY_ETAG, "");
            // bez zapisanego stanu nie ma czego potwierdzać 304
            if (!etag.isEmpty() && p.contains(KEY_STATE)) con.setRequestProperty("If-None-Match", etag);
            int code = con.getResponseCode();
            if (code == HttpURLConnection.HTTP_NOT_MODIFIED) {
                p.edit().putLong(KEY_CHECKED, System.currentTimeMillis()).apply();
                return true;
            }
            if (code != 200) { Log.w(TAG, "HTTP " + code); return false; }
            String body = readAll(con.getInputStream());
            JSONObject compact = compact(new JSONObject(body));
            p.edit().putString(KEY_STATE, compact.toString())
                .putString(KEY_ETAG, con.getHeaderField("ETag") == null ? "" : con.getHeaderField("ETag"))
                .putLong(KEY_CHECKED, System.currentTimeMillis()).apply();
            return true;
        } catch (Exception e) {
            Log.w(TAG, "pobranie stanu", e);
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > 2_000_000) throw new java.io.IOException("za duża odpowiedź");
            }
            return out.toString("UTF-8");
        } finally {
            in.close();
        }
    }

    private static String versionName(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; }
        catch (Exception e) { return "?"; }
    }

    /**
     * Z pełnego stanu (~40 KB) zostawiamy tylko to, co rysuje widżet: czas, poziomy
     * województw i jedną linijkę o najbliższym obiekcie lecącym w stronę Polski.
     */
    static JSONObject compact(JSONObject state) throws org.json.JSONException {
        JSONObject out = new JSONObject();
        JSONObject fusion = state.optJSONObject("fusion");
        out.put("ts", parseTs(fusion == null ? null : fusion.optString("ts", null)));
        JSONObject voivs = new JSONObject();
        JSONObject src = fusion == null ? null : fusion.optJSONObject("voivodeships");
        if (src != null) {
            for (Iterator<String> it = src.keys(); it.hasNext(); ) {
                String name = it.next();
                JSONObject st = src.optJSONObject(name);
                if (st == null) continue;
                JSONObject v = new JSONObject();
                v.put("score", st.optDouble("score", 0));
                v.put("level", st.optString("level", "none"));
                v.put("alert", st.optString("alert_level", st.optString("level", "none")));
                voivs.put(name, v);
            }
        }
        out.put("voivs", voivs);
        JSONObject neptun = state.optJSONObject("neptun");
        out.put("near", nearest(neptun));
        out.put("obj", obiekty(neptun));
        out.put("ua", alarmyUA(neptun));
        return out;
    }

    /**
     * Obiekty na mapę widżetu — te same pozycje, które rysuje aplikacja. Pozycja
     * przybliżona (środek miejscowości) zostaje oznaczona: mapa rysuje ją pustym
     * krążkiem, żeby nie udawała zmierzonego miejsca.
     */
    static JSONArray obiekty(JSONObject neptun) throws org.json.JSONException {
        JSONArray out = new JSONArray();
        JSONArray threats = neptun == null ? null : neptun.optJSONArray("threats");
        if (threats == null) return out;
        for (int i = 0; i < threats.length() && out.length() < MAX_OBIEKTOW; i++) {
            JSONObject t = threats.optJSONObject(i);
            if (t == null || t.isNull("lat") || t.isNull("lon")) continue;
            JSONObject o = new JSONObject();
            o.put("lon", Math.round(t.optDouble("lon", 0) * 1000) / 1000.0);
            o.put("lat", Math.round(t.optDouble("lat", 0) * 1000) / 1000.0);
            o.put("t", t.optString("type", "unknown"));
            JSONObject pos = t.optJSONObject("straznik_position");
            if (pos != null && "approx".equals(pos.optString("quality"))) o.put("ok", false);
            JSONObject a = t.optJSONObject("pl_assessment");
            if (a != null && a.optBoolean("toward_pl", false)) {
                o.put("pl", true);
                double km = a.optBoolean("inside_pl", false) ? 0 : a.optDouble("dist_km", Double.NaN);
                if (!Double.isNaN(km)) o.put("km", Math.round(km));
            }
            out.put(o);
        }
        return out;
    }

    /** Obwody Ukrainy z aktywnym alarmem — do podświetlenia na mapie, bez punktów. */
    static JSONArray alarmyUA(JSONObject neptun) {
        JSONArray out = new JSONArray();
        if (neptun == null) return out;
        JSONArray punktowane = neptun.optJSONArray("alert_oblasts");
        if (punktowane != null) for (int i = 0; i < punktowane.length(); i++) out.put(punktowane.optString(i, ""));
        JSONArray obszary = neptun.optJSONArray("alert_areas");
        if (obszary != null) for (int i = 0; i < obszary.length(); i++) {
            JSONObject a = obszary.optJSONObject(i);
            if (a == null || !"oblast".equals(a.optString("w"))) continue;
            // „Донецька область" → „Донецька" (tak nazywa je plik konturów)
            String nazwa = a.optString("n", "").replace(" область", "").trim();
            if (!nazwa.isEmpty()) out.put(nazwa);
        }
        return out;
    }

    /** Najbliższy obiekt z NEPTUN-a lecący w stronę Polski, liczony od granicy (jak serwer). */
    static String nearest(JSONObject neptun) {
        JSONArray threats = neptun == null ? null : neptun.optJSONArray("threats");
        if (threats == null) return "";
        JSONObject best = null;
        double bestKm = Double.MAX_VALUE;
        for (int i = 0; i < threats.length(); i++) {
            JSONObject t = threats.optJSONObject(i);
            if (t == null || t.isNull("lat")) continue;
            JSONObject pos = t.optJSONObject("straznik_position");
            // przybliżony rejon zgłoszenia (środek miejscowości) — bez trasy i odległości
            if (pos != null && "approx".equals(pos.optString("quality"))) continue;
            JSONObject a = t.optJSONObject("pl_assessment");
            if (a == null || !a.optBoolean("toward_pl", false)) continue;
            double km = a.optBoolean("inside_pl", false) ? 0 : a.optDouble("dist_km", Double.NaN);
            if (Double.isNaN(km) || km > NEAR_MAX_KM || km >= bestKm) continue;
            best = t;
            bestKm = km;
        }
        if (best == null) return "";
        JSONObject a = best.optJSONObject("pl_assessment");
        String what = typeLabel(best.optString("type", "unknown"));
        if (bestKm <= 0) return "Najbliżej: " + what + " · nad Polską";
        String voiv = a == null ? "" : a.optString("border_voiv", "");
        return "Najbliżej: " + what + " · " + Math.round(bestKm) + " km od granicy"
            + (voiv.isEmpty() ? "" : " (" + voiv + ")");
    }

    static String typeLabel(String type) {
        switch (type) {
            case "shahed": return "dron typu Shahed";
            case "uav": return "dron";
            case "fpv": return "dron FPV";
            case "recon": return "dron rozpoznawczy";
            case "missile": case "cruise": return "rakieta manewrująca";
            case "ballistic": return "rakieta balistyczna";
            case "kab": return "bomba KAB";
            case "mig31k": return "MiG-31K";
            default: return "obiekt powietrzny";
        }
    }

    static long parseTs(String iso) {
        if (iso == null) return 0;
        try {
            // „2026-09-22T06:53:50+00:00” — SimpleDateFormat zamiast java.time (minSdk 24)
            return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.ROOT).parse(iso).getTime();
        } catch (Exception e) {
            return 0;
        }
    }

    // ── push alarmowy ──────────────────────────────────────────────────────────

    /**
     * Push dotarł: od razu wpisujemy jego poziom (bez sieci — w Doze może jej jeszcze
     * nie być), przerysowujemy, a potem próbujemy dociągnąć pełny stan.
     */
    static void onPush(Context c, String voiv, String level, double score, long sentAtMs) {
        if (!anyPlaced(c)) return;
        try {
            SharedPreferences p = Alarms.prefs(c);
            JSONObject st = new JSONObject(p.getString(KEY_STATE, "{}"));
            // spóźniony push nie nadpisuje nowszego stanu z serwera
            if (sentAtMs > 0 && sentAtMs < st.optLong("ts", 0)) { refreshNow(c); return; }
            JSONObject voivs = st.optJSONObject("voivs");
            if (voivs == null) { voivs = new JSONObject(); st.put("voivs", voivs); }
            JSONObject v = voivs.optJSONObject(voiv);
            if (v == null) { v = new JSONObject(); voivs.put(voiv, v); }
            v.put("alert", level);
            if (rank(v.optString("level", "none")) < rank(level)) v.put("level", level);
            v.put("score", score);
            long ts = sentAtMs > 0 ? sentAtMs : System.currentTimeMillis();
            if (ts > st.optLong("ts", 0)) st.put("ts", ts);
            // stan z pushem różni się od tego pod zapisanym ETagiem — następne pobranie musi być pełne
            p.edit().putString(KEY_STATE, st.toString()).remove(KEY_ETAG).apply();
        } catch (Exception e) {
            Log.w(TAG, "zapis pusha", e);
        }
        redrawAll(c);
        refreshNow(c);
    }

    static int rank(String level) {
        return "high".equals(level) ? 2 : "elevated".equals(level) ? 1 : 0;
    }

    // ── rysowanie ──────────────────────────────────────────────────────────────

    /** Obserwowane województwa: główne pierwsze, reszta w stałej kolejności listy. */
    static List<String> watched(Context c) {
        List<String> out = new ArrayList<>();
        try {
            SharedPreferences bg = c.getSharedPreferences(BackgroundPlugin.PREFS, Context.MODE_PRIVATE);
            String home = bg.getString(BackgroundPlugin.KEY_HOME, "");
            Set<String> regions = bg.getStringSet(BackgroundPlugin.KEY_REGIONS, Collections.<String>emptySet());
            for (String v : Alarms.VOIVS) if (v.equals(home)) out.add(v);
            for (String v : Alarms.VOIVS) if (!v.equals(home) && regions.contains(v)) out.add(v);
        } catch (Exception e) {
            // przed pierwszym odblokowaniem ustawienia aplikacji są niedostępne
            Log.w(TAG, "obserwowane", e);
        }
        return out;
    }

    static void redrawAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : ids(c, StraznikWidgetSmall.class)) m.updateAppWidget(id, build(c, m, id));
        for (int id : ids(c, StraznikWidgetMapWide.class)) m.updateAppWidget(id, buildMap(c, m, id));
        for (int id : ids(c, StraznikWidgetMapTall.class)) m.updateAppWidget(id, buildMap(c, m, id));
    }

    /** Widok stanu jednego województwa. */
    static final class Row {
        String name, label, points;
        int tone;       // 0 zielony, 1 żółty, 2 czerwony, 3 od sąsiadów, 4 nieaktualne
    }

    static Row row(String name, JSONObject v, boolean stale) {
        Row r = new Row();
        r.name = name;
        double score = v == null ? 0 : v.optDouble("score", 0);
        r.points = String.format(new Locale("pl", "PL"), "%.1f", score);
        String alert = v == null ? "none" : v.optString("alert", "none");
        String level = v == null ? "none" : v.optString("level", "none");
        if (v == null) { r.tone = 4; r.label = "brak danych"; r.points = "–"; }
        else if ("high".equals(alert)) { r.tone = 2; r.label = "WYSOKI PRIORYTET"; }
        else if ("elevated".equals(alert)) { r.tone = 1; r.label = "PODWYŻSZONA UWAGA"; }
        else if (rank(level) > 0) { r.tone = 3; r.label = "od sąsiadów · bez alarmu"; }
        else if (score > 0) { r.tone = 0; r.label = "poniżej progu"; }
        else { r.tone = 0; r.label = "brak sygnałów"; }
        if (stale && v != null) r.tone = 4;
        return r;
    }

    private static final int[] BG = {R.drawable.widget_bg, R.drawable.widget_bg_elevated,
        R.drawable.widget_bg_high, R.drawable.widget_bg, R.drawable.widget_bg};
    private static final int[] BAR = {R.drawable.widget_bar_none, R.drawable.widget_bar_elevated,
        R.drawable.widget_bar_high, R.drawable.widget_bar_spill, R.drawable.widget_bar_stale};
    private static final int[] DOT = {R.drawable.widget_dot_none, R.drawable.widget_dot_elevated,
        R.drawable.widget_dot_high, R.drawable.widget_dot_spill, R.drawable.widget_dot_stale};
    private static final int[] LABEL_COLOR = {R.color.widget_text_muted, R.color.widget_elevated_text,
        R.color.widget_high_text, R.color.widget_spill_text, R.color.widget_text_muted};

    /** Kolory etykiet na ciemnej mapie (inne niż na jasnym kafelku 2×2). */
    private static final int[] MAP_LABEL_COLOR = {R.color.widget_map_muted, R.color.widget_map_elevated,
        R.color.widget_map_high, R.color.widget_map_spill, R.color.widget_map_muted};

    /** Ostatni zapisany stan albo null, gdy nic jeszcze nie pobrano. */
    static JSONObject zapisanyStan(Context c) {
        try {
            String raw = Alarms.prefs(c).getString(KEY_STATE, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Rozmiar kafelka w dp. W pionie Android podaje wysokość w MAX_HEIGHT i szerokość
     * w MIN_WIDTH, w poziomie odwrotnie — pomylenie tego dawało widżet w wersji
     * kompaktowej mimo mnóstwa miejsca (sprawdzone na Pixelu 7, 22.09.2026).
     */
    static int[] rozmiarDp(Context c, AppWidgetManager m, int id, int domyslnaSzer, int domyslnaWys) {
        int w = 0, h = 0;
        try {
            Bundle o = m.getAppWidgetOptions(id);
            boolean portrait = c.getResources().getConfiguration().orientation
                != android.content.res.Configuration.ORIENTATION_LANDSCAPE;
            h = o.getInt(portrait ? AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT
                : AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            w = o.getInt(portrait ? AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH
                : AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
        } catch (Exception ignored) {}
        return new int[]{w > 0 ? w : domyslnaSzer, h > 0 ? h : domyslnaWys};
    }

    static RemoteViews build(Context c, AppWidgetManager m, int id) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_small);
        rv.setOnClickPendingIntent(R.id.w_root, openApp(c));

        JSONObject st = null;
        try {
            String raw = Alarms.prefs(c).getString(KEY_STATE, null);
            if (raw != null) st = new JSONObject(raw);
        } catch (Exception ignored) {}
        long ts = st == null ? 0 : st.optLong("ts", 0);
        boolean stale = ts > 0 && System.currentTimeMillis() - ts > STALE_AFTER_MS;
        String time = ts > 0 ? new SimpleDateFormat("HH:mm", Locale.ROOT).format(new Date(ts)) : "";
        rv.setTextViewText(R.id.w_time, time);

        List<String> watched = watched(c);
        JSONObject voivs = st == null ? null : st.optJSONObject("voivs");

        // wysokość widżetu i skala czcionki decydują, ile się zmieści
        float font = c.getResources().getConfiguration().fontScale;
        int hDp = 0, wDp = 0;
        try {
            Bundle o = m.getAppWidgetOptions(id);
            // w pionie widżet ma wysokość MAX_HEIGHT, w poziomie MIN_HEIGHT
            boolean portrait = c.getResources().getConfiguration().orientation
                != android.content.res.Configuration.ORIENTATION_LANDSCAPE;
            hDp = o.getInt(portrait ? AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT
                : AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            wDp = o.getInt(portrait ? AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH
                : AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
        } catch (Exception ignored) {}
        if (hDp <= 0) hDp = 110;
        if (wDp <= 0) wDp = 250;
        // duża czcionka albo wąski widżet: krótkie etykiety zamiast uciętych („PODWYŻSZONA UW…”)
        boolean shortLabels = font > 1.1f || wDp < 330;

        String foot = stale ? "Dane z " + time + " — mogą być nieaktualne. Otwórz aplikację."
            : "Źródło nieoficjalne · alarmem jest syrena w powiadomieniu";
        rv.setTextViewText(R.id.w_foot, foot);

        {
            if (watched.isEmpty()) {
                applyTone(c, rv, 4, false);
                // pusty kafelek nic by nie mówił — mówimy, co zrobić
                rv.setTextViewText(R.id.w_name, "Brak miejsc");
                rv.setInt(R.id.w_level, "setMaxLines", 5);
                rv.setTextViewText(R.id.w_level, NO_WATCHED_HINT);
                rv.setViewVisibility(R.id.w_points, View.GONE);
                rv.setTextViewText(R.id.w_foot, "Źródło nieoficjalne · to nie jest alarm");
                return rv;
            }
            Row r = row(watched.get(0), voivs == null ? null : voivs.optJSONObject(watched.get(0)), stale);
            if (st == null) { r.label = "ładowanie…"; r.points = "–"; r.tone = 4; }
            applyTone(c, rv, r.tone, true);
            rv.setTextViewText(R.id.w_name, r.name);
            // launcher może nałożyć zmiany na istniejący widok — cofamy 5 wierszy podpowiedzi
            rv.setInt(R.id.w_level, "setMaxLines", 2);
            // przy małej wysokości albo dużej czcionce punkty idą do wiersza poziomu
            boolean roomy = hDp >= 150 * Math.max(1f, font);
            rv.setViewVisibility(R.id.w_points, roomy ? View.VISIBLE : View.GONE);
            rv.setTextViewText(R.id.w_points_num, r.points);
            String lbl = r.tone == 1 && !roomy ? "PODWYŻSZONA" : r.tone == 2 && !roomy ? "WYSOKI" : r.label;
            rv.setTextViewText(R.id.w_level, roomy || r.points.equals("–") ? r.label : lbl + " · " + r.points + " pkt");
        }
        return rv;
    }

    /**
     * Widżet z mapą (4×2 i 4×3). Mapę rysuje {@link WidgetMap} po Canvasie i wstawia
     * jako obrazek — widżet Androida nie ma WebView, więc silnik mapy z aplikacji tu
     * nie działa. Panel z lewej jest półprzezroczysty, żeby mapa była pod nim widoczna.
     */
    static RemoteViews buildMap(Context c, AppWidgetManager m, int id) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_map);
        rv.setOnClickPendingIntent(R.id.w_root, openApp(c));

        JSONObject st = zapisanyStan(c);
        long ts = st == null ? 0 : st.optLong("ts", 0);
        boolean stale = ts > 0 && System.currentTimeMillis() - ts > STALE_AFTER_MS;
        String time = ts > 0 ? new SimpleDateFormat("HH:mm", Locale.ROOT).format(new Date(ts)) : "";
        List<String> watched = watched(c);
        JSONObject voivs = st == null ? null : st.optJSONObject("voivs");
        int[] size = rozmiarDp(c, m, id, 250, 110);
        int wDp = size[0], hDp = size[1];
        float font = Math.max(1f, c.getResources().getConfiguration().fontScale);

        int[] rowIds = {R.id.w_row1, R.id.w_row2, R.id.w_row3};
        int[] dotIds = {R.id.w_dot1, R.id.w_dot2, R.id.w_dot3};
        int[] nameIds = {R.id.w_name1, R.id.w_name2, R.id.w_name3};
        int[] ptsIds = {R.id.w_pts1, R.id.w_pts2, R.id.w_pts3};
        int[] subIds = {R.id.w_sub1, R.id.w_sub2, R.id.w_sub3};
        // nagłówek + dolny pasek ≈ 62 dp, wiersz z podpisem ≈ 31 dp (skalowane czcionką)
        int fit = (int) Math.floor((hDp - 62 * font) / (31 * font));
        int n = Math.max(1, Math.min(3, Math.min(fit, Math.max(1, watched.size()))));
        boolean shortLabels = font > 1.1f || wDp < 300;
        for (int i = 0; i < 3; i++) {
            if (i >= n || i >= watched.size()) {
                rv.setViewVisibility(rowIds[i], View.GONE);
                rv.setViewVisibility(subIds[i], View.GONE);
                continue;
            }
            Row r = row(watched.get(i), voivs == null ? null : voivs.optJSONObject(watched.get(i)), stale);
            if (st == null) { r.label = "ładowanie…"; r.points = "–"; r.tone = 4; }
            rv.setViewVisibility(rowIds[i], View.VISIBLE);
            rv.setViewVisibility(subIds[i], View.VISIBLE);
            rv.setImageViewResource(dotIds[i], DOT[r.tone]);
            rv.setTextViewText(nameIds[i], r.name);
            rv.setTextViewText(ptsIds[i], r.points);
            rv.setTextViewText(subIds[i], shortLabels ? shortLabel(r) : r.label);
            setColor(c, rv, subIds[i], MAP_LABEL_COLOR[r.tone]);
        }
        if (watched.isEmpty()) {
            rv.setViewVisibility(R.id.w_row1, View.VISIBLE);
            rv.setViewVisibility(R.id.w_sub1, View.VISIBLE);
            rv.setImageViewResource(R.id.w_dot1, DOT[4]);
            rv.setTextViewText(R.id.w_name1, "Brak miejsc");
            rv.setTextViewText(R.id.w_pts1, "");
            rv.setTextViewText(R.id.w_sub1, NO_WATCHED_HINT);
            setColor(c, rv, R.id.w_sub1, R.color.widget_map_muted);
        }

        Bitmap mapa = null;
        try {
            float gestosc = c.getResources().getDisplayMetrics().density;
            // ograniczenie szerokości: obrazek widżetu jedzie przez IPC, a wielki
            // bitmapa potrafi przekroczyć limit transakcji launchera
            float skala = Math.min(gestosc, 1000f / Math.max(1, wDp));
            int wPx = Math.round(wDp * skala), hPx = Math.round(hDp * skala);
            mapa = WidgetMap.rysuj(c, st, watched, wPx, hPx, 152f / Math.max(1, wDp));
        } catch (Throwable e) {
            Log.w(TAG, "rysowanie mapy", e);
        }
        if (mapa != null) rv.setImageViewBitmap(R.id.w_map, mapa);

        JSONArray obiekty = st == null ? null : st.optJSONArray("obj");
        boolean blisko = WidgetMap.blisko(obiekty);
        // dopisek tylko przy zbliżeniu: wtedy kadr różni się od zwykłego i warto to powiedzieć
        rv.setTextViewText(R.id.w_time, time.isEmpty() ? "—" : time + (blisko && mapa != null ? " · zbliżenie" : ""));

        String near = st == null ? "" : st.optString("near", "");
        rv.setTextViewText(R.id.w_near, watched.isEmpty() ? "Dotknij, żeby wybrać miejsca"
            : st == null ? "Ładowanie…"
            : near.isEmpty() ? "Żaden obiekt nie jest bliżej niż " + (int) NEAR_MAX_KM + " km od granicy" : near);
        rv.setTextViewText(R.id.w_foot, stale
            ? "Dane z " + time + " — mogą być nieaktualne. Otwórz aplikację."
            : "Źródło nieoficjalne · alarmem jest syrena w powiadomieniu");
        return rv;
    }

    static String shortLabel(Row r) {
        switch (r.label) {
            case "WYSOKI PRIORYTET": return "WYSOKI";
            case "PODWYŻSZONA UWAGA": return "PODWYŻSZONA";
            case "od sąsiadów · bez alarmu": return "od sąsiadów";
            case "brak sygnałów": return "spokój";
            default: return r.label;
        }
    }

    /** Kolejność „najgorszego” stanu dla tła szerokiego widżetu. */
    private static int severity(int tone) {
        switch (tone) { case 2: return 4; case 1: return 3; case 3: return 2; case 0: return 1; default: return 0; }
    }

    private static void applyTone(Context c, RemoteViews rv, int tone, boolean hasLevel) {
        rv.setInt(R.id.w_root, "setBackgroundResource", BG[tone]);
        rv.setImageViewResource(R.id.w_bar, BAR[tone]);
        if (hasLevel) {
            rv.setImageViewResource(R.id.w_dot, DOT[tone]);
            setColor(c, rv, R.id.w_level, tone == 0 ? R.color.widget_text : LABEL_COLOR[tone]);
        }
    }

    /**
     * Kolor tekstu z zasobu. Od Androida 12 przekazujemy sam zasób, więc launcher
     * dobiera wariant jasny/ciemny przy zmianie motywu; wcześniej kolor jest wpisany
     * na sztywno i poprawi się przy najbliższym odświeżeniu.
     */
    private static void setColor(Context c, RemoteViews rv, int viewId, int colorRes) {
        if (Build.VERSION.SDK_INT >= 31) rv.setColorStateList(viewId, "setTextColor", colorRes);
        else rv.setTextColor(viewId, c.getResources().getColor(colorRes, c.getTheme()));
    }

    private static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class)
            .setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, 0, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

}
