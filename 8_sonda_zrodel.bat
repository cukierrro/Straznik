@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

rem ===========================================================================
rem  Sonda dostepnosci zrodel stref przestrzeni powietrznej u sasiadow.
rem  Dla kazdego adresu z scripts\probe_urls.txt zapisuje kod HTTP, typ tresci,
rem  rozmiar i poczatek odpowiedzi. Zadnych zgadywanek - liczy sie to,
rem  co serwer naprawde odda.
rem  Wynik: test-out\sonda.txt  (pelne odpowiedzi w test-out\sonda\)
rem ===========================================================================

set "REPO=%~dp0"
set "REPO=%REPO:~0,-1%"
set "OUT=%REPO%\test-out"
set "BODIES=%OUT%\sonda"
if not exist "%OUT%" mkdir "%OUT%"
if not exist "%BODIES%" mkdir "%BODIES%"
del /q "%BODIES%\*" >nul 2>&1
set "RAPORT=%OUT%\sonda.txt"
echo === SONDA ZRODEL STREF - %DATE% %TIME% === > "%RAPORT%"

set "UA=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

set /a N=0
for /f "usebackq delims=" %%U in ("%REPO%\scripts\probe_urls.txt") do (
  set /a N+=1
  set "URL=%%U"
  echo [!N!] !URL!
  set "BODY=%BODIES%\!N!.txt"
  for /f "delims=" %%R in ('curl -s -L -m 25 -A "%UA%" -H "Accept: application/json,text/html,*/*" -o "!BODY!" -w "%%{http_code}^|%%{content_type}^|%%{size_download}^|%%{url_effective}" "!URL!" 2^>nul') do set "META=%%R"
  echo. >> "%RAPORT%"
  echo ---------------------------------------------------------------- >> "%RAPORT%"
  echo [!N!] !URL! >> "%RAPORT%"
  echo     !META! >> "%RAPORT%"
  if exist "!BODY!" (
    powershell -NoProfile -Command "$p='!BODY!'; if((Get-Item $p).Length -gt 0){ $s=Get-Content $p -Raw -Encoding UTF8; $s=$s -replace '\s+',' '; if($s.Length -gt 400){$s=$s.Substring(0,400)}; Write-Output ('     POCZATEK: '+$s) } else { Write-Output '     (pusta odpowiedz)' }" >> "%RAPORT%"
  )
)

echo.
echo ===========================================================
echo  Gotowe. Raport: test-out\sonda.txt
echo  Pelne odpowiedzi: test-out\sonda\
echo ===========================================================
echo.
echo (okno zamknie sie samo za 10 minut)
timeout /t 600 /nobreak >nul
endlocal
