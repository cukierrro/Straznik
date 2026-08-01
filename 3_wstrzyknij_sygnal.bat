@echo off
setlocal
echo Krok 2: podlozenie sygnalu kontrolnego i porownanie paska z aplikacja.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\test_wstrzykniecie.ps1"
echo.
echo (okno zamknie sie samo za 5 minut)
timeout /t 300 /nobreak >nul
endlocal
