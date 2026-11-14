/** EVA plan: outbound legs to the stops, work at each stop, the walk home; oxygen budget, verdict, point of no return. */

import { doseMSvPerDay } from "../demRaster";
import { MARS_SOLAR_HOUR_S } from "../missionClock";
import { EVA, EVA_EXTRA, stopTerms, type Mode } from "./evaModel";
import { aStar, cellOf, cellPoint, descendHome, homeField, step, walkSeconds, type Grid, type Pt } from "./grid";

export type Verdict = "READY" | "CAUTION" | "NO_GO";

export interface PlanNode {
  x: number;
  y: number;
  z: number;
  /** cumulative ground distance [m], time [s] and oxygen [L] at this node (after any work at a stop) */
  cumD: number;
  cumT: number;
  cumO2: number;
  kind: "path" | "stop";
  /** cell of the grid, to read the oxygen-to-home field */
  cell: number;
}

export interface Plan {
  nodes: PlanNode[];
  /** index of the node where the last stop is (end of the outbound part) */
  outEnd: number;
  stopNodes: number[];
  stats: {
    distanceM: number;
    timeS: number;
    ascentM: number;
    maxGradeDeg: number;
    o2L: number;
    /** the oxygen the suit carries [L], and the part of it that may be used above the reserve */
    capacityL: number;
    usableL: number;
    doseMSv: number;
    /** storm shelter time: walking time home from the farthest point of the route */
    shelterWalkS: number;
  };
  /** true when the route comes back to the station */
  returnHome: boolean;
  verdict: Verdict;
  reason: string;
  /** share of the usable oxygen left at the end, 0..1 (negative when short) */
  margin: number;
  /** last outbound node from which the walk home still keeps the reserve; null when the whole outbound leg is safe */
  noReturn: number | null;
  mode: Mode;
}

export function usableO2(capacityL: number = EVA.o2_capacity_l): number {
  return capacityL * (1 - EVA.reserve_fraction);
}

export function verdictFor(input: { o2L: number; timeS: number; walkbackBroken: boolean; capacityL?: number }): { verdict: Verdict; reason: string } {
  const usable = usableO2(input.capacityL);
  const hours = input.timeS / 3600;
  if (input.walkbackBroken) return { verdict: "NO_GO", reason: "Breaks the walkback rule: the crew could not walk home with the oxygen left if the rover failed." };
  if (input.o2L > usable) return { verdict: "NO_GO", reason: `Needs ${input.o2L.toFixed(0)} L of oxygen; ${usable.toFixed(0)} L are usable above the ${(EVA.reserve_fraction * 100).toFixed(0)} % reserve.` };
  if (hours > EVA.eva_max_h) return { verdict: "NO_GO", reason: `${hours.toFixed(1)} h is longer than the ${EVA.eva_max_h} h EVA limit.` };
  if (input.o2L > 0.8 * usable) return { verdict: "CAUTION", reason: `Uses ${((input.o2L / usable) * 100).toFixed(0)} % of the usable oxygen.` };
  if (hours > 0.85 * EVA.eva_max_h) return { verdict: "CAUTION", reason: `${hours.toFixed(1)} h is close to the ${EVA.eva_max_h} h EVA limit.` };
  return { verdict: "READY", reason: `Uses ${((input.o2L / usable) * 100).toFixed(0)} % of the usable oxygen.` };
}

