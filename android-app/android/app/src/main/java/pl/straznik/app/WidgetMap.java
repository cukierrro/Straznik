package pl.straznik.app;

import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.DataInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Mapa na widżecie ekranu głównego — rysowana po Canvasie, bez kafelków.
 *
 * Widżet Androida nie ma WebView, więc silnik mapy z aplikacji tu nie działa.
 * Kontury (kraje, obwody Ukrainy, województwa) leżą w `assets/widget_map.bin`,
 * przygotowanym raz przy budowaniu przez `scripts/gen_widget_map.js`. Dzięki temu
 * mapa rysuje się bez sieci, działa też przy braku zasięgu i nie obciąża darmowego
 * serwera kafelków przy każdym odświeżeniu na tysiącach telefonów.
 *
 * Kadr jest zmienny (decyzja usera 26.09.2026): gdy najbliższy obiekt lecący w
 * stronę Polski jest dalej niż {@link #BLISKO_KM}, mapa pokazuje szeroki widok jak
 * w aplikacji — widać wtedy prawdziwe pozycje obiektów nad Ukrainą. Gdy coś
 * podejdzie bliżej, kadr zbliża się do Polski. Róg zawsze mówi, który to widok.
 */
final class WidgetMap {
    private static final String TAG = "StraznikWidgetMap";
    private static final String ASSET = "widget_map.bin";

    /** Poniżej tej odległości od granicy kadr zbliża się do Polski. */
    static final double BLISKO_KM = 250;

    // kolory jak na mapie w aplikacji (mapa jest ciemna w obu motywach systemu)
    private static final int TLO = 0xFF0B0F1A;
    private static final int OBRYS_TLA = 0xFF0B0F1A;
    private static final int WOJ_OBRYS = 0x8C5B8CFF;
    /** Obrys obserwowanego województwa — cienki, żeby nie krzyczał (uwaga usera 26.09.2026). */
    private static final int OBSERWOWANE = 0xE6DBE4F5;
    private static final int ALARM_UA_WYPELNIENIE = 0xD97A2F1E;
    private static final int ALARM_UA_OBRYS = 0xFFFF8C1A;
    private static final int POZIOM_NONE = 0xFF2C4372;
    private static final int POZIOM_ELEVATED = 0xFFB57A12;
    private static final int POZIOM_HIGH = 0xFFA3283A;
    private static final int POZIOM_SPILL = 0xFF5C4A1D;

    private static final Map<String, Integer> KRAJE = new HashMap<>();
    static {
        KRAJE.put("BLR", 0xFF4A2230); KRAJE.put("UKR", 0xFF4A3F1E); KRAJE.put("LTU", 0xFF24402E);
        KRAJE.put("LVA", 0xFF24402E); KRAJE.put("EST", 0xFF24402E); KRAJE.put("RUS", 0xFF3A2140);
        KRAJE.put("SVK", 0xFF1F3A3A); KRAJE.put("CZE", 0xFF2B2B44); KRAJE.put("DEU", 0xFF2A2A3C);
        KRAJE.put("HUN", 0xFF3A2F24); KRAJE.put("ROU", 0xFF33283F); KRAJE.put("MDA", 0xFF33283F);
    }

    /** Kolory obiektów — te same klasy co TYPE_META w aplikacji. */
    static int kolorTypu(String typ) {
        if (typ == null) return 0xFF8A93A6;
        switch (typ) {
            case "shahed": return 0xFFFF8C1A;
            case "uav": return 0xFFFFB020;
            case "kab": return 0xFFFFD23B;
            case "missile": case "cruise": return 0xFFFF4D5E;
            case "ballistic": return 0xFFFF2DB0;
            case "mig31k": return 0xFFC06BFF;
            case "recon": return 0xFFC9D1DC;
            default: return 0xFF8A93A6;
        }
    }

    private WidgetMap() {}

    // ── kontury z assets ───────────────────────────────────────────────────────

    private static final class Ksztalt {
        String klucz;
        List<float[]> pierscienie = new ArrayList<>();   // [lon,lat,lon,lat,...]
    }

    private static volatile Map<String, List<Ksztalt>> WARSTWY;

    private static Map<String, List<Ksztalt>> warstwy(Context c) {
        Map<String, List<Ksztalt>> gotowe = WARSTWY;
        if (gotowe != null) return gotowe;
        Map<String, List<Ksztalt>> out = new HashMap<>();
        AssetManager am = c.getApplicationContext().getAssets();
        try (InputStream raw = am.open(ASSET); DataInputStream in = new DataInputStream(new java.io.BufferedInputStream(raw))) {
            byte[] magic = new byte[4];
            in.readFully(magic);
            if (!"SWM1".equals(new String(magic, "US-ASCII"))) throw new java.io.IOException("zły nagłówek");
            int warstw = in.readUnsignedByte();
            for (int w = 0; w < warstw; w++) {
                String nazwa = tekst(in);
                int ksztaltow = u16(in);
                List<Ksztalt> lista = new ArrayList<>(ksztaltow);
                for (int s = 0; s < ksztaltow; s++) {
                    Ksztalt k = new Ksztalt();
                    k.klucz = tekst(in);
                    int pierscieni = u16(in);
                    for (int r = 0; r < pierscieni; r++) {
                        int punktow = u16(in);
                        float[] p = new float[punktow * 2];
                        for (int i = 0; i < punktow; i++) {
                            p[i * 2] = 12f + u16(in) / 2000f;
                            p[i * 2 + 1] = 44f + u16(in) / 4000f;
                        }
                        k.pierscienie.add(p);
                    }
                    lista.add(k);
                }
                out.put(nazwa, lista);
            }
        } catch (Exception e) {
            Log.w(TAG, "kontury mapy", e);
            return null;
        }
        WARSTWY = out;
        return out;
    }

    private static int u16(DataInputStream in) throws java.io.IOException {
        int a = in.readUnsignedByte(), b = in.readUnsignedByte();
        return a | (b << 8);
    }

    private static String tekst(DataInputStream in) throws java.io.IOException {
        byte[] b = new byte[in.readUnsignedByte()];
        in.readFully(b);
        return new String(b, "UTF-8");
    }

    // ── kadr ───────────────────────────────────────────────────────────────────

    /**
     * Kamera nad mapą — ten sam model, którego używa silnik mapy w aplikacji:
     * odwzorowanie Mercatora, obrót o bearing i pochylenie (pitch) z rzutem
     * perspektywicznym. Dzięki temu przechylony widok na widżecie układa się tak
     * jak w aplikacji, a nie „mniej więcej tak" (próby z wyginaniem gotowego
     * obrazka i z własnym przybliżeniem odpadły 26.09.2026).
     */
    static final class Kadr {
        double lon0, lon1, lat0, lat1;      // obszar, który ma się zmieścić
        boolean blisko;                     // kadr zbliżony do Polski
        boolean przechylona;                // widok 3D wybrany w aplikacji
        int w, h;

        /** Pochylenie i obrót jak w aplikacji (`is3d ? 45 : 0`, bearing −8°). */
        private static final double PITCH = Math.toRadians(45), BEARING = Math.toRadians(-8);
        /** Pole widzenia silnika mapy — stąd odległość kamery od środka kadru. */
        private static final double FOV = Math.toRadians(36.87);

        private double srodekX, srodekY;    // środek kadru w jednostkach Mercatora
        private double skala;               // pikseli na jednostkę Mercatora
        private double sinB, cosB, sinP, cosP, odlKamery;
        private double przesunX, przesunY;  // gdzie na kafelku ma wypaść środek

        private static double merX(double lon) { return lon / 360.0; }

        private static double merY(double lat) {
            double s = Math.sin(Math.toRadians(Math.max(-85, Math.min(85, lat))));
            return -Math.log((1 + s) / (1 - s)) / (4 * Math.PI);   // na północ = mniej
        }

        void przygotuj(double srodkaX, double srodkaY) {
            przesunX = srodkaX; przesunY = srodkaY;
            sinB = Math.sin(BEARING); cosB = Math.cos(BEARING);
            sinP = przechylona ? Math.sin(PITCH) : 0;
            cosP = przechylona ? Math.cos(PITCH) : 1;
            srodekX = (merX(lon0) + merX(lon1)) / 2;
            srodekY = (merY(lat0) + merY(lat1)) / 2;
            odlKamery = 0.5 / Math.tan(FOV / 2) * h;
            skala = dobierzSkale();
        }

        /**
         * Skala tak dobrana, żeby zadany obszar wypełnił kafelek (nie "zmieścił się
         * w środku" — przy pochyleniu zostawiało to czarne marginesy). Przy widoku
         * przechylonym bierzemy trochę mniejsze zbliżenie, bo perspektywa i tak
         * powiększa bliższą połowę.
         */
        private double dobierzSkale() {
            double szer = Math.abs(merX(lon1) - merX(lon0));
            double wys = Math.abs(merY(lat0) - merY(lat1));
            if (szer <= 0 || wys <= 0) return w;
            // Kadr szeroki ma pokazać, gdzie naprawdę są obiekty, więc dopasowujemy go
            // do szerokości (północ i południe mogą wyjść poza kafelek). Kadr bliski jest
            // o Polsce, więc ma ją wypełnić w całości.
            double s = blisko ? Math.max(w / szer, h / wys) : w / szer;
            return przechylona ? s * 0.85 : s;
        }

        /** @return {x, y, skala głębi} albo null, gdy punkt jest za horyzontem. */
        float[] rzut(double lon, double lat, double s) {
            double dx = (merX(lon) - srodekX) * s;
            double dy = (merY(lat) - srodekY) * s;
            double rx = dx * cosB - dy * sinB;          // obrót o bearing
            double ry = dx * sinB + dy * cosB;
            // perspektywa: to, co na południe od środka, jest bliżej kamery
            double waga = 1 - ry * sinP / odlKamery;
            if (waga < 0.05) return null;               // za horyzontem
            return new float[]{
                (float) (przesunX + rx / waga),
                (float) (przesunY + ry * cosP / waga),
                (float) (1 / waga),
            };
        }

        float[] rzut(double lon, double lat) { return rzut(lon, lat, skala); }

        float skalaGlebi(double lon, double lat) {
            float[] p = rzut(lon, lat);
            return p == null ? 0 : p[2];
        }

        float x(double lon, double lat) { float[] p = rzut(lon, lat); return p == null ? -9999 : p[0]; }

        float y(double lat) { float[] p = rzut((lon0 + lon1) / 2, lat); return p == null ? -9999 : p[1]; }
    }

    /**
     * Kadr dopasowany do proporcji kafelka. `panelUlamek` to część szerokości
     * zajęta przez panel z lewej — Polska ma wypaść obok niego, nie pod nim.
     */
    static Kadr kadr(int w, int h, boolean blisko, float panelUlamek, boolean przechylona) {
        Kadr k = new Kadr();
        k.w = w; k.h = h; k.blisko = blisko; k.przechylona = przechylona;
        if (blisko) {
            k.lat0 = 48.6; k.lat1 = 55.0; k.lon0 = 13.6; k.lon1 = 25.2;
        } else {
            // zbliżony do obszaru, na który aplikacja ustawia mapę przy starcie, ale
            // bez pustego pasa na zachodzie (plik konturów kończy się na sąsiadach Polski)
            k.lat0 = 46.4; k.lat1 = 55.2; k.lon0 = 15.2; k.lon1 = 34.0;
        }
        // środek kadru odsuwamy od panelu, żeby Polska nie chowała się pod tekstem
        double cel = blisko ? panelUlamek / 2 + 0.5 : 0.5 + panelUlamek / 4;
        k.przygotuj(w * cel, h * (przechylona ? 0.42f : 0.5f));
        return k;
    }

    // ── rysowanie ──────────────────────────────────────────────────────────────

    /**
     * @param stan   zwarty stan z {@link Widgets} (poziomy, obiekty, alarmy UA)
     * @param obserwowane województwa użytkownika (obrysowane na biało)
     */
    static Bitmap rysuj(Context c, JSONObject stan, List<String> obserwowane,
                        int w, int h, float panelUlamek, boolean przechylona) {
        Map<String, List<Ksztalt>> warstwy = warstwy(c);
        if (warstwy == null || w <= 0 || h <= 0) return null;
        JSONArray obiekty = stan == null ? null : stan.optJSONArray("obj");
        Kadr k = kadr(w, h, blisko(obiekty), panelUlamek, przechylona);

        Bitmap bmp;
        try {
            bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        } catch (OutOfMemoryError e) {
            Log.w(TAG, "za mało pamięci na mapę " + w + "x" + h);
            return null;
        }
        Canvas cv = new Canvas(bmp);
        cv.drawColor(TLO);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setStyle(Paint.Style.FILL);
        Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeJoin(Paint.Join.ROUND);

        float skala = Math.min(w, h) / 170f;         // grubości linii rosną z kafelkiem

        for (Ksztalt s : nieNull(warstwy.get("kraje"))) {
            Integer kolor = KRAJE.get(s.klucz);
            if (kolor == null) continue;
            fill.setColor(kolor);
            cv.drawPath(sciezka(s, k), fill);
        }

        JSONArray ua = stan == null ? null : stan.optJSONArray("ua");
        if (ua != null && ua.length() > 0) {
            fill.setColor(ALARM_UA_WYPELNIENIE);
            line.setColor(ALARM_UA_OBRYS);
            line.setStrokeWidth(0.9f * skala);
            for (Ksztalt s : nieNull(warstwy.get("obwody"))) {
                if (!zawiera(ua, s.klucz)) continue;
                Path p = sciezka(s, k);
                cv.drawPath(p, fill);
                cv.drawPath(p, line);
            }
        }

        JSONObject voivs = stan == null ? null : stan.optJSONObject("voivs");
        line.setColor(WOJ_OBRYS);
        line.setStrokeWidth(0.7f * skala);
        for (Ksztalt s : nieNull(warstwy.get("woj"))) {
            fill.setColor(kolorPoziomu(voivs == null ? null : voivs.optJSONObject(s.klucz)));
            Path p = sciezka(s, k);
            cv.drawPath(p, fill);
            cv.drawPath(p, line);
        }
        if (obserwowane != null && !obserwowane.isEmpty()) {
            line.setColor(OBSERWOWANE);
            line.setStrokeWidth(0.95f * skala);
            for (Ksztalt s : nieNull(warstwy.get("woj")))
                if (obserwowane.contains(s.klucz)) cv.drawPath(sciezka(s, k), line);
        }

        double[] poza = rysujObiekty(cv, k, obiekty, skala);
        if (poza != null) {
            rysujPozaKadrem(cv, k, (int) poza[0], poza[1], poza[2], (int) poza[3], skala);
        }
        return bmp;
    }

    /** Czy któryś obiekt lecący w stronę Polski jest już blisko granicy. */
    static boolean blisko(JSONArray obiekty) {
        if (obiekty == null) return false;
        for (int i = 0; i < obiekty.length(); i++) {
            JSONObject o = obiekty.optJSONObject(i);
            if (o == null || !o.optBoolean("pl", false)) continue;
            if (o.optDouble("km", Double.MAX_VALUE) <= BLISKO_KM) return true;
        }
        return false;
    }

    /** @return {liczba poza kadrem, km najbliższego, jego szerokość, kolor} albo null. */
    private static double[] rysujObiekty(Canvas cv, Kadr k, JSONArray obiekty, float skala) {
        if (obiekty == null) return null;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        int pozaKadrem = 0;
        double najblizszePoza = Double.MAX_VALUE, latPoza = 0;
        int kolorPoza = 0xFFFFB020;
        for (int i = 0; i < obiekty.length(); i++) {
            JSONObject o = obiekty.optJSONObject(i);
            if (o == null) continue;
            double lon = o.optDouble("lon", Double.NaN), lat = o.optDouble("lat", Double.NaN);
            if (Double.isNaN(lon) || Double.isNaN(lat)) continue;
            int kolorObiektu = kolorTypu(o.optString("t", ""));
            float[] test = k.rzut(lon, lat);
            if (test == null || test[0] < 0 || test[0] > k.w || test[1] < 0 || test[1] > k.h) {
                // nic nie znika po cichu: liczymy je i pokazujemy strzałką przy krawędzi
                pozaKadrem++;
                double km = o.optDouble("km", Double.MAX_VALUE);
                if (o.optBoolean("pl", false) && km < najblizszePoza) {
                    najblizszePoza = km; latPoza = Math.max(k.lat0, Math.min(k.lat1, lat)); kolorPoza = kolorObiektu;
                }
                continue;
            }
            float[] pkt = k.rzut(lon, lat);
            if (pkt == null) continue;                  // za horyzontem
            float x = pkt[0], y = pkt[1];
            float glebia = Math.min(2f, pkt[2]);        // dalsze obiekty rysujemy mniejsze
            int kolor = kolorObiektu;
            p.setColor((kolor & 0x00FFFFFF) | 0x38000000);
            p.setStyle(Paint.Style.FILL);
            cv.drawCircle(x, y, 3.4f * skala * glebia, p);
            p.setColor(kolor);
            if (o.optBoolean("ok", true)) {          // potwierdzona pozycja
                cv.drawCircle(x, y, 1.7f * skala * glebia, p);
                p.setColor(OBRYS_TLA);
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(0.5f * skala);
                cv.drawCircle(x, y, 1.7f * skala * glebia, p);
            } else {                                  // przybliżony rejon — pusty krążek
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(0.8f * skala);
                cv.drawCircle(x, y, 1.9f * skala * glebia, p);
            }
        }
        return pozaKadrem > 0 ? new double[]{pozaKadrem, najblizszePoza, latPoza, kolorPoza} : null;
    }

    /** Strzałka przy wschodniej krawędzi: ile obiektów jest dalej i jak daleko najbliższy. */
    private static void rysujPozaKadrem(Canvas cv, Kadr k, int ile, double km, double lat, int kolor, float skala) {
        float x = k.w - 2f * skala;
        // dolny pasek z tekstem zjada ok. 22% wysokości — strzałka nie może pod niego wejść
        float yMapy = k.przechylona ? (float) (k.h * 0.45) : (float) (k.h * (k.lat1 - lat) / (k.lat1 - k.lat0));
        float y = (float) Math.max(12 * skala, Math.min(k.h * 0.76f, yMapy));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(kolor);
        android.graphics.Path trojkat = new android.graphics.Path();
        trojkat.moveTo(x, y);
        trojkat.lineTo(x - 5.5f * skala, y - 3.4f * skala);
        trojkat.lineTo(x - 5.5f * skala, y + 3.4f * skala);
        trojkat.close();
        cv.drawPath(trojkat, p);
        String podpis = (km < Double.MAX_VALUE ? Math.round(km) + " km · " : "") + ile + "×";
        p.setColor(0xFFE3E9F5);
        p.setTextSize(5.2f * skala);
        p.setTextAlign(Paint.Align.RIGHT);
        p.setFakeBoldText(true);
        p.setShadowLayer(2f * skala, 0, 0, 0xFF0B0F1A);
        cv.drawText(podpis, x - 7f * skala, y - 5f * skala, p);
    }

    private static int kolorPoziomu(JSONObject v) {
        if (v == null) return POZIOM_NONE;
        String alert = v.optString("alert", "none"), level = v.optString("level", "none");
        if ("high".equals(alert)) return POZIOM_HIGH;
        if ("elevated".equals(alert)) return POZIOM_ELEVATED;
        if (Widgets.rank(level) > 0) return POZIOM_SPILL;
        return POZIOM_NONE;
    }

    private static Path sciezka(Ksztalt s, Kadr k) {
        Path path = new Path();
        for (float[] r : s.pierscienie) {
            if (r.length < 6) continue;
            boolean zaczete = false;
            for (int i = 0; i < r.length; i += 2) {
                float[] p = k.rzut(r[i], r[i + 1]);
                if (p == null) { zaczete = false; continue; }   // punkt zza horyzontu
                if (zaczete) path.lineTo(p[0], p[1]);
                else { path.moveTo(p[0], p[1]); zaczete = true; }
            }
            path.close();
        }
        return path;
    }

    private static boolean zawiera(JSONArray a, String s) {
        for (int i = 0; i < a.length(); i++) if (s.equals(a.optString(i, ""))) return true;
        return false;
    }

    private static List<Ksztalt> nieNull(List<Ksztalt> l) {
        return l == null ? new ArrayList<Ksztalt>() : l;
    }

    static int kolorPoziomuTla(int tone) {
        switch (tone) {
            case 1: return POZIOM_ELEVATED;
            case 2: return POZIOM_HIGH;
            default: return Color.TRANSPARENT;
        }
    }
}
