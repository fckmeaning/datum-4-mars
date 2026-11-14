# STATE — marsnav / "AreoNav" (NASA Space Apps 2026, challenge "Interplanetary Survival Guide: Martian Map")

Snapshot: 2026-11-14, about 11:55 local (≈ H+8 of ~24). Repo: `C:\Users\777\Desktop\nasa space app` (Windows, path has spaces — always quote).
Branch `feat/marsnav-build`, no git remote, nothing pushed (never push without asking the operator). Commit identity `marsnav-team` (local config).
This file is the hand-over: a fresh Claude Code session should read it, `docs/DECISIONS.md`, `conveyor/README.md`, then run the checks in §9.

## 1. Product in one paragraph
Website + PWA for astronauts on Mars: 2D/3D/Globe map of Gale crater (lower Mount Sharp), layers optical/thermal/spectral/topography/radiation/atmosphere, FASTEST/SAFEST/BALANCED/SCIENCE routes with return-reserve and verdict, orientation without GPS (sun compass F39, resection F40 with error ellipse, later skyline F43/EKF F44), orbiters + relay contact windows with terrain masks, mission clock. Everything is an explicit tested function F01–F53 (`docs/MATH.md`, `docs/PRODUCT_SPEC.md`). UX references: maps app in Satellite mode, satellitemap.space globe, and the Sol Atlas site (decision D-12; patterns only).

## 2. Execution model (D-05)
- **CEO = Claude Code (this role).** Owns `contracts/`, `config/params.yaml`, `docs/{MATH,DECISIONS,STATE,STATUS}.md`, `packages/marsnav/` (lanes W2–W4), `apps/api/` (W5), `conveyor/`, `prompts/`, shared web config. Reviews everything, commits, installs dependencies.
- **Antigravity agents (Gemini) W1 data, W6 frontend core/2D, W7 3D+globe, W8 UX/HUD/PWA, W9 QA/docs/pitch**: one Antigravity chat each, file mailbox in `conveyor/` (`inbox/W#/T-###.md` → `outbox/W#/T-###.report.md`). They loop with `conveyor/tools/next_ticket.ps1`. Folder ownership: `conveyor/lanes.json`. They never run git, never install packages, never touch `contracts/`, `config/`, `packages/marsnav`, `apps/api`.
- **Operator = one human.** Pastes prompts into Antigravity chats, approves risky steps. Other teammates only present. Write to the operator in Russian, short, with copy-paste blocks; put the next prompt into the clipboard with `Get-Content -Raw -Encoding UTF8 <file> | Set-Clipboard`.
- Gemini CLI is blocked for these accounts (`IneligibleTierError UNSUPPORTED_CLIENT`, checked twice) — do not try to bypass. Antigravity is launched with `antigravity-account-switcher launch --bin "C:\Users\777\AppData\Local\Programs\antigravity\Antigravity.exe"`; all 5 accounts healthy (check: `antigravity-account-switcher check-accounts`).
- Typical agent stall: Google returns `503 No capacity available for model gemini-3.8-flash-high`; Antigravity retries 9 times then stops. Fix: operator switches the model in the picker (next to "Turbo") and types "continue"; ready prompts: `prompts/antigravity_agents/W#_CONTINUE.txt`, full boot prompts `W#_PASTE.txt`.

## 3. Environment
Python 3.12 venv `.venv` (numpy 2.5, scipy, numba, rasterio/GDAL 3.12, pyproj, FastAPI, pytest, ruff); Node 24, npm 11; web: React 19, Vite 8, TS 5.9 (pinned `~5.9.3`; TS 7 breaks openapi-typescript), OpenLayers 10, three 0.187, uPlot, MSW, vitest 5, Playwright (no browsers downloaded — use installed Chrome/Edge via `channel`).
API: `.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000` (restart after code changes; kill via `Get-NetTCPConnection -LocalPort 8000`). Web: `cd apps/web; npm run dev` (5173, proxies /api and /data). Regenerate TS types after contract edits: `cd apps/web; npm run gen:api`.

