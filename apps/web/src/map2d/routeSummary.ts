import type { components } from "../api/schema";

type Segment = components["schemas"]["Segment"];
export type LimitingFactor = components["schemas"]["LimitingFactor"];

export interface FactorShare {
  factor: LimitingFactor;
  label: string;
  /** Share of the route's walking time spent on segments limited by this factor, 0..1. */
  share: number;
}

const LABEL: Record<LimitingFactor, string> = {
  time: "Walking time",
  energy: "Energy use",
  dose: "Radiation dose",
  hazard: "Terrain hazard",
  slope: "Slope",
  roughness: "Rough ground",
  shadow: "Shadow and cold",
  thermal: "Thermal limits",
  comms: "Radio shadow",
  science: "Science value",
};

/**
 * What limits the route, by share of time (F37 breakdown): segments carry the dominant cost component.
 * Sorted largest first; shares below `minShare` are dropped so the list stays readable.
 */
export function summariseLimitingFactors(segments: Segment[], minShare = 0.05): FactorShare[] {
  const total = segments.reduce((sum, s) => sum + (Number.isFinite(s.duration_s) ? Math.max(0, s.duration_s) : 0), 0);
  if (total <= 0) return [];
  const byFactor = new Map<LimitingFactor, number>();
  for (const s of segments) {
    const d = Number.isFinite(s.duration_s) ? Math.max(0, s.duration_s) : 0;
    byFactor.set(s.limiting_factor, (byFactor.get(s.limiting_factor) ?? 0) + d);
  }
  return [...byFactor.entries()]
    .map(([factor, seconds]) => ({ factor, label: LABEL[factor] ?? factor, share: seconds / total }))
    .filter((f) => f.share >= minShare)
    .sort((a, b) => b.share - a.share);
}

/** "62% walking time, 25% slope" for tooltips and one-line summaries. */
export function describeFactors(shares: FactorShare[], max = 3): string {
  return shares
    .slice(0, max)
    .map((f) => `${Math.round(f.share * 100)}% ${f.label.toLowerCase()}`)
    .join(", ");
}
