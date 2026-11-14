# MAP2D-UI: design critique (before)

Screens inspected: `/planner` at 1440x900 and 390x844 (`before_planner_1440x900.jpg`, `before_planner_390x844.jpg`), plus a read of every owned component.

## What is weak, concretely

1. **Mission bar clips and wraps.** At 1440 px the fourth tile ("EARTH LINK DELAY") is cut off at the right edge and a horizontal scrollbar sits under the tiles. Tile labels such as "LMST (LOCAL SOLAR TIME)" wrap to two lines, so the tiles differ in height; every tile carries a subtitle line, which makes the bar tall. `MissionBar.css` contains `justifyContent: space-between` (camelCase, invalid in CSS) so the intended layout never applied. At 390 px the bar turns into a tall column that is covered by the logo, the search box and the three pills.
2. **Overlaps at phone width.** The mission bar, the logo/search row, the pills, the compass/"2D"/"Where am I?" buttons and the bottom bar's scale chip all occupy the same pixels (positions are inline-styled in `MissionPlanner.tsx`, bar height is not bounded).
3. **Emoji as icons.** The planet logo, the magnifier, compass, pin, pancake ("Layers"), camera, tent/microscope/robot group icons and the target in "Where am I?" are emoji: inconsistent size and colour, platform-dependent, and they read as a demo. The kit already has `ui/Icons.tsx` but none of these components use it.
4. **Two different accents.** `tokens.css` defines `--color-accent` as Mars ochre `#E06A3B`, but every component falls back to `#56B4E9` (blue) in `var(--color-accent, #56B4E9)` and hard-codes `#56B4E9` for links and shadows, so what you see depends on whether the token resolved. Active pills mix blue fills with white text.
5. **Inline styles and hard-coded greys.** Cards use `#8B949E`, `#E6EDF3`, `#21262D`, `rgba(255,255,255,0.15)` literals instead of tokens, radii of 8/12/14/16 px, three different shadows and two blur values. No hover/focus states except for POI items (done with JS `onMouseEnter`). No `:focus-visible` styling on the cards' buttons (they are bare `<button>`s with `outline: none` in places).
6. **Approximate badge is purple** (`--badge-approximate-*` = `#BC8CFF`); the SCIENCE route colour is pink-purple and is also used as chrome (search kind label). Purple does not belong to the mission palette.
7. **Hierarchy and data presentation.**
   - Place card: a 160 px brown gradient with a camera emoji and the text "Curiosity Rover POV / Mastcam / Hazcam Context" is shown for every place that has no picture, which is a placeholder pretending to be content.
   - Coordinates are printed as `x° S, y° E` with the hemisphere letters hard-coded, regardless of sign.
   - No elevation, slope, geology, bearing or distance from base on the place card (only POI list rows show distance); no copy-coordinates action; no empty/error/skeleton states.
   - "What's here" lists all values at equal weight, no grouping (terrain / light / environment), unit strings such as `J·m⁻²·K⁻¹·s⁻½` wrap.
   - Directions: a native `<select>` per waypoint, a dashed "+ Add stop" button, and the route cards underneath; no verdict (READY / CAUTION / NO_GO), no reason, no oxygen or sunset; progress text "Calculating (F05–F09)..." exposes internals.
8. **Contrast and size.** Muted text `#8B949E` at 11-12 px on translucent glass lands near AA for 12 px text, below it on the lighter map; labels are 10-11 px; touch targets are 28-36 px (close buttons 28 px, pills 34 px).
9. **Responsive.** Panels are absolutely positioned at `top: 120px; left: 16px` with `max-width: 380px` on desktop and a bottom sheet only on `isMobile`; the sheet has no grab handle, no safe-area padding, and is `75vh` (hides the whole map).
10. **Motion/transparency.** `prefers-reduced-motion` is honoured globally, but there is no `prefers-reduced-transparency` fallback for the 14-16 px backdrop blur panels, and `color-scheme` is not declared so native controls (select, scrollbar, input autofill) can render light.

## Plan (order of impact)

Mission bar (never clips, 4 widths) -> toolbar (logo, search, three toggles, 40 px, SVG icons) -> place / what's-here cards -> directions panel and route rows -> tokens (scale, radius, elevation, blur, type, AA) -> responsive sheets and 44 px touch targets. Everything uses tokens; one accent (Mars ochre) plus the semantic ok/warning/danger/info colours.
