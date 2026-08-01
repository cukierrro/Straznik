# Krok 1 testu scalania: build debug + instalacja.
#
# Emulator jest obrazem produkcyjnym ("adbd cannot run as root in production
# builds"), wiec do podlozenia kontrolnego sygnalu potrzebny jest build
# debugowy - tylko dla niego dziala "adb shell run-as". Logika scalania jest
# w obu buildach identyczna, wiec test jest miarodajny.
#
# Plik w czystym ASCII: PowerShell 5.1 czyta skrypt bez BOM jako ANSI.

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $repo "test-out"
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }
$log = Join-Path $out "30_debug_instalacja.txt"
Remove-Item $log -ErrorAction SilentlyContinue

function Zapisz($t) {
  $s = if ($null -eq $t) { "" } elseif ($t -is [array]) { $t -join "`n" } else { "$t" }
  Write-Host $s
  Add-Content -Path $log -Value $s -Encoding UTF8
}

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { $adb = "adb" }
$pkg = "pl.straznik.app"
$android = Join-Path $repo "android-app\android"

$jdk = "$env:ProgramFiles\Android\Android Studio\jbr"
if (Test-Path "$jdk\bin\java.exe") { $env:JAVA_HOME = $jdk; $env:PATH = "$jdk\bin;$env:PATH" }

Zapisz "=== KROK 1: build debug + instalacja ==="
Zapisz "JAVA_HOME = $env:JAVA_HOME"
Zapisz ""

Push-Location $android
& cmd /c "gradlew.bat --no-daemon assembleDebug" 2>&1 | Out-File -Encoding utf8 (Join-Path $out "31_gradle_debug.txt")
$kod = $LASTEXITCODE
Pop-Location
if ($kod -ne 0) {
  Zapisz "BLAD budowy debug, ostatnie linie:"
  Zapisz (Get-Content (Join-Path $out "31_gradle_debug.txt") -Tail 30)
  exit 1
}
$apk = Join-Path $android "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { Zapisz "BLAD: brak $apk"; exit 1 }
Zapisz "Zbudowano: $apk"

Zapisz "[uninstall] $(& $adb uninstall $pkg 2>&1)"
Zapisz "[install] $(& $adb install $apk 2>&1)"
& $adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 2>&1 | Out-Null
Start-Sleep -Seconds 20
& $adb exec-out screencap -p > (Join-Path $out "32_ekran_debug.png")

Zapisz ""
Zapisz "=== GOTOWE ==="
Zapisz "Teraz w emulatorze: wybierz wojewodztwo lubelskie i wlacz nasluch w tle."
Zapisz "Potem uruchom 3_wstrzyknij_sygnal.bat"
