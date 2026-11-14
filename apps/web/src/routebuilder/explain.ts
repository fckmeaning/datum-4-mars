/**
 * Plain-English explanations and display helpers derived from a RouteResult (F37 segment breakdown, verdict, totals).
 */
import type { components } from "../api/schema";
import type { RouteResult } from "./routeApi";

export type LimitingFactor = components["schemas"]["LimitingFactor"];

interface FactorStyle {
  /** Used in sentences: "limited by {label}" */
  label: string;
  color: string;
}

/** Colours follow the design tokens (hazard red, energy amber, dose violet, time blue, thermal ochre, nominal green). */
export const FACTOR_STYLE: Record<LimitingFactor, FactorStyle> = {
  time: { label: "walking time", color: "#58A6FF" },
  energy: { label: "energy use", color: "#D29922" },
  dose: { label: "radiation dose", color: "#BC8CFF" },
  hazard: { label: "terrain hazard", color: "#F85149" },
  slope: { label: "steep slopes", color: "#FF7B72" },
  roughness: { label: "rough ground", color: "#E3B341" },
  shadow: { label: "shadowed ground", color: "#6E7681" },
  thermal: { label: "cold exposure", color: "#E06A3B" },
  comms: { label: "loss of relay contact", color: "#39C5CF" },
  science: { label: "science value", color: "#3FB950" },
};

export const PROFILE_BLURB: Record<string, string> = {
  FASTEST: "Minimises walking time inside the slope, step and reserve limits.",
  SAFEST: "Minimises risk (dose, hazard, shadow, cold) while staying inside the EVA time limit.",
  BALANCED: "The knee of the time-versus-risk trade-off: a good time without taking the worst risks.",
  SCIENCE: "Like BALANCED, but bends the path towards places with high science value.",
};

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "n/a";
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "<1 min";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "n/a";
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
}

export function formatSunset(sunsetInS: number | null | undefined): string {
  if (sunsetInS === null || sunsetInS === undefined) return "n/a";
  if (sunsetInS <= 0) return "sun is down";
  return `in ${formatDuration(sunsetInS)}`;
}

export interface Verdict {
  call: "READY" | "CAUTION" | "NO_GO";
  reason: string;
}

/** Verdict call plus the first plain reason; falls back to the first feasibility violation. */
export function verdictOf(route: RouteResult): Verdict {
  const call = route.verdict?.call ?? (route.feasibility.ok ? "READY" : "NO_GO");
  const reason =
    route.verdict?.reasons?.[0] ??
    route.feasibility.violations[0]?.message ??
    (call === "READY" ? "All reserve and terrain checks pass." : "See the details below.");
  return { call, reason };
}

export interface RibbonPiece {
  factor: LimitingFactor;
  /** Share of the route length, 0..1 */
  fraction: number;
  color: string;
  label: string;
}

/** Contiguous runs of the same limiting factor, as shares of the route length. */
export function ribbonPieces(route: RouteResult): RibbonPiece[] {
  const total = route.segments.reduce((s, seg) => s + Math.max(0, seg.length_m), 0);
  if (total <= 0) return [];
  const out: RibbonPiece[] = [];
  for (const seg of route.segments) {
    const frac = Math.max(0, seg.length_m) / total;
    const last = out[out.length - 1];
    if (last && last.factor === seg.limiting_factor) {
      last.fraction += frac;
    } else {
      const style = FACTOR_STYLE[seg.limiting_factor];
      out.push({ factor: seg.limiting_factor, fraction: frac, color: style.color, label: style.label });
    }
  }
  return out;
}

export interface FactorShare {
  factor: LimitingFactor;
  fraction: number;
  label: string;
}

/** Share of the distance per limiting factor, largest first. */
export function factorShares(route: RouteResult): FactorShare[] {
  const total = route.segments.reduce((s, seg) => s + Math.max(0, seg.length_m), 0);
  if (total <= 0) return [];
  const sums = new Map<LimitingFactor, number>();
  for (const seg of route.segments) {
    sums.set(seg.limiting_factor, (sums.get(seg.limiting_factor) ?? 0) + Math.max(0, seg.length_m));
  }
  return [...sums.entries()]
    .map(([factor, len]) => ({ factor, fraction: len / total, label: FACTOR_STYLE[factor].label }))
    .sort((a, b) => b.fraction - a.fraction);
}

