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

/**
 * Most JS ↔ warstwa natywna: stan powiadomień, subskrypcja tematu FCM regionu,
 * zgody systemowe (powiadomienia, alarm pełnoekranowy, wyjątek baterii).
 *
 * Usługa pierwszoplanowa w tle została WYCOFANA (Android 15/16 ubijał `dataSync`
 * FGS) — alarmy przy zamkniętej aplikacji dostarcza push FCM per województwo,
 * więc ten plugin nie steruje już żadną usługą.
 */
@CapacitorPlugin(name = "StraznikBackground")
public class BackgroundPlugin extends Plugin {

    /** Prefs współdzielone z resztą warstwy natywnej — trzymamy tu wybrany region. */
    private static final String PREFS = "straznik_bg";
    private static final String KEY_HOME = "home_voiv";

    /**
     * Województwo wybrane w ustawieniach. Nazwa regionu wyznacza temat FCM
     * (voiv_&lt;region&gt;), więc po każdej zmianie przepinamy subskrypcję.
     */
    @PluginMethod
    public void setHomeVoivodeship(PluginCall call) {
        String v = call.getString("voivodeship");
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_HOME, v == null ? "" : v).apply();
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
     * województwa użytkownika (albo, gdy nie wybrał, ściany wschodniej), i
     * odsubskrybowuje poprzednie. Wywoływane przy starcie aplikacji i po każdej
     * zmianie regionu, więc telefon dostaje push tylko o swoim województwie.
     */
    static void syncFcmSubscription(Context c) {
        java.util.Set<String> target = new java.util.HashSet<>();
        String home = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                       .getString(KEY_HOME, "");
        if (home != null && !home.isEmpty()) {
            target.add(voivTopic(home));
        } else {
            for (int i : new int[]{0, 1, 2, 6})   // lubelskie, podkarpackie, podlaskie, warm.-maz.
                target.add(voivTopic(Alarms.VOIVS[i]));
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
        ret.put("batteryUnrestricted", isIgnoringBattery(c));
        ret.put("notificationsAllowed", notificationsAllowed(c));
        ret.put("fullScreenAllowed", fullScreenAllowed(c));
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("appVersion", appVersion(c));
        ret.put("homeVoivodeship",
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_HOME, ""));
        call.resolve(ret);
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
     * Huawei, Oppo) potrafią uśpić proces i opóźnić dostarczenie pusha.
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
