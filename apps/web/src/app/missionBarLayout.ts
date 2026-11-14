/**
 * Responsive layout of the mission bar as a pure function of the bar's own width (not the viewport: the planner gives
 * the bar a variable slot). Stats are dropped in priority order SOL, LMST, Earth link, Ls, so the first things to go
 * are the least operational ones. The site name and the EVA badge go before any stat does.
 */
export type StatId = "sol" | "lmst" | "link" | "ls";

export const STAT_PRIORITY: readonly StatId[] = ["sol", "lmst", "link", "ls"];

export interface MissionBarLayout {
  stats: StatId[];
  showSiteName: boolean;
  showBadge: boolean;
}

/** Width needed (px) for each layout step: tiles are 104 px with 4 px gaps, plus 24 px padding (site name ~170, badge ~90). */
export const BREAKPOINTS = {
  full: 740, // site name + badge + 4 stats
  siteName: 640, // site name + 4 stats
  fourStats: 470, // 4 stats
  threeStats: 360, // SOL, LMST, Earth link
  twoStats: 250, // SOL, LMST
} as const;

export function computeMissionBarLayout(width: number): MissionBarLayout {
  // Unknown width (first render, SSR, jsdom without layout): show everything rather than an empty bar.
  if (!Number.isFinite(width) || width <= 0) {
    return { stats: [...STAT_PRIORITY], showSiteName: true, showBadge: true };
  }
  if (width >= BREAKPOINTS.full) return { stats: [...STAT_PRIORITY], showSiteName: true, showBadge: true };
  if (width >= BREAKPOINTS.siteName) return { stats: [...STAT_PRIORITY], showSiteName: true, showBadge: false };
  if (width >= BREAKPOINTS.fourStats) return { stats: [...STAT_PRIORITY], showSiteName: false, showBadge: false };
  if (width >= BREAKPOINTS.threeStats) return { stats: STAT_PRIORITY.slice(0, 3), showSiteName: false, showBadge: false };
  if (width >= BREAKPOINTS.twoStats) return { stats: STAT_PRIORITY.slice(0, 2), showSiteName: false, showBadge: false };
  return { stats: STAT_PRIORITY.slice(0, 1), showSiteName: false, showBadge: false };
}

/** Meteorological-style Mars season from the solar longitude (northern hemisphere naming, as in docs/MATH.md). */
export function seasonName(lsDeg: number): string {
  const ls = ((lsDeg % 360) + 360) % 360;
  if (ls < 90) return "Northern spring";
  if (ls < 180) return "Northern summer";
  if (ls < 270) return "Northern autumn";
  return "Northern winter";
}
