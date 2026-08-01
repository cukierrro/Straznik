# Krok 2 testu scalania: podlozenie kontrolnego sygnalu usludze w tle.
#
# Sedno zgloszenia: pasek powiadomien pokazywal 1.0 pkt, a aplikacja 0 pkt
# i brak sygnalow, bo usluga i aplikacja liczyly z dwoch osobnych zbiorow.
# Podkladamy usludze JEDEN sygnal 2.0 pkt w wojewodztwie lubelskim i patrzymy,
# czy aplikacja pokaze te sama liczbe.
#
# Plik w czystym ASCII: PowerShell 5.1 czyta skrypt bez BOM jako ANSI.
# Zrzut ekranu robimy przez screencap do pliku i adb pull, bo przekierowanie
# "> plik" w PowerShellu przekoduje strumien i zepsuje binarny PNG.

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $repo "test-out"
$log = Join-Path $out "40_wstrzykniecie.txt"
Remove-Item $log -ErrorAction SilentlyContinue

function Zapisz($t) {
  $s = if ($null -eq $t) { "" } elseif ($t -is [array]) { $t -join "`n" } else { "$t" }
  Write-Host $s
  Add-Content -Path $log -Value $s -Encoding UTF8
}

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { $adb = "adb" }
$pkg = "pl.straznik.app"
$prefs = "/data/data/$pkg/shared_prefs"

Zapisz "=== KROK 2: podlozenie sygnalu kontrolnego ==="
Zapisz ""

# Swieza instalacja nie ma zgody na powiadomienia (Android 13+ pyta o nia
# osobno), wiec bez tego usluga dziala, ale paska nie widac.
Zapisz "[zgoda na powiadomienia] $(& $adb shell pm grant $pkg android.permission.POST_NOTIFICATIONS 2>&1)"

$teraz = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$klucz = "media:test-scalania-$teraz"
$sygnal = '[{"src":"media","v":0,"p":2.0,"t":' + $teraz + ',"title":"TEST scalania stanu (sygnal kontrolny)","k":"' + $klucz + '"}]'

$q = [char]34
$xml = @"
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name=@Qhome_voiv@Q>lubelskie</string>
    <string name=@Qsignals@Q>$sygnal</string>
    <string name=@Qseen@Q>[]</string>
</map>
"@
$xml = $xml.Replace("@Q", $q)

$cfg = @"
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name=@Qenabled@Q value=@Qtrue@Q />
</map>
"@
$cfg = $cfg.Replace("@Q", $q)

$t1 = Join-Path $env:TEMP "straznik_bg.xml"
$t2 = Join-Path $env:TEMP "straznik_bg_cfg.xml"
[System.IO.File]::WriteAllText($t1, $xml, (New-Object System.Text.UTF8Encoding $false))
[System.IO.File]::WriteAllText($t2, $cfg, (New-Object System.Text.UTF8Encoding $false))

Zapisz "podkladany sygnal: 2.0 pkt, woj. lubelskie, klucz $klucz"
Zapisz ""

Zapisz "[force-stop] $(& $adb shell am force-stop $pkg 2>&1)"
Start-Sleep -Seconds 3
Zapisz "[push1] $(& $adb push $t1 /data/local/tmp/straznik_bg.xml 2>&1)"
Zapisz "[push2] $(& $adb push $t2 /data/local/tmp/straznik_bg_cfg.xml 2>&1)"
Zapisz "[cp1] $(& $adb shell run-as $pkg cp /data/local/tmp/straznik_bg.xml $prefs/straznik_bg.xml 2>&1)"
Zapisz "[cp2] $(& $adb shell run-as $pkg cp /data/local/tmp/straznik_bg_cfg.xml $prefs/straznik_bg_cfg.xml 2>&1)"
Zapisz ""
Zapisz "--- stan PO podlozeniu ---"
Zapisz (& $adb shell run-as $pkg cat $prefs/straznik_bg.xml 2>&1)
Zapisz ""

& $adb logcat -c 2>&1 | Out-Null
& $adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 2>&1 | Out-Null
Zapisz "Aplikacja uruchomiona. Czekam 90 s (usluga liczy co 20 s, aplikacja scala co 30 s)."
Start-Sleep -Seconds 90

$pow = & $adb shell dumpsys notification --noredact 2>&1
$pow | Out-File -Encoding utf8 (Join-Path $out "41_notification_full.txt")
Zapisz "--- TRESC POWIADOMIEN (pasek) ---"
$linie = $pow | Select-String -Pattern "android.title|android.text|android.bigText"
Zapisz ($linie | ForEach-Object { $_.Line.Trim() } | Select-Object -First 30)
Zapisz ""

& $adb shell screencap -p /sdcard/ekran.png 2>&1 | Out-Null
& $adb pull /sdcard/ekran.png (Join-Path $out "42_ekran_po_wstrzyknieciu.png") 2>&1 | Out-Null
Zapisz "Zrzut ekranu: test-out\42_ekran_po_wstrzyknieciu.png"

& $adb logcat -d -v time *:E 2>&1 | Out-File -Encoding utf8 (Join-Path $out "43_logcat_bledy.txt")

Zapisz ""
Zapisz "=== GOTOWE ==="
Zapisz "Pasek powinien pokazac 'lubelskie 2.0 pkt', a aplikacja te sama liczbe."
