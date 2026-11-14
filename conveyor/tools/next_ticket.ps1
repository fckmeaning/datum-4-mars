# next_ticket.ps1 - mailbox helper for Antigravity agents (ASCII-only on purpose).
# Prints one of:
#   TICKET: <full path>      the oldest ticket of the lane that has no report yet (take it)
#   NO_TICKET                nothing arrived within -WaitMinutes (run the script again)
#   STOP                     conveyor/inbox/<Lane>/STOP exists (finish your work loop)
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\777\Desktop\nasa space app\conveyor\tools\next_ticket.ps1" -Lane W6
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^W[1-9]$')][string]$Lane,
    [int]$WaitMinutes = 10,
    [int]$PollSeconds = 15
)
$ErrorActionPreference = 'Stop'
$conveyor = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$inbox  = Join-Path $conveyor ("inbox\" + $Lane)
$outbox = Join-Path $conveyor ("outbox\" + $Lane)
New-Item -ItemType Directory -Force -Path $inbox, $outbox | Out-Null
$deadline = (Get-Date).AddMinutes($WaitMinutes)

while ($true) {
    if (Test-Path -LiteralPath (Join-Path $inbox 'STOP')) { Write-Output 'STOP'; exit 0 }
    $pending = @(Get-ChildItem -LiteralPath $inbox -Filter 'T-*.md' -File |
        Where-Object { -not (Test-Path -LiteralPath (Join-Path $outbox ($_.BaseName + '.report.md'))) } |
        Sort-Object Name)
    if ($pending.Count -gt 0) {
        Write-Output ('TICKET: ' + $pending[0].FullName)
        Write-Output ('PENDING_COUNT: ' + $pending.Count)
        exit 0
    }
    if ((Get-Date) -ge $deadline) { Write-Output 'NO_TICKET'; exit 0 }
    Start-Sleep -Seconds $PollSeconds
}
