@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

rem ===========================================================================
rem  Straznik - budowa wydania + test na emulatorze Pixel
rem  Uruchom dwuklikiem. Wszystkie logi ladują w folderze test-out\.
rem ===========================================================================

set "REPO=%~dp0"
set "REPO=%REPO:~0,-1%"
set "OUT=%REPO%\test-out"
set "ANDROID=%REPO%\android-app\android"
set "APP=%REPO%\android-app"

if not exist "%OUT%" mkdir "%OUT%"
del /q "%OUT%\*" >nul 2>&1

rem --- lokalizacja narzedzi SDK -------------------------------------------
set "ADB=adb"
set "EMU=emulator"
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if exist "%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" set "EMU=%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe"
if defined ANDROID_HOME (
  if exist "%ANDROID_HOME%\platform-tools\adb.exe" set "ADB=%ANDROID_HOME%\platform-tools\adb.exe"
  if exist "%ANDROID_HOME%\emulator\emulator.exe" set "EMU=%ANDROID_HOME%\emulator\emulator.exe"
)
rem --- lokalizacja Pythona -------------------------------------------------
rem  Samo "python" w PATH trafia na zaslepke ze Sklepu Microsoft, ktora nic nie
rem  uruchamia, tylko odsyla do instalatora. Szukamy prawdziwego interpretera.
set "PY="
for %%C in (
  "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
  "C:\Python313\python.exe"
  "C:\Python312\python.exe"
) do if not defined PY if exist %%C set "PY=%%~C"
if not defined PY (
  py -3 --version >nul 2>&1 && set "PY=py -3"
)
if not defined PY (
  for /f "delims=" %%P in ('where python3 2^>nul') do if not defined PY set "PY=%%P"
)
if not defined PY (
  echo BLAD - nie znaleziono Pythona. Zainstaluj Python 3 z python.org.
  goto :koniec
)

rem --- JDK 11+ dla Gradle ---------------------------------------------------
rem  Systemowe JAVA_HOME wskazuje tu Jave 8, a wtyczka Androida wymaga 11+.
rem  Najpewniejszy JDK na komputerze z Android Studio to dolaczony do niego JBR.
set "JDK="
for %%J in (
  "%ProgramFiles%\Android\Android Studio\jbr"
  "%LOCALAPPDATA%\Programs\Android Studio\jbr"
  "%ProgramFiles%\Android\Android Studio\jre"
  "%ProgramFiles%\Microsoft\jdk-17"
) do if not defined JDK if exist "%%~J\bin\java.exe" set "JDK=%%~J"
if not defined JDK (
  for /d %%J in ("%ProgramFiles%\Eclipse Adoptium\jdk-1*") do if not defined JDK if exist "%%~J\bin\java.exe" set "JDK=%%~J"
)
if not defined JDK (
  for /d %%J in ("%ProgramFiles%\Java\jdk-1*") do if not defined JDK if exist "%%~J\bin\java.exe" set "JDK=%%~J"
)
if defined JDK (
  set "JAVA_HOME=%JDK%"
  set "PATH=%JDK%\bin;%PATH%"
)

echo adb      = %ADB% > "%OUT%\srodowisko.txt"
echo java     = %JDK% >> "%OUT%\srodowisko.txt"
echo emulator = %EMU% >> "%OUT%\srodowisko.txt"
echo python   = %PY% >> "%OUT%\srodowisko.txt"
%PY% --version >> "%OUT%\srodowisko.txt" 2>&1
if defined JDK "%JDK%\bin\java.exe" -version >> "%OUT%\srodowisko.txt" 2>&1

echo.
echo =========== 1/7  Test spojnosci silnikow ===========
%PY% "%REPO%\scripts\test_spojnosc.py" > "%OUT%\1_spojnosc.txt" 2>&1
if errorlevel 1 (
  echo   BLAD - silniki sie rozjechaly, patrz test-out\1_spojnosc.txt
  type "%OUT%\1_spojnosc.txt"
  goto :koniec
)
type "%OUT%\1_spojnosc.txt"

echo.
echo =========== 2/7  Test dopasowania slow kluczowych ===========
%PY% "%REPO%\scripts\test_textmatch.py" > "%OUT%\2_textmatch.txt" 2>&1
if errorlevel 1 (
  echo   UWAGA - test nie przeszedl albo brakuje zaleznosci backendu.
  echo   Nie blokuje budowy, szczegoly w test-out\2_textmatch.txt
  powershell -NoProfile -Command "Get-Content '%OUT%\2_textmatch.txt' -Tail 6"
) else (
  echo   OK
)

echo.
echo =========== 3/7  Kopiowanie frontendu do www + cap sync ===========
copy /y "%REPO%\frontend\app.js"     "%APP%\www\app.js"     >nul
copy /y "%REPO%\frontend\engine.js"  "%APP%\www\engine.js"  >nul
copy /y "%REPO%\frontend\index.html" "%APP%\www\index.html" >nul
copy /y "%REPO%\frontend\style.css"  "%APP%\www\style.css"  >nul
xcopy /e /y /q "%REPO%\frontend\assets" "%APP%\www\assets\" >nul
pushd "%APP%"
call npx cap sync android > "%OUT%\3_capsync.txt" 2>&1
set SYNCERR=%errorlevel%
popd
if not "%SYNCERR%"=="0" (
  echo   BLAD cap sync - patrz test-out\3_capsync.txt
  goto :koniec
)
echo   OK

