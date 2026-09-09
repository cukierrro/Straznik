param([int]$Offset=0, [int]$Count=8, [string[]]$Codes=@(), [switch]$Refresh)
# Research only. Public Wikipedia/Commons GETs, local output, no app imports.
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$seeds=Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'docs/aircraft-library/model-seeds.json') | ConvertFrom-Json
$outputDir=Join-Path $repoRoot 'test-out/aircraft-library-research'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$headers=@{'User-Agent'='StraznikAircraftCatalog/1.0 (https://github.com/cukierrro/Straznik; local research)'}
$selected=if($Codes.Count){$seeds | Where-Object { $_.code -in $Codes }}else{$seeds | Select-Object -Skip $Offset -First $Count}
foreach($seed in $selected) {
  if($seed.status -eq 'blocked_unverified_designator') { Write-Output ($seed.code+': blocked; no verified type mapping'); continue }
  $dest=Join-Path $outputDir ($seed.code+'.json')
  if((Test-Path -LiteralPath $dest) -and -not $Refresh) { Write-Output ($seed.code+': cached'); continue }
  try {
    $summary=$null
    if($seed.commons_file) { $file=$seed.commons_file -replace '^File:','' } else {
    $summaryUrl='https://en.wikipedia.org/api/rest_v1/page/summary/'+[uri]::EscapeDataString($seed.article.Replace(' ','_'))
    $summary=Invoke-RestMethod -Uri $summaryUrl -Headers $headers -TimeoutSec 25
    if(-not $summary.originalimage.source) { throw 'No article photo' }
    $imagePath=([uri]$summary.originalimage.source).AbsolutePath
    $segments=$imagePath.Split('/')
    $file=[uri]::UnescapeDataString($(if($imagePath -match '/thumb/'){$segments[-2]}else{$segments[-1]}))
    }
    $commonsUrl='https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize%7Csha1&iiurlwidth=640&titles='+[uri]::EscapeDataString('File:'+$file)
    $commons=Invoke-RestMethod -Uri $commonsUrl -Headers $headers -TimeoutSec 25
    $page=@($commons.query.pages.PSObject.Properties.Value)[0]
    if(-not $page.imageinfo) { throw 'No Commons metadata; possibly non-free local image' }
    $info=$page.imageinfo[0]
    $meta=$info.extmetadata
    $row=[ordered]@{code=$seed.code;requested_model=$seed.model;article_title=$summary.title;article_url=$summary.content_urls.desktop.page;article_extract=$summary.extract;file_title=$page.title;source_url=$info.descriptionurl;original_url=$info.url;thumbnail_url=$info.thumburl;sha1=$info.sha1;width=$info.width;height=$info.height;author=$meta.Artist.value;credit=$meta.Credit.value;description=$meta.ImageDescription.value;license=$meta.LicenseShortName.value;license_url=$meta.LicenseUrl.value;usage_terms=$meta.UsageTerms.value;restrictions=$meta.Restrictions.value;copyrighted=$meta.Copyrighted.value;status='unreviewed_candidate'}
    $row | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $dest -Encoding utf8
    if($row.thumbnail_url) { Invoke-WebRequest -Uri $row.thumbnail_url -Headers $headers -TimeoutSec 25 -OutFile (Join-Path $outputDir ($seed.code+'.jpg')) }
    Write-Output ($seed.code+': '+$row.file_title+' | '+$row.license)
  } catch { Write-Output ($seed.code+': ERROR '+$_.Exception.Message) }
}
