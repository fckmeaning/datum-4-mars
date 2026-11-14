# split_pack.ps1
# Rebuilds prompts/pack/ from prompts/MASTER_PROMPT_CEO.md (the source of truth).
#
# Usage (from any folder):
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\777\Desktop\nasa space app\prompts\split_pack.ps1"
#
# This script is ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less scripts in the
# ANSI code page, so every non-ASCII pattern below is written as a \uXXXX regex escape.
# Output files are UTF-8 without BOM, Windows line endings.

$ErrorActionPreference = 'Stop'

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$master = Join-Path $here 'MASTER_PROMPT_CEO.md'
$outDir = Join-Path $here 'pack'
$utf8   = New-Object System.Text.UTF8Encoding($false)
$nl     = "`r`n"

if (-not (Test-Path -LiteralPath $master)) { throw "Master file not found: $master" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$lines  = [System.IO.File]::ReadAllLines($master, $utf8)
$report = @()

function Find-Line([string]$pattern, [int]$from = 0) {
    for ($i = $from; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match $pattern) { return $i }
    }
    throw "Pattern not found after line $($from + 1): $pattern"
}

function Get-Between([int]$a, [int]$b) {
    if ($b - $a -le 1) { throw "Empty block between lines $($a + 1) and $($b + 1)" }
    return (($lines[($a + 1)..($b - 1)]) -join $nl).Trim()
}

# Content of the first 4-backtick fence that follows the heading matching $headingPattern.
function Get-Fenced([string]$headingPattern) {
    $h     = Find-Line $headingPattern
    $open  = Find-Line '^````[A-Za-z]*\s*$' ($h + 1)
    $close = Find-Line '^````\s*$' ($open + 1)
    return Get-Between $open $close
}

function Save([string]$name, [string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) { throw "Refusing to write empty file: $name" }
    $path = Join-Path $outDir $name
    [System.IO.File]::WriteAllText($path, $text + $nl, $utf8)
    $script:report += [pscustomobject]@{
        File  = $name
        Lines = ($text -split "`n").Count
        Chars = $text.Length
    }
}

# Cyrillic heading word as regex escapes (no non-ASCII bytes in this file).
$PRILOZHENIE = '\u041F\u0420\u0418\u041B\u041E\u0416\u0415\u041D\u0418\u0415'

# 1. CEO prompt: everything between the triple-triangle marker lines (U+25BC / U+25B2).
$start = Find-Line '\u25BC\u25BC\u25BC'
$end   = Find-Line '\u25B2\u25B2\u25B2' ($start + 1)
Save '01_CLAUDE_CEO.txt' (Get-Between $start $end)

# 2. Conductor = appendix A (Latin A or Cyrillic A accepted).
Save '02_ANTIGRAVITY_CONDUCTOR.txt' (Get-Fenced ('^# ' + $PRILOZHENIE + ' [A\u0410] '))

# 3. Gemini workers: common block B0 + lane block Bn; the "Reply now ONLY with" line moves to the end.
$b0        = Get-Fenced '^## [B\u0412]0 '
$b0Lines   = $b0 -split "`r?`n"
$replyLine = $b0Lines | Where-Object { $_ -match '^Reply now ONLY with' } | Select-Object -First 1
if (-not $replyLine) { throw 'Reply line not found in B0' }
$b0Body    = (($b0Lines | Where-Object { $_ -ne $replyLine }) -join $nl).Trim()

$laneNames = @{
    1 = 'data_gis'
    2 = 'env_math'
    3 = 'routing'
    4 = 'localize_orbits'
    5 = 'backend'
    6 = 'frontend_2d'
    7 = 'frontend_3d_globe'
    8 = 'ux_hud_pwa'
    9 = 'qa_docs_pitch'
}

for ($n = 1; $n -le 9; $n++) {
    $lane  = Get-Fenced ('^## [B\u0412]' + $n + ' ')
    if ($lane -notmatch ('YOU ARE W' + $n + ' ')) { throw "Lane block B$n does not start with 'YOU ARE W$n'" }
    $reply = $replyLine.Replace('W<N>', ('W' + $n))
    $text  = $b0Body + $nl + $nl + $lane + $nl + $nl + $reply
    $file  = '{0:D2}_GEMINI_W{1}_{2}.txt' -f ($n + 2), $n, $laneNames[$n]
    Save $file $text
}

# 4. CEO resume prompt = appendix C (Latin C or Cyrillic S-shaped C accepted).
Save '12_CLAUDE_CEO_RESUME.txt' (Get-Fenced ('^# ' + $PRILOZHENIE + ' [C\u0421] '))

$report | Format-Table -AutoSize | Out-String | Write-Host
Write-Host ("OK: {0} files written to {1}" -f $report.Count, $outDir)
