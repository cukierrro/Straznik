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
import android.os.VibrationEffect;
import android.os.Vibrator;
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
    // v4 (10.10.2026): wibracja alfabetem Morse'a — patrz WZOR_A / WZOR_U.
    static final String CH_HIGH = "straznik-high-v4";
    // v4 (audyt B7): żółty gra jako zdarzenie powiadomienia, a nie alarm — szanuje
    // tryb cichy i Nie przeszkadzać. Budzić przez DND ma wyłącznie czerwony.
    // v5 (10.10.2026): wibracja „U” alfabetem Morse'a.
    static final String CH_INFO = "straznik-info-v5";
    // Ten sam żółty o ~10 dB ciszej i wariant zupełnie bez dźwięku. Androida nie da
    // się poprosić o głośność pojedynczego powiadomienia — regulacja jest możliwa
    // WYŁĄCZNIE przez wybór kanału (zgłoszenia czytelników: żółty budzi w nocy).
    static final String CH_INFO_QUIET = "straznik-info-cicho-v2";
    static final String CH_INFO_SILENT = "straznik-info-cisza-v2";
    // Czerwony bez dźwięku, ale z pełną wibracją i obejściem Nie przeszkadzać
    // (prośba czytelnika 29.09.2026: „zamiast syreny niech zawibruje zegarek”).
    // Osobny kanał, bo Android nie pozwala wyciszyć pojedynczego powiadomienia —
    // można tylko wybrać kanał z innym dźwiękiem albo bez niego.
    static final String CH_HIGH_SILENT = "straznik-high-cisza-v2";
    // Czerwony jako ZWYKŁE powiadomienie (prośba czytelnika 10.10.2026): baner,
    // krótki dźwięk i wibracja „A”, bez pełnego ekranu, syreny i obejścia trybu
    // Nie przeszkadzać — pośrednio między syreną a wyłączeniem alarmów w ogóle.
    static final String CH_HIGH_NORMAL = "straznik-high-zwykly-v1";
    // bez dźwięku: alarm potwierdzony, wiadomość opóźniona, powtórzenie
    static final String CH_QUIET = "straznik-quiet-v1";
    // stare kanały do sprzątnięcia: dawne wersje z systemowymi dźwiękami oraz
    // „straznik-status" po wycofanej usłudze w tle (trwałe powiadomienie
    // „nasłuch aktywny" już nie istnieje)
    private static final String[] CH_LEGACY = {
        "straznik-high", "straznik-info", "straznik-high-v2", "straznik-info-v2",
        "straznik-info-v3", "straznik-status",
        "straznik-high-v3", "straznik-info-v4", "straznik-info-cicho-v1",
        "straznik-info-cisza-v1", "straznik-high-cisza-v1"};

    // ── wibracja alfabetem Morse'a (decyzja usera 10.10.2026) ──────────────────
    // Żółty to „U” (· · —): Uwaga / Увага / Urgent. Czerwony to „A” (· —):
    // Alarm / Атака. Kto zna Morse'a, czyta literę; kto nie zna, czuje dwa rytmy
    // nie do pomylenia ze sobą ani z SMS-em — dawny żółty (dwa krótkie) był
    // prawie identyczny z domyślną wibracją Androida. Nie SOS: to wołanie o pomoc,
    // a część telefonów i aplikacji ratunkowych już go używa.
    // Kropka = 1 jednostka, kreska = 3, przerwa w literze = 1, między literami = 3.
    // Czerwony na dłuższej jednostce, żeby był mocniejszy w kieszeni.
    // TE SAME wzory są w app.js (WIBRACJA_U / WIBRACJA_A) i sw.js — pilnuje
    // scripts/test_wibracje_morse.cjs. Tablice Androida zaczynają się od opóźnienia.
    static final long[] WZOR_U = {0, 150, 150, 150, 150, 450, 450, 150, 150, 150, 150, 450};
    static final long[] WZOR_A = {0, 200, 200, 600, 600, 200, 200, 600, 600, 200, 200, 600};
    /** Pełny ekran powtarza „A A A” z przerwą słowa (7 jednostek), aż ktoś potwierdzi. */
    static final long[] WZOR_A_PETLA = {0, 200, 200, 600, 600, 200, 200, 600, 600, 200, 200, 600, 1400};

    /** Od tylu minut alarm mówi o opóźnieniu, a od STALE_AFTER_MS mówi to dobitnie; gra zawsze (2.11.2026). */
    static final long SPOZNIONY_OD_MS = 3 * 60 * 1000L;
    static final long STALE_AFTER_MS = 10 * 60 * 1000L;

    static final String ACTION_SILENCE = "pl.straznik.app.SILENCE_ALARM";
    static final String EXTRA_NOTIF_ID = "notif_id";
    /**
     * Najdłuższy czas głośnego czerwonego alarmu (decyzja usera 21.10.2026: bateria,
     * grzanie telefonu i ekranu). Po nim syrena, wibracja i miganie gasną same,
     * a powiadomienie przechodzi na ciche — jak po „Wycisz”. Ten sam limit ma ekran
     * alarmu w aplikacji (app.js ALARM_MAX_MIN); pilnuje scripts/test_alarm_limit.cjs.
     */
    static final long ALARM_MAX_MS = 15 * 60 * 1000L;
    /** Automatyczne wyciszenie po ALARM_MAX_MS — z czasem wystawienia alarmu. */
    static final String EXTRA_AUTO_POSTED_AT = "auto_posted_at";
    /** Ile powodów pokazuje powiadomienie i ekran alarmu (21.10.2026: było 4 i 6). */
    static final int POWODY_MAX = 3;
    private static final String KEY_POSTED_PREFIX = "alarm_posted_";

    // Ustawienia natywne trzymamy w pamięci urządzenia dostępnej przed pierwszym
    // odblokowaniem (audyt B6): push po nocnym restarcie telefonu musi je odczytać.
    static final String PREFS = "straznik_native";
    static final String KEY_FORCE_VOLUME = "force_max_volume";
    /** Głośność żółtego wybrana przez użytkownika: „normal”, „quiet” albo „silent”. */
    static final String KEY_YELLOW_LEVEL = "yellow_level";
    static final String KEY_RED_SILENT = "czerwony_cisza";
    /** Tryb czerwonego: „syrena” (domyślnie), „wibracja” albo „zwykle”. Zastępuje
     *  KEY_RED_SILENT, który zostaje odczytywany jako „wibracja” dla starszych zapisów. */
    static final String KEY_RED_MODE = "czerwony_tryb";
    static final String RED_SIREN = "syrena", RED_VIBRATION = "wibracja", RED_NORMAL = "zwykle";
    // Godziny ciszy (prośba czytelnika 13.10.2026: „w dzień chcę słyszeć, w nocy w domu
    // wystarczy wibracja”). Minuty od północy; od == do znaczy „nigdy”.
    static final String KEY_QUIET_ON = "cisza_wlaczona", KEY_QUIET_FROM = "cisza_od",
        KEY_QUIET_TO = "cisza_do", KEY_QUIET_RED = "cisza_czerwony";
    static final int QUIET_FROM_DEFAULT = 22 * 60, QUIET_TO_DEFAULT = 7 * 60;
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
        info.setVibrationPattern(WZOR_U);
        // ten sam dwutonowy sygnał, który gra w otwartej aplikacji
        info.setSound(soundUri(ctx, R.raw.alert_uwaga), eventAttrs);
        utworz(nm, info, "straznik-info-v4");

        // Kanał tworzymy zawsze, nie dopiero po włączeniu opcji: kanał raz utworzony
        // ignoruje zmiany dźwięku, więc lepiej, żeby istniał od początku i miał
        // własne, zapamiętane ustawienia użytkownika.
        NotificationChannel quietInfo = new NotificationChannel(CH_INFO_QUIET,
            "Podwyższona uwaga — ciszej (żółty)", NotificationManager.IMPORTANCE_HIGH);
        quietInfo.setDescription("Ten sam sygnał uwagi, około dziesięć razy ciszej");
        quietInfo.enableVibration(true);
        quietInfo.setVibrationPattern(WZOR_U);
        quietInfo.setSound(soundUri(ctx, R.raw.alert_uwaga_cicho), eventAttrs);
        utworz(nm, quietInfo, "straznik-info-cicho-v1");

        // Bez dźwięku, ale nadal IMPORTANCE_HIGH: baner ma wyskoczyć, telefon zawibrować.
        // CH_QUIET się do tego nie nadaje — ma niską ważność (tylko szuflada) i służy
        // czemu innemu, a wspólny kanał odebrałby możliwość osobnego ustawienia obu.
        NotificationChannel silentInfo = new NotificationChannel(CH_INFO_SILENT,
            "Podwyższona uwaga — bez dźwięku (żółty)", NotificationManager.IMPORTANCE_HIGH);
        silentInfo.setDescription("Sygnał uwagi tylko jako baner i wibracja");
        silentInfo.enableVibration(true);
        silentInfo.setVibrationPattern(WZOR_U);
        silentInfo.setSound(null, null);
        utworz(nm, silentInfo, "straznik-info-cisza-v1");

        NotificationChannel high = new NotificationChannel(CH_HIGH,
            "Wysoki priorytet (czerwony)", NotificationManager.IMPORTANCE_HIGH);
        high.setDescription("Alarm — przebija tryb cichy, jeśli na to zezwolisz");
        high.enableVibration(true);
        high.setVibrationPattern(WZOR_A);
        high.setBypassDnd(true);
        // modulowana syrena alarmu powietrznego — identyczna jak w aplikacji
        high.setSound(soundUri(ctx, R.raw.alarm_syrena), alarmAttrs);
        utworz(nm, high, "straznik-high-v3");

        // Ten sam czerwony, tylko bez syreny. Wibracja, ważność i obejście trybu
        // Nie przeszkadzać zostają bez zmian — chodzi o zdjęcie dźwięku, nie o
        // obniżenie alarmu do zwykłego powiadomienia.
        NotificationChannel highSilent = new NotificationChannel(CH_HIGH_SILENT,
            "Wysoki priorytet — tylko wibracja (czerwony)", NotificationManager.IMPORTANCE_HIGH);
        highSilent.setDescription("Alarm bez syreny: sama wibracja i pełny ekran");
        highSilent.enableVibration(true);
        highSilent.setVibrationPattern(WZOR_A);
        highSilent.setBypassDnd(true);
        highSilent.setSound(null, null);
        utworz(nm, highSilent, "straznik-high-cisza-v1");

        // Czerwony jako zwykłe powiadomienie: dźwięk zdarzenia jak żółty (szanuje
        // tryb cichy i Nie przeszkadzać — świadomie, tego chciał czytelnik), bez
        // obejścia DND. Nowy kanał, więc nie ma czego przenosić.
        NotificationChannel highNormal = new NotificationChannel(CH_HIGH_NORMAL,
            "Wysoki priorytet — zwykłe powiadomienie (czerwony)", NotificationManager.IMPORTANCE_HIGH);
        highNormal.setDescription("Czerwony bez syreny i pełnego ekranu: baner, krótki dźwięk i wibracja");
        highNormal.enableVibration(true);
        highNormal.setVibrationPattern(WZOR_A);
        highNormal.setSound(soundUri(ctx, R.raw.alert_uwaga), eventAttrs);
        nm.createNotificationChannel(highNormal);

        NotificationChannel quiet = new NotificationChannel(CH_QUIET,
            "Alarmy potwierdzone i opóźnione (cicho)", NotificationManager.IMPORTANCE_LOW);
        quiet.setDescription("Bez dźwięku: potwierdzony alarm i wiadomości, które dotarły z opóźnieniem");
        quiet.setSound(null, null);
        quiet.enableVibration(false);
        nm.createNotificationChannel(quiet);

        // Stare kanały sprzątamy DOPIERO teraz: utworz() musiało jeszcze odczytać
        // z nich, co użytkownik wyłączył.
        for (String old : CH_LEGACY) {
            try { nm.deleteNotificationChannel(old); } catch (Exception ignored) {}
        }
    }

    /**
     * Tworzy kanał, a przy PIERWSZYM utworzeniu przenosi ze starej wersji to, co
     * użytkownik sam wyłączył w ustawieniach systemu: cały kanał albo wibrację.
     *
     * Nowy wzór wibracji wymaga nowego identyfikatora (kanał po utworzeniu ignoruje
     * zmiany), a nowy kanał startuje z naszymi domyślnymi. Bez tego ktoś, kto
     * wyciszył żółty w ustawieniach telefonu, po aktualizacji znów by go dostawał.
     * Dźwięku wybranego w systemie nie przenosimy — wraca nasz.
     */
    private static void utworz(NotificationManager nm, NotificationChannel nowy, String stary) {
        try {
            if (nm.getNotificationChannel(nowy.getId()) == null) {
                NotificationChannel s = nm.getNotificationChannel(stary);
                if (s != null) {
                    if (s.getImportance() == NotificationManager.IMPORTANCE_NONE)
                        nowy.setImportance(NotificationManager.IMPORTANCE_NONE);
                    if (!s.shouldVibrate()) nowy.enableVibration(false);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "przeniesienie ustawień kanału " + stary, e);
        }
        nm.createNotificationChannel(nowy);
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
            NotificationChannel ch = nm.getNotificationChannel(highChannel(ctx));
            return ch != null && ch.getSound() != null
                && ch.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT;
        } catch (Exception e) {
            return false;
        }
    }

    private static String reasonsOnly(List<String> reasons) {
        StringBuilder sb = new StringBuilder();
        for (String r : powody(reasons)) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(r);
        }
        return sb.toString();
    }

    /**
     * Najwyżej POWODY_MAX powodów, bez nagłówków grup („Oficjalnie:”, „Wskaźniki
     * (nieoficjalne):”) — przy dłuższej liście przyciski ekranu alarmu i sedno
     * powiadomienia uciekały pod krawędź (21.10.2026). Pełna lista jest w aplikacji.
     */
    static List<String> powody(List<String> reasons) {
        List<String> out = new java.util.ArrayList<>();
        if (reasons == null) return out;
        for (String r : reasons) {
            if (r == null) continue;
            String t = r.trim();
            if (t.isEmpty() || t.endsWith(":")) continue;
            out.add(t);
            if (out.size() >= POWODY_MAX) break;
        }
        return out;
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

    /** Tryb czerwonego; zapis sprzed 10.10.2026 (sam przełącznik ciszy) czytamy jako „wibracja”. */
    static String redMode(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String v = p.getString(KEY_RED_MODE, null);
        if (RED_VIBRATION.equals(v) || RED_NORMAL.equals(v) || RED_SIREN.equals(v)) return v;
        return p.getBoolean(KEY_RED_SILENT, false) ? RED_VIBRATION : RED_SIREN;
    }

    /** Czy czerwony alarm ma iść bez syreny (wibracja albo zwykłe powiadomienie) — TERAZ,
     *  z uwzględnieniem godzin ciszy. */
    static boolean redSilent(Context ctx) {
        return !RED_SIREN.equals(redModeNow(ctx));
    }

    /** Czy czerwony ma przyjść jak zwykłe powiadomienie: bez pełnego ekranu i syreny. */
    static boolean redNormal(Context ctx) {
        return RED_NORMAL.equals(redModeNow(ctx));
    }

    // ── godziny ciszy ────────────────────────────────────────────────────────────
    // Zapisany wybór (redMode, yellowLevel) zostaje bez zmian — w godzinach ciszy
    // liczy się wariant „teraz”: żółty bez dźwięku, czerwony z syreną → tylko wibracja
    // (chyba że użytkownik wybrał „syrena jak w dzień”). Wszystko, co decyduje o
    // dźwięku (kanał, pełny ekran, syrena, głośność, „Poczuj”), pyta o wariant „teraz”.

    static boolean quietEnabled(Context ctx) { return prefs(ctx).getBoolean(KEY_QUIET_ON, false); }
    static int quietFrom(Context ctx) { return prefs(ctx).getInt(KEY_QUIET_FROM, QUIET_FROM_DEFAULT); }
    static int quietTo(Context ctx) { return prefs(ctx).getInt(KEY_QUIET_TO, QUIET_TO_DEFAULT); }
    static String quietRed(Context ctx) {
        return RED_SIREN.equals(prefs(ctx).getString(KEY_QUIET_RED, RED_VIBRATION)) ? RED_SIREN : RED_VIBRATION;
    }

    /** Czy minuta doby `teraz` leży w przedziale [od, do) — także przez północ. */
    static boolean inWindow(int od, int doo, int teraz) {
        if (od == doo) return false;
        return od < doo ? (teraz >= od && teraz < doo) : (teraz >= od || teraz < doo);
    }

    static boolean quietNow(Context ctx) {
        if (!quietEnabled(ctx)) return false;
        java.util.Calendar c = java.util.Calendar.getInstance();
        int teraz = c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE);
        return inWindow(quietFrom(ctx), quietTo(ctx), teraz);
    }

    /** Tryb czerwonego obowiązujący w tej chwili. „Zwykłe powiadomienie” i „tylko wibracja”
     *  wybrane na stałe zostają — cisza nigdy nie robi alarmu GŁOŚNIEJSZYM. */
    static String redModeNow(Context ctx) {
        String m = redMode(ctx);
        if (RED_SIREN.equals(m) && quietNow(ctx) && RED_VIBRATION.equals(quietRed(ctx))) return RED_VIBRATION;
        return m;
    }

    /** Głośność żółtego obowiązująca w tej chwili: w godzinach ciszy bez dźwięku. */
    static String yellowLevelNow(Context ctx) {
        return quietNow(ctx) ? "silent" : yellowLevel(ctx);
    }

    /**
     * Przyciski „Poczuj” (11.10.2026): wzór wibracji tą samą drogą co prawdziwy
     * sygnał. Wibracja ze strony (navigator.vibrate) idzie w Androidzie jako
     * „dotyk” — milczy w trybie cichym i przy wyłączonych wibracjach dotyku, choć
     * alarm wtedy wibruje (zgłoszenie usera). Żółty: jak powiadomienie, czerwony:
     * jak alarm (albo jak powiadomienie w trybie „zwykłe”).
     * Zwraca "ok", "bez_wibratora", "kanal_bez_wibracji" (użytkownik wyłączył
     * wibrację kanału — prawdziwy sygnał też nie zawibruje) albo "tryb_cichy":
     * powiadomienie w trybie cichym Android odrzuca (sprawdzone na Pixelu 7:
     * status ignored_for_ringer_mode), a alarm wibruje mimo to.
     */
    static String poczuj(Context ctx, boolean czerwony) {
        Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return "bez_wibratora";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            NotificationChannel ch = nm == null ? null
                : nm.getNotificationChannel(czerwony ? highChannel(ctx) : infoChannel(ctx));
            if (ch != null && (!ch.shouldVibrate()
                    || ch.getImportance() == NotificationManager.IMPORTANCE_NONE)) return "kanal_bez_wibracji";
        }
        boolean alarm = czerwony && !redNormal(ctx);
        AudioAttributes aa = new AudioAttributes.Builder()
            .setUsage(alarm ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        long[] wzor = czerwony ? WZOR_A : WZOR_U;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            v.vibrate(VibrationEffect.createWaveform(wzor, -1), aa);
        else
            v.vibrate(wzor, -1, aa);
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (!alarm && am != null && am.getRingerMode() == AudioManager.RINGER_MODE_SILENT) return "tryb_cichy";
        return "ok";
    }

    /** Kanał czerwonego zależnie od wybranego trybu. */
    static String highChannel(Context ctx) {
        switch (redModeNow(ctx)) {
            case RED_VIBRATION: return CH_HIGH_SILENT;
            case RED_NORMAL:    return CH_HIGH_NORMAL;
            default:            return CH_HIGH;
        }
    }

    /** Kanał żółtego zależnie od ustawienia użytkownika. Czerwonego to nie dotyczy. */
    static String infoChannel(Context ctx) {
        switch (yellowLevelNow(ctx)) {
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
        // Przy „tylko wibracja” podnoszenie głośności alarmów byłoby ingerencją
        // w ustawienia telefonu bez żadnego skutku — nic nie ma zagrać.
        if (redSilent(ctx)) return;
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
        silence(ctx, voiv, false);
    }

    /** @param auto wyciszenie po ALARM_MAX_MS, a nie przez użytkownika */
    static void silence(Context ctx, int voiv, boolean auto) {
        try { prefs(ctx).edit().remove(KEY_POSTED_PREFIX + voiv).apply(); } catch (Exception ignored) {}
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String title = Last.title(voiv);
        nm.cancel(notifId(voiv));
        dziennik(ctx, auto ? "limit" : "wyciszono", VOIVS[voiv], "high", null);
        // syrena gra teraz z ekranu alarmu — samo skasowanie powiadomienia jej nie zgasi
        AlarmActivity.wyciszono(voiv, auto);
        if (title != null) {
            Notification.Builder b = builder(ctx, CH_QUIET)
                .setContentTitle(title + (auto ? " — wyciszony po 15 min" : " — potwierdzony"))
                .setContentText(Last.text(voiv))
                .setStyle(new Notification.BigTextStyle().bigText(Last.text(voiv)))
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentIntent(openApp(ctx))
                .setAutoCancel(true);
            nm.notify(notifId(voiv), b.build());
        }
        restoreAlarmVolume(ctx);
    }

    /**
     * Automatyczne wyciszenie po ALARM_MAX_MS (AlarmActionReceiver). Działa tylko,
     * gdy to wciąż TEN SAM alarm: nowszy alarm albo wcześniejsze wyciszenie zmienia
     * zapisany czas wystawienia, więc stare zlecenie niczego nie zgasi.
     */
    static void autoSilence(Context ctx, int voiv, long postedAt) {
        long zapisany;
        try { zapisany = prefs(ctx).getLong(KEY_POSTED_PREFIX + voiv, -1L); }
        catch (Exception e) { zapisany = -1L; }
        if (postedAt <= 0 || zapisany != postedAt) return;
        silence(ctx, voiv, true);
    }

    /** Zlecenie automatycznego wyciszenia za ALARM_MAX_MS (bez uprawnień do alarmów dokładnych). */
    private static void zaplanujAutoWyciszenie(Context ctx, int voiv, long postedAt) {
        try {
            prefs(ctx).edit().putLong(KEY_POSTED_PREFIX + voiv, postedAt).apply();
            android.app.AlarmManager am = (android.app.AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, 5000 + voiv,
                new Intent(ctx, AlarmActionReceiver.class).setAction(ACTION_SILENCE)
                    .putExtra(EXTRA_NOTIF_ID, voiv).putExtra(EXTRA_AUTO_POSTED_AT, postedAt),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            long kiedy = postedAt + ALARM_MAX_MS;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                am.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, kiedy, pi);
            else
                am.set(android.app.AlarmManager.RTC_WAKEUP, kiedy, pi);
        } catch (Exception e) {
            Log.w(TAG, "zlecenie automatycznego wyciszenia", e);
        }
    }

    /**
     * Ciche powiadomienie, gdy alarm pokazała już OTWARTA aplikacja (11.10.2026).
     *
     * Google obniża priorytet pilnym wiadomościom FCM, które nie kończą się
     * widocznym powiadomieniem — ocenia to z 7 dni, osobno dla każdego telefonu.
     * Alarm przekazany do otwartej aplikacji był dla Google „niczym”, więc kto
     * często ma Strażnika na ekranie, dostawał potem alarmy przy zgaszonym ekranie
     * z opóźnieniem (u usera 80 s). To powiadomienie jest bez dźwięku i wibracji
     * (kanał CH_QUIET) — alarm i tak widać w aplikacji — ale zostaje w szufladzie.
     * Ten sam identyfikator co alarm: późniejszy alarm natywny je zastąpi.
     */
    static void postShownInApp(Context ctx, int voiv, String level, double score,
                               String headline, long sentAtMs) {
        if (voiv < 0 || voiv >= VOIVS.length) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String title = ("high".equals(level) ? "WYSOKI PRIORYTET" : "PODWYŻSZONA UWAGA")
            + ": woj. " + VOIVS[voiv] + " (" + score + " pkt)";
        String text = (headline != null && !headline.isEmpty() ? headline + "\n" : "")
            + "Pokazane w otwartej aplikacji.";
        Notification.Builder b = builder(ctx, CH_QUIET)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(openApp(ctx))
            .setAutoCancel(true);
        if (sentAtMs > 0) b.setWhen(sentAtMs).setShowWhen(true);
        try { nm.notify(notifId(voiv), b.build()); }
        catch (Exception e) { Log.w(TAG, "ciche powiadomienie z otwartej aplikacji", e); }
    }

    /** Treść ostatniego alarmu per województwo — do cichej kopii po wyciszeniu. */
    /**
     * Dziennik alarmów na tym telefonie (1.8.05). Noc z 31.10 na 1.11.2026: czerwony
     * o 3:06, a rano nie dało się ustalić, czy w ogóle dotarł — pamiętaliśmy tylko
     * ostatni push, a ten nadpisał poranny żółty. Dane zostają w telefonie.
     */
    static final String KEY_DZIENNIK = "dziennik_alarmow";
    private static final int DZIENNIK_MAX = 40;

    static synchronized void dziennik(Context ctx, String zdarzenie, String voiv, String level,
                                      org.json.JSONObject szczegoly) {
        try {
            SharedPreferences p = prefs(ctx);
            org.json.JSONArray stare = new org.json.JSONArray(p.getString(KEY_DZIENNIK, "[]"));
            org.json.JSONArray nowe = new org.json.JSONArray();
            for (int i = Math.max(0, stare.length() - (DZIENNIK_MAX - 1)); i < stare.length(); i++)
                nowe.put(stare.get(i));
            org.json.JSONObject wpis = new org.json.JSONObject()
                .put("t", System.currentTimeMillis()).put("e", zdarzenie);
            if (voiv != null) wpis.put("v", voiv);
            if (level != null) wpis.put("l", level);
            if (szczegoly != null) wpis.put("d", szczegoly);
            nowe.put(wpis);
            p.edit().putString(KEY_DZIENNIK, nowe.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "dziennik alarmów", e);
        }
    }

    /** Stan telefonu w chwili alarmu: to, od czego zależy, czy było słychać i widać. */
    private static org.json.JSONObject stanPrzyAlarmie(Context ctx, NotificationManager nm, String kanal) {
        org.json.JSONObject d = new org.json.JSONObject();
        try {
            d.put("kanal", kanal).put("tryb", redModeNow(ctx));
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) d.put("ekran", pm.isInteractive());
            if (nm != null) {
                d.put("nieprzeszkadzac", nm.getCurrentInterruptionFilter());
                d.put("pelny", Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent());
            }
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                d.put("glosnosc", am.getStreamVolume(AudioManager.STREAM_ALARM));
                d.put("glosnoscMax", am.getStreamMaxVolume(AudioManager.STREAM_ALARM));
            }
        } catch (Exception ignored) {}
        return d;
    }

    private static PendingIntent wyciszIntent(Context ctx, int voiv) {
        return PendingIntent.getBroadcast(ctx, 4000 + voiv,
            new Intent(ctx, AlarmActionReceiver.class).setAction(ACTION_SILENCE)
                .putExtra(EXTRA_NOTIF_ID, voiv),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Powiadomienie trwającego alarmu bez pełnego ekranu, z podanego kanału. */
    private static void powiadomienieTrwajace(Context ctx, int voiv, long postedAt, String kanal, boolean bezAlertu) {
        if (voiv < 0 || voiv >= VOIVS.length) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String title = Last.title(voiv);
        if (title == null) title = "WYSOKI PRIORYTET: woj. " + VOIVS[voiv];
        String text = Last.text(voiv);
        if (text == null) text = "";
        PendingIntent wycisz = wyciszIntent(ctx, voiv);
        Notification.Builder b = builder(ctx, kanal)
            .setContentTitle(title).setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentIntent(openApp(ctx))
            .setCategory(Notification.CATEGORY_ALARM)
            .setDeleteIntent(wycisz)
            .setOnlyAlertOnce(bezAlertu)
            .addAction(new Notification.Action.Builder(null, "Wycisz alarm", wycisz).build());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            long zostalo = (postedAt > 0 ? postedAt : System.currentTimeMillis()) + ALARM_MAX_MS
                + 60_000L - System.currentTimeMillis();
            if (zostalo > 0) b.setTimeoutAfter(zostalo);
        }
        Notification n = b.build();
        // MainActivity po tej fladze poznaje trwający alarm i nie przywraca głośności
        n.flags |= Notification.FLAG_INSISTENT;
        nm.notify(notifId(voiv), n);
    }

    /**
     * Ekran alarmu przejął syrenę: powiadomienie przechodzi na kanał bez dźwięku.
     * Android gra dźwięki powiadomień jednym odtwarzaczem i traktuje je jak zbywalne.
     * Zmierzone 1.11.2026: syrenę z kanału na stałe gasiły panel powiadomień, przyciski
     * głośności (Android 14), SMS i żółty dla innego województwa (Android 9).
     * Własny MediaPlayer ekranu alarmu nic z tego nie obchodzi.
     */
    static void przejmijDzwiek(Context ctx, int voiv, long postedAt) {
        powiadomienieTrwajace(ctx, voiv, postedAt, CH_HIGH_SILENT, true);
    }

    /** Ekran alarmu zniknął bez potwierdzenia: syrena wraca do powiadomienia. */
    static void oddajDzwiek(Context ctx, int voiv, long postedAt) {
        powiadomienieTrwajace(ctx, voiv, postedAt, highChannel(ctx), false);
    }

    /** Tekst o opóźnieniu albo null, gdy alarm jest świeży. */
    static String notkaOpoznienia(boolean high, long ageMs, long sentAtMs) {
        if (sentAtMs <= 0 || ageMs < SPOZNIONY_OD_MS) return null;
        long min = ageMs / 60000;
        String czas = godzina(sentAtMs);
        if (ageMs <= STALE_AFTER_MS) {
            return "Alarm dotarł z opóźnieniem " + min + " min. "
                + (high ? "Zagrożenie" : "Sytuacja") + " z godz. " + czas + ".";
        }
        return high
            ? "SPÓŹNIONY ALARM. Zagrożenie z godz. " + czas + ", opóźnienie " + min + " min."
            : "Spóźnione o " + min + " min. Sytuacja z godz. " + czas + ".";
    }

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
        String notka = notkaOpoznienia(high, ageMs, sentAtMs);

        String title = (test ? "TEST — " : "")
            + (high ? "WYSOKI PRIORYTET" : "PODWYŻSZONA UWAGA")
            + ": woj. " + voivName + " (" + score + " pkt)";
        if (stale) title = title + " — spóźnione o " + (ageMs / 60000) + " min";
        // Godzina WYSYŁKI, nie dotarcia: przy spóźnionym pushu to dwie różne rzeczy,
        // a liczy się ta, o której serwer stwierdził zagrożenie (prośba użytkownika
        // 24.09.2026). Stoi na początku treści — i w zwiniętym, i w rozwiniętym
        // powiadomieniu — bo zwinięte pokazuje wyłącznie `firstLine`.
        String czas = godzina(sentAtMs);
        // 21.10.2026 (user): krócej — nagłówek, najwyżej POWODY_MAX powodów i jedna linia
        // „co zrobić · źródło”, zamiast czterech powodów i dwóch pełnych zdań.
        StringBuilder body = new StringBuilder();
        if (notka != null) body.append(notka).append('\n');
        if (headline != null && !headline.isEmpty()) body.append(headline).append('\n');
        for (String r : powody(reasons)) body.append(r).append('\n');
        body.append(high
            ? "Co zrobić: przejdź do miejsca schronienia lub pomieszczenia bez okien · źródło NIEOFICJALNE"
            : "Zachowaj czujność · źródło NIEOFICJALNE");
        String firstLine = headline != null && !headline.isEmpty() ? headline
            : (reasons.isEmpty() ? "" : reasons.get(0));
        if (notka != null) {
            firstLine = notka;              // zwinięte powiadomienie ma mówić to najpierw
        } else if (!czas.isEmpty()) {
            firstLine = czas + " · " + firstLine;
            body.insert(0, czas + " · ");
        }
        Last.put(voiv, title, body.toString());

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);

        // Spóźniony alarm NIE jest cichy (decyzja usera 2.11.2026). Do 1.8.05 był: audyt B2
        // bał się wycia po czasie, a czerwony 10-15 min po wysłaniu był aktualny w 49 z 50
        // przypadków. Po 15 min FCM i tak go odrzuca (FCM_TTL_S). Mówimy wprost, że jest
        // spóźniony i z której godziny; zegar telefonu może się mylić, więc tylko tekst
        // zależy od tego wyliczenia, a alarm gra zawsze.
        if (stale && !test) {
            try {
                dziennik(ctx, "spozniony", voivName, level,
                    new org.json.JSONObject().put("min", ageMs / 60000));
            } catch (org.json.JSONException ignored) {}
        }

        // Czerwony poziom ma prowadzić do pełnoekranowego alarmu, tak jak połączenie
        // przychodzące: zapala ekran, pokazuje się nad blokadą, miga i gra do potwierdzenia.
        // Kod żądania per województwo (audyt B11): dwa czerwone naraz miały wspólny
        // PendingIntent, więc ekran alarmu pokazywał dane tylko ostatniego.
        long postedAt = System.currentTimeMillis();
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
                .putExtra(AlarmActivity.EXTRA_SENT_AT, sentAtMs)
                .putExtra(AlarmActivity.EXTRA_NOTKA, notka)
                .putExtra(AlarmActivity.EXTRA_POSTED_AT, postedAt),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = builder(ctx, high ? highChannel(ctx) : infoChannel(ctx));
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
        // „Zwykłe powiadomienie” (prośba czytelnika 10.10.2026): czerwony przychodzi
        // jak żółty — baner, krótki dźwięk, wibracja „A” — bez pełnego ekranu, syreny
        // w pętli, podnoszenia głośności i obejścia Nie przeszkadzać.
        boolean pelnyAlarm = high && !redNormal(ctx);
        if (pelnyAlarm) {
            PendingIntent silenceIntent = wyciszIntent(ctx, voiv);
            b.setFullScreenIntent(fullScreen, true);
            b.setCategory(Notification.CATEGORY_ALARM);
            // NIE setOngoing (10.10.2026): Wear OS nie przekazuje powiadomień stałych
            // na zegarek (developer.android.com, „When notifications aren't bridged”),
            // a opaski z własnymi aplikacjami zwykle też je pomijają — czerwony nie
            // docierał na rękę osoby głuchej. Android 14+ i tak pozwala zsunąć stałe
            // powiadomienie z odblokowanego telefonu. Zsunięcie = „Wycisz alarm”
            // (deleteIntent), pełny ekran zostaje.
            b.setDeleteIntent(silenceIntent);
            b.addAction(new Notification.Action.Builder(null, "Wycisz alarm", silenceIntent).build());
            // Bezpiecznik limitu (21.10.2026): gdyby zlecenie wyciszenia nie doszło,
            // system sam usunie głośne powiadomienie minutę po ALARM_MAX_MS.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(ALARM_MAX_MS + 60_000L);
        }

        Notification n = b.build();
        // Audyt B11: przy włączonym ekranie czerwony grał syrenę raz, przez 8 s.
        // Flaga INSISTENT powtarza dźwięk kanału, dopóki użytkownik nie wyciszy.
        if (pelnyAlarm) n.flags |= Notification.FLAG_INSISTENT;

        if (pelnyAlarm) raiseAlarmVolume(ctx);
        // Czerwony po żółtym tego samego województwa byłby tylko AKTUALIZACJĄ powiadomienia,
        // a Android uruchamia pełny ekran wyłącznie dla nowego. Zmierzone 1.11.2026: syrena
        // grała, ale ekran zostawał zgaszony — a tak właśnie przebiega prawie każdy alarm.
        if (pelnyAlarm && nm != null) nm.cancel(notifId(voiv));
        if (nm != null) nm.notify(notifId(voiv), n);
        if (!test) dziennik(ctx, "pokazano", voivName, level,
            stanPrzyAlarmie(ctx, nm, high ? highChannel(ctx) : infoChannel(ctx)));
        if (pelnyAlarm && !test) zaplanujAutoWyciszenie(ctx, voiv, postedAt);

        if (pelnyAlarm) ensureAlarmIsSeen(ctx, nm);
    }

    /**
     * Czerwony poziom musi zostać zauważony także przy wygaszonym ekranie.
     *
     * Ze zgodą na alarm pełnoekranowy robi to system: sam uruchamia AlarmActivity
     * z przywilejem startu z tła, a ta zapala ekran i pokazuje się nad blokadą.
     * Nie wolno wtedy niczego wybudzać od razu — przy włączonym ekranie Android
     * celowo pomija full-screen intent i alarm zostałby zwykłym powiadomieniem.
     * Poniżej Androida 14 zgoda jest zawsze, a kod wybudzał mimo to: 1.11.2026 na
     * Androidzie 9 zmierzony był sam pasek. Nakładki potrafią jednak zablokować start
     * z tła (MIUI, EMUI), więc gdy po chwili ekran nadal śpi — zapalamy go.
     *
     * Bez zgody (Android 14 odbiera ją domyślnie aplikacjom innym niż budzik
     * i telefon) start aktywności z tła jest blokowany, więc jedyne, co możemy
     * zrobić, to zapalić ekran wake lockiem — wtedy użytkownik zobaczy alarm
     * jako powiadomienie na zapalonym ekranie i usłyszy syrenę.
     */
    static void ensureAlarmIsSeen(Context ctx, NotificationManager nm) {
        boolean maZgode = Build.VERSION.SDK_INT < 34 || (nm != null && nm.canUseFullScreenIntent());
        if (maZgode) {
            new android.os.Handler(android.os.Looper.getMainLooper())
                .postDelayed(() -> zapalEkran(ctx), 3_000L);
            return;
        }
        zapalEkran(ctx);
    }

    private static void zapalEkran(Context ctx) {
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
