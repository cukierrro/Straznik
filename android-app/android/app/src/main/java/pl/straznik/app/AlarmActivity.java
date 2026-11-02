package pl.straznik.app;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Pełnoekranowy alarm przy WYSOKIM PRIORYTECIE — uruchamiany przez full-screen
 * intent alarmu zbudowanego z pusha FCM (patrz {@link Alarms#postAlarm}).
 *
 * Dlaczego natywnie, a nie w WebView: alarm musi pokazać się natychmiast, także
 * gdy proces WebView nie żyje (aplikacja zamknięta) i gdy ekran jest wygaszony.
 * Ładowanie WebView zajęłoby sekundy, a przy zablokowanym ekranie w ogóle nie
 * wyszłoby na wierzch.
 *
 * showWhenLocked + turnScreenOn (manifest i programowo dla API < 27) sprawiają,
 * że ekran się zapala i alarm pokazuje się NAD blokadą — bez odblokowywania
 * telefonu, czyli bez ujawniania czegokolwiek innego z zawartości urządzenia.
 */
public class AlarmActivity extends Activity {

    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";
    static final String EXTRA_VOIV = "voiv";
    static final String EXTRA_SCORE = "score";
    static final String EXTRA_VOIV_INDEX = "voiv_index";
    static final String EXTRA_TEST = "test";
    /** Czas wysyłki z serwera (ms). Ekran alarmu nie pokazywał żadnej godziny. */
    static final String EXTRA_SENT_AT = "sent_at";
    /** Chwila wystawienia alarmu na telefonie (ms) — od niej liczymy ALARM_MAX_MS. */
    static final String EXTRA_POSTED_AT = "posted_at";
    /** Tekst o spóźnieniu alarmu albo null (decyzja usera 2.11.2026). */
    static final String EXTRA_NOTKA = "notka";

    // barwy i tempo migania przepisane z #alarm-overlay / @keyframes alarmflash
    // w frontend/style.css, żeby alarm w tle wyglądał jak w otwartej aplikacji
    private static final int FLASH_DARK = Color.parseColor("#140004");
    private static final int FLASH_BRIGHT = Color.parseColor("#50060e");
    private static final long FLASH_HALF_CYCLE_MS = 550;

    private MediaPlayer player;
    private Vibrator vibrator;
    private ValueAnimator blink;
    private PowerManager.WakeLock screenLock;
    private View root;
    private TextView autoNote;
    private final Handler limit = new Handler(Looper.getMainLooper());
    private final Runnable poLimicie = this::wyciszPoLimicie;
    /** Alarm skończony świadomie albo po limicie — syrena nie wraca do powiadomienia. */
    private boolean zakonczone;
    private static java.lang.ref.WeakReference<AlarmActivity> biezacy;

    /** Wyciszenie spoza tego ekranu: „Wycisz alarm”, zsunięcie powiadomienia, limit. */
    static void wyciszono(int voiv, boolean auto) {
        AlarmActivity a = biezacy != null ? biezacy.get() : null;
        if (a == null) return;
        a.runOnUiThread(() -> {
            Intent in = a.getIntent();
            if (in == null || in.getIntExtra(EXTRA_VOIV_INDEX, -1) != voiv) return;
            if (auto) { a.wyciszPoLimicie(); return; }
            a.zakonczone = true;
            a.stopAlarmSignals();
            a.finish();
        });
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        wakeAndShowOverLockscreen();
        setContentView(buildUi());
        biezacy = new java.lang.ref.WeakReference<>(this);
        Intent in = getIntent();
        int v = in != null ? in.getIntExtra(EXTRA_VOIV_INDEX, -1) : -1;
        Alarms.dziennik(this, "ekran", v >= 0 && v < Alarms.VOIVS.length ? Alarms.VOIVS[v] : null, "high", null);
        wlaczSyrene();
        startVibration();
        startBlinking();
        ustawLimit();
    }

    /**
     * Syrena gra stąd, a nie z powiadomienia (1.8.05): tylko „POTWIERDZAM” i limit mają ją
     * gasić. Dwie syreny się nie nakładają (audyt B11), bo powiadomienie przechodzi na kanał
     * bez dźwięku — dopiero gdy własny odtwarzacz już gra, żeby nie było przerwy.
     */
    private void wlaczSyrene() {
        if (Alarms.redSilent(this)) return;
        if (player == null) startSiren();
        if (player == null) return;   // nie wystartował: zostaje syrena z powiadomienia
        Intent in = getIntent();
        Alarms.przejmijDzwiek(this, in != null ? in.getIntExtra(EXTRA_VOIV_INDEX, -1) : -1,
            in != null ? in.getLongExtra(EXTRA_POSTED_AT, 0L) : 0L);
    }

    /** Przyciski głośności nie wyciszają alarmu — ani przez przypadek, ani w półśnie. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (czyPrzyciskGlosnosci(keyCode) && player != null) return true;
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (czyPrzyciskGlosnosci(keyCode) && player != null) return true;
        return super.onKeyUp(keyCode, event);
    }

    private static boolean czyPrzyciskGlosnosci(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN
            || keyCode == KeyEvent.KEYCODE_VOLUME_MUTE;
    }

    /**
     * Limit głośnego alarmu (decyzja usera 21.10.2026: bateria, grzanie telefonu
     * i ekranu): po Alarms.ALARM_MAX_MS od WYSTAWIENIA alarmu syrena, wibracja
     * i miganie gasną same. Ekran otwarty później (np. z powiadomienia) liczy się
     * od tej samej chwili, nie od otwarcia.
     */
    private void ustawLimit() {
        limit.removeCallbacks(poLimicie);
        Intent in = getIntent();
        long posted = in != null ? in.getLongExtra(EXTRA_POSTED_AT, 0L) : 0L;
        if (posted <= 0) posted = System.currentTimeMillis();
        long zostalo = posted + Alarms.ALARM_MAX_MS - System.currentTimeMillis();
        if (zostalo <= 0) wyciszPoLimicie();
        else limit.postDelayed(poLimicie, zostalo);
    }

    private void wyciszPoLimicie() {
        if (zakonczone) return;
        zakonczone = true;
        stopAlarmSignals();
        if (root != null) root.setBackgroundColor(FLASH_DARK);
        if (autoNote != null) autoNote.setVisibility(View.VISIBLE);
        // ekran może już zgasnąć — tylko komunikat zostaje nad blokadą
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (screenLock != null && screenLock.isHeld()) {
            try { screenLock.release(); } catch (Exception ignored) {}
        }
        Intent in = getIntent();
        int voiv = in != null ? in.getIntExtra(EXTRA_VOIV_INDEX, -1) : -1;
        long posted = in != null ? in.getLongExtra(EXTRA_POSTED_AT, 0L) : 0L;
        if (voiv >= 0 && posted > 0) Alarms.autoSilence(this, voiv, posted);
        else Alarms.restoreAlarmVolume(this);
    }

    /**
     * Alarm pokazuje się NAD blokadą (jak budzik / połączenie), bez proszenia o PIN.
     *
     * Świadomie NIE wołamy requestDismissKeyguard(): na zabezpieczonej blokadzie
     * wywołałoby to systemowy ekran odblokowania (użytkownik widziałby najpierw
     * prośbę o PIN, a nie alarm). setShowWhenLocked+setTurnScreenOn wystarczą, by
     * ekran się zapalił i alarm był w całości widoczny nad blokadą — nic innego z
     * zawartości telefonu się nie ujawnia. Odblokowanie następuje dopiero, gdy
     * użytkownik sam wybierze „Otwórz mapę" (uruchomienie MainActivity).
     */
    private void wakeAndShowOverLockscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                screenLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "straznik:alarm");
                screenLock.acquire(3 * 60 * 1000L);
            }
        } catch (Exception ignored) {}
    }

    private View buildUi() {
        Intent in = getIntent();
        String title = in != null ? in.getStringExtra(EXTRA_TITLE) : null;
        String body = in != null ? in.getStringExtra(EXTRA_BODY) : null;
        String voiv = in != null ? in.getStringExtra(EXTRA_VOIV) : null;
        double score = in != null ? in.getDoubleExtra(EXTRA_SCORE, 0) : 0;

        // tło migające (jak #alarm-overlay w aplikacji) + karta o stałym tle w środku
        LinearLayout back = new LinearLayout(this);
        back.setOrientation(LinearLayout.VERTICAL);
        back.setGravity(Gravity.CENTER);
        back.setBackgroundColor(FLASH_DARK);
        back.setPadding(dp(14), dp(14), dp(14), dp(14));
        root = back;

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        android.graphics.drawable.GradientDrawable card = new android.graphics.drawable.GradientDrawable();
        card.setColor(Color.parseColor("#16111a"));
        card.setCornerRadius(dp(16));
        card.setStroke(dp(2), Color.parseColor("#ff4d5e"));
        box.setBackground(card);
        int pad = dp(20);
        box.setPadding(pad, dp(24), pad, dp(20));
        back.addView(box, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        box.addView(text("⚠", 64, Color.parseColor("#ff4d5e"), true), lp(dp(8)));
        boolean test = in != null && in.getBooleanExtra(EXTRA_TEST, false);
        box.addView(text(test ? "TEST — WYSOKI PRIORYTET" : "WYSOKI PRIORYTET", 26,
            Color.parseColor("#ff4d5e"), true), lp(dp(4)));
        box.addView(text(voiv != null ? "woj. " + voiv : "", 22, Color.WHITE, true), lp(dp(2)));
        String czas = Alarms.godzina(in != null ? in.getLongExtra(EXTRA_SENT_AT, 0L) : 0L);
        String podpis = (score > 0 ? score + " pkt" : "")
            + (czas.isEmpty() ? "" : (score > 0 ? " · " : "") + "godz. " + czas);
        box.addView(text(podpis, 16, Color.parseColor("#a9b4cc"), false), lp(dp(14)));
        String notka = in != null ? in.getStringExtra(EXTRA_NOTKA) : null;
        if (notka != null) box.addView(text(notka, 16, Color.parseColor("#ffd98a"), true), lp(dp(12)));

        // 21.10.2026 (user): przyciski zaraz pod nagłówkiem — przy długiej liście
        // powodów trzeba było przewijać do „POTWIERDZAM”. Informacje są niżej.
        Button ack = new Button(this);
        ack.setText("POTWIERDZAM — wycisz alarm");
        ack.setAllCaps(false);
        ack.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        ack.setTypeface(Typeface.DEFAULT_BOLD);
        ack.setTextColor(Color.WHITE);
        ack.setBackgroundColor(Color.parseColor("#c81e30"));   // kontrast z bielą ≥ 4,5:1 (audyt C11)
        ack.setPadding(dp(16), dp(18), dp(16), dp(18));
        ack.setOnClickListener(v -> finishAlarm());
        LinearLayout.LayoutParams ackp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ackp.bottomMargin = dp(10);
        box.addView(ack, ackp);

        Button open = new Button(this);
        open.setText("Otwórz mapę i szczegóły");
        open.setAllCaps(false);
        open.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        open.setTextColor(Color.parseColor("#cfe0ff"));
        open.setBackgroundColor(Color.parseColor("#1a2338"));
        open.setOnClickListener(v -> {
            zakonczone = true;
            stopAlarmSignals();
            silenceNotification();
            startActivity(new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            finish();
        });
        box.addView(open, lp(dp(8)));

        autoNote = text("Wyciszono automatycznie po 15 min", 15, Color.parseColor("#ffd98a"), true);
        autoNote.setVisibility(View.GONE);
        box.addView(autoNote, lp(dp(8)));

        // Reszta przewija się pod przyciskami: co zrobić, nagłówek, najwyżej
        // Alarms.POWODY_MAX powodów (pełna lista w aplikacji) i notka o źródle.
        LinearLayout info = new LinearLayout(this);
        info.setOrientation(LinearLayout.VERTICAL);

        // Audyt B10: człowiek wybudzony w nocy ma wiedzieć, co zrobić — krótko.
        TextView todo = text("Co zrobić: przejdź do miejsca schronienia albo pomieszczenia bez okien "
            + "i śledź komunikaty RCB.", 15, Color.WHITE, true);
        todo.setPadding(dp(12), dp(10), dp(12), dp(10));
        todo.setBackgroundColor(Color.parseColor("#2a1016"));
        info.addView(todo, lp(dp(12)));

        if (title != null && !title.isEmpty())
            info.addView(text(title, 15, Color.parseColor("#e8edf7"), false), lp(dp(8)));

        TextView reasons = text(body != null ? body : "", 14, Color.parseColor("#c9d3e8"), false);
        reasons.setGravity(Gravity.START);
        info.addView(reasons, lp(dp(6)));
        info.addView(text("Pełna lista sygnałów w aplikacji.", 13, Color.parseColor("#a9b4cc"), false), lp(dp(12)));

        TextView warn = text("To sygnał NIEOFICJALNY. Sprawdź syreny, RCB i RSO — "
            + "one są źródłem rozstrzygającym.", 13, Color.parseColor("#ffd98a"), false);
        warn.setPadding(dp(14), dp(12), dp(14), dp(12));
        warn.setBackgroundColor(Color.parseColor("#3a2a10"));
        info.addView(warn, lp(0));

        ScrollView sc = new ScrollView(this);
        sc.addView(info);
        LinearLayout.LayoutParams scp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        box.addView(sc, scp);

        return back;   // migające tło jest korzeniem; karta siedzi w środku
    }

    /** Miganie całego ekranu — alarm musi zwrócić uwagę też bez dźwięku (tryb cichy). */
    private void startBlinking() {
        if (blink != null) blink.cancel();
        blink = ObjectAnimator.ofArgb(root, "backgroundColor", FLASH_DARK, FLASH_BRIGHT);
        blink.setDuration(FLASH_HALF_CYCLE_MS);
        blink.setRepeatCount(ValueAnimator.INFINITE);
        blink.setRepeatMode(ValueAnimator.REVERSE);
        blink.start();
    }

    private void startSiren() {
        // Opcja „tylko wibracja” (29.09.2026): pełny ekran, miganie i wibracja
        // zostają, milknie sam dźwięk. Bez tego warunku syrena i tak by zagrała,
        // bo pełnoekranowy alarm ma własny odtwarzacz, niezależny od kanału.
        if (Alarms.redSilent(this)) return;
        try {
            // ta sama modulowana syrena, którą gra otwarta aplikacja (scripts/build_sounds.py)
            Uri uri = Alarms.soundUri(this, R.raw.alarm_syrena);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            player.setDataSource(this, uri);
            player.setLooping(true);   // gra bez przerwy, aż użytkownik potwierdzi
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);   // także po zgaszeniu ekranu
            player.prepare();
            player.start();
            // alarm musi być słyszalny nawet przy wyciszonym telefonie
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null && am.getStreamVolume(AudioManager.STREAM_ALARM) == 0)
                am.setStreamVolume(AudioManager.STREAM_ALARM,
                    am.getStreamMaxVolume(AudioManager.STREAM_ALARM) / 2, 0);
        } catch (Exception e) {
            if (player != null) { try { player.release(); } catch (Exception ignored) {} }
            player = null;
            Alarms.dziennik(this, "syrena_blad", null, "high", null);
        }
    }

    private void startVibration() {
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] pattern = Alarms.WZOR_A_PETLA;   // „A A A” Morse'a, w pętli
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0),
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            else
                vibrator.vibrate(pattern, 0);
        } catch (Exception ignored) {}
    }

    private void stopAlarmSignals() {
        if (player != null) {
            try { player.stop(); player.release(); } catch (Exception ignored) {}
            player = null;
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception ignored) {}
            vibrator = null;
        }
        if (blink != null) { blink.cancel(); blink = null; }
    }

    private void finishAlarm() {
        zakonczone = true;
        stopAlarmSignals();
        silenceNotification();
        finish();
    }

    /** Wycisza pętlę syreny w powiadomieniu i przywraca głośność sprzed alarmu. */
    private void silenceNotification() {
        Intent in = getIntent();
        int voiv = in != null ? in.getIntExtra(EXTRA_VOIV_INDEX, -1) : -1;
        if (voiv >= 0) Alarms.silence(this, voiv);
        else Alarms.restoreAlarmVolume(this);
    }

    /** Cofnięcie nie może wyciszyć alarmu — musi być świadome potwierdzenie. */
    @Override
    public void onBackPressed() { /* celowo puste */ }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setContentView(buildUi());
        // nowy alarm: znów pełne sygnały i nowy limit liczony od jego wystawienia
        zakonczone = false;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        wlaczSyrene();
        if (vibrator == null) startVibration();
        startBlinking();
        ustawLimit();
    }

    @Override
    protected void onDestroy() {
        limit.removeCallbacks(poLimicie);
        boolean gralaStad = player != null;
        stopAlarmSignals();
        // Ekran zniknął bez potwierdzenia (system go zamknął): alarm nie może zamilknąć.
        if (gralaStad && !zakonczone && !isChangingConfigurations()) {
            Intent in = getIntent();
            Alarms.oddajDzwiek(this, in != null ? in.getIntExtra(EXTRA_VOIV_INDEX, -1) : -1,
                in != null ? in.getLongExtra(EXTRA_POSTED_AT, 0L) : 0L);
        }
        if (biezacy != null && biezacy.get() == this) biezacy = null;
        if (screenLock != null && screenLock.isHeld()) {
            try { screenLock.release(); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private LinearLayout.LayoutParams lp(int bottomMargin) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.bottomMargin = bottomMargin;
        return p;
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }
}
