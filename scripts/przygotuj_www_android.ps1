# Przygotowanie www/ dla Androida: interfejs z frontend/ + moduł GROTA z grota/.
#
# Kolejność ma znaczenie: robocopy /MIR usuwa z celu wszystko, czego nie ma w źródle,
# więc GROTA idzie DRUGA — inaczej lustro frontend/ skasowałoby ją przy każdym
# budowaniu. Strona straznik.eu podaje samo frontend/ i Groty nie widzi (decyzja usera).
#
# Użycie (z katalogu repo):  powershell -File scripts\przygotuj_www_android.ps1
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$www = Join-Path $repo "android-app\www"

robocopy (Join-Path $repo "frontend") $www /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy frontend -> www: kod $LASTEXITCODE" }

$grota = Join-Path $repo "grota"
if (Test-Path (Join-Path $grota "widok.js")) {
    robocopy $grota (Join-Path $www "grota") /MIR /NFL /NDL /NJH /NJS /NP /XF README.md | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy grota -> www/grota: kod $LASTEXITCODE" }
    "www gotowe: frontend + GROTA"
} else {
    "www gotowe: sam frontend (brak grota/widok.js — moduł jeszcze nie dostarczony)"
}
