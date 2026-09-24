package pl.straznik.app;

import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.google.firebase.messaging.FirebaseMessaging;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

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
    private static final String KEY_REGIONS = "observed_voivs";

    /** Żywa instancja pluginu (WebView działa) — do przekazania pusha otwartej aplikacji. */
    private static volatile BackgroundPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /**
     * Audyt B1: aplikacja na wierzchu dostaje push jako zdarzenie „fcmAlarm” i sama
     * pokazuje alarm dla KAŻDEGO obserwowanego województwa (z deduplikacją po
     * event_id). Zwraca false, gdy WebView nie nasłuchuje — wtedy alarm pokazuje
     * warstwa natywna, więc wiadomość nigdy nie przepada.
     */
    static boolean forwardAlarm(java.util.Map<String, String> data) {
        BackgroundPlugin p = instance;
        if (p == null || !p.hasListeners("fcmAlarm")) return false;
        try {
            JSObject ev = new JSObject();
            for (java.util.Map.Entry<String, String> e : data.entrySet()) ev.put(e.getKey(), e.getValue());
            p.notifyListeners("fcmAlarm", ev);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Województwo wybrane w ustawieniach. Nazwa regionu wyznacza temat FCM
     * (voiv_&lt;region&gt;), więc po każdej zmianie przepinamy subskrypcję.
     */
    @PluginMethod
    public void setHomeVoivodeship(PluginCall call) {
        String v = call.getString("voivodeship");
        java.util.Set<String> regions = new java.util.HashSet<>();
        if (isKnownVoivodeship(v)) regions.add(v);
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_HOME, v == null ? "" : v).putStringSet(KEY_REGIONS, regions).apply();
        syncFcmSubscription(getContext());
        call.resolve();
    }

    /** Otrzymuje wyłącznie zbiór województw obserwowanych przez użytkownika.
     * Nazwy profili, miasta, adresy i współrzędne nigdy nie przechodzą do FCM. */
    @PluginMethod
    public void setObservedVoivodeships(PluginCall call) {
        JSArray input = call.getArray("voivodeships", new JSArray());
        java.util.Set<String> regions = new java.util.LinkedHashSet<>();
        String home = "";
        for (int i = 0; i < input.length(); i++) {
            String value = input.optString(i, "");
            if (isKnownVoivodeship(value)) {
                if (home.isEmpty()) home = value;
                regions.add(value);
            }
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_HOME, home).putStringSet(KEY_REGIONS, regions).commit();
        // „Alarmy na tym telefonie” wyłączone (zgłoszenie 14–15.09.2026): flaga w pamięci
        // dostępnej przed odblokowaniem, żeby usługa FCM odrzucała alarmy także wtedy,
        // gdy wypisanie z tematu jeszcze nie dotarło do Firebase.
        // commit(), nie apply(): localStorage WebView zapisuje się z opóźnieniem i ginął
        // przy zamknięciu aplikacji (sprawdzone na emulatorze 15.09.2026) — ta flaga jest
        // źródłem prawdy, więc musi być na dysku, zanim wrócimy do JS.
        Alarms.prefs(getContext()).edit()
            .putBoolean(Alarms.KEY_ALERTS_OFF, Boolean.TRUE.equals(call.getBoolean("alertsOff", false))).commit();
        syncFcmSubscription(getContext());
        call.resolve();
    }

    private static boolean isKnownVoivodeship(String value) {
        if (value == null) return false;
        for (String v : Alarms.VOIVS) if (v.equals(value)) return true;
        return false;
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
     * Dopasowuje subskrypcje tematów FCM do obserwowanych województw. Dla starej
     * instalacji bez nowego ustawienia zachowuje dotychczasowy region albo ścianę
     * wschodnią. Wywoływane przy starcie aplikacji i po każdej zmianie miejsc.
     */
    static void syncFcmSubscription(Context c) {
        syncFcmSubscription(c, false);
    }

    /**
     * Audyt B3: subskrypcje były różnicowe i zapisywane bez sprawdzenia wyniku, więc
     * nowy token bez tematów albo nieudane zapisanie tematu dawały trwałą ciszę przy
     * komunikacie „Powiadomienia gotowe”. Teraz przy każdym starcie zapisujemy
     * WSZYSTKIE docelowe tematy (operacja idempotentna), a stan utrwalamy dopiero po
     * potwierdzeniu przez FCM.
     */
    static void syncFcmSubscription(Context c, boolean forceAll) {
        java.util.Set<String> target = new java.util.HashSet<>();
        android.content.SharedPreferences bg = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (bg.contains(KEY_REGIONS)) {
            for (String region : bg.getStringSet(KEY_REGIONS, java.util.Collections.<String>emptySet()))
                if (isKnownVoivodeship(region)) target.add(voivTopic(region));
        } else {
            String home = bg.getString(KEY_HOME, "");
            if (isKnownVoivodeship(home)) target.add(voivTopic(home));
            else for (int i : new int[]{0, 1, 2, 6}) target.add(voivTopic(Alarms.VOIVS[i]));
        }
        android.content.SharedPreferences p =
            c.getSharedPreferences("straznik_fcm", Context.MODE_PRIVATE);
        java.util.Set<String> current = new java.util.HashSet<>(
            p.getStringSet("topics", java.util.Collections.<String>emptySet()));
        FirebaseMessaging fm = FirebaseMessaging.getInstance();
        final java.util.Set<String> confirmed = java.util.Collections.synchronizedSet(new java.util.HashSet<>());
        final java.util.concurrent.atomic.AtomicInteger pending =
            new java.util.concurrent.atomic.AtomicInteger(target.size());
        if (target.isEmpty()) {
            // Wypisujemy ze WSZYSTKICH województw, nie tylko z zapamiętanych: starsze
            // wersje zapisywały tematy bez utrwalenia listy. Stan „0 tematów” zapisujemy
            // dopiero po potwierdzeniu przez FCM — ustawienia pokazują wtedy prawdę.
            final java.util.concurrent.atomic.AtomicInteger left =
                new java.util.concurrent.atomic.AtomicInteger(Alarms.VOIVS.length);
            final java.util.concurrent.atomic.AtomicInteger failed = new java.util.concurrent.atomic.AtomicInteger();
            p.edit().putString("topics_error", "").putBoolean("topics_unsubscribing", true)
                .putLong("topics_unsub_at", System.currentTimeMillis()).apply();
            for (String v : Alarms.VOIVS) {
                fm.unsubscribeFromTopic(voivTopic(v)).addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) failed.incrementAndGet();
                    if (left.decrementAndGet() == 0) {
                        android.content.SharedPreferences.Editor ed = p.edit().putBoolean("topics_unsubscribing", false);
                        if (failed.get() == 0)
                            ed.putStringSet("topics", target).putLong("topics_ok_at", System.currentTimeMillis())
                              .putString("topics_error", "");
                        else ed.putString("topics_error", "nie potwierdzono wypisania z " + failed.get() + " tematów");
                        ed.apply();
                    }
                });
            }
            return;
        }
        for (String t : current) if (!target.contains(t)) fm.unsubscribeFromTopic(t);
        for (String t : target) {
            fm.subscribeToTopic(t).addOnCompleteListener(task -> {
                if (task.isSuccessful()) confirmed.add(t);
                if (pending.decrementAndGet() == 0) {
                    boolean all = confirmed.size() == target.size();
                    android.content.SharedPreferences.Editor ed = p.edit()
                        .putStringSet("topics", new java.util.HashSet<>(confirmed));
                    if (all) ed.putLong("topics_ok_at", System.currentTimeMillis()).putString("topics_error", "");
                    else ed.putString("topics_error", "nie potwierdzono " + (target.size() - confirmed.size())
                        + " z " + target.size() + " tematów");
                    ed.apply();
                }
            });
        }
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
        ret.put("observedVoivodeships", new JSArray(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(KEY_REGIONS, java.util.Collections.<String>emptySet())));
        android.content.SharedPreferences fcm = c.getSharedPreferences("straznik_fcm", Context.MODE_PRIVATE);
        ret.put("topicsConfirmed", new JSArray(fcm.getStringSet("topics", java.util.Collections.<String>emptySet())));
        ret.put("topicsOkAt", fcm.getLong("topics_ok_at", 0));
        ret.put("topicsError", fcm.getString("topics_error", ""));
        // Bez odpowiedzi FCM (brak Usług Google, proces zabity w trakcie) flaga zostawała
        // na zawsze i ustawienia wisiały na „Wypisywanie…”. Po 2 min uznajemy, że się nie udało.
        boolean unsub = fcm.getBoolean("topics_unsubscribing", false)
            && System.currentTimeMillis() - fcm.getLong("topics_unsub_at", 0) < 120_000;
        ret.put("topicsUnsubscribing", unsub);
        if (fcm.getBoolean("topics_unsubscribing", false) && !unsub && fcm.getString("topics_error", "").isEmpty())
            ret.put("topicsError", "Firebase nie potwierdził wypisania");
        ret.put("alertsOff", Alarms.prefs(c).getBoolean(Alarms.KEY_ALERTS_OFF, false));
        // czy flaga była kiedykolwiek zapisana (wersje do 1.7.49 trzymały ją tylko w localStorage)
        ret.put("alertsOffSet", Alarms.prefs(c).contains(Alarms.KEY_ALERTS_OFF));
        // głośność alarmów i stan kanału czerwonego — do podglądu w ustawieniach
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                ret.put("alarmVolume", am.getStreamVolume(AudioManager.STREAM_ALARM));
                ret.put("alarmVolumeMax", am.getStreamMaxVolume(AudioManager.STREAM_ALARM));
            }
        } catch (Exception ignored) {}
        ret.put("forceMaxVolume", Alarms.forceVolumeEnabled(c));
        ret.put("redChannelSound", Alarms.highChannelPlaysSound(c));
        ret.put("yellowLevel", Alarms.yellowLevel(c));
        call.resolve(ret);
    }

    /**
     * Głośność żółtego sygnału uwagi: „normal”, „quiet” albo „silent”. Android nie
     * pozwala ustawić głośności pojedynczego powiadomienia, więc wybór sprowadza się
     * do kanału z innym plikiem. Czerwonego alarmu to nie dotyka.
     */
    @PluginMethod
    public void setYellowLevel(PluginCall call) {
        String level = call.getString("level", "normal");
        Context c = getContext();
        Alarms.prefs(c).edit().putString(Alarms.KEY_YELLOW_LEVEL, level).apply();
        Alarms.createChannels(c);
        JSObject ret = new JSObject();
        ret.put("yellowLevel", Alarms.yellowLevel(c));
        call.resolve(ret);
    }

    /** Opcja „czerwony alarm zawsze na pełnej głośności” — tylko po świadomym włączeniu. */
    @PluginMethod
    public void setForceMaxVolume(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Alarms.prefs(getContext()).edit().putBoolean(Alarms.KEY_FORCE_VOLUME, enabled).apply();
        JSObject ret = new JSObject();
        ret.put("forceMaxVolume", enabled);
        call.resolve(ret);
    }

    /**
     * Audyt B12: test przechodzi PRAWDZIWĄ ścieżką natywną (kanał, pełny ekran,
     * pętla syreny, wyciszenie), a nie nakładką WebView. Opóźniony o kilka sekund,
     * żeby dało się zablokować ekran i sprawdzić alarm nad blokadą.
     */
    @PluginMethod
    public void testNativeAlarm(PluginCall call) {
        String level = "elevated".equals(call.getString("level")) ? "elevated" : "high";
        int delayMs = Math.max(0, Math.min(call.getInt("delayMs", 0), 30000));
        String voivName = call.getString("voivodeship", Alarms.VOIVS[0]);
        int voiv = 0;
        for (int i = 0; i < Alarms.VOIVS.length; i++) if (Alarms.VOIVS[i].equals(voivName)) voiv = i;
        final int v = voiv;
        final Context c = getContext().getApplicationContext();
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            Alarms.createChannels(c);
            java.util.List<String> reasons = new java.util.ArrayList<>();
            reasons.add("To jest test alarmu — nie ma zagrożenia.");
            Alarms.postAlarm(c, v, level, "high".equals(level) ? 4.0 : 2.0, reasons,
                "TEST: sprawdzenie dźwięku i ekranu alarmu", 0L, true);
        }, delayMs);
        call.resolve();
    }

    /** Wersja aplikacji — potrzebna, by porównać ją z najnowszym wydaniem. */
    private String appVersion(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    /** Czy Strażnik może otworzyć instalator pobranego APK. Na Androidzie 8+
     * użytkownik przyznaje tę zgodę osobno dla każdej aplikacji-źródła. */
    @PluginMethod
    public void canInstallUpdates(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    /** Otwiera systemowy ekran „Instaluj nieznane aplikacje” dla Strażnika. */
    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls()) {
            call.resolve();
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Nie udało się otworzyć ustawień instalacji", e);
        }
    }

    /** Pobiera APK do prywatnego cache, sprawdza SHA-256, pakiet i certyfikat podpisu,
     * i dopiero wtedy otwiera systemowy instalator. Adres jest ograniczony do wydań
     * repozytorium na GitHubie; przekierowania GitHuba są dozwolone przez HTTPS.
     *
     * Audyt bezpieczeństwa 16.09.2026: adres i sumę SHA-256 podaje ten sam serwer, więc
     * przejęty serwer mógł podsunąć dowolny plik z pasującą sumą. Android sam odrzuci
     * aktualizację podpisaną innym kluczem, ale APK z INNĄ nazwą pakietu zainstalowałby
     * jako nową aplikację. Dlatego pobrany plik musi mieć nasz pakiet i ten sam
     * certyfikat podpisu co zainstalowany Strażnik. */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        String rawUrl = call.getString("url");
        String expected = call.getString("sha256");
        if (rawUrl == null || expected == null || !expected.matches("(?i)[0-9a-f]{64}")) {
            call.reject("Nieprawidłowe dane aktualizacji");
            return;
        }
        try {
            URL parsed = new URL(rawUrl);
            String host = parsed.getHost().toLowerCase(Locale.ROOT);
            if (!"github.com".equals(host)
                    || !parsed.getPath().startsWith(RELEASE_PATH)
                    || !"https".equalsIgnoreCase(parsed.getProtocol())) {
                call.reject("Niedozwolone źródło aktualizacji");
                return;
            }
        } catch (Exception e) {
            call.reject("Nieprawidłowy adres aktualizacji");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Najpierw zezwól Strażnikowi na instalowanie aktualizacji", "INSTALL_PERMISSION");
            return;
        }

        new Thread(() -> {
            File apk = new File(getContext().getCacheDir(), "Straznik-update.apk");
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(rawUrl).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "Straznik-Android-Updater");
                if (conn.getResponseCode() < 200 || conn.getResponseCode() >= 300)
                    throw new IllegalStateException("HTTP " + conn.getResponseCode());
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[32768];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        digest.update(buf, 0, n);
                    }
                } finally {
                    conn.disconnect();
                }
                StringBuilder actual = new StringBuilder();
                for (byte b : digest.digest()) actual.append(String.format(Locale.ROOT, "%02x", b));
                if (!actual.toString().equalsIgnoreCase(expected)) {
                    apk.delete();
                    throw new SecurityException("Suma SHA-256 nie zgadza się");
                }
                String problem = signatureProblem(apk);
                if (problem != null) {
                    apk.delete();
                    throw new SecurityException(problem);
                }
                getActivity().runOnUiThread(() -> {
                    try {
                        Uri uri = FileProvider.getUriForFile(getContext(),
                            getContext().getPackageName() + ".fileprovider", apk);
                        Intent i = new Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                                | Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(i);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Nie udało się uruchomić instalatora", e);
                    }
                });
            } catch (Exception e) {
                apk.delete();
                call.reject("Pobieranie aktualizacji nie powiodło się: " + e.getMessage(), e);
            }
        }, "straznik-updater").start();
    }

    static final String RELEASE_PATH = "/cukierrro/Straznik/releases/download/";

    /** null, gdy pobrany APK to Strażnik podpisany tym samym certyfikatem co ta instalacja. */
    @SuppressWarnings("deprecation")
    private String signatureProblem(File apk) {
        try {
            PackageManager pm = getContext().getPackageManager();
            String own = getContext().getPackageName();
            int flags = Build.VERSION.SDK_INT >= 28
                ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            // Android 9 i 10 czytają certyfikaty z PLIKU APK tylko przy GET_SIGNATURES —
            // w getPackageArchiveInfo stoi tam `if ((flags & GET_SIGNATURES) != 0)
            // collectCertificates(...)`, a sama GET_SIGNING_CERTIFICATES zostawia signingInfo
            // puste. Poprawił to dopiero Android 11. Bez tej flagi każdy telefon z Androidem
            // 9 lub 10 porównywał prawdziwy certyfikat z pustym zbiorem i odrzucał każdą
            // aktualizację jako „podpis się nie zgadza" (zgłoszenie z Huawei P20 Pro, 21.09.2026).
            int archiveFlags = Build.VERSION.SDK_INT >= 28
                ? flags | PackageManager.GET_SIGNATURES : flags;
            PackageInfo downloaded = pm.getPackageArchiveInfo(apk.getAbsolutePath(), archiveFlags);
            if (downloaded == null) return "Plik aktualizacji nie jest poprawnym APK";
            if (!own.equals(downloaded.packageName))
                return "Plik aktualizacji jest inną aplikacją (" + downloaded.packageName + ")";
            Set<String> have = certDigests(pm.getPackageInfo(own, flags));
            Set<String> got = certDigests(downloaded);
            if (have.isEmpty() || !have.equals(got))
                return "Podpis aktualizacji nie zgadza się z zainstalowaną aplikacją";
            return null;
        } catch (Exception e) {
            return "Nie udało się sprawdzić podpisu aktualizacji: " + e.getMessage();
        }
    }

    @SuppressWarnings("deprecation")
    private static Set<String> certDigests(PackageInfo info) throws Exception {
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= 28 && info.signingInfo != null) {
            sigs = info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory();
        } else {
            // Starsze Androidy, a na 9/10 także pobrany plik, gdyby producent zostawił
            // signingInfo puste mimo GET_SIGNATURES — wtedy certyfikat jest tutaj.
            sigs = info.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) out.add(Arrays.toString(md.digest(s.toByteArray())));
        return out;
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

    /** Systemowy ekran dźwięku — tam jest suwak „Alarmy”, którego używa syrena. */
    @PluginMethod
    public void openSoundSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_SOUND_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {}
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
