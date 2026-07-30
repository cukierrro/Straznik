package pl.straznik.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Usługa pierwszoplanowa: monitoruje źródła również przy zamkniętej aplikacji.
 *
 * Android ubija zwykłe procesy w tle i wstrzymuje timery WebView, więc bez tego
 * powiadomienia docierałyby tylko przy otwartej aplikacji. Foreground service
 * z trwałym powiadomieniem to jedyny sposób, żeby system pozwolił na stały
 * nasłuch — i jednocześnie uczciwie pokazuje użytkownikowi, że coś działa.
 */
public class MonitorService extends Service {
    private static final String TAG = "StraznikService";
    static final String CH_STATUS = "straznik-status";
    // sufiks wersji: kanał raz utworzony ignoruje zmiany dźwięku i wibracji,
    // więc podmiana sygnałów wymaga nowego identyfikatora
    static final String CH_HIGH = "straznik-high-v2";
    static final String CH_INFO = "straznik-info-v2";
    private static final String[] CH_LEGACY = {"straznik-high", "straznik-info"};
    private static final int ID_STATUS = 1001;
    static final String ACTION_STOP = "pl.straznik.app.STOP";

    private static final long POLL_NEPTUN_MS = 60_000L;
    private static final long POLL_MEDIA_MS = 120_000L;
    private static final long POLL_RCB_MS = 180_000L;

    private Thread worker;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private PowerManager.WakeLock wakeLock;
    private String lastStatus = "uruchamianie…";

    static void createChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel status = new NotificationChannel(CH_STATUS,
            "Monitorowanie w tle", NotificationManager.IMPORTANCE_MIN);
        status.setDescription("Stałe powiadomienie informujące, że nasłuch działa");
        status.setShowBadge(false);
        nm.createNotificationChannel(status);

        // stare kanały z systemowymi dźwiękami — usuwamy, żeby nie dublowały wpisów
        for (String old : CH_LEGACY) {
            try { nm.deleteNotificationChannel(old); } catch (Exception ignored) {}
        }

        AudioAttributes alarmAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();

        NotificationChannel info = new NotificationChannel(CH_INFO,
            "Podwyższona uwaga (żółty)", NotificationManager.IMPORTANCE_DEFAULT);
        info.enableVibration(true);
        info.setVibrationPattern(new long[]{0, 220, 120, 220});
        // ten sam dwutonowy sygnał, który gra w otwartej aplikacji
        info.setSound(soundUri(ctx, R.raw.alert_uwaga), alarmAttrs);
        nm.createNotificationChannel(info);

