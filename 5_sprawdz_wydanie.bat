@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

rem  Ostateczna kontrola: plik, ktory pobierze uzytkownik z linku "Pobierz APK",
rem  musi byc bajt w bajt tym, ktory zbudowano i przetestowano.

set "REPO=%~dp0"
set "REPO=%REPO:~0,-1%"
set "OUT=%REPO%\test-out"
if not exist "%OUT%" mkdir "%OUT%"

rem  Wersja z build.gradle, zeby nie trzeba bylo jej podbijac w drugim miejscu.
set "VER="
for /f "tokens=2 delims= " %%V in ('findstr /c:"versionName" "%REPO%\android-app\android\app\build.gradle"') do set "VER=%%~V"
set "TAG=v%VER%"
echo Sprawdzam wydanie %TAG%

echo Pobieram plik spod linku "Pobierz APK" (releases/latest/download)...
curl -sL -o "%OUT%\80_pobrany.apk" https://github.com/cukierrro/Straznik/releases/latest/download/Straznik.apk

set "H1="
set "H2="
for /f "skip=1 tokens=1" %%H in ('certutil -hashfile "%REPO%\Straznik.apk" SHA256') do if not defined H1 set "H1=%%H"
for /f "skip=1 tokens=1" %%H in ('certutil -hashfile "%OUT%\80_pobrany.apk" SHA256') do if not defined H2 set "H2=%%H"

echo. > "%OUT%\81_porownanie.txt"
echo lokalny  : !H1! >> "%OUT%\81_porownanie.txt"
echo z GitHuba: !H2! >> "%OUT%\81_porownanie.txt"
if "!H1!"=="!H2!" (
  echo ZGODNE >> "%OUT%\81_porownanie.txt"
) else (
  echo ROZNE - NIE UDOSTEPNIAJ TEGO WYDANIA >> "%OUT%\81_porownanie.txt"
)
type "%OUT%\81_porownanie.txt"

echo.
echo --- stan wydania ---
gh release view %TAG% --json tagName,name,isDraft,isPrerelease,assets > "%OUT%\82_wydanie.txt" 2>&1
type "%OUT%\82_wydanie.txt"
echo. >> "%OUT%\82_wydanie.txt"
echo --- lista wydan --- >> "%OUT%\82_wydanie.txt"
gh release list -R cukierrro/Straznik >> "%OUT%\82_wydanie.txt" 2>&1
echo. >> "%OUT%\82_wydanie.txt"
echo --- co GitHub uwaza za najnowsze --- >> "%OUT%\82_wydanie.txt"
rem  bez -q z filtrem jq: cudzyslowy w filtrze gina w cmd i polecenie sie wysypuje
gh api repos/cukierrro/Straznik/releases/latest --jq .tag_name >> "%OUT%\82_wydanie.txt" 2>&1

echo.
echo Wyniki w test-out\81_porownanie.txt i 82_wydanie.txt
echo (okno zamknie sie samo za 5 minut)
timeout /t 300 /nobreak >nul
endlocal
