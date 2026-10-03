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
if (-not (Test-Path (Join-Path $grota "widok.js"))) {
    throw "brak grota/widok.js w repozytorium — paczka bez schronień to regres od 1.7.68"
}
robocopy $grota (Join-Path $www "grota") /MIR /NFL /NDL /NJH /NJS /NP /XF README.md | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy grota -> www/grota: kod $LASTEXITCODE" }

# Sprawdzamy WYNIK kopiowania, nie sam zamiar: zły filtr albo zła ścieżka
# potrafią zostawić katalog bez widok.js, a robocopy i tak zgłosi sukces.
# 3.10.2026 GROTA wypadła z paczki androidowej i JEDYNYM sygnałem był rozmiar
# APK mniejszy o 4,5 MB. Od teraz build się na tym zatrzymuje.
if (-not (Test-Path (Join-Path $www "grota\widok.js"))) {
    throw "po kopiowaniu nie ma www/grota/widok.js — paczka wyszłaby BEZ SCHRONIEŃ"
}
"www gotowe: frontend + GROTA"
