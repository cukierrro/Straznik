param([switch]$Refresh)
# Read-only public source verification. Generated research records only.
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$dir=Join-Path $root 'test-out/aircraft-library-research'
$headers=@{'User-Agent'='StraznikAircraftCatalog/1.0 (https://github.com/cukierrro/Straznik; source verification)'}
$rows=@(Get-ChildItem -LiteralPath $dir -Filter '*.json' | Where-Object {$_.BaseName -ne 'icao-models' -and $_.BaseName -notlike '*-source'} | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json } | Where-Object {$_.file_title})
for($i=0;$i -lt $rows.Count;$i+=10){
  $batch=@($rows | Select-Object -Skip $i -First 10 | Where-Object {$Refresh -or -not (Test-Path -LiteralPath (Join-Path $dir ($_.code+'-source.json')))})
  if(-not $batch.Count){continue}
  $titles=($batch.file_title | Select-Object -Unique) -join '|'
  $url='https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1&prop=imageinfo%7Crevisions&iiprop=extmetadata%7Csha1&rvprop=content&rvslots=main&titles='+[uri]::EscapeDataString($titles)
  $data=Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 40
  foreach($row in $batch){
    $page=@($data.query.pages.PSObject.Properties.Value | Where-Object {$_.title.Replace('_',' ') -eq $row.file_title.Replace('_',' ')})[0]
    if(-not $page.imageinfo){throw ('Missing source for '+$row.code)}
    $record=[ordered]@{code=$row.code;file_title=$page.title;sha1=$page.imageinfo[0].sha1;metadata=$page.imageinfo[0].extmetadata;wikitext=$page.revisions[0].slots.main.'*'}
    $record | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $dir ($row.code+'-source.json')) -Encoding utf8
    Write-Output ($row.code+': source and full license metadata saved')
  }
}
