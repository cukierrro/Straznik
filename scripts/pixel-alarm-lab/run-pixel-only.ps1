param([string]$Serial = 'emulator-5554')
$ErrorActionPreference = 'Stop'
if ($Serial -notmatch '^emulator-[0-9]+$') { throw 'Dozwolony wyłącznie emulator, nie telefon.' }
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$apk = Join-Path $repo 'test-out\pixel-alarm-lab\build\outputs\apk\debug\StraznikOfflineAlarmLab-debug.apk'
$apk = (New-Object -ComObject Scripting.FileSystemObject).GetFile($apk).ShortPath
$avd = & $adb -s $Serial emu avd name
if ($LASTEXITCODE -ne 0 -or $avd -notcontains 'Pixel_7') { throw 'Wymagany uruchomiony Pixel_7.' }
$permissions = & (Join-Path $sdk 'build-tools\36.0.0\aapt.exe') dump permissions $apk
if ($LASTEXITCODE -ne 0 -or ($permissions -join "`n") -notmatch 'package: pl\.straznik\.offlinelab' -or
    ($permissions -join "`n") -match 'uses-permission') { throw 'APK ma niewłaściwy pakiet lub uprawnienia — STOP.' }
function AdbChecked {
    & $adb -s $Serial @args
    if ($LASTEXITCODE -ne 0) { throw "ADB nie powiodło się: $args" }
}
AdbChecked shell am force-stop pl.straznik.app
AdbChecked shell cmd connectivity airplane-mode enable
AdbChecked shell svc wifi disable
AdbChecked shell svc data disable
$offline = & $adb -s $Serial shell settings get global airplane_mode_on
if ($LASTEXITCODE -ne 0 -or "$offline".Trim() -ne '1') { throw 'Brak potwierdzenia trybu samolotowego.' }
AdbChecked install -r $apk
AdbChecked shell am force-stop pl.straznik.offlinelab
AdbChecked shell input keyevent KEYCODE_WAKEUP
AdbChecked shell wm dismiss-keyguard
AdbChecked shell am start -W -n pl.straznik.offlinelab/.MainActivity
Write-Output 'Otwarto TEST OFFLINE na Pixel_7. Wyniki znajdują się w logcat pod tagiem StraznikOfflineLab.'