## 4. Done and verified
- Math core F01–F42, F43–F44 NOT done; F45, F49–F53, F34/F35, F32/F33, F38; all Python tests pass (`pytest apps\api\tests packages\marsnav\tests tests data\pipeline\tests`).
- Cross-checks: Mars24 golden epoch (Ls 277.19°, MST 23.994 h); F52 light time 659 s = 10m59s and mission sol agree exactly with the independent Sol Atlas site (Perseverance sol 2039; Gale sol 5074); resection 95 % ellipse coverage 95 ± 3 % over 1000 trials; A* = Dijkstra on 60 random grids.
- API (contract v1.1, `contracts/openapi.yaml`): sites, layers, clock, sources, whats-here, places search, route / alternatives / pareto / uncertainty / order / back-to-base / off-route, sun, environment, sun-compass, resection, space-weather (live DONKI WSA-ENLIL Mars CMEs via `NASA_API_KEY`, falls back to the public DEMO_KEY with a 30-min cache; replay and simulated modes), orbiters (empty until W1 delivers), comms windows, light-time. Routes return `verdict` READY/CAUTION/NO_GO, `return_margin`, shelter time, turn-back distance, oxygen-out point, `sunset_in_s`.
- Data: L1 elevation (HRSC/MOLA 200 m) in `data/processed/gale/L1/`; real Curiosity traverse `traverse.geojson` and `places.json` (base, boxwork region, rover now) derived from NASA MMGIS waypoints (`data/pipeline/make_places_from_mmgis.py`).
- Frontend (agents, reviewed R1): start menu, planner shell, POI menu, UI kit, tokens, HUD skeleton, globe + terrain components. At the last full run: web tsc 0 errors; vitest 158 passed, 1 failing test in W6's unfinished T-602 (`src/map2d/layerLevel.test.ts`).

## 5. In progress right now
- **L2 (20 m) and L3 (10 m) elevation download** (`data/pipeline/fetch_gale_dem.py`, background process, log `conveyor/runs/fetch_dem.out.log`): 4 of 11 bands done at 11:54, slow network (≈ 0.6 MB/s shared). Source: USGS `MSL_Gale_DEM_Mosaic_1m_v3.tif` (3.7 GB, no overviews, strip rows), area-averaged to 10 m then reprojected. When it ends it prints min/max, valid fraction and a vertical check vs L1; outputs `data/processed/gale/L3|L2/elevation.tif`. THEN: restart the API (cached grids), rerun alternatives and see whether FASTEST and SAFEST diverge (at 200 m they differ by only 2–3 %). If the process died: rerun the script (idempotent, ~1.3 GB).
- Agent tickets issued: W1 T-102-r1 (done, report waiting), T-103 orbiters (claimed), T-104 landing sites + places + POV, T-105 orthophoto 2 m + globe texture; W6 T-602 (claimed), T-603; W7 T-702 (report waiting), T-703 (claimed); W8 T-802 (claimed), T-803; W9 T-902 (claimed).

## 6. Pending reviews (do these first)
Read `conveyor/outbox/W1/T-102-r1.report.md` and `W7/T-702.report.md`; re-run their acceptance commands yourself; then write `T-###.review.md` (ACCEPT/REWORK) and issue the next tickets. Review recipe: `typecheck_lane.ps1 -Lane ALL`; `cd apps/web; npx vitest run`; pytest; `conveyor\tools\zone_report.ps1` (unowned must be 0); `git diff --stat` on CEO-only files must show only your own edits.

## 7. Lessons and traps
- **Never trust "confirmed" from an agent without a data file.** W1 reported place coordinates off by up to 1.7 km (boxwork, Yellowknife Bay, Pahrump Hills); real positions come from `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` (1389 positions, sols 3–5073, + `MSL_waypoints_current.json`, `MSL_traverse.json`). Rule D-13: coordinates only from measured data; sol ranges only from mission sources.
- Boxwork region (sols 4600–4700 per NASA blogs): lat −4.8087…−4.8042, lon 137.3791…137.3817, elev ≈ −3613 m. AOI lat −4.89…−4.55, lon 137.27…137.53 contains the whole traverse. Rover now (sol 5073): −4.826, 137.389.
- proj4's spherical tmerc inverse has a southern-hemisphere bug; W6/W7 patched it twice; consolidate in `apps/web/src/map2d/projection.ts` (ordered in T-602).
- Making a response field required in the contract breaks agents' typed mocks: keep new fields optional (`verdict`).
- 3.1 M-cell L3 grids need coarse-grid horizons (`SiteGrid.horizon_toward`, `terrain.analysis_cell_m`); measure route latency on L3 (A*, `min_cost_per_metre`, return field on 3 M cells may take seconds — add caching of layers/c_min per request class if > 2 s).
- Windows/PowerShell: Python in PowerShell here-strings works; avoid non-ASCII in `.ps1` (scripts are ASCII with `\u` escapes); `Invoke-WebRequest -Method Head` fine; `tee`/`2>&1` on native exes causes NativeCommandError noise.
- Sol Atlas repo (another team, same challenge; `github.com/saracen66/the-sol-explorers`, Apache-2.0, JS only, Jezero): take patterns only, never code/text/assets. Their strengths we lack: helmet first-person view, rover + Apollo walkback rule, science-goal driven plan with stop photos, REC/SOUND, geologic-map layer (USGS SIM 3292), exploration zones, zero-backend static deploy. Our edge: orientation without GPS, Python-grade math with tests/uncertainty/Pareto, real contract API.

