package pl.straznik.app;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pobieranie i ocena źródeł w tle — natywny odpowiednik kolektorów z engine.js.
 *
 * Świadomie używa REST-owego snapshotu Neptuna zamiast WebSocketu: usługa
 * budzi się cyklicznie, a utrzymywanie gniazda przez dobę kosztowałoby baterię
 * bez zysku (snapshot i tak zawiera pełny stan).
 */
class Sources {
    private static final String TAG = "StraznikSources";

    /* Klasyfikacja jak w backendzie: CRITICAL sam wystarczy, inaczej AIR + EVENT.
       Testy przypadków: scripts/test_textmatch.py */
    static final String[] CRITICAL = {
        "alarm powietrzny", "zagrożenie z powietrza", "zawyły syreny", "zawyła syrena",
        "naruszenie przestrzeni powietrznej", "naruszyła przestrzeń powietrzną",
        "naruszył przestrzeń powietrzną", "obiekt powietrzny spadł",
        "niezidentyfikowany obiekt", "zestrzelono dron", "zestrzelono rakiet",
        "poderwano myśliwce", "poderwano lotnictwo", "schrony otwarte"
    };
    static final String[] AIR = {
        "dron", "bezzałogow", "bsp", "shahed", "geran", "rakiet", "pocisk", "ch-101",
        "kalibr", "iskander", "kab", "bomb", "myśliwc", "mig-31", "obiekt powietrzny",
        "przestrzeni powietrznej", "przestrzeń powietrzną", "obrona powietrzna",
        "obiekt latając"
    };
    static final String[] EVENT = {
        "spadł", "spadła", "spadło", "eksploz", "wybuch", "zestrzel", "przechwyc",
        "poderwan", "naruszen", "naruszył", "naruszyła", "wleciał", "wtargn", "uderzy",
        "trafił", "szczątki", "atak", "ostrzał", "zawył", "alarm", "ewakuac", "schron",
        "zagrożeni"
    };
    static final String[] EXCLUDE = {
        "ćwiczeni", "trening", "test syren", "próba syren", "próby syren", "głośna próba",
        "rocznic", "upamiętni", "minuta ciszy", "wymian", "modernizac", "przetarg",
        "inwestycj", "zakup", "montaż", "zamontow", "instalac", "rozbudow", "dofinansow",
        "dotacj", "planowan", "potrwa", "konserwac", "remont", "pojawią się", "powstan",
        "wdroż", "komunikat głosowy", "system ostrzegania będzie", "nowe syreny",
        "nowych syren", "pożar bloku", "pożar domu", "pożar mieszkania", "pożar lasu",
        "wypadek drogow", "kolizja", "lpr lądował", "śmigłowiec lpr", "utonię", "potrąc",
        "dachowa", "karambol", "zderzenie samochod"
    };

    /** Punkty referencyjne granicy wschodniej: lat, lon, województwo. */
    private static final double[][] BORDER = {
        {54.44, 19.80, 3}, {54.35, 20.60, 3}, {54.36, 21.50, 3}, {54.34, 22.79, 3},
        {53.90, 23.55, 2}, {53.51, 23.65, 2}, {53.16, 23.87, 2}, {52.70, 23.87, 2},
        {52.07, 23.62, 0}, {51.75, 23.55, 0}, {51.55, 23.55, 0}, {51.18, 23.80, 0},
        {50.80, 24.02, 0}, {50.58, 24.05, 0},
        {50.19, 23.55, 1}, {49.96, 23.10, 1}, {49.80, 22.94, 1}, {49.63, 22.64, 1},
        {49.20, 22.70, 1}
    };
    static final String[] VOIVS = {"lubelskie", "podkarpackie", "podlaskie", "warmińsko-mazurskie"};

    private static final String[][] VOIV_KEYS = {
        {"lubelski", "lublin", "chełm", "zamoś", "biała podlask", "hrubiesz", "włodaw",
         "terespol", "dorohusk", "świdnik", "puław", "kraśnik", "łęczn"},
        {"podkarpack", "rzeszów", "przemyśl", "medyk", "jarosław", "lubaczów", "sanok",
         "krosno", "mielec", "stalowa wol", "tarnobrzeg"},
        {"podlask", "białystok", "suwałk", "augustów", "sokółk", "kuźnic", "siemiatycz",
         "hajnówk", "bielsk podlask", "łomż"},
        {"warmińsko", "olsztyn", "elbląg", "ełk", "gołdap", "braniew", "mazurskie"}
    };

