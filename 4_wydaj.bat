@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

rem ===========================================================================
rem  Publikacja wydania v1.4.4: kontrola bezpieczenstwa, push, release, weryfikacja.
rem  Skrypt PRZERYWA prace, jesli cokolwiek w kontroli wyjdzie nie tak.
rem  Wyniki w test-out\.
rem
rem  Tytul wydania po polsku ustawiamy osobno, przez API z pliku JSON:
rem  argumenty przekazywane przez cmd i tak zostalyby przekodowane, a plik
rem  wedruje bajt w bajt.
rem ===========================================================================

set "REPO=%~dp0"
set "REPO=%REPO:~0,-1%"
set "OUT=%REPO%\test-out"
if not exist "%OUT%" mkdir "%OUT%"
cd /d "%REPO%"

echo.
echo === 1/7  Klucz podpisu i hasla poza repozytorium ===
git ls-files > "%OUT%\61_pliki.txt"
findstr /i /c:".jks" /c:"keystore.properties" "%OUT%\61_pliki.txt" | findstr /v /i "example" > "%OUT%\61_sekrety.txt"
for %%A in ("%OUT%\61_sekrety.txt") do if %%~zA GTR 0 (
  echo   PRZERWANE - w repozytorium jest plik klucza albo hasel:
  type "%OUT%\61_sekrety.txt"
  goto :koniec
)
git log --all --oneline -- "*.jks" "keystore.properties" > "%OUT%\62_historia.txt" 2>&1
for %%A in ("%OUT%\62_historia.txt") do if %%~zA GTR 0 (
  echo   PRZERWANE - klucz lub hasla byly kiedys w historii commitow:
  type "%OUT%\62_historia.txt"
  goto :koniec
)
echo   OK - nie ma ich w repozytorium ani w historii

echo.
echo === 2/7  APK w repozytorium identyczny ze zbudowanym ===
set "H1="
set "H2="
for /f "skip=1 tokens=1" %%H in ('certutil -hashfile "%REPO%\Straznik.apk" SHA256') do if not defined H1 set "H1=%%H"
for /f "skip=1 tokens=1" %%H in ('certutil -hashfile "%REPO%\android-app\android\app\build\outputs\apk\release\app-release.apk" SHA256') do if not defined H2 set "H2=%%H"
echo   repozytorium: !H1!
echo   build:        !H2!
if not "!H1!"=="!H2!" (
  echo   PRZERWANE - APK w repozytorium rozni sie od zbudowanego
  goto :koniec
)
echo !H1!> "%OUT%\63_sha.txt"
echo   OK - identyczne

echo.
echo === 3/7  Podpis APK ===
set "SIGNER="
for /d %%B in ("%LOCALAPPDATA%\Android\Sdk\build-tools\*") do if exist "%%B\apksigner.bat" set "SIGNER=%%B\apksigner.bat"
if defined SIGNER (
  call "!SIGNER!" verify --print-certs "%REPO%\Straznik.apk" > "%OUT%\65_podpis.txt" 2>&1
  findstr /i /c:"DOES NOT VERIFY" "%OUT%\65_podpis.txt" >nul && (
    echo   PRZERWANE - APK nie ma poprawnego podpisu
    type "%OUT%\65_podpis.txt"
    goto :koniec
  )
  findstr /i /c:"certificate SHA-256" "%OUT%\65_podpis.txt"
  echo   OK - podpisany
) else (
  echo   apksigner niedostepny - pomijam
)

echo.
echo === 4/7  Czy nie ma niezacommitowanych zmian ===
git status --porcelain > "%OUT%\66_status.txt"
type "%OUT%\66_status.txt"
echo   ^(pusto = wszystko zacommitowane^)

echo.
echo === 5/7  Wypchniecie na GitHuba ===
git push origin main > "%OUT%\67_push.txt" 2>&1
type "%OUT%\67_push.txt"
git rev-parse HEAD > "%OUT%\68_head.txt" 2>&1
git ls-remote origin refs/heads/main >> "%OUT%\68_head.txt" 2>&1
type "%OUT%\68_head.txt"

echo.
echo === 6/7  Utworzenie wydania v1.4.4 ===
gh release create v1.4.4 "%REPO%\Straznik.apk" --notes-file "%REPO%\notatki_wydania_1.4.4.md" --latest > "%OUT%\69_release.txt" 2>&1
type "%OUT%\69_release.txt"

for /f "delims=" %%I in ('gh release view v1.4.4 --json databaseId -q .databaseId 2^>nul') do set "RELID=%%I"
if defined RELID (
  echo   id wydania: !RELID! - ustawiam tytul z pliku JSON
  gh api repos/cukierrro/Straznik/releases/!RELID! -X PATCH --input "%REPO%\notatki_wydania_tytul.json" > "%OUT%\70_tytul.txt" 2>&1
  findstr /i /c:"\"name\"" "%OUT%\70_tytul.txt"
) else (
  echo   UWAGA - nie udalo sie odczytac id wydania, tytul zostaje jako tag
)

echo.
echo === 7/7  Weryfikacja ===
gh release view v1.4.4 --json tagName,name,isLatest,isDraft,assets > "%OUT%\71_weryfikacja.txt" 2>&1
type "%OUT%\71_weryfikacja.txt"
echo. >> "%OUT%\71_weryfikacja.txt"
gh release list -R cukierrro/Straznik >> "%OUT%\71_weryfikacja.txt" 2>&1

echo.
echo   Sprawdzam, czy link "Pobierz APK" prowadzi do tego pliku...
curl -sIL -o "%OUT%\72_link.txt" -w "HTTP %%{http_code}  rozmiar %%{size_download}  ->  %%{url_effective}\n" https://github.com/cukierrro/Straznik/releases/latest/download/Straznik.apk
type "%OUT%\72_link.txt" | findstr /i "location content-length"

echo.
echo ===========================================================
echo  GOTOWE. Wyniki w test-out\ (69_release.txt, 71_weryfikacja.txt)
echo ===========================================================

:koniec
echo.
echo (okno zamknie sie samo za 10 minut)
timeout /t 600 /nobreak >nul
endlocal
