# Datum-4 (marsnav) — Operational Runbook

This guide covers developer onboarding, local environment setup, running the backend API and frontend PWA, executing verification tests, prompt rebuilding, and interacting with the asynchronous agent conveyor mailbox.

---

## 1. Prerequisites

- **OS**: Windows 11 / Windows Server (PowerShell 7+ or Windows PowerShell) or Linux / macOS.
  *Note for Windows*: The workspace path may contain spaces (e.g. `C:\Users\...\Desktop\nasa space app`). Always enclose paths in quotes in shell commands and avoid hardcoded backslashes in code (use `pathlib.Path`).
- **Python**: 3.12+ (tested on Python 3.12.10).
- **Node.js**: 22+ or 24+ LTS (tested on Node 24.20.0) with `npm` 11+.
- **Git**: 2.40+.

---

## 2. Environment Setup

### 2.1 Python Virtual Environment (`.venv`)
From the repository root:

```powershell
# Create virtual environment
python -m venv .venv

# Activate (PowerShell)
.venv\Scripts\Activate.ps1
# Or run commands directly via .venv\Scripts\python.exe

# Upgrade pip and install core dependencies & marsnav editable package
& ".venv\Scripts\python.exe" -m pip install --upgrade pip
& ".venv\Scripts\python.exe" -m pip install -r requirements.txt
```

### 2.2 Frontend Dependencies (`apps/web`)
From the repository root:

```powershell
cd "apps/web"
npm install
cd "../.."
```

---

## 3. Running the Backend API

The FastAPI service runs on port `8000` and serves the REST endpoints under `/api/v1` and static Cloud-Optimized GeoTIFF (COG) rasters under `/data`.

```powershell
# Start Uvicorn from repository root
& ".venv\Scripts\python.exe" -m uvicorn app.main:app --app-dir "apps/api" --host 127.0.0.1 --port 8000 --reload
```

- **Health check**: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)
- **Interactive OpenAPI Docs (Swagger)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **OpenAPI Schema (JSON)**: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

---

## 4. Running the Web Application

The frontend is a Vite + React + TypeScript single-page application and installable PWA.

```powershell
cd "apps/web"
npm run dev
```

- **Local UI**: [http://localhost:5173](http://localhost:5173)
- **Build production assets**: `npm run build`
- **Preview production build**: `npm run preview` (starts static preview server on port 4173)

---

## 5. Running Tests

### 5.1 Python Tests (Math Core, Data Pipeline, Contracts)
```powershell
# Run math core unit tests (F01–F53)
& ".venv\Scripts\python.exe" -m pytest "packages/marsnav" -q

# Run contract tests (OpenAPI 3.1 schema & route checks)
& ".venv\Scripts\python.exe" -m pytest "tests" -q

# Run all test suites
& ".venv\Scripts\python.exe" -m pytest -q

# Code formatting & linting check
& ".venv\Scripts\python.exe" -m ruff check .
```

### 5.2 Web Tests & Typechecks
```powershell
cd "apps/web"

# TypeScript strict type checking
npm run typecheck

# Vitest unit test execution
npm test

# Return to root
cd "../.."

# Lane-specific typecheck (e.g. for lane W9, W6, W8)
powershell -NoProfile -ExecutionPolicy Bypass -File "conveyor/tools/typecheck_lane.ps1" -Lane W9
```

---

## 6. Rebuilding Prompts & Contracts

The CEO master prompt and modular lane instructions are compiled from templates in `prompts/`:

```powershell
# Rebuild all markdown prompts and contracts
powershell -NoProfile -ExecutionPolicy Bypass -File "prompts/build_all.ps1"
```

Rebuilding updates:
- `prompts/compiled/`
- Synchronized sections in `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/MATH.md`, and `docs/WORK_PROGRAM.md`.

---

## 7. Conveyor Mailbox Protocol (10-Line Summary)

1. **Architecture**: Agents communicate strictly through files in `conveyor/inbox/` and `conveyor/outbox/`.
2. **Lane IDs**: W1 (Data), W6 (2D/App), W7 (3D/Globe), W8 (UX/HUD/PWA), W9 (QA/Pitch), CEO (Claude Code: W2–W5).
3. **Fetch Ticket**: Run `powershell -File "conveyor/tools/next_ticket.ps1" -Lane W#` to receive `T-###.md`.
4. **Claim**: Create empty marker file `conveyor/outbox/W#/T-###.claimed` to lock the task.
5. **Implement**: Modify files **only** within your designated lane directories (`conveyor/lanes.json`).
6. **Acceptance**: Execute all acceptance test commands locally; ensure determinism and zero regressions.
7. **Report**: Write `conveyor/outbox/W#/T-###.report.md` pasting real terminal outputs and screenshots.
8. **Review**: The CEO inspects reports, re-runs acceptance tests, verifies folder ownership, and writes `T-###.review.md`.
9. **Rework / Merge**: If rejected, rework via `T-###-r1.md`; if accepted, the CEO commits and advances git tags.
10. **Termination**: When all tasks complete, the CEO places an empty `STOP` file in `conveyor/inbox/W#/`.
