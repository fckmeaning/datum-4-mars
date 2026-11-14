# typecheck_lane.ps1 - TypeScript check filtered to one lane's folders (ASCII-only).
# Exit 0 when the lane's files have no errors, 1 otherwise. Errors in other lanes are counted but ignored.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\777\Desktop\nasa space app\conveyor\tools\typecheck_lane.ps1" -Lane W7
param([Parameter(Mandatory = $true)][ValidatePattern('^(W[1-9]|ALL)$')][string]$Lane)
$ErrorActionPreference = 'Stop'
$conveyor = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$repo = Split-Path -Parent $conveyor
$web  = Join-Path $repo 'apps\web'
$lanes = Get-Content -Raw -LiteralPath (Join-Path $conveyor 'lanes.json') | ConvertFrom-Json

Push-Location -LiteralPath $web
try { $out = (& npx tsc --noEmit -p tsconfig.json --pretty false 2>&1 | Out-String) } finally { Pop-Location }

$errors = @($out -split "`r?`n" | Where-Object { $_ -match '^(src/[^(]+)\(\d+,\d+\): error' })
if ($Lane -eq 'ALL') {
    Write-Output ('total errors: ' + $errors.Count)
    $errors | ForEach-Object { Write-Output $_ }
    if ($errors.Count -gt 0) { exit 1 } else { exit 0 }
}
$prefixes = @($lanes.$Lane.web_src_prefixes)
$mine = @($errors | Where-Object { $line = $_; @($prefixes | Where-Object { $line.StartsWith($_) }).Count -gt 0 })
Write-Output ('lane ' + $Lane + ' errors: ' + $mine.Count + '   (errors in other lanes, ignored: ' + ($errors.Count - $mine.Count) + ')')
$mine | ForEach-Object { Write-Output $_ }
if ($mine.Count -gt 0) { exit 1 } else { exit 0 }
