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
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.Gravity;
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

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        wakeAndShowOverLockscreen();
        setContentView(buildUi());
        startSiren();
        startVibration();
        startBlinking();
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
        box.addView(text("WYSOKI PRIORYTET", 26, Color.parseColor("#ff4d5e"), true), lp(dp(4)));
        box.addView(text(voiv != null ? "woj. " + voiv : "", 22, Color.WHITE, true), lp(dp(2)));
        box.addView(text(score > 0 ? score + " pkt" : "", 16, Color.parseColor("#a9b4cc"), false), lp(dp(18)));

        if (title != null && !title.isEmpty())
            box.addView(text(title, 15, Color.parseColor("#e8edf7"), false), lp(dp(10)));

        ScrollView sc = new ScrollView(this);
        TextView reasons = text(body != null ? body : "", 14, Color.parseColor("#c9d3e8"), false);
        reasons.setGravity(Gravity.START);
        sc.addView(reasons);
        LinearLayout.LayoutParams scp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        scp.bottomMargin = dp(16);
        box.addView(sc, scp);

        TextView warn = text("To sygnał NIEOFICJALNY. Sprawdź syreny, RCB i RSO — "
            + "one są źródłem rozstrzygającym.", 13, Color.parseColor("#ffd98a"), false);
        warn.setPadding(dp(14), dp(12), dp(14), dp(12));
        warn.setBackgroundColor(Color.parseColor("#3a2a10"));
        box.addView(warn, lp(dp(18)));

        Button ack = new Button(this);
        ack.setText("POTWIERDZAM — wycisz alarm");
        ack.setAllCaps(false);
        ack.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        ack.setTypeface(Typeface.DEFAULT_BOLD);
        ack.setTextColor(Color.WHITE);
        ack.setBackgroundColor(Color.parseColor("#ff4d5e"));
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
            stopAlarmSignals();
            startActivity(new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
            finish();
        });
        box.addView(open, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

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
        try {
            // ta sama modulowana syrena, którą gra otwarta aplikacja (scripts/build_sounds.py)
            Uri uri = Alarms.soundUri(this, R.raw.alarm_syrena);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            player.setDataSource(this, uri);
            player.setLooping(true);   // gra bez przerwy, aż użytkownik potwierdzi
            player.prepare();
            player.start();
            // alarm musi być słyszalny nawet przy wyciszonym telefonie
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null && am.getStreamVolume(AudioManager.STREAM_ALARM) == 0)
                am.setStreamVolume(AudioManager.STREAM_ALARM,
                    am.getStreamMaxVolume(AudioManager.STREAM_ALARM) / 2, 0);
        } catch (Exception ignored) {}
    }

    private void startVibration() {
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] pattern = {0, 700, 300, 700, 300, 900, 400};
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
        stopAlarmSignals();
        finish();
    }

    /** Cofnięcie nie może wyciszyć alarmu — musi być świadome potwierdzenie. */
    @Override
    public void onBackPressed() { /* celowo puste */ }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setContentView(buildUi());
        startBlinking();
    }

    @Override
    protected void onDestroy() {
        stopAlarmSignals();
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