## 8. Prioritised backlog
1. Finish L2/L3, restart API, re-check route divergence; review W1/W7 reports; keep every agent fed with the next ticket.
2. **Public delivery plan (decision D-07 still open):** judges must open a link without our laptop → either host the API (Cloud Run/Render with the operator's approval) or build a static offline version (marsnav-ts A* on the L2 grid in a Worker + pre-baked routes). Ask the operator; never deploy or create accounts without a yes.
3. CEO math still open: Theta* F29, skyline matching F43, EKF F44, rover + walkback mode (rover 5 km/h seated crew, walkback by the existing return field), `golden.json` test vectors for marsnav-ts (needed by W8 T-803).
4. Tickets to write: W7 T-704 helmet/first-person walkthrough with real skyline; W1 geology layer (USGS SIM 3292) + science-goal stops with sources + exploration zones (P2); W8 REC/SOUND (P2), verdict card UI ("READY/CAUTION/NO-GO", turn-back marker, shelter time, sunset); W6 goals-driven planner.
5. Ask the operator (never asked yet): submission deadline + timezone, pitch length/language, GitHub/hosting accounts, whether to create a public repo, which project name (AreoNav default, Red Horizon, SolPath).
6. Pitch pack/submission docs are W9's (`submission/`); AI-use disclosure must name Claude, Gemini/Antigravity; official judging criteria wording to be cited from the Space Apps site (W9 reports "Impact, Creativity, Validity, Relevance, Presentation").

## 9. First 10 minutes for a new Claude
1. `git -C "C:\Users\777\Desktop\nasa space app" log --oneline -5` and `git status --short | head`.
2. `Invoke-RestMethod http://127.0.0.1:8000/api/v1/health` (restart the API if down).
3. `Get-Content conveyor\runs\fetch_dem.out.log -Tail 5`; check `data\processed\gale\L3\elevation.tif`.
4. List `conveyor\outbox\W*\*.report.md` without a `.review.md` → review them (§6).
5. Run the full checks (§6), commit the CEO lane with specific `git add` paths (agents' unreviewed files stay uncommitted until reviewed), then continue with §8.
Safety rules from the operator: no deploys, keys, paid services, account creation or downloads over 2 GB without asking; keep personal data out of files and requests; never push.

## 10. Update H+9 (2026-11-14, ≈ 12:50) — read this first
- **Sol Atlas spec analysed:** `docs/SOLATLAS_ANALYSIS.md`, decision D-15 (no code adopted; audit script `ops/verify_solatlas_spec.py`).
- **Reviews done (ACCEPT):** W1 T-102-r1 (coordinates re-derived from raw MMGIS, 0.1–0.4 m), W7 T-702 (condition: measured FPS in T-703 report). New ticket **W6 T-604** (mount `<TerrainScene/>` in MissionPlanner, route `/dev/3d`, remove stray `apps/web/capture_t602.js`). Web check at ≈12:35: 188 tests pass, `src/charts/RouteProfileChart.test.tsx` fails to load (W8's T-802 in flight). Agents were told to continue via `prompts/antigravity_agents/W#_CONTINUE.txt`.
- **L2/L3 DEM:** the first run died with the previous session; `fetch_gale_dem.py` now caches every band in `data/raw/gale_dem_bands/` and resumes. 8 of 11 bands were done at ≈12:45. When it prints the vertical check, restart the API (cached grids) and rerun alternatives (FASTEST vs SAFEST divergence).
- **Public delivery = host the API (operator's choice, D-07).** Files are ready and committed (`Dockerfile`, `.dockerignore`, `deploy/`, `docs/DEPLOY.md`, `SPAStaticFiles` in the API). NOT done: docker build (no Docker on this machine), provider choice (recommend Hugging Face Spaces, Docker SDK), account, any push or deploy: all need the operator's explicit yes. Check `/api/v1/health` `data_levels` after deploy.
- **Parallel math forks (CEO lane, uncommitted until reviewed):** A = F43 skyline + F44 EKF (`localize/`), B = F29 Theta* + rover/walkback (`routing/`), C = F10 viewshed (`terrain/`) + RFC 7946 route export (`export.py`). Their reports list the signatures to wire into `apps/api` (`/localize/skyline`, `/route/rover`, `/sites/{id}/viewshed`, `/route/export`) and the ASSUMPTION constants to move into `config/params.yaml`.
- **Name:** operator asked for a proposal: AreoNav recommended with the tagline "No GPS. No compass. Still home."; alternatives Ares Compass, Red Horizon, Gale Walk; SolPath advised against (clashes with Sol Atlas). Awaiting the operator's pick; trademark/domain availability not checked.
- **Trap found:** `Path.write_text` on Windows writes CRLF into LF repos (turned a 30-line change into a 1279-line diff); use the Edit/Write tools, or `write_bytes`/`newline="\n"`.