    private static final String UA =
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile";

    static String httpGet(String urlStr) {
        HttpURLConnection c = null;
        try {
            URL url = new URL(urlStr);
            c = (HttpURLConnection) url.openConnection();
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setInstanceFollowRedirects(true);
            if (c.getResponseCode() >= 400) return null;
            StringBuilder sb = new StringBuilder();
            BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
            r.close();
            return sb.toString();
        } catch (Exception e) {
            Log.w(TAG, "GET " + urlStr + " -> " + e);
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** Słowo krytyczne albo para obiekt powietrzny + zdarzenie; wykluczenia mają veto. */
    static boolean matches(String text) {
        String t = text.toLowerCase(Locale.ROOT);
        for (String k : EXCLUDE) if (t.contains(k)) return false;
        for (String k : CRITICAL) if (t.contains(k)) return true;
        boolean air = false, event = false;
        for (String k : AIR) if (t.contains(k)) { air = true; break; }
        if (!air) return false;
        for (String k : EVENT) if (t.contains(k)) { event = true; break; }
        return event;
    }

    static int voivFromText(String text) {
        String t = text.toLowerCase(Locale.ROOT);
        for (int i = 0; i < VOIV_KEYS.length; i++)
            for (String k : VOIV_KEYS[i]) if (t.contains(k)) return i;
        return -1;
    }

    private static double hav(double la1, double lo1, double la2, double lo2) {
        double p1 = Math.toRadians(la1), p2 = Math.toRadians(la2);
        double dp = Math.toRadians(la2 - la1), dl = Math.toRadians(lo2 - lo1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2)
                 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * 6371 * Math.asin(Math.sqrt(a));
    }

    private static double bearing(double la1, double lo1, double la2, double lo2) {
        double p1 = Math.toRadians(la1), p2 = Math.toRadians(la2), dl = Math.toRadians(lo2 - lo1);
        double y = Math.sin(dl) * Math.cos(p2);
        double x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    /** Neptun: obiekt kursem na granicę PL bliżej niż 100 km. */
    static List<Fusion.Signal> neptun() {
        List<Fusion.Signal> out = new ArrayList<>();
        String body = httpGet("https://neptun.in.ua/api/v1/threats");
        if (body == null) return null;
        try {
            JSONArray arr = new JSONObject(body).optJSONArray("threats");
            if (arr == null) return out;
            Set<String> scored = new HashSet<>();
            for (String s : new String[]{"uav", "missile", "ballistic", "kab", "mig31k",
                                         "cruise", "shahed"}) scored.add(s);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject t = arr.getJSONObject(i);
                if (t.isNull("lat") || t.isNull("lon")) continue;
                String type = t.optString("type", "").toLowerCase(Locale.ROOT);
                if (!scored.contains(type)) continue;
                double lat = t.getDouble("lat"), lon = t.getDouble("lon");
                double best = Double.MAX_VALUE; int voiv = 0; double bLat = 0, bLon = 0;
                for (double[] b : BORDER) {
                    double d = hav(lat, lon, b[0], b[1]);
                    if (d < best) { best = d; voiv = (int) b[2]; bLat = b[0]; bLon = b[1]; }
                }
                if (best >= 100) continue;
                if (t.isNull("heading")) continue;
                double hdg = t.getDouble("heading");
                double brg = bearing(lat, lon, bLat, bLon);
                double diff = Math.abs(hdg - brg) % 360;
                if (diff > 180) diff = 360 - diff;
                if (diff > 50) continue;

                String conf = t.optString("confidenceLevel", "low").toLowerCase(Locale.ROOT);
                boolean high = "high".equals(conf);
                String confPl = high ? "wysoka" : ("medium".equals(conf) ? "średnia" : "niska");
                out.add(new Fusion.Signal(
                    "neptun", voiv, high ? 3.0 : 1.5,
                    "NEPTUN: obiekt kursem na granicę, " + Math.round(best)
                        + " km (wiarygodność " + confPl + ")",
                    "neptun:" + t.optString("id") + ":" + (high ? "h" : "m")));
            }
        } catch (Exception e) {
            Log.w(TAG, "neptun parse", e);
        }
        return out;
    }

    private static final Pattern ITEM = Pattern.compile("<item[^>]*>(.*?)</item>", Pattern.DOTALL);
    private static final Pattern TITLE = Pattern.compile("<title[^>]*>(.*?)</title>", Pattern.DOTALL);
    private static final Pattern LINK = Pattern.compile("<link[^>]*>(.*?)</link>", Pattern.DOTALL);
    private static final Pattern PUBDATE = Pattern.compile("<pubDate[^>]*>(.*?)</pubDate>", Pattern.DOTALL);
    private static final Pattern TAGS = Pattern.compile("<[^>]+>");

    private static String clean(String s) {
        if (s == null) return "";
        s = s.replace("<![CDATA[", "").replace("]]>", "");
        s = TAGS.matcher(s).replaceAll(" ");
        return s.replaceAll("\\s+", " ").trim();
    }

    private static final String[][] FEEDS = {
        {"https://www.lublin112.pl/feed/", "0"},
        {"https://radio.lublin.pl/feed/", "0"},
        {"https://www.dziennikwschodni.pl/rss", "0"},
        {"https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podkarpackie&hl=pl&gl=PL&ceid=PL:pl", "1"},
        {"https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podlaskie&hl=pl&gl=PL&ceid=PL:pl", "2"},
        {"https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20lubelskie&hl=pl&gl=PL&ceid=PL:pl", "0"},
        {"https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(warmi%C5%84sko-mazurskie%20OR%20olsztyn)&hl=pl&gl=PL&ceid=PL:pl", "3"}
    };

    private static long parseRssDate(String s) {
        String[] fmts = {"EEE, dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm:ss zzz"};
        for (String f : fmts) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(f, Locale.US);
                Date d = sdf.parse(s.trim());
                if (d != null) return d.getTime();
            } catch (Exception ignored) {}
        }
        return 0;
    }