        NotificationChannel high = new NotificationChannel(CH_HIGH,
            "Wysoki priorytet (czerwony)", NotificationManager.IMPORTANCE_HIGH);
        high.setDescription("Alarm — przebija tryb cichy, jeśli na to zezwolisz");
        high.enableVibration(true);
        high.setVibrationPattern(new long[]{0, 700, 300, 700, 300, 900});
        high.setBypassDnd(true);
        // modulowana syrena alarmu powietrznego — identyczna jak w aplikacji
        high.setSound(soundUri(ctx, R.raw.alarm_syrena), alarmAttrs);
        nm.createNotificationChannel(high);
    }

    static Uri soundUri(Context ctx, int resId) {
        return Uri.parse("android.resource://" + ctx.getPackageName() + "/" + resId);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForegroundCompat();
        if (running.compareAndSet(false, true)) {
            acquireWakeLock();
            worker = new Thread(this::loop, "straznik-monitor");
            worker.setDaemon(true);
            worker.start();
        }
        return START_STICKY;   // system wskrzesi usługę po ubiciu
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "straznik:monitor");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        } catch (Exception e) {
            Log.w(TAG, "wakelock", e);
        }
    }

    private void startForegroundCompat() {
        Notification n = statusNotification(lastStatus);
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID_STATUS, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(ID_STATUS, n);
        }
    }

    private Notification statusNotification(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1,
            new Intent(this, MonitorService.class).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CH_STATUS)
            : new Notification.Builder(this);
        b.setContentTitle("Strażnik — nasłuch aktywny")
         .setContentText(text)
         .setSmallIcon(android.R.drawable.ic_menu_compass)
         .setContentIntent(open)
         .setOngoing(true)
         .setShowWhen(false)
         .addAction(new Notification.Action.Builder(
             null, "Zatrzymaj", stop).build());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) b.setPriority(Notification.PRIORITY_MIN);
        return b.build();
    }

    private void updateStatus(String text) {
        lastStatus = text;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ID_STATUS, statusNotification(text));
    }

    private static String reasonsOnly(List<String> reasons) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(reasons.size(), 6); i++) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(reasons.get(i));
        }
        return sb.toString();
    }

    private void alarm(int voiv, String level, double score, List<String> reasons) {
        String voivName = Sources.VOIVS[voiv];
        boolean high = "high".equals(level);
        String title = (high ? "WYSOKI PRIORYTET" : "PODWYŻSZONA UWAGA")
            + ": woj. " + voivName + " (" + score + " pkt)";
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < Math.min(reasons.size(), 4); i++) body.append(reasons.get(i)).append('\n');
        body.append("NIEOFICJALNE źródło — kieruj się syrenami, RCB i RSO.");

        PendingIntent open = PendingIntent.getActivity(this, 2,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Czerwony poziom ma prowadzić do pełnoekranowego alarmu, tak jak połączenie
        // przychodzące: zapala ekran, pokazuje się nad blokadą, miga i gra do potwierdzenia.
        PendingIntent fullScreen = PendingIntent.getActivity(this, 3,
            new Intent(this, AlarmActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                // ekran alarmu sam składa nagłówek z województwa i punktów,
                // więc dostaje wyłącznie rozbicie na sygnały
                .putExtra(AlarmActivity.EXTRA_BODY, reasonsOnly(reasons))
                .putExtra(AlarmActivity.EXTRA_VOIV, voivName)
                .putExtra(AlarmActivity.EXTRA_SCORE, score),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, high ? CH_HIGH : CH_INFO)
            : new Notification.Builder(this);
        b.setContentTitle(title)
         .setContentText(reasons.isEmpty() ? "" : reasons.get(0))
         .setStyle(new Notification.BigTextStyle().bigText(body.toString()))
         .setSmallIcon(android.R.drawable.ic_dialog_alert)
         .setContentIntent(open)
         .setAutoCancel(true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setPriority(high ? Notification.PRIORITY_MAX : Notification.PRIORITY_DEFAULT);
            b.setDefaults(Notification.DEFAULT_VIBRATE | Notification.DEFAULT_SOUND);
            if (high) b.setSound(android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI);
        }
        if (high) {
            b.setFullScreenIntent(fullScreen, true);
            b.setCategory(Notification.CATEGORY_ALARM);
            b.setOngoing(true);        // alarm nie znika przypadkowym muśnięciem
        }

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(2000 + voiv, b.build());

        if (high) ensureAlarmIsSeen(nm);
    }

    /**
     * Czerwony poziom musi zostać zauważony także przy wygaszonym ekranie.
     *
     * Ze zgodą na alarm pełnoekranowy robi to system: sam uruchamia AlarmActivity
     * z przywilejem startu z tła, a ta zapala ekran i pokazuje się nad blokadą.
     * Nie wolno wtedy niczego wybudzać samemu — przy włączonym ekranie Android
     * celowo pomija full-screen intent i alarm zostałby zwykłym powiadomieniem.
     *
     * Bez zgody (Android 14 odbiera ją domyślnie aplikacjom innym niż budzik
     * i telefon) start aktywności z tła jest blokowany, więc jedyne, co możemy
     * zrobić, to zapalić ekran wake lockiem — wtedy użytkownik zobaczy alarm
     * jako powiadomienie na zapalonym ekranie i usłyszy syrenę.
     */
    private void ensureAlarmIsSeen(NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= 34 && nm != null && nm.canUseFullScreenIntent()) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null || pm.isInteractive()) return;
            PowerManager.WakeLock screenOn = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "straznik:wake-alarm");
            screenOn.acquire(30_000L);
            new android.os.Handler(android.os.Looper.getMainLooper())
                .postDelayed(() -> { try { screenOn.release(); } catch (Exception ignored) {} }, 25_000L);
        } catch (Exception e) {
            Log.w(TAG, "wybudzanie ekranu", e);
        }
    }

    /** Stan źródeł widoczny dla użytkownika — inaczej „nasłuch aktywny" nic nie mówi. */
    private final java.util.LinkedHashMap<String, String> diag = new java.util.LinkedHashMap<>();

    private void note(String src, boolean ok, int found) {
        diag.put(src, ok ? (found > 0 ? "✓" + found : "✓") : "✕");
        getSharedPreferences("straznik_bg", MODE_PRIVATE).edit()
            .putString("diag", diagText())
            .putLong("diag_ts", System.currentTimeMillis()).apply();
    }

    private String diagText() {
        StringBuilder sb = new StringBuilder();
        for (java.util.Map.Entry<String, String> e : diag.entrySet()) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(e.getKey()).append(e.getValue());
        }
        return sb.toString();
    }

    private void loop() {
        long lastNeptun = 0, lastMedia = 0, lastRcb = 0;
        boolean bootstrap = true;   // pierwszy przebieg: zapamiętaj istniejące wpisy

        while (running.get()) {
            long now = System.currentTimeMillis();
            try {
                if (now - lastNeptun >= POLL_NEPTUN_MS) {
                    lastNeptun = now;
                    List<Fusion.Signal> s = Sources.neptun();
                    note("Neptun", s != null, s == null ? 0 : s.size());
                    if (s != null) Fusion.ingest(this, s, false);
                }
                if (now - lastMedia >= POLL_MEDIA_MS) {
                    lastMedia = now;
                    List<Fusion.Signal> s = Sources.media();
                    note("Media", s != null, s == null ? 0 : s.size());
                    if (s != null) Fusion.ingest(this, s, bootstrap);
                }
                if (now - lastRcb >= POLL_RCB_MS) {
                    lastRcb = now;
                    List<Fusion.Signal> s = Sources.rcb();
                    note("RCB", s != null, s == null ? 0 : s.size());
                    if (s != null) Fusion.ingest(this, s, bootstrap);
                    bootstrap = false;
                }

                Fusion.Result r = Fusion.evaluate(this);
                StringBuilder st = new StringBuilder();
                double worst = 0; int worstVoiv = -1;
                for (int i = 0; i < r.scores.length; i++) {
                    if (r.scores[i] > worst) { worst = r.scores[i]; worstVoiv = i; }
                    if (Fusion.shouldNotify(this, i, r.levels[i]))
                        alarm(i, r.levels[i], r.scores[i], r.reasons[i]);
                }
                if (worstVoiv >= 0 && worst > 0)
                    st.append(Sources.VOIVS[worstVoiv]).append(" ").append(worst).append(" pkt");
                else
                    st.append("bez sygnałów (okno ").append(Fusion.WINDOW_MIN).append(" min)");
                if (!diag.isEmpty()) st.append(" · ").append(diagText());
                updateStatus(st.toString());
            } catch (Exception e) {
                Log.w(TAG, "pętla", e);
            }
            try {
                Thread.sleep(20_000L);
            } catch (InterruptedException e) {
                break;
            }
        }
    }

    @Override
    public void onDestroy() {
        running.set(false);
        if (worker != null) worker.interrupt();
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