const pct = (f: number): string => `${Math.round(f * 100)} %`;

function signedPct(delta: number): string {
  const r = Math.round(delta * 100);
  return r > 0 ? `+${r} %` : `${r} %`;
}

/** "Why this route" as short plain sentences. `all` lets the text compare with the FASTEST alternative. */
export function whyRoute(route: RouteResult, all: RouteResult[] = []): string[] {
  const lines: string[] = [];
  const blurb = PROFILE_BLURB[route.profile];
  if (blurb) lines.push(blurb);

  const shares = factorShares(route);
  const top = shares[0];
  if (top) {
    const second = shares[1];
    lines.push(
      second && second.fraction >= 0.1
        ? `Mostly limited by ${top.label} (${pct(top.fraction)} of the distance), then ${second.label} (${pct(second.fraction)}).`
        : `Limited by ${top.label} along ${pct(top.fraction)} of the distance.`,
    );
  }

  lines.push(
    `Steepest section ${route.totals.max_slope_deg.toFixed(1)}°, climbing ${Math.round(route.totals.ascent_m)} m and descending ${Math.round(route.totals.descent_m)} m.`,
  );

  const fastest = all.find((r) => r.profile === "FASTEST");
  if (fastest && fastest.route_id !== route.route_id && fastest.totals.time_s > 0) {
    const dt = route.totals.time_s - fastest.totals.time_s;
    const dTimeRel = dt / fastest.totals.time_s;
    const doseBase = fastest.totals.dose_mSv;
    const doseRel = doseBase > 0 ? (route.totals.dose_mSv - doseBase) / doseBase : 0;
    const timePart =
      Math.abs(dt) < 30 ? "the same time as FASTEST" : `${dt > 0 ? "+" : "-"}${formatDuration(Math.abs(dt))} (${signedPct(dTimeRel)}) versus FASTEST`;
    const dosePart = Math.abs(doseRel) < 0.005 ? "about the same dose" : `${signedPct(doseRel)} dose`;
    lines.push(`Compared with FASTEST: ${timePart}, ${dosePart}.`);
  }

  const v = verdictOf(route);
  lines.push(`Verdict ${v.call.replace("_", "-")}: ${v.reason}`);
  return lines;
}

export interface CardFacts {
  time: string;
  distance: string;
  dose: string;
  oxygen: string;
  energy: string;
  maxSlope: string;
  turnBack: string;
  sunset: string;
}

export function cardFacts(route: RouteResult): CardFacts {
  const t = route.totals;
  return {
    time: formatDuration(t.time_s),
    distance: formatDistance(t.length_m),
    dose: `${t.dose_mSv.toFixed(2)} mSv`,
    oxygen: `${t.o2_l.toFixed(0)} L`,
    energy: `${Math.round(t.energy_kJ)} kJ`,
    maxSlope: `${t.max_slope_deg.toFixed(1)}°`,
    turnBack: t.turnback_distance_m === null || t.turnback_distance_m === undefined ? "no limit hit" : formatDistance(t.turnback_distance_m),
    sunset: formatSunset(t.sunset_in_s),
  };
}

export interface ChartBar {
  route_id: string;
  profile: string;
  /** 0..1, relative to the longest time among the alternatives */
  time: number;
  /** 0..1, relative to the largest risk among the alternatives */
  risk: number;
}

export function chartBars(routes: RouteResult[]): ChartBar[] {
  const maxTime = Math.max(1e-9, ...routes.map((r) => r.totals.time_s));
  const maxRisk = Math.max(1e-9, ...routes.map((r) => r.totals.risk ?? 0));
  return routes.map((r) => ({
    route_id: r.route_id,
    profile: r.profile,
    time: r.totals.time_s / maxTime,
    risk: (r.totals.risk ?? 0) / maxRisk,
  }));
}
