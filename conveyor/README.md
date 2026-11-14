# Conveyor mailbox protocol

The CEO (Claude Code) and the Antigravity agents (W1, W6, W7, W8, W9) exchange work through files only.
Ownership of folders: `conveyor/lanes.json`. Decisions: `docs/DECISIONS.md`.

| What | Where | Who writes |
|---|---|---|
| Ticket | `conveyor/inbox/W#/T-###.md` | CEO |
| Claim (empty file, "I started") | `conveyor/outbox/W#/T-###.claimed` | agent |
| Report | `conveyor/outbox/W#/T-###.report.md` | agent |
| Review | `conveyor/outbox/W#/T-###.review.md` (ACCEPT / REWORK + reasons) | CEO |
| Rework | new ticket `conveyor/inbox/W#/T-###-r1.md` | CEO |
| Stop the loop | empty file `conveyor/inbox/W#/STOP` | CEO |

Ticket ids: W1 → T-1xx, W6 → T-6xx, W7 → T-7xx, W8 → T-8xx, W9 → T-9xx. CEO lanes (W2–W5) are tracked in `docs/STATUS.md`.

## Agent loop
1. `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\777\Desktop\nasa space app\conveyor\tools\next_ticket.ps1" -Lane W#` → `TICKET: <path>` | `NO_TICKET` (run again) | `STOP`.
2. Create the `.claimed` file, implement inside your folders only, run the ACCEPTANCE commands, write the `.report.md` with real output.
3. Repeat. Tickets are processed in name order; a ticket is done when its report exists.

## CEO loop
1. Read new reports → run the acceptance commands again → `conveyor/tools/zone_report.ps1` to confirm the lane touched only its folders.
2. Commit the lane's paths only (`git add <lane paths>`), write the review, issue the next tickets.
3. Dependencies, contracts, shared web config and git are CEO-only.

## Helpers
- `conveyor/tools/next_ticket.ps1 -Lane W#` — next ticket for a lane (waits up to 10 min).
- `conveyor/tools/typecheck_lane.ps1 -Lane W#|ALL` — TypeScript errors for one lane only.
- `conveyor/tools/zone_report.ps1 [-Lane W#]` — uncommitted changes grouped by owning lane.
