package pl.straznik.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
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
    // v4 (audyt B7): żółty gra jako zdarzenie powiadomienia, a nie alarm — szanuje
    // tryb cichy i Nie przeszkadzać. Budzić przez DND ma wyłącznie czerwony.
    static final String CH_INFO = "straznik-info-v4";
    // Ten sam żółty o ~10 dB ciszej i wariant zupełnie bez dźwięku. Androida nie da
    // się poprosić o głośność pojedynczego powiadomienia — regulacja jest możliwa
    // WYŁĄCZNIE przez wybór kanału (zgłoszenia czytelników: żółty budzi w nocy).
    static final String CH_INFO_QUIET = "straznik-info-cicho-v1";
    static final String CH_INFO_SILENT = "straznik-info-cisza-v1";
    // bez dźwięku: alarm potwierdzony, wiadomość opóźniona, powtórzenie
    static final String CH_QUIET = "straznik-quiet-v1";
    // stare kanały do sprzątnięcia: dawne wersje z systemowymi dźwiękami oraz
    // „straznik-status" po wycofanej usłudze w tle (trwałe powiadomienie
    // „nasłuch aktywny" już nie istnieje)
    private static final String[] CH_LEGACY = {
        "straznik-high", "straznik-info", "straznik-high-v2", "straznik-info-v2",
        "straznik-info-v3", "straznik-status"};

    /** Wiadomość starsza niż to pokazujemy cicho, z dopiskiem o opóźnieniu (audyt B2). */
    static final long STALE_AFTER_MS = 10 * 60 * 1000L;

    static final String ACTION_SILENCE = "pl.straznik.app.SILENCE_ALARM";
    static final String EXTRA_NOTIF_ID = "notif_id";

    // Ustawienia natywne trzymamy w pamięci urządzenia dostępnej przed pierwszym
    // odblokowaniem (audyt B6): push po nocnym restarcie telefonu musi je odczytać.
    static final String PREFS = "straznik_native";
    static final String KEY_FORCE_VOLUME = "force_max_volume";
    /** Głośność żółtego wybrana przez użytkownika: „normal”, „quiet” albo „silent”. */
    static final String KEY_YELLOW_LEVEL = "yellow_level";
    /** Użytkownik wyłączył „Alarmy na tym telefonie” — usługa FCM odrzuca alarmy. */
    static final String KEY_ALERTS_OFF = "alerts_off";
    private static final String KEY_SAVED_VOLUME = "saved_alarm_volume";

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

    static SharedPreferences prefs(Context ctx) {
        Context base = ctx.getApplicationContext() != null ? ctx.getApplicationContext() : ctx;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N)
            base = base.createDeviceProtectedStorageContext();
        return base.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

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
        AudioAttributes eventAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();

        // IMPORTANCE_HIGH, żeby żółty wyskakiwał jako baner (heads-up), a nie tylko
        // cicho lądował w szufladzie. Dźwięk jako zdarzenie powiadomienia: w nocy
        // przy włączonym Nie przeszkadzać żółty nie budzi (audyt B7).
        NotificationChannel info = new NotificationChannel(CH_INFO,
            "Podwyższona uwaga (żółty)", NotificationManager.IMPORTANCE_HIGH);
        info.setDescription("Sygnał uwagi — respektuje tryb cichy i Nie przeszkadzać");
        info.enableVibration(true);
        info.setVibrationPattern(new long[]{0, 220, 120, 220});
        // ten sam dwutonowy sygnał, który gra w otwartej aplikacji
        info.setSound(soundUri(ctx, R.raw.alert_uwaga), eventAttrs);
        nm.createNotificationChannel(info);

        // Kanał tworzymy zawsze, nie dopiero po włączeniu opcji: kanał raz utworzony
        // ignoruje zmiany dźwięku, więc lepiej, żeby istniał od początku i miał
        // własne, zapamiętane ustawienia użytkownika.
        NotificationChannel quietInfo = new NotificationChannel(CH_INFO_QUIET,
            "Podwyższona uwaga — ciszej (żółty)", NotificationManager.IMPORTANCE_HIGH);
        quietInfo.setDescription("Ten sam sygnał uwagi, około dziesięć razy ciszej");
        quietInfo.enableVibration(true);
        quietInfo.setVibrationPattern(new long[]{0, 220, 120, 220});
        quietInfo.setSound(soundUri(ctx, R.raw.alert_uwaga_cicho), eventAttrs);
        nm.createNotificationChannel(quietInfo);

        // Bez dźwięku, ale nadal IMPORTANCE_HIGH: baner ma wyskoczyć, telefon zawibrować.
        // CH_QUIET się do tego nie nadaje — ma niską ważność (tylko szuflada) i służy
        // czemu innemu, a wspólny kanał odebrałby możliwość osobnego ustawienia obu.
        NotificationChannel silentInfo = new NotificationChannel(CH_INFO_SILENT,
            "Podwyższona uwaga — bez dźwięku (żółty)", NotificationManager.IMPORTANCE_HIGH);
        silentInfo.setDescription("Sygnał uwagi tylko jako baner i wibracja");
        silentInfo.enableVibration(true);
        silentInfo.setVibrationPattern(new long[]{0, 220, 120, 220});
        silentInfo.setSound(null, null);
        nm.createNotificationChannel(silentInfo);

        NotificationChannel high = new NotificationChannel(CH_HIGH,
            "Wysoki priorytet (czerwony)", NotificationManager.IMPORTANCE_HIGH);
        high.setDescription("Alarm — przebija tryb cichy, jeśli na to zezwolisz");
        high.enableVibration(true);
        high.setVibrationPattern(new long[]{0, 700, 300, 700, 300, 900});
        high.setBypassDnd(true);
        // modulowana syrena alarmu powietrznego — identyczna jak w aplikacji
        high.setSound(soundUri(ctx, R.raw.alarm_syrena), alarmAttrs);
        nm.createNotificationChannel(high);

        NotificationChannel quiet = new NotificationChannel(CH_QUIET,
            "Alarmy potwierdzone i opóźnione (cicho)", NotificationManager.IMPORTANCE_LOW);
        quiet.setDescription("Bez dźwięku: potwierdzony alarm i wiadomości, które dotarły z opóźnieniem");
        quiet.setSound(null, null);
        quiet.enableVibration(false);
        nm.createNotificationChannel(quiet);
    }

    /** „HH:mm" z czasu wysyłki serwera; pusty napis, gdy czas nieznany (sentAtMs = 0). */
    static String godzina(long sentAtMs) {
        if (sentAtMs <= 0) return "";
        try {
            return new java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
                .format(new java.util.Date(sentAtMs));
        } catch (Exception e) {
            return "";
        }
    }

    static Uri soundUri(Context ctx, int resId) {
        return Uri.parse("android.resource://" + ctx.getPackageName() + "/" + resId);
    }

    /** Czy kanał czerwony zagra syrenę sam (użytkownik nie wyłączył dźwięku kanału). */
    static boolean highChannelPlaysSound(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm == null || !nm.areNotificationsEnabled()) return false;
            NotificationChannel ch = nm.getNotificationChannel(CH_HIGH);
            return ch != null && ch.getSound() != null
                && ch.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT;
        } catch (Exception e) {
            return false;
        }
    }

    private static String reasonsOnly(List<String> reasons) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(reasons.size(), 6); i++) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(reasons.get(i));
        }
        return sb.toString();
    }

    static int notifId(int voiv) { return 2000 + voiv; }

    // ── głośność czerwonego alarmu ─────────────────────────────────────────────────
    // Decyzja 13.09.2026: czerwony gra CO NAJMNIEJ na połowie głośności „Alarmy”
    // (wyciszony do zera suwak nie może zagłuszyć syreny), a pełną głośność włącza
    // wyłącznie użytkownik w ustawieniach. Żółtego to nie dotyczy. Poprzednią
    // głośność zapisujemy i przywracamy po wyciszeniu alarmu.

    static boolean forceVolumeEnabled(Context ctx) {
        return prefs(ctx).getBoolean(KEY_FORCE_VOLUME, false);
    }

    /** Wybrana głośność żółtego; nieznana wartość znaczy „normal”. */
    static String yellowLevel(Context ctx) {
        String v = prefs(ctx).getString(KEY_YELLOW_LEVEL, "normal");
        return ("quiet".equals(v) || "silent".equals(v)) ? v : "normal";
    }

    /** Kanał żółtego zależnie od ustawienia użytkownika. Czerwonego to nie dotyczy. */
    static String infoChannel(Context ctx) {
        switch (yellowLevel(ctx)) {
            case "quiet":  return CH_INFO_QUIET;
            case "silent": return CH_INFO_SILENT;
            default:       return CH_INFO;
        }
    }

    /** Docelowa głośność czerwonego: maksimum z opcją, inaczej co najmniej połowa. */
    static int targetAlarmVolume(int cur, int max, boolean forceMax) {
        if (forceMax) return max;
        return Math.max(cur, (max + 1) / 2);
    }

    static void raiseAlarmVolume(Context ctx) {
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int cur = am.getStreamVolume(AudioManager.STREAM_ALARM);
            int target = targetAlarmVolume(cur, max, forceVolumeEnabled(ctx));
            if (target <= cur) return;
            SharedPreferences p = prefs(ctx);
            if (!p.contains(KEY_SAVED_VOLUME)) p.edit().putInt(KEY_SAVED_VOLUME, cur).apply();
            am.setStreamVolume(AudioManager.STREAM_ALARM, target, 0);
        } catch (Exception e) {
            Log.w(TAG, "podniesienie głośności alarmu", e);
        }
    }

    static void restoreAlarmVolume(Context ctx) {
        try {
            SharedPreferences p = prefs(ctx);
            if (!p.contains(KEY_SAVED_VOLUME)) return;
            int saved = p.getInt(KEY_SAVED_VOLUME, -1);
            p.edit().remove(KEY_SAVED_VOLUME).apply();
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && saved >= 0) am.setStreamVolume(AudioManager.STREAM_ALARM, saved, 0);
        } catch (Exception e) {
            Log.w(TAG, "przywrócenie głośności alarmu", e);
        }
    }

    /**
     * Wycisza alarm: kasuje głośne powiadomienie (pętla syreny milknie), zostawia
     * ciche z tą samą treścią i przywraca głośność sprzed alarmu.
     */
    static void silence(Context ctx, int voiv) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String title = Last.title(voiv);
        nm.cancel(notifId(voiv));
        if (title != null) {
            Notification.Builder b = builder(ctx, CH_QUIET)
                .setContentTitle(title + " — potwierdzony")
                .setContentText(Last.text(voiv))
                .setStyle(new Notification.BigTextStyle().bigText(Last.text(voiv)))
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentIntent(openApp(ctx))
                .setAutoCancel(true);
            nm.notify(notifId(voiv), b.build());
        }
        restoreAlarmVolume(ctx);
    }

    /** Treść ostatniego alarmu per województwo — do cichej kopii po wyciszeniu. */
    static final class Last {
        private static final String[] TITLES = new String[VOIVS.length];
        private static final String[] TEXTS = new String[VOIVS.length];
        static synchronized void put(int v, String title, String text) { TITLES[v] = title; TEXTS[v] = text; }
        static synchronized String title(int v) { return v >= 0 && v < VOIVS.length ? TITLES[v] : null; }
        static synchronized String text(int v) { return v >= 0 && v < VOIVS.length ? TEXTS[v] : ""; }
    }

    private static Notification.Builder builder(Context ctx, String channel) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(ctx, channel)
            : new Notification.Builder(ctx);
    }

    private static PendingIntent openApp(Context ctx) {
        return PendingIntent.getActivity(ctx, 2,
            new Intent(ctx, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Wystawienie powiadomienia alarmowego — wywoływane z odbioru pusha FCM. */
    static void postAlarm(Context ctx, int voiv, String level, double score, List<String> reasons) {
        postAlarm(ctx, voiv, level, score, reasons, null, 0L, false);
    }

    /**
     * @param headline  pierwsza linia „co i gdzie" z serwera (może być null)
     * @param sentAtMs  czas wysyłki z serwera; 0 = nieznany
     * @param test      alarm testowy z ustawień (bez utrwalania, z dopiskiem TEST)
     */
    static void postAlarm(Context ctx, int voiv, String level, double score, List<String> reasons,
                          String headline, long sentAtMs, boolean test) {
        String voivName = VOIVS[voiv];
        boolean high = "high".equals(level);
        long ageMs = sentAtMs > 0 ? System.currentTimeMillis() - sentAtMs : 0;
        boolean stale = ageMs > STALE_AFTER_MS;

        String title = (test ? "TEST — " : "")
            + (high ? "WYSOKI PRIORYTET" : "PODWYŻSZONA UWAGA")
            + ": woj. " + voivName + " (" + score + " pkt)";
        if (stale) title = title + " — opóźnione o " + (ageMs / 60000) + " min";
        // Godzina WYSYŁKI, nie dotarcia: przy spóźnionym pushu to dwie różne rzeczy,
        // a liczy się ta, o której serwer stwierdził zagrożenie (prośba użytkownika
        // 24.09.2026). Stoi na początku treści — i w zwiniętym, i w rozwiniętym
        // powiadomieniu — bo zwinięte pokazuje wyłącznie `firstLine`.
        String czas = godzina(sentAtMs);
        StringBuilder body = new StringBuilder();
        if (headline != null && !headline.isEmpty()) body.append(headline).append('\n');
        for (int i = 0; i < Math.min(reasons.size(), 4); i++) body.append(reasons.get(i)).append('\n');
        body.append(high
            ? "Co zrobić: przejdź do schronu lub pomieszczenia bez okien i śledź komunikaty RCB.\n"
            : "Co zrobić: zachowaj czujność i sprawdź komunikaty RCB.\n");
        body.append("NIEOFICJALNE źródło — kieruj się syrenami, RCB i RSO.");
        String firstLine = headline != null && !headline.isEmpty() ? headline
            : (reasons.isEmpty() ? "" : reasons.get(0));
        if (!czas.isEmpty()) {
            firstLine = czas + " · " + firstLine;
            body.insert(0, czas + " · ");
        }
        Last.put(voiv, title, body.toString());

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);

        // Opóźniona wiadomość nie może wyć: cicho, bez pełnego ekranu (audyt B2).
        if (stale) {
            Notification.Builder b = builder(ctx, CH_QUIET)
                .setContentTitle(title).setContentText(firstLine)
                .setStyle(new Notification.BigTextStyle().bigText(body.toString()))
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentIntent(openApp(ctx)).setAutoCancel(true);
            if (nm != null) nm.notify(notifId(voiv), b.build());
            return;
        }

        // Czerwony poziom ma prowadzić do pełnoekranowego alarmu, tak jak połączenie
        // przychodzące: zapala ekran, pokazuje się nad blokadą, miga i gra do potwierdzenia.
        // Kod żądania per województwo (audyt B11): dwa czerwone naraz miały wspólny
        // PendingIntent, więc ekran alarmu pokazywał dane tylko ostatniego.
        PendingIntent fullScreen = PendingIntent.getActivity(ctx, 3000 + voiv,
            new Intent(ctx, AlarmActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                // ekran alarmu sam składa nagłówek z województwa i punktów,
                // więc dostaje wyłącznie rozbicie na sygnały
                .putExtra(AlarmActivity.EXTRA_BODY, reasonsOnly(reasons))
                .putExtra(AlarmActivity.EXTRA_TITLE, headline)
                .putExtra(AlarmActivity.EXTRA_VOIV, voivName)
                .putExtra(AlarmActivity.EXTRA_VOIV_INDEX, voiv)
                .putExtra(AlarmActivity.EXTRA_TEST, test)
                .putExtra(AlarmActivity.EXTRA_SCORE, score)
                .putExtra(AlarmActivity.EXTRA_SENT_AT, sentAtMs),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = builder(ctx, high ? CH_HIGH : infoChannel(ctx));
        b.setContentTitle(title)
         .setContentText(firstLine)
         .setStyle(new Notification.BigTextStyle().bigText(body.toString()))
         .setSmallIcon(android.R.drawable.ic_dialog_alert)
         .setContentIntent(openApp(ctx))
         .setAutoCancel(true);
        // Zegarek w rogu powiadomienia też ma pokazywać czas WYSYŁKI. Bez tego
        // Android wpisuje moment dotarcia, więc spóźniony push wyglądał na świeży.
        if (sentAtMs > 0) b.setWhen(sentAtMs).setShowWhen(true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setPriority(high ? Notification.PRIORITY_MAX : Notification.PRIORITY_DEFAULT);
            b.setDefaults(Notification.DEFAULT_VIBRATE | Notification.DEFAULT_SOUND);
            if (high) b.setSound(android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI);
        }
        if (high) {
            PendingIntent silenceIntent = PendingIntent.getBroadcast(ctx, 4000 + voiv,
                new Intent(ctx, AlarmActionReceiver.class).setAction(ACTION_SILENCE)
                    .putExtra(EXTRA_NOTIF_ID, voiv),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.setFullScreenIntent(fullScreen, true);
            b.setCategory(Notification.CATEGORY_ALARM);
            b.setOngoing(true);        // alarm nie znika przypadkowym muśnięciem
            b.setDeleteIntent(silenceIntent);
            b.addAction(new Notification.Action.Builder(null, "Wycisz alarm", silenceIntent).build());
        }

        Notification n = b.build();
        // Audyt B11: przy włączonym ekranie czerwony grał syrenę raz, przez 8 s.
        // Flaga INSISTENT powtarza dźwięk kanału, dopóki użytkownik nie wyciszy.
        if (high) n.flags |= Notification.FLAG_INSISTENT;

        if (high) raiseAlarmVolume(ctx);
        if (nm != null) nm.notify(notifId(voiv), n);

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