echo.
echo =========== 4/7  Budowa podpisanego APK (release) ===========
pushd "%ANDROID%"
call gradlew.bat --no-daemon clean assembleRelease > "%OUT%\4_gradle.txt" 2>&1
set BUILDERR=%errorlevel%
popd
if not "%BUILDERR%"=="0" (
  echo   BLAD budowy - ostatnie linie:
  powershell -NoProfile -Command "Get-Content '%OUT%\4_gradle.txt' -Tail 40"
  goto :koniec
)
set "APK=%ANDROID%\app\build\outputs\apk\release\app-release.apk"
if not exist "%APK%" (
  echo   BLAD - nie ma pliku APK
  goto :koniec
)
copy /y "%APK%" "%REPO%\Straznik.apk" >nul
certutil -hashfile "%REPO%\Straznik.apk" SHA256 > "%OUT%\5_sha256.txt"
echo   OK
type "%OUT%\5_sha256.txt"

echo.
echo =========== 5/7  Emulator Pixel ===========
"%ADB%" start-server >nul 2>&1
"%ADB%" devices > "%OUT%\6_devices.txt" 2>&1
findstr /c:"emulator-" "%OUT%\6_devices.txt" >nul
if errorlevel 1 (
  echo   Emulator nie chodzi - startuje...
  "%EMU%" -list-avds > "%OUT%\6_avds.txt" 2>&1
  set "AVD="
  for /f "usebackq delims=" %%A in ("%OUT%\6_avds.txt") do (
    echo %%A | findstr /i "pixel" >nul && if not defined AVD set "AVD=%%A"
  )
  if not defined AVD (
    for /f "usebackq delims=" %%A in ("%OUT%\6_avds.txt") do if not defined AVD set "AVD=%%A"
  )
  if not defined AVD (
    echo   BLAD - nie ma zadnego AVD. Utworz emulator Pixel w Android Studio.
    goto :koniec
  )
  echo   AVD = !AVD!
  start "" "%EMU%" -avd !AVD! -no-snapshot-load -no-boot-anim
) else (
  echo   Emulator juz chodzi.
)

echo   Czekam na uruchomienie systemu (do 5 min)...
"%ADB%" wait-for-device
set /a PROBA=0
:czekaj
set /a PROBA+=1
for /f "delims=" %%B in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set "BOOT=%%B"
echo   proba !PROBA! - boot_completed=!BOOT!
echo %BOOT% | findstr "1" >nul && goto :wystartowal
if !PROBA! geq 60 (
  echo   BLAD - emulator nie wstal
  goto :koniec
)
timeout /t 5 /nobreak >nul
goto :czekaj
:wystartowal
echo   System gotowy.
timeout /t 10 /nobreak >nul

echo.
echo =========== 6/7  Instalacja i uruchomienie ===========
"%ADB%" logcat -c >nul 2>&1
"%ADB%" install -r -d "%REPO%\Straznik.apk" > "%OUT%\7_install.txt" 2>&1
type "%OUT%\7_install.txt"
findstr /i "Success" "%OUT%\7_install.txt" >nul
if errorlevel 1 (
  echo   Instalacja z zachowaniem danych nie przeszla - probuje na czysto...
  "%ADB%" uninstall pl.straznik.app >nul 2>&1
  "%ADB%" install "%REPO%\Straznik.apk" >> "%OUT%\7_install.txt" 2>&1
  type "%OUT%\7_install.txt"
)
"%ADB%" shell monkey -p pl.straznik.app -c android.intent.category.LAUNCHER 1 >nul 2>&1
echo   Czekam 45 s na pobranie zrodel...
timeout /t 45 /nobreak >nul

echo.
echo =========== 7/7  Zbieranie dowodow ===========
"%ADB%" shell dumpsys notification --noredact > "%OUT%\8_notification_full.txt" 2>&1
"%ADB%" shell cmd notification list > "%OUT%\8_notification_list.txt" 2>&1
"%ADB%" shell dumpsys notification_manager --noredact > "%OUT%\8_notification_mgr.txt" 2>&1
"%ADB%" shell "dumpsys notification --noredact | grep -A3 -i straznik" > "%OUT%\9_pasek.txt" 2>&1
"%ADB%" logcat -d -v time > "%OUT%\10_logcat.txt" 2>&1
"%ADB%" logcat -d -v time *:E > "%OUT%\11_logcat_bledy.txt" 2>&1
"%ADB%" shell dumpsys package pl.straznik.app > "%OUT%\12_pakiet.txt" 2>&1
"%ADB%" exec-out screencap -p > "%OUT%\13_ekran.png" 2>nul
"%ADB%" shell getprop ro.product.model > "%OUT%\14_model.txt" 2>&1
"%ADB%" shell getprop ro.build.version.release >> "%OUT%\14_model.txt" 2>&1

echo.
echo ===========================================================
echo  GOTOWE. Wyniki w folderze:  test-out\
echo  Najwazniejsze:  13_ekran.png, 9_pasek.txt, 11_logcat_bledy.txt
echo ===========================================================

:koniec
echo.
echo (okno zamknie sie samo za 10 minut - mozesz je tez zamknac recznie)
timeout /t 600 /nobreak >nul
endlocal
