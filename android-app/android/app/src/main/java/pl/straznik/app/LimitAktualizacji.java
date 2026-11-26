package pl.straznik.app;

/**
 * Górna granica pobieranego pliku aktualizacji (audyt bezpieczeństwa 26.11.2026) — bez
 * Androida, żeby dało się ją sprawdzić testem (scripts/test_limit_aktualizacji.py).
 *
 * Aktualizator sprawdza adres (github.com, ścieżka wydań, HTTPS), sumę SHA-256, nazwę
 * pakietu i certyfikat — ale dopiero PO pobraniu. Pętla czytania nie miała limitu, więc
 * podmieniony zasób wydania mógł zapchać pamięć aplikacji, zanim suma by go odrzuciła.
 * Teraz pobieranie kończy się po przekroczeniu rozmiaru podanego przez serwer Strażnika
 * (pole `size` z /api/app-version) z małym zapasem, a bez tej informacji — po MAKS_BEZ_ROZMIARU.
 */
final class LimitAktualizacji {
    private LimitAktualizacji() {}

    /** APK 1.8.14 ma 15 MB; bez rozmiaru od serwera nie przyjmujemy więcej niż 100 MB. */
    static final long MAKS_BEZ_ROZMIARU = 100L << 20;
    /** Zapas ponad rozmiar podany przez serwer. */
    static final long ZAPAS = 1L << 20;

    /** Ile bajtów wolno pobrać, gdy serwer podał `size` (≤ 0 albo brak = nieznany). */
    static long limit(long rozmiarZSerwera) {
        if (rozmiarZSerwera <= 0) return MAKS_BEZ_ROZMIARU;
        return Math.min(rozmiarZSerwera + ZAPAS, MAKS_BEZ_ROZMIARU);
    }

    /** Czy deklarowany Content-Length (≤ 0 = brak nagłówka) już przekracza limit. */
    static boolean zaDuzyZNaglowka(long contentLength, long limit) {
        return contentLength > 0 && contentLength > limit;
    }
}
