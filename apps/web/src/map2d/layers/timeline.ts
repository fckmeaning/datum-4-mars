import type { LayerMeta } from "../../api/client";

export interface Snapshot {
  id: string;
  year: number;
  validTime: string;
  meta: LayerMeta;
}

/** Dated optical snapshots (TIME-MARS): time-dependent optical layers with a parsable `valid_time`, oldest first. */
export function datedSnapshots(layers: LayerMeta[]): Snapshot[] {
  const seen = new Set<string>();
  const out: Snapshot[] = [];
  for (const l of layers) {
    if (l.family !== "optical" || !l.time_dependent || !l.valid_time || !l.cog_url || seen.has(l.id)) continue;
    const t = Date.parse(l.valid_time);
    if (!Number.isFinite(t)) continue;
    seen.add(l.id);
    out.push({ id: l.id, year: new Date(t).getUTCFullYear(), validTime: l.valid_time, meta: l });
  }
  return out.sort((a, b) => Date.parse(a.validTime) - Date.parse(b.validTime));
}

/** The control is hidden unless there are at least two dated snapshots to compare. */
export function shouldShowTimeline(snapshots: readonly Snapshot[]): boolean {
  return snapshots.length >= 2;
}

/** GL scissor rectangle (device pixels) for the layer drawn to the RIGHT of the swipe line at `fraction` of the width. */
export function swipeScissor(fraction: number, widthCss: number, heightCss: number, dpr: number): { x: number; y: number; w: number; h: number } {
  const f = Math.min(1, Math.max(0, fraction));
  const W = Math.round(widthCss * dpr);
  const x = Math.round(W * f);
  return { x, y: 0, w: Math.max(0, W - x), h: Math.round(heightCss * dpr) };
}
