package pl.straznik.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import java.util.List;

/**
 * Kanały powiadomień i budowa alarmu — wspólne dla ścieżki pusha FCM
 * ({@link StraznikFcmService}) i pełnoekranowego alarmu ({@link AlarmActivity}).
 *
 * Wcześniej te helpery mieszkały w wycofanej usłudze pierwszoplanowej
 * (MonitorService). Usługa w tle została usunięta — Android 15/16 i tak ubijał
 * `dataSync` FGS — a alarmy przy zamkniętej aplikacji dostarcza teraz push FCM
 * per województwo. Kod wystawiania powiadomień jest jednak nadal potrzebny, więc
 * żyje tutaj, bez martwej pętli i bez zależności od usługi.
 */
class Alarms {
    private static final String TAG = "StraznikAlarms";

    // sufiks wersji: kanał raz utworzony ignoruje zmiany dźwięku, wibracji i
    // ważności, więc podmiana sygnałów albo podniesienie żółtego do heads-up
    // wymaga nowego identyfikatora
    static final String CH_HIGH = "straznik-high-v3";
    static final String CH_INFO = "straznik-info-v3";
    // stare kanały do sprzątnięcia: dawne wersje z systemowymi dźwiękami oraz
    // „straznik-status" po wycofanej usłudze w tle (trwałe powiadomienie
    // „nasłuch aktywny" już nie istnieje)
    private static final String[] CH_LEGACY = {
        "straznik-high", "straznik-info", "straznik-high-v2", "straznik-info-v2",
        "straznik-status"};

    /**
     * Wszystkie 16 województw — ta sama lista i kolejność co config.VOIVODESHIPS
     * w backendzie i VOIVODESHIPS w engine.js. Telefon dopasowuje po nazwie
     * województwo z pusha FCM i subskrypcję tematu voiv_&lt;region&gt;.
     */
    static final String[] VOIVS = {
        "lubelskie", "podkarpackie", "podlaskie", "mazowieckie", "świętokrzyskie",
        "małopolskie", "warmińsko-mazurskie", "łódzkie", "śląskie", "kujawsko-pomorskie",
        "pomorskie", "zachodniopomorskie", "lubuskie", "wielkopolskie", "dolnośląskie",
        "opolskie"
    };

    static void createChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;

        // stare kanały (systemowe dźwięki, dawny status usługi) — usuwamy, żeby
        // nie dublowały wpisów w ustawieniach powiadomień
        for (String old : CH_LEGACY) {
            try { nm.deleteNotificationChannel(old); } catch (Exception ignored) {}
        }

        AudioAttributes alarmAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();

        // IMPORTANCE_HIGH, żeby żółty wyskakiwał jako baner (heads-up), a nie tylko
        // cicho lądował w szufladzie — czerwony zostaje mocniejszy przez pełny ekran,
        // ominięcie trybu cichego i budzenie ekranu, więc rozróżnienie zostaje
        NotificationChannel info = new NotificationChannel(CH_INFO,
            "Podwyższona uwaga (żółty)", NotificationManager.IMPORTANCE_HIGH);
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

    private static String reasonsOnly(List<String> reasons) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(reasons.size(), 6); i++) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(reasons.get(i));
        }
        return sb.toString();
    }

    /** Wystawienie powiadomienia alarmowego — wywoływane z odbioru pusha FCM. */
    static void postAlarm(Context ctx, int voiv, String level, double score, List<String> reasons) {
        String voivName = VOIVS[voiv];
        boolean high = "high".equals(level);
        String title = (high ? "WYSOKI PRIORYTET" : "PODWYŻSZONA UWAGA")
            + ": woj. " + voivName + " (" + score + " pkt)";
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < Math.min(reasons.size(), 4); i++) body.append(reasons.get(i)).append('\n');
        body.append("NIEOFICJALNE źródło — kieruj się syrenami, RCB i RSO.");

        PendingIntent open = PendingIntent.getActivity(ctx, 2,
            new Intent(ctx, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Czerwony poziom ma prowadzić do pełnoekranowego alarmu, tak jak połączenie
        // przychodzące: zapala ekran, pokazuje się nad blokadą, miga i gra do potwierdzenia.
        PendingIntent fullScreen = PendingIntent.getActivity(ctx, 3,
            new Intent(ctx, AlarmActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                // ekran alarmu sam składa nagłówek z województwa i punktów,
                // więc dostaje wyłącznie rozbicie na sygnały
                .putExtra(AlarmActivity.EXTRA_BODY, reasonsOnly(reasons))
                .putExtra(AlarmActivity.EXTRA_VOIV, voivName)
                .putExtra(AlarmActivity.EXTRA_SCORE, score),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(ctx, high ? CH_HIGH : CH_INFO)
            : new Notification.Builder(ctx);
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

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(2000 + voiv, b.build());

        if (high) ensureAlarmIsSeen(ctx, nm);
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
    static void ensureAlarmIsSeen(Context ctx, NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= 34 && nm != null && nm.canUseFullScreenIntent()) return;
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
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
}
