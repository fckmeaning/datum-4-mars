/**
 * director.ts - the hands of the autopilot tour.
 *
 * The tour (autopilot.ts) is a script that outlives page changes; the pages that can be driven (the globe and an
 * expedition page) register a handler here while they are mounted and the script sends them commands, like a person
 * clicking. A handler returns `true` for the `ready` command once its data has loaded.
 */

export type GlobeCommand = { type: "ready" } | { type: "select"; id: string };

/** The 3D relief of an expedition page. */
export type ReliefCommand =
  | { type: "ready" }
  | { type: "mode"; mode: "imagery" | "elevation" | "slope" | "radiation" | "pressure" | "hazard" };

export type SiteCommand =
  | { type: "ready" }
  | { type: "view"; view: "2d" | "3d" | "fpv" }
  /** drop the pin this many metres east (dx) and north (dy) of the landing station */
  | { type: "pin"; dxM: number; dyM: number }
  | { type: "clearPin" }
  | { type: "plan"; on: boolean }
  /** apply the n-th science goal of the site */
  | { type: "goal"; index: number }
  /** `withinS`: the speed at which the whole plan is walked in that many seconds */
  | { type: "sim"; on: boolean; warp?: number; withinS?: number }
  /** what-if: the oxygen the suit carries in litres, or null for the full suit */
  | { type: "o2"; l: number | null }
  /** how the crew goes: on foot, or in the rover with the walkback rule */
  | { type: "mode"; mode: "foot" | "rover" }
  /** the modeled data layers of the 2D map that are on (slope, radiation, pressure, hazard) */
  | { type: "layers"; layers: Array<"slope" | "radiation" | "pressure" | "hazard"> }
  /** the base map: natural colour (null picks the best), elevation colour, MOLA colour */
  | { type: "basemap"; basemap: "mdim" | "elev" | "mola" | null }
  /** the detail level: the regional MOLA patch or the finest tile of the site */
  | { type: "tier"; tier: "regional" | "best" };

type Handler<C> = (cmd: C) => boolean | void;

let globeHandler: Handler<GlobeCommand> | null = null;
let siteHandler: Handler<SiteCommand> | null = null;
let reliefHandler: Handler<ReliefCommand> | null = null;

export function registerGlobeDirector(h: Handler<GlobeCommand>): () => void {
  globeHandler = h;
  return () => {
    if (globeHandler === h) globeHandler = null;
  };
}

export function registerSiteDirector(h: Handler<SiteCommand>): () => void {
  siteHandler = h;
  return () => {
    if (siteHandler === h) siteHandler = null;
  };
}

export function registerReliefDirector(h: Handler<ReliefCommand>): () => void {
  reliefHandler = h;
  return () => {
    if (reliefHandler === h) reliefHandler = null;
  };
}

export const director = {
  relief(cmd: ReliefCommand): boolean {
    return reliefHandler ? reliefHandler(cmd) === true : false;
  },
  globe(cmd: GlobeCommand): boolean {
    return globeHandler ? globeHandler(cmd) === true : false;
  },
  site(cmd: SiteCommand): boolean {
    return siteHandler ? siteHandler(cmd) === true : false;
  },
};

/** Waits until the page answers `ready`; false after the timeout (the tour then carries on without that page). */
export async function waitForPage(kind: "globe" | "site" | "relief", timeoutMs = 15000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = kind === "globe" ? director.globe({ type: "ready" }) : kind === "relief" ? director.relief({ type: "ready" }) : director.site({ type: "ready" });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
