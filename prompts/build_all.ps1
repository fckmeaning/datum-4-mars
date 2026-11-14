# build_all.ps1 - regenerates everything derived from prompts/MASTER_PROMPT_CEO.md and the agent prompt parts (ASCII-only).
#   1) docs/*.md sections exported from the master prompt
#   2) prompts/pack/* (via split_pack.ps1)
#   3) prompts/antigravity_agents/W#_PASTE.txt = _common.md + _lane_W#.md with {LANE} filled in
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\777\Desktop\nasa space app\prompts\build_all.ps1"
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$utf8 = New-Object System.Text.UTF8Encoding($false)
$nl = "`r`n"

# 1) docs export
$master = [System.IO.File]::ReadAllText((Join-Path $here 'MASTER_PROMPT_CEO.md'), $utf8)
function Section([string]$tag) {
    $m = [regex]::Match($master, "(?s)<$tag>\s*(.*?)\s*</$tag>")
    if (-not $m.Success) { throw "section $tag not found" }
    return $m.Groups[1].Value
}
$map = [ordered]@{
    'docs\MATH.md'         = @('math_spec')
    'docs\PRODUCT_SPEC.md' = @('mission', 'product_spec')
    'docs\ARCHITECTURE.md' = @('architecture', 'data_pipeline', 'params_seed')
    'docs\RULES.md'        = @('hard_rules', 'protocols')
    'docs\WORK_PROGRAM.md' = @('work_program', 'quality_gates')
    'docs\PITCH_SPEC.md'   = @('pitch_and_submission')
}
foreach ($k in $map.Keys) {
    $body = ($map[$k] | ForEach-Object { Section $_ }) -join ($nl + $nl + '---' + $nl + $nl)
    $hdr = '<!-- Generated from prompts/MASTER_PROMPT_CEO.md sections: ' + ($map[$k] -join ', ') + '. Execution model overrides: docs/DECISIONS.md (D-05, D-11). Do not edit by hand. -->' + $nl + $nl
    [System.IO.File]::WriteAllText((Join-Path $repo $k), $hdr + $body + $nl, $utf8)
    Write-Output ('docs: ' + $k)
}

# 2) prompt pack
& (Join-Path $here 'split_pack.ps1') | Out-Null
Write-Output 'pack: rebuilt'

# 3) Antigravity agent paste files
$agDir = Join-Path $here 'antigravity_agents'
$common = [System.IO.File]::ReadAllText((Join-Path $agDir '_common.md'), $utf8)
foreach ($lane in 'W1', 'W6', 'W7', 'W8', 'W9') {
    $laneText = [System.IO.File]::ReadAllText((Join-Path $agDir ('_lane_' + $lane + '.md')), $utf8)
    $text = ($common.Replace('{LANE}', $lane)).TrimEnd() + $nl + $nl + $laneText.Trim() + $nl + $nl +
        'Start now: read the files listed under READ FIRST, then begin the WORK LOOP with step 1.' + $nl
    [System.IO.File]::WriteAllText((Join-Path $agDir ($lane + '_PASTE.txt')), $text, $utf8)
    Write-Output ('agent prompt: ' + $lane + '_PASTE.txt (' + $text.Length + ' chars)')
}
