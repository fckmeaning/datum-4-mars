# zone_report.ps1 - groups uncommitted changes by owning lane (ASCII-only). Used by the CEO before committing.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File conveyor\tools\zone_report.ps1 [-Lane W6]
param([string]$Lane = '')
$ErrorActionPreference = 'Stop'
$conveyor = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$repo = Split-Path -Parent $conveyor
$lanes = Get-Content -Raw -LiteralPath (Join-Path $conveyor 'lanes.json') | ConvertFrom-Json
$owners = @()
foreach ($p in $lanes.PSObject.Properties) {
    if ($p.Value -is [psobject] -and $p.Value.paths) {
        foreach ($prefix in $p.Value.paths) { $owners += [pscustomobject]@{ Lane = $p.Name; Prefix = $prefix } }
    }
}
$owners = $owners | Sort-Object { $_.Prefix.Length } -Descending

Push-Location -LiteralPath $repo
try { $status = @(git status --porcelain=v1 -uall) } finally { Pop-Location }
$rows = foreach ($line in $status) {
    if ($line.Length -lt 4) { continue }
    $path = $line.Substring(3).Trim('"')
    if ($path -match ' -> ') { $path = ($path -split ' -> ')[1] }
    $own = $owners | Where-Object { $path.StartsWith($_.Prefix) } | Select-Object -First 1
    [pscustomobject]@{ Lane = $(if ($own) { $own.Lane } else { 'UNOWNED' }); State = $line.Substring(0, 2); Path = $path }
}
if ($Lane) { $rows = $rows | Where-Object { $_.Lane -eq $Lane } }
$rows | Sort-Object Lane, Path | Format-Table -AutoSize | Out-String -Width 220 | Write-Output
$unowned = @($rows | Where-Object { $_.Lane -eq 'UNOWNED' })
Write-Output ('changed: ' + @($rows).Count + '   unowned: ' + $unowned.Count)
