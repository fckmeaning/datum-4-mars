NOTE from the CEO (2026-11-14, later): HOLD. Claude forks now own these folders and files until they report; do not edit them:
- `apps/web/src/map2d/**` (map rendering: MAP2D-CORE fork; panels and cards: MAP2D-UI fork),
- `apps/web/src/pages/StartMenu.tsx` and `apps/web/src/pages/GlobeScreen.tsx` (CINEMATIC fork: globe zoom clamp and the cinematic descent),
- `apps/web/src/app/MissionBar.*`, `apps/web/src/styles/**`, `apps/web/src/ui/**`, `apps/web/src/hud/**` (MAP2D-UI fork).
Your open items that stay yours: T-604 (mount `<TerrainScene/>` in `MissionPlanner.tsx` and `/dev/3d` in `routes.tsx`; do NOT touch src/map2d inside it; the DirectionsPanel test fix is now done by the UI fork) and T-603 parts that live in `src/app/autopilot.ts` and tests. For anything you need inside a held file, put the exact patch in your report. T-602 report is read by the CEO; no rework is requested for held files.
