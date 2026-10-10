# Reguły R8 dla Strażnika.
#
# Zasada: ścieżka alarmu nie może zależeć od tego, czy R8 „domyśli się”, że coś
# jest używane. Błąd tutaj nie wychodzi przy budowie ani przy starcie — wychodzi
# dopiero wtedy, gdy przyjdzie prawdziwy alarm i metoda okaże się wycięta.
# Dlatego trzymamy w całości wszystko, co jest wołane spoza zwykłego wywołania
# w Javie: przez system (manifest), przez most JavaScript (refleksja Capacitora)
# albo przez nazwę klasy zapisaną w pliku. Zysk R8 bierze się z bibliotek
# (androidx, Firebase, Kotlin), nie z tych kilku tysięcy linii.

# --- Nasz kod natywny: alarmy, push FCM, wtyczka, aktualizator ----------------
# MainActivity, AlarmActivity, StraznikFcmService i AlarmActionReceiver uruchamia
# system po nazwie z manifestu; BackgroundPlugin woła JavaScript przez
# refleksję. Całość jest mała, więc nie ma czego oszczędzać — nazwy zostają też
# czytelne w stosach błędów.
-keep class pl.straznik.app.** { *; }

# --- Capacitor ----------------------------------------------------------------
# Biblioteka ma własne reguły (consumerProguardFiles), ale tylko dla klas wtyczek.
# Mostek (PluginHandle, PluginMethodHandle) szuka metod przez getMethods() i czyta
# adnotacje w czasie działania, PluginManager ładuje wtyczki po nazwie klasy
# z assets/capacitor.plugins.json, a MessageHandler wystawia @JavascriptInterface.
# Zostawiamy całość — awaria mostu to aplikacja bez alarmów.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @interface com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }

# Adnotacje muszą przetrwać RAZEM z wartościami domyślnymi: @PluginMethod bez
# argumentów niesie returnType = "promise" właśnie jako AnnotationDefault. Bez
# tego mostek nie wie, jak zwrócić wynik, i wywołanie z JavaScriptu wisi.
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod,Exceptions

# Metody wystawione do WebView (mostek Capacitora, gdyby doszły kolejne)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- Czytelne stosy błędów ----------------------------------------------------
# Numery linii zostają, nazwa pliku źródłowego zastąpiona jednym słowem.
# Odszyfrowanie reszty wymaga mapping.txt z TEGO SAMEGO wydania.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
