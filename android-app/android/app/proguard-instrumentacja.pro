# Tylko dla buildów z -PsecurityTests (testy instrumentacyjne na wariancie release).
# Do wydania NIE trafia — build.gradle dołącza ten plik wyłącznie przy tej fladze.
#
# Test APK dzieli z aplikacją biblioteki (Kotlin, androidx.tracing, Guava…) i po
# R8 woła je pod nazwami z mapping.txt aplikacji. Metody, których aplikacja sama
# nie używa, R8 z niej wycina — wtedy runner pada przy starcie z NoSuchMethodError
# (sprawdzone 10.10.2026: kotlin.jvm.internal.Intrinsics). Zostawiamy je w całości.
-keep class kotlin.** { *; }
-keep class kotlinx.** { *; }
-keep class androidx.tracing.** { *; }
-keep class androidx.concurrent.** { *; }
-keep class androidx.lifecycle.** { *; }
-keep class androidx.core.** { *; }
-keep class com.google.common.** { *; }

# SecurityReleaseTest.deviceToken woła FirebaseMessaging.getInstance().getToken()
# i Tasks.await po oryginalnych nazwach; w aplikacji R8 je przemianował
# (NoSuchMethodError, 6.11.2026). Tylko dla testu — wydanie bez zmian.
-keep class com.google.firebase.messaging.FirebaseMessaging { public *; }
-keep class com.google.firebase.FirebaseApp { public *; }
-keep class com.google.android.gms.tasks.** { *; }