    /** Media regionalne — najsilniejszy pojedynczy sygnał potwierdzający. */
    static List<Fusion.Signal> media() {
        List<Fusion.Signal> out = new ArrayList<>();
        boolean any = false;
        long maxAge = 45 * 60 * 1000L;
        for (String[] feed : FEEDS) {
            String xml = httpGet(feed[0]);
            if (xml == null) continue;
            any = true;
            Matcher m = ITEM.matcher(xml);
            int n = 0;
            while (m.find() && n++ < 25) {
                String item = m.group(1);
                Matcher tm = TITLE.matcher(item);
                String title = tm.find() ? clean(tm.group(1)) : "";
                if (title.isEmpty()) continue;
                Matcher dm = PUBDATE.matcher(item);
                if (dm.find()) {
                    long ts = parseRssDate(clean(dm.group(1)));
                    if (ts > 0 && System.currentTimeMillis() - ts > maxAge) continue;
                }
                if (!matches(title)) continue;
                int voiv = voivFromText(title);
                if (voiv < 0) voiv = Integer.parseInt(feed[1]);
                Matcher lm = LINK.matcher(item);
                String link = lm.find() ? clean(lm.group(1)) : title;
                out.add(new Fusion.Signal("media", voiv, 2.0,
                    "Media: „" + (title.length() > 90 ? title.substring(0, 90) + "…" : title) + "”",
                    "media:" + link));
            }
        }
        return any ? out : null;
    }

    private static final Pattern RCB_LINK =
        Pattern.compile("href=\"(/web/rcb/[a-z0-9-]{8,})\"[^>]*>(.*?)</a>",
                        Pattern.DOTALL | Pattern.CASE_INSENSITIVE);

    /** Komunikaty RCB — scraping listy, bo gov.pl nie wystawia działającego RSS. */
    static List<Fusion.Signal> rcb() {
        String html = httpGet("https://www.gov.pl/web/rcb");
        if (html == null) return null;
        List<Fusion.Signal> out = new ArrayList<>();
        Matcher m = RCB_LINK.matcher(html);
        int n = 0;
        while (m.find() && n++ < 20) {
            String href = m.group(1);
            String title = clean(m.group(2));
            if (title.length() < 8 || !matches(title)) continue;
            int voiv = voivFromText(title);
            String label = "RCB: „" + (title.length() > 90 ? title.substring(0, 90) + "…" : title) + "”";
            if (voiv >= 0) {
                out.add(new Fusion.Signal("rcb", voiv, 2.0, label, "rcb:" + href + ":" + voiv));
            } else {
                for (int i = 0; i < VOIVS.length; i++)
                    out.add(new Fusion.Signal("rcb", i, 2.0, label, "rcb:" + href + ":" + i));
            }
        }
        return out;
    }
}
