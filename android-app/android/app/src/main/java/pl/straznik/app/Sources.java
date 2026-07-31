package pl.straznik.app;

import android.content.Context;
import android.content.SharedPreferences;
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

    /**
     * Wszystkie 16 województw — kolejność musi się zgadzać z VOIV_KEYS,
     * indeksami w BORDER i tablicą sąsiedztwa w Fusion, bo stan w tle trzymamy
     * po indeksach. Ta sama lista i kolejność co config.VOIVODESHIPS w backendzie.
     */
    static final String[] VOIVS = {
        "lubelskie", "podkarpackie", "podlaskie", "mazowieckie", "świętokrzyskie",
        "małopolskie", "warmińsko-mazurskie", "łódzkie", "śląskie", "kujawsko-pomorskie",
        "pomorskie", "zachodniopomorskie", "lubuskie", "wielkopolskie", "dolnośląskie",
        "opolskie"
    };

    /** Punkty referencyjne granicy wschodniej: lat, lon, indeks w VOIVS. */
    private static final double[][] BORDER = {
        {54.44, 19.80, 6}, {54.35, 20.60, 6}, {54.36, 21.50, 6}, {54.34, 22.79, 6},
        {53.90, 23.55, 2}, {53.51, 23.65, 2}, {53.16, 23.87, 2}, {52.70, 23.87, 2},
        {52.07, 23.62, 0}, {51.75, 23.55, 0}, {51.55, 23.55, 0}, {51.18, 23.80, 0},
        {50.80, 24.02, 0}, {50.58, 24.05, 0},
        {50.19, 23.55, 1}, {49.96, 23.10, 1}, {49.80, 22.94, 1}, {49.63, 22.64, 1},
        {49.20, 22.70, 1}
    };

    /**
     * Kolejność ma znaczenie: dopasowanie kończy się na pierwszym trafieniu,
     * więc nazwy zawierające się w innych (pomorskie ⊂ kujawsko-pomorskie) idą
     * później. Świadomie pomijamy nazwy kolidujące ze słowami pospolitymi
     * ("piła", "żary", "hel", "brzeg"). Kopia VOIV_KEYWORDS z backendu.
     */
    private static final String[][] VOIV_KEYS = {
        {"lubelski", "lublin", "chełm", "zamoś", "biała podlask", "hrubiesz", "włodaw",
         "terespol", "dorohusk", "świdnik", "puław", "kraśnik", "łęczn"},
        {"podkarpack", "rzeszów", "przemyśl", "medyk", "jarosław", "lubaczów", "sanok",
         "krosno", "mielec", "stalowa wol", "tarnobrzeg"},
        // Białystok odmienia się nieregularnie (Białymstoku, Białegostoku)
        {"podlask", "białystok", "białymstok", "białegostok", "suwałk", "augustów",
         "sokółk", "kuźnic", "siemiatycz", "hajnówk", "bielsk podlask", "łomż"},
        {"mazowieck", "warszaw", "radom", "siedlc", "płock", "ostrołęk", "pruszków",
         "legionow", "otwock", "żyrardów", "ciechanów"},
        {"świętokrzysk", "kielc", "ostrowiec świętokrzysk", "starachowic", "skarżysk",
         "sandomierz", "końskie", "jędrzejów", "busko"},
        {"małopolsk", "kraków", "tarnów", "nowy sącz", "oświęcim", "zakopane", "chrzanów",
         "olkusz", "bochni", "wadowic"},
        {"warmińsko", "olsztyn", "elbląg", "ełk", "gołdap", "braniew", "mazurskie",
         "ostróda", "iława", "kętrzyn", "giżyck", "mrągow"},
        {"łódzk", "łódź", "piotrków trybunalsk", "pabianic", "bełchatów", "sieradz",
         "kutno", "zgierz", "radomsk", "tomaszów mazowieck", "tomaszowie mazowieck",
         "tomaszowa mazowieck", "skierniewic"},
        {"śląski", "katowic", "częstochow", "gliwic", "sosnowiec", "zabrze", "bytom",
         "rybnik", "bielsko-biał", "tychy", "chorzów", "dąbrowa górnicz", "jastrzębie",
         "żywiec"},
        {"kujawsko", "bydgoszcz", "toruń", "włocławek", "grudziądz", "inowrocław",
         "brodnic", "świecie", "chełmn", "chełmż"},
        {"woj. pomorsk", "pomorskiego", "gdańsk", "gdyni", "sopot", "słupsk", "tczew",
         "malbork", "wejherow", "kaszub", "kwidzyn", "starogard gdańsk", "chojnic",
         "lębork", "puck"},
        {"zachodniopomorsk", "szczecin", "koszalin", "kołobrzeg", "świnoujści", "stargard",
         "police", "wałcz", "gryfin"},
        {"lubusk", "zielona gór", "zielonej gór", "gorzów", "nowa sól", "świebodzin",
         "międzyrzecz", "słubic", "sulechów"},
        {"wielkopolsk", "poznań", "kalisz", "konin", "leszno", "gniezno",
         "ostrów wielkopolsk", "piła wielkopolsk", "swarzędz", "śrem"},
        {"dolnośląsk", "wrocław", "legnic", "wałbrzych", "jelenia gór", "lubin", "głogów",
         "świdnic", "bolesławiec", "oleśnic"},
        {"opolsk", "opole", "opolu", "kędzierzyn", "nysa", "kluczbork", "prudnik",
         "strzelce opolsk", "namysłów"}
    };

    /** Przybliżone prostokąty województw przygranicznych: lat_min, lon_min, lat_max, lon_max.
     *  Do przypisania stref PAŻP wystarczy przybliżenie — strefy są duże, a chodzi
     *  o to, nad którym regionem leżą, nie o dokładność co do gminy. */
    private static final Object[][] VOIV_BBOX = {
        {0, 50.25, 21.60, 52.30, 24.15},   // lubelskie
        {1, 49.00, 21.10, 50.85, 23.60},   // podkarpackie
        {2, 52.28, 21.60, 54.40, 24.00},   // podlaskie
        {6, 53.13, 19.10, 54.45, 22.95},   // warmińsko-mazurskie
    };

    /** Indeks województwa dla punktu albo −1. */
    static int voivForPoint(double lat, double lon) {
        for (Object[] b : VOIV_BBOX) {
            if (lat >= (Double) b[1] && lat <= (Double) b[3]
                && lon >= (Double) b[2] && lon <= (Double) b[4]) return (Integer) b[0];
        }
        return -1;
    }

    private static final String UA =
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile";

    static String httpGet(String urlStr) {
        HttpURLConnection c = null;
        try {
            URL url = new URL(urlStr);
            c = (HttpURLConnection) url.openConnection();
            c.setRequestProperty("User-Agent", UA);
            // pełniejszy zestaw nagłówków: część serwisów (m.in. gov.pl) odrzuca
            // żądania wyglądające na automat, a te trzy nagłówki wysyła każda przeglądarka
            c.setRequestProperty("Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            c.setRequestProperty("Accept-Language", "pl-PL,pl;q=0.9,en;q=0.8");
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

    /**
     * Województwo po NAJDŁUŻSZYM pasującym haśle, nie po pierwszym trafieniu:
     * nazwy się zawierają — "Chełmno" (kujawsko-pomorskie) zawiera "chełm"
     * (lubelskie), "Radomsko" (łódzkie) zawiera "radom" (mazowieckie),
     * "Tomaszów Mazowiecki" zawiera "mazowieck". Dłuższe hasło jest bardziej
     * szczegółowe, więc wygrywa.
     */
    /** Małe litery bez diakrytyków; ł nie rozkłada się w NFD, stąd osobna podmiana. */
    static String fold(String s) {
        String n = java.text.Normalizer.normalize(s.toLowerCase(Locale.ROOT),
            java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.replace('ł', 'l');
    }

    static int voivFromText(String text) {
        String t = fold(text);
        int best = -1, bestLen = 0;
        for (int i = 0; i < VOIV_KEYS.length; i++)
            for (String k : VOIV_KEYS[i]) {
                String kf = fold(k);
                if (kf.length() > bestLen && t.contains(kf)) { best = i; bestLen = kf.length(); }
            }
        return best;
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
    /* Punktacja obiektów NEPTUN — kopia reguły z backendu i engine.js:
       waga typu × √liczba × k_odległości × k_wiarygodności × k_potwierdzeń × k_cyklu.
       Zagrożenie zależy od tego CO leci, ILE tego jest, JAK BLISKO i JAK PEWNA
       jest obserwacja — jedna stawka za „obiekt kursem na PL” tego nie oddawała. */
    static final double NEPTUN_MAX_KM = 250.0;
    private static final String[] TYPE_KEYS =
        {"ballistic", "mig31k", "cruise", "missile", "kab", "shahed", "uav", "recon", "fpv"};
    private static final double[] TYPE_W =
        {3.0, 2.6, 2.4, 2.4, 1.8, 1.4, 1.1, 0.5, 0.0};

    private static double typeWeight(String type) {
        for (int i = 0; i < TYPE_KEYS.length; i++)
            if (TYPE_KEYS[i].equals(type)) return TYPE_W[i];
        return 0.0;
    }

    private static double distMult(double km) {
        if (km < 30) return 1.6;
        if (km < 60) return 1.3;
        if (km < 100) return 1.0;
        if (km < 150) return 0.55;
        if (km < 250) return 0.25;
        return 0.0;
    }

    private static double sourceMult(int n) {
        if (n <= 1) return 0.7;    // jedno zgłoszenie to jeszcze nie potwierdzenie
        if (n == 2) return 0.9;
        if (n <= 4) return 1.1;
        return 1.25;
    }

    static double scoreThreat(JSONObject t, double distKm) {
        double weight = typeWeight(t.optString("type", "").toLowerCase(Locale.ROOT));
        if (weight <= 0 || distKm >= NEPTUN_MAX_KM) return 0.0;
        int count = Math.max(t.optInt("count", 1), 1);
        String conf = t.optString("confidenceLevel", "low").toLowerCase(Locale.ROOT);
        String life = t.optString("lifecycle", "uncertain").toLowerCase(Locale.ROOT);
        int sources = Math.max(t.optInt("sourceCount", 1), 1);
        double kConf = "high".equals(conf) ? 1.0 : ("medium".equals(conf) ? 0.6 : 0.35);
        double kLife = "confirmed".equals(life) ? 1.1 : ("created".equals(life) ? 0.7 : 0.85);
        double p = weight * Math.sqrt(count) * distMult(distKm) * kConf
                 * sourceMult(sources) * kLife;
        return Math.round(p * 100) / 100.0;
    }

    static List<Fusion.Signal> neptun() {
        List<Fusion.Signal> out = new ArrayList<>();
        String body = httpGet("https://neptun.in.ua/api/v1/threats");
        if (body == null) return null;
        try {
            JSONArray arr = new JSONObject(body).optJSONArray("threats");
            if (arr == null) return out;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject t = arr.getJSONObject(i);
                if (t.isNull("lat") || t.isNull("lon")) continue;
                double lat = t.getDouble("lat"), lon = t.getDouble("lon");
                double best = Double.MAX_VALUE; int voiv = 0; double bLat = 0, bLon = 0;
                for (double[] b : BORDER) {
                    double d = hav(lat, lon, b[0], b[1]);
                    if (d < best) { best = d; voiv = (int) b[2]; bLat = b[0]; bLon = b[1]; }
                }
                if (best >= NEPTUN_MAX_KM) continue;
                if (t.isNull("heading")) continue;
                double hdg = t.getDouble("heading");
                double brg = bearing(lat, lon, bLat, bLon);
                double diff = Math.abs(hdg - brg) % 360;
                if (diff > 180) diff = 360 - diff;
                if (diff > 50) continue;

                double points = scoreThreat(t, best);
                if (points <= 0) continue;

                String conf = t.optString("confidenceLevel", "low").toLowerCase(Locale.ROOT);
                String confPl = "high".equals(conf) ? "wysoka"
                    : ("medium".equals(conf) ? "średnia" : "niska");
                int count = Math.max(t.optInt("count", 1), 1);
                int sources = Math.max(t.optInt("sourceCount", 1), 1);
                String ile = count > 1 ? count + "× " : "";
                // poziom w kluczu: zbliżenie się obiektu albo nowe potwierdzenia
                // podnoszą wagę, więc sygnał ma prawo wejść ponownie
                int tier = (int) (points * 2);
                out.add(new Fusion.Signal(
                    "neptun", voiv, points,
                    "NEPTUN: " + ile + "obiekt kursem na granicę, " + Math.round(best)
                        + " km (wiarygodność " + confPl + ", " + sources + " potwierdzeń)",
                    "neptun:" + t.optString("id") + ":t" + tier));
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
        {"https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(warmi%C5%84sko-mazurskie%20OR%20olsztyn)&hl=pl&gl=PL&ceid=PL:pl", "6"},
        // Ogólnopolski nasłuch — "-1" znaczy: brak domyślnego regionu, województwo
        // rozpoznaje voivFromText. Jedno zapytanie pokrywa pozostałe 12 województw.
        {"https://news.google.com/rss/search?q=(%22alarm%20powietrzny%22%20OR%20%22zawy%C5%82y%20syreny%22%20OR%20%22naruszenie%20przestrzeni%20powietrznej%22%20OR%20%22zestrzelono%20dron%22)&hl=pl&gl=PL&ceid=PL:pl", "-1"}
    };

    /** Media bałtyckie — incydent powietrzny u sąsiadów NATO podnosi czujność
     *  podlaskiego i warmińsko-mazurskiego (kierunek Kaliningrad/Białoruś).
     *  Aplikacja miała to źródło od początku, usługa w tle nie. */
    private static final String[] BALTIC_FEEDS = {
        "https://news.err.ee/rss", "https://eng.lsm.lv/rss/",
        "https://www.delfi.lt/rss/feeds/daily.xml",
    };
    private static final int[] BALTIC_TARGETS = {2, 6};   // podlaskie, warmińsko-mazurskie
    private static final String[] BALTIC_CRITICAL = {
        "airspace violation", "violated airspace", "airspace was violated", "air raid",
        "airspace closed", "shot down a drone", "scrambled jets",
        "oro erdvės pažeid", "gaisa telpas pārkāp", "õhuruumi rikku",
    };
    private static final String[] BALTIC_AIR = {
        "airspace", "air space", "drone", "uav", "missile", "shahed", "air defence",
        "air defense", "oro erdv", "bepilot", "raket", "gaisa telp", "droon", "õhuruum",
        "military aircraft", "fighter jet", "jets",
    };
    private static final String[] BALTIC_EVENT = {
        "violat", "intercept", "shot down", "scrambl", "incursion", "crash", "fell",
        "explos", "struck", "entered", "closed", "alert", "debris",
    };
    private static final String[] BALTIC_EXCLUDE = {
        "exercise", "drill", "training", "anniversary", "drone show", "festival",
        "pratyb", "mācīb", "õppus", "delivery drone", "drone racing", "photo drone",
    };

    private static boolean balticMatches(String text) {
        String t = text.toLowerCase(Locale.ROOT);
        for (String k : BALTIC_EXCLUDE) if (t.contains(k)) return false;
        for (String k : BALTIC_CRITICAL) if (t.contains(k)) return true;
        boolean air = false, event = false;
        for (String k : BALTIC_AIR) if (t.contains(k)) { air = true; break; }
        if (!air) return false;
        for (String k : BALTIC_EVENT) if (t.contains(k)) { event = true; break; }
        return event;
    }

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
                if (voiv < 0) continue;   // kanał ogólnopolski bez rozpoznanego regionu
                Matcher lm = LINK.matcher(item);
                String link = lm.find() ? clean(lm.group(1)) : title;
                out.add(new Fusion.Signal("media", voiv, 2.0,
                    "Media: „" + (title.length() > 90 ? title.substring(0, 90) + "…" : title) + "”",
                    "media:" + link));
            }
        }
        // media bałtyckie: incydent u sąsiadów NATO podnosi czujność północno-wschodniej ściany
        for (String url : BALTIC_FEEDS) {
            String xml = httpGet(url);
            if (xml == null) continue;
            any = true;
            Matcher m = ITEM.matcher(xml);
            int n = 0;
            while (m.find() && n++ < 25) {
                String item = m.group(1);
                Matcher tm = TITLE.matcher(item);
                String title = tm.find() ? clean(tm.group(1)) : "";
                if (title.isEmpty() || !balticMatches(title)) continue;
                Matcher dm = PUBDATE.matcher(item);
                if (dm.find()) {
                    long ts = parseRssDate(clean(dm.group(1)));
                    if (ts > 0 && System.currentTimeMillis() - ts > maxAge) continue;
                }
                Matcher lm = LINK.matcher(item);
                String link = lm.find() ? clean(lm.group(1)) : title;
                for (int v : BALTIC_TARGETS)
                    out.add(new Fusion.Signal("media", v, 1.0,
                        "Media bałtyckie: „" + (title.length() > 90
                            ? title.substring(0, 90) + "…" : title) + "”",
                        "baltic:" + link + ":" + v));
            }
        }
        return any ? out : null;
    }

    /**
     * PAŻP — nowo aktywowane strefy przestrzeni powietrznej (AUP/UUP).
     *
     * Aplikacja sprawdzała to źródło od początku, ale usługa w tle nie — a to ono
     * generuje w praktyce najwięcej sygnałów. Efekt był taki, że przy zamkniętej
     * aplikacji nie przychodziło nic, a po jej otwarciu alarmy pojawiały się
     * natychmiast. Zbiór stref z poprzedniego obiegu trzymamy w SharedPreferences,
     * bo sygnałem jest dopiero POJAWIENIE SIĘ nowej strefy, nie jej trwanie.
     */
    static List<Fusion.Signal> pansa(Context ctx) {
        String body = null;
        for (String u : new String[]{"https://airspace.pansa.pl/map-configuration/uup",
                                     "https://airspace.pansa.pl/map-configuration/aup"}) {
            body = httpGet(u);
            if (body != null && body.length() > 40) break;
        }
        if (body == null) return null;

        List<Fusion.Signal> out = new ArrayList<>();
        SharedPreferences p = ctx.getSharedPreferences("straznik_bg", Context.MODE_PRIVATE);
        try {
            JSONArray feats = new JSONArray(body);
            long now = System.currentTimeMillis();
            JSONArray seenNow = new JSONArray();
            Set<String> prev = new HashSet<>();
            JSONArray prevArr = new JSONArray(p.getString("pansa_zones", "[]"));
            for (int i = 0; i < prevArr.length(); i++) prev.add(prevArr.getString(i));
            boolean firstRun = p.getString("pansa_zones", "").isEmpty();

            for (int i = 0; i < feats.length(); i++) {
                JSONObject props = feats.getJSONObject(i).optJSONObject("properties");
                if (props == null) continue;
                String dz = props.optString("designator", "");
                if (dz.isEmpty()) continue;

                JSONArray res = props.optJSONArray("airspaceReservations");
                JSONObject activeRes = null;
                for (int j = 0; res != null && j < res.length(); j++) {
                    JSONObject r = res.getJSONObject(j);
                    long s = parseIso(r.optString("startDate")), e = parseIso(r.optString("endDate"));
                    if (s > 0 && e > 0 && now >= s && now <= e
                        && !"CANCELLED".equalsIgnoreCase(r.optString("reservationStatus"))) {
                        activeRes = r; break;
                    }
                }
                if (activeRes == null) continue;

                JSONArray cen = props.optJSONArray("centroid");
                if (cen == null || cen.length() == 0) continue;
                JSONObject c = cen.optJSONObject(0);
                if (c == null || c.isNull("x")) continue;
                int voiv = voivForPoint(c.optDouble("y"), c.optDouble("x"));
                if (voiv < 0) continue;

                seenNow.put(dz);
                // pierwszy obieg tylko zapamiętuje stan — inaczej po każdym starcie
                // usługi wszystkie trwające strefy zgłosiłyby się jako nowe
                if (firstRun || prev.contains(dz)) continue;
                out.add(new Fusion.Signal("pansa", voiv, 1.0,
                    "PAŻP: aktywacja strefy " + props.optString("airspaceElementType", "")
                        + " " + dz + " nad woj. " + VOIVS[voiv]
                        + " (" + activeRes.optString("lowerAltitude", "?") + "–"
                        + activeRes.optString("upperAltitude", "?") + ")",
                    "pansa:" + dz + ":" + activeRes.optString("endDate")));
            }
            p.edit().putString("pansa_zones", seenNow.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "pansa parse", e);
            return null;
        }
        return out;
    }

    private static long parseIso(String s) {
        if (s == null || s.isEmpty()) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            return f.parse(s.substring(0, Math.min(19, s.length()))).getTime();
        } catch (Exception e) {
            return 0;
        }
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