export function planEva(g: Grid, home: Pt, stops: Pt[], mode: Mode, opts: { returnHome?: boolean; o2CapacityL?: number } = {}): Plan | { error: string } {
  const returnHome = opts.returnHome ?? true;
  const capacityL = opts.o2CapacityL ?? EVA.o2_capacity_l;
  if (stops.length === 0) return { error: "Add at least one stop." };
  const homeCell = cellOf(g, home);
  const field = homeField(g, homeCell);

  // cells in order, with the position of each stop among them
  const cells: number[] = [homeCell];
  const stopAt: number[] = [];
  let cur = homeCell;
  for (let k = 0; k < stops.length; k++) {
    const target = cellOf(g, stops[k]!);
    const leg = aStar(g, cur, target, mode);
    if (!leg) return { error: `No ${mode === "rover" ? "drivable" : "walkable"} route to stop ${k + 1}: the slopes around it are too steep.` };
    cells.push(...leg.slice(1));
    stopAt.push(cells.length - 1);
    cur = target;
  }
  const outLast = cells.length - 1;
  if (returnHome) {
    const back = mode === "rover" ? aStar(g, cur, homeCell, "rover") : descendHome(g, field, cur);
    if (!back || back[back.length - 1] !== homeCell) return { error: "No route back from the last stop within the slope limit." };
    cells.push(...back.slice(1));
  }

  const dwell = stopTerms();
  const nodes: PlanNode[] = [];
  let cumD = 0;
  let cumT = 0;
  let cumO2 = 0;
  let ascent = 0;
  let maxGrade = 0;
  let zSum = 0;
  const stopNodes: number[] = [];
  let outEnd = 0;
  for (let k = 0; k < cells.length; k++) {
    if (k > 0) {
      const s = step(g, cells[k - 1]!, cells[k]!, mode);
      cumD += Math.hypot(s.d, s.dz);
      cumT += s.dt;
      cumO2 += s.o2;
      if (s.dz > 0) ascent += s.dz;
      maxGrade = Math.max(maxGrade, (Math.atan(Math.abs(s.dz) / s.d) * 180) / Math.PI);
    }
    const p = cellPoint(g, cells[k]!);
    zSum += p.z;
    nodes.push({ x: p.x, y: p.y, z: p.z, cumD, cumT, cumO2, kind: "path", cell: cells[k]! });
    if (stopAt.includes(k)) {
      cumT += dwell.dt;
      cumO2 += dwell.o2;
      nodes.push({ x: p.x, y: p.y, z: p.z, cumD, cumT, cumO2, kind: "stop", cell: cells[k]! });
      stopNodes.push(nodes.length - 1);
      if (k === outLast) outEnd = nodes.length - 1;
    }
  }

  // the walk home keeps the reserve only while oxygen used so far + oxygen to walk home <= the usable oxygen
  const usable = usableO2(capacityL);
  let firstBreak: number | null = null;
  for (let k = 0; k <= outEnd; k++) {
    const n = nodes[k]!;
    if (n.cumO2 + field[n.cell]! > usable) {
      firstBreak = k;
      break;
    }
  }
  const noReturn = firstBreak === null ? null : Math.max(0, firstBreak - 1);

  const last = nodes[nodes.length - 1]!;
  const v = verdictFor({ o2L: last.cumO2, timeS: last.cumT, walkbackBroken: mode === "rover" && firstBreak !== null, capacityL });
  const meanZ = zSum / nodes.length;
  // storm shelter: the station is the shelter; time to walk to it from the farthest point of the route
  let farthest = homeCell;
  let farD = -1;
  for (const n of nodes) {
    const d = Math.hypot(n.x - home.x, n.y - home.y);
    if (d > farD) {
      farD = d;
      farthest = n.cell;
    }
  }
  const shelterWalkS = walkSeconds(g, descendHome(g, field, farthest));
  return {
    nodes,
    outEnd,
    stopNodes,
    stats: {
      distanceM: last.cumD,
      timeS: last.cumT,
      ascentM: ascent,
      maxGradeDeg: maxGrade,
      o2L: last.cumO2,
      capacityL,
      usableL: usable,
      doseMSv: doseMSvPerDay(meanZ) * (last.cumT / 86400),
      shelterWalkS,
    },
    returnHome,
    verdict: v.verdict,
    reason: v.reason,
    margin: (usable - last.cumO2) / usable,
    noReturn,
    mode,
  };
}

export { EVA_EXTRA };

export type EvaPhase = "outbound" | "working" | "returning" | "done";
export type EvaState = "nominal" | "past-no-return" | "reserve";

export interface EvaAt {
  x: number;
  y: number;
  o2L: number;
  distM: number;
  /** index of the node at or just before t */
  k: number;
  phase: EvaPhase;
  state: EvaState;
  /** distance along the route to the next stop (or to the airlock on the way back) */
  toNextM: number;
  nextStop: number | null;
  remainingL: number;
}

