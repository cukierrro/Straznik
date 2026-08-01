@echo off
setlocal
echo Krok 1: build debug + instalacja na emulatorze.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\test_debug_instalacja.ps1"
echo.
echo (okno zamknie sie samo za 5 minut)
timeout /t 300 /nobreak >nul
endlocal
