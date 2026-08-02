package pl.straznik.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.google.firebase.messaging.FirebaseMessaging;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Most JS ↔ usługa w tle: start, stop, status, wyjątek od optymalizacji baterii. */
@CapacitorPlugin(name = "StraznikBackground")
public class BackgroundPlugin extends Plugin {

    private static final String PREFS = "straznik_bg_cfg";
    private static final String KEY_ENABLED = "enabled";

    static boolean isEnabled(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false);
    }

    private void setEnabled(boolean v) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_ENABLED, v).apply();
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context c = getContext();
        Intent i = new Intent(c, MonitorService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i);
            else c.startService(i);
            setEnabled(true);
            JSObject ret = new JSObject();
            ret.put("running", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Nie udało się uruchomić usługi: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context c = getContext();
        c.stopService(new Intent(c, MonitorService.class));
        setEnabled(false);
        JSObject ret = new JSObject();
        ret.put("running", false);
        call.resolve(ret);
    }

    /**
     * Województwo wybrane w ustawieniach. Usługa w tle nie ma dostępu do
     * localStorage WebView, a musi wiedzieć, o którym regionie alarmować —
     * bez tego przy 16 województwach telefon dostawałby alerty o zdarzeniach
     * po drugiej stronie kraju.
     */
    @PluginMethod
    public void setHomeVoivodeship(PluginCall call) {
        Fusion.setHomeVoivodeship(getContext(), call.getString("voivodeship"));
        // po zmianie regionu przepnij subskrypcję tematu FCM na nowe województwo
        syncFcmSubscription(getContext());
        call.resolve();
    }

    /**
     * Temat FCM dla województwa. Nazwy tematów muszą być ASCII, a województwa mają
     * polskie znaki — mapujemy je 1:1 na ASCII. Ten sam slug liczy backend
     * (config.voiv_topic), więc obie strony trafiają w ten sam temat.
     */
    static String voivTopic(String name) {
        String s = name.toLowerCase()
            .replace('ą', 'a').replace('ć', 'c').replace('ę', 'e').replace('ł', 'l')
            .replace('ń', 'n').replace('ó', 'o').replace('ś', 's').replace('ź', 'z')
            .replace('ż', 'z');
        return "voiv_" + s;
    }

    /**
     * Dopasowuje subskrypcje tematów FCM do wybranego regionu: subskrybuje temat
     * województwa użytkownika (albo, gdy nie wybrał, ściany wschodniej — jak
     * Fusion.DEFAULT_WATCH), i odsubskrybowuje poprzednie. Wywoływane przy starcie
     * aplikacji i po każdej zmianie regionu, więc telefon dostaje push tylko o
     * swoim województwie.
     */
    static void syncFcmSubscription(Context c) {
        java.util.Set<String> target = new java.util.HashSet<>();
        String home = c.getSharedPreferences("straznik_bg", Context.MODE_PRIVATE)
                       .getString("home_voiv", "");
        if (home != null && !home.isEmpty()) {
            target.add(voivTopic(home));
        } else {
            for (int i : new int[]{0, 1, 2, 6})   // lubelskie, podkarpackie, podlaskie, warm.-maz.
                target.add(voivTopic(Sources.VOIVS[i]));
        }
        android.content.SharedPreferences p =
            c.getSharedPreferences("straznik_fcm", Context.MODE_PRIVATE);
        java.util.Set<String> current = new java.util.HashSet<>(
            p.getStringSet("topics", java.util.Collections.<String>emptySet()));
        FirebaseMessaging fm = FirebaseMessaging.getInstance();
        for (String t : current) if (!target.contains(t)) fm.unsubscribeFromTopic(t);
        for (String t : target) if (!current.contains(t)) fm.subscribeToTopic(t);
        p.edit().putStringSet("topics", target).apply();
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        JSObject ret = new JSObject();
        ret.put("enabled", isEnabled(c));
        ret.put("batteryUnrestricted", isIgnoringBattery(c));
        ret.put("notificationsAllowed", notificationsAllowed(c));
        ret.put("fullScreenAllowed", fullScreenAllowed(c));
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("appVersion", appVersion(c));
        // Faktyczny stan usługi i moment jej ostatniego cyklu — samo „włączone”
        // w ustawieniach nic nie mówi, gdy system ubił usługę w tle.
        ret.put("serviceAlive", MonitorService.ALIVE);
        ret.put("homeVoivodeship",
            c.getSharedPreferences("straznik_bg", Context.MODE_PRIVATE)
             .getString("home_voiv", ""));
        ret.put("lastCycleAgoS", lastCycleAgoSeconds(c));
        call.resolve(ret);
    }

    /**
     * Sygnały zebrane przez usługę w tle — jedyne źródło prawdy, gdy usługa żyje.
     *
     * Bez tego interfejs nie widział stanu usługi: powiadomienie na pasku mogło
     * pokazywać punkty, a aplikacja po otwarciu — zero i „brak sygnałów", bo
     * liczyła wyłącznie z własnego zbioru w localStorage, zbieranego tylko
     * wtedy, gdy była otwarta.
     */
    @PluginMethod
    public void signals(PluginCall call) {
        Context c = getContext();
        JSObject ret = new JSObject();
        ret.put("signals", Fusion.export(c));
        ret.put("serviceAlive", MonitorService.ALIVE);
        ret.put("enabled", isEnabled(c));
        ret.put("diag", c.getSharedPreferences("straznik_bg", Context.MODE_PRIVATE)
                         .getString("diag", ""));
        ret.put("lastCycleAgoS", lastCycleAgoSeconds(c));
        call.resolve(ret);
    }

    /**
     * Sygnały zebrane przez aplikację, których usługa sama by nie zobaczyła.
     *
     * Silnik w WebView ma źródła niedostępne usłudze — przede wszystkim alarmy
     * powietrzne w obwodach UA, które Neptun wysyła wyłącznie WebSocketem
     * (usługa korzysta ze snapshotu REST, bo trzymanie gniazda przez dobę
     * kosztowałoby baterię bez zysku). Bez tej ścieżki aplikacja pokazywałaby
     * punkty, o których pasek powiadomień nic nie wie. Deduplikacja po tym
     * samym kluczu, więc sygnał, który już przyszedł drugą stroną, jest pomijany.
     */
    @PluginMethod
    public void pushSignals(PluginCall call) {
        com.getcapacitor.JSArray arr = call.getArray("signals");
        if (arr == null) { call.resolve(); return; }
        java.util.List<Fusion.Signal> in = new java.util.ArrayList<>();
        try {
            for (Object raw : arr.toList()) {
                org.json.JSONObject o = new org.json.JSONObject(
                    raw instanceof org.json.JSONObject ? raw.toString() : String.valueOf(raw));
                String key = o.optString("key", "");
                String voivName = o.optString("voivodeship", "");
                double pts = o.optDouble("points", 0);
                if (key.isEmpty() || pts <= 0) continue;
                int voiv = -1;
                for (int i = 0; i < Sources.VOIVS.length; i++)
                    if (Sources.VOIVS[i].equalsIgnoreCase(voivName)) { voiv = i; break; }
                if (voiv < 0) continue;
                Fusion.Signal s = new Fusion.Signal(o.optString("source", "app"), voiv, pts,
                    o.optString("title", ""), key);
                // zachowujemy oryginalny czas — od niego zależy wygaszanie w oknie 60 min
                long t = o.optLong("t", 0);
                if (t > 0) s.ts = t;
                in.add(s);
            }
        } catch (Exception ignored) {}
        Fusion.ingest(getContext(), in, false);
        call.resolve();
    }

    /** Ile sekund temu usługa skończyła ostatni obieg (−1, gdy nigdy). */
    private long lastCycleAgoSeconds(Context c) {
        long ts = c.getSharedPreferences("straznik_bg", Context.MODE_PRIVATE)
                   .getLong("diag_ts", 0);
        return ts > 0 ? (System.currentTimeMillis() - ts) / 1000 : -1;
    }

    /** Wersja aplikacji — potrzebna, by porównać ją z najnowszym wydaniem. */
    private String appVersion(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Android 14 przestał przyznawać pełnoekranowe powiadomienia z automatu —
     * bez tej zgody czerwony alarm przy wygaszonym ekranie nie zapali ekranu,
     * a zostanie zwykłym powiadomieniem.
     */
    private boolean fullScreenAllowed(Context c) {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.canUseFullScreenIntent();
    }

    /**
     * Otwiera systemowy ekran zgody na alarm pełnoekranowy.
     *
     * Celowo BEZ sprawdzania canUseFullScreenIntent() — ta metoda przy domyślnym
     * trybie uprawnienia zwraca „dozwolone”, choć system i tak odrzuca alarm.
     * Wcześniejsze wyjście na jej podstawie sprawiało, że przycisk nie robił nic.
     * Użytkownik musi móc zajrzeć w ustawienia i zobaczyć stan przełącznika.
     */
    @PluginMethod
    public void requestFullScreenPermission(PluginCall call) {
        Context c = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    private boolean isIgnoringBattery(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName());
    }

    private boolean notificationsAllowed(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) return nm.areNotificationsEnabled();
        return true;
    }

    /**
     * Prośba o zdjęcie ograniczeń baterii. Bez tego producenci (Xiaomi, Samsung,
     * Huawei, Oppo) potrafią ubić usługę po kilkunastu minutach.
     */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context c = getContext();
        if (isIgnoringBattery(c)) { call.resolve(); return; }
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    /** Ekran ustawień powiadomień aplikacji (kanały, tryb Nie przeszkadzać). */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context c = getContext();
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
            } else {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + c.getPackageName()));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception ignored) {}
        call.resolve();
    }
}