/** Where EV1 is, how much oxygen it has used and what state it is in, `t` seconds after the airlock opened. */
export function evaAt(plan: Plan, t: number): EvaAt {
  const nodes = plan.nodes;
  const last = nodes[nodes.length - 1]!;
  const tt = Math.max(0, Math.min(last.cumT, t));
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (nodes[mid]!.cumT <= tt) lo = mid;
    else hi = mid - 1;
  }
  const a = nodes[lo]!;
  const b = nodes[Math.min(lo + 1, nodes.length - 1)]!;
  const span = b.cumT - a.cumT;
  const f = span > 1e-9 ? (tt - a.cumT) / span : 0;
  const lerp = (p: number, q: number) => p + (q - p) * f;
  const distM = lerp(a.cumD, b.cumD);
  const o2L = lerp(a.cumO2, b.cumO2);
  const nextIdx = plan.stopNodes.findIndex((s) => s > lo && nodes[s]!.kind === "stop" && nodes[s]!.cumT - 1e-6 > tt - 1e-6);
  const nextStop = tt >= last.cumT ? null : nextIdx >= 0 ? nextIdx : null;
  const working = a.kind === "stop" && b.cumT > a.cumT && a.x === b.x && a.y === b.y && tt < b.cumT && lo > 0 && nodes[lo - 1]!.x === a.x && nodes[lo - 1]!.y === a.y;
  const atStopDwell = nodes[lo]!.kind === "path" && nodes[Math.min(lo + 1, nodes.length - 1)]!.kind === "stop" && a.x === b.x && a.y === b.y;
  const phase: EvaPhase = tt >= last.cumT ? "done" : working || atStopDwell ? "working" : lo < plan.outEnd ? "outbound" : "returning";
  const usable = plan.stats.usableL;
  const remainingL = plan.stats.capacityL - o2L;
  const noRetT = plan.noReturn === null ? Infinity : nodes[plan.noReturn]!.cumT;
  const state: EvaState = o2L > usable ? "reserve" : tt > noRetT && lo < plan.outEnd ? "past-no-return" : "nominal";
  const target = nextStop !== null ? nodes[plan.stopNodes[nextStop]!]!.cumD : last.cumD;
  return { x: lerp(a.x, b.x), y: lerp(a.y, b.y), o2L, distM, k: lo, phase, state, toNextM: Math.max(0, target - distM), nextStop, remainingL };
}

export interface FpvRoute {
  xy: number[][];
  profile: string;
  segments: Array<{ length_m: number; duration_s: number; o2_l: number }>;
  totals: { o2_l: number; energy_kJ: number };
}

/**
 * The plan as the route the first-person view walks: the path nodes in order (work at a stop is a pause, not walking time),
 * with the real length, walking time and oxygen of each leg.
 */
export function planToFpvRoute(plan: Plan): FpvRoute {
  const dwell = stopTerms();
  const xy: number[][] = [];
  const segments: FpvRoute["segments"] = [];
  let dwellT = 0;
  let dwellO2 = 0;
  let prev: { cumD: number; walkT: number; walkO2: number } | null = null;
  for (const n of plan.nodes) {
    if (n.kind === "stop") {
      dwellT += dwell.dt;
      dwellO2 += dwell.o2;
      continue;
    }
    const cur = { cumD: n.cumD, walkT: n.cumT - dwellT, walkO2: n.cumO2 - dwellO2 };
    if (prev) segments.push({ length_m: cur.cumD - prev.cumD, duration_s: cur.walkT - prev.walkT, o2_l: cur.walkO2 - prev.walkO2 });
    xy.push([n.x, n.y]);
    prev = cur;
  }
  return { xy, profile: plan.mode === "rover" ? "ROVER" : "SAFEST", segments, totals: { o2_l: prev?.walkO2 ?? 0, energy_kJ: 0 } };
}

export const EVA_START_LTST_H = 9;

export interface DaylightCheck {
  startH: number;
  endH: number;
  sunriseH: number;
  sunsetH: number;
  /** hours of daylight left when the EVA ends (negative: it ends after sunset) */
  marginH: number;
  verdict: Verdict;
  reason: string;
}

/**
 * The plan's verdict with the daylight taken into account: the EVA starts at `startH` local true solar time. Ending after sunset
 * is NO_GO and less than half an hour of light left is CAUTION; otherwise the plan's own verdict stands.
 */
export function adjustForDaylight(plan: Plan, sun: { sunriseH: number; sunsetH: number } | null, startH = EVA_START_LTST_H): DaylightCheck | null {
  if (!sun) return null;
  const endH = startH + plan.stats.timeS / MARS_SOLAR_HOUR_S;
  const marginH = sun.sunsetH - endH;
  let verdict = plan.verdict;
  let reason = plan.reason;
  if (marginH < 0) {
    verdict = "NO_GO";
    reason = `The EVA would end at ${hhmm(endH)}, after sunset at ${hhmm(sun.sunsetH)}.`;
  } else if (marginH < 0.5 && plan.verdict === "READY") {
    verdict = "CAUTION";
    reason = `Only ${(marginH * 60).toFixed(0)} min of daylight would be left at the end (sunset ${hhmm(sun.sunsetH)}).`;
  }
  return { startH, endH, sunriseH: sun.sunriseH, sunsetH: sun.sunsetH, marginH, verdict, reason };
}

function hhmm(h: number): string {
  const total = Math.round((((h % 24) + 24) % 24) * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
