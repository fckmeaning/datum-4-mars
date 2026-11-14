import type { LayerMeta } from "../../api/client";
import { readClasses } from "./classes";
import {
  DEFAULT_NO_GO_DEG,
  GALE_ELEVATION_RANGE,
  SLOPE_STOPS,
  elevationGradientCss,
  slopeGradientCss,
} from "./terrainStyle";

export interface LegendSwatch {
  label: string;
  color: string;
}

export interface LegendEntry {
  id: string;
  title: string;
  unit?: string;
  kind: "ramp" | "classes" | "line";
  gradient?: string;
  minLabel?: string;
  maxLabel?: string;
  classes?: LegendSwatch[];
  note?: string;
}

export interface LegendContext {
  elevation?: LayerMeta;
  optical?: LayerMeta;
  walkability?: LayerMeta;
  noGoDeg?: number;
  isochroneMinutes?: number[];
}

type States = Record<string, { visible: boolean } | undefined>;

export const ISOCHRONE_COLORS = ["#2DD4BF", "#84CC16", "#EAB308", "#F97316", "#EF4444"];

/** Colour of the n-th isochrone (shortest return time = coolest colour). */
export function isochroneColor(index: number, count: number): string {
  if (count <= 1) return ISOCHRONE_COLORS[0]!;
  const i = Math.round((index / (count - 1)) * (ISOCHRONE_COLORS.length - 1));
  return ISOCHRONE_COLORS[Math.min(ISOCHRONE_COLORS.length - 1, Math.max(0, i))]!;
}

export function formatMeters(m: number): string {
  return m >= 1000 ? `${+(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${+m.toFixed(1)} m`;
}

/** "Hazards smaller than X m are not resolved", taken from the layer meta (never invented). */
export function resolutionNote(meta: LayerMeta | undefined): string | undefined {
  const r = meta?.resolution_m;
  return typeof r === "number" && r > 0 ? `Hazards smaller than ${formatMeters(r)} are not resolved.` : undefined;
}

function on(states: States, id: string, fallback: boolean): boolean {
  return states[id]?.visible ?? fallback;
}

/** Legend entries for exactly the layers that are visible, in drawing order. */
export function buildLegend(states: States, ctx: LegendContext = {}): LegendEntry[] {
  const out: LegendEntry[] = [];
  const noGo = ctx.noGoDeg ?? DEFAULT_NO_GO_DEG;
  const res = resolutionNote(ctx.elevation);

  if (on(states, "elevation", true)) {
    out.push({
      id: "elevation",
      title: "Shaded relief",
      unit: "m",
      kind: "ramp",
      gradient: elevationGradientCss(GALE_ELEVATION_RANGE),
      minLabel: `${GALE_ELEVATION_RANGE[0]} m`,
      maxLabel: `${GALE_ELEVATION_RANGE[1]} m`,
      note: ["Elevation tint x hillshade (sun from the NW, relief exaggerated x3 for display).", res].filter(Boolean).join(" "),
    });
  }
  if (ctx.optical && on(states, "optical", true)) {
    out.push({
      id: "optical",
      title: "Optical (HiRISE)",
      unit: "DN",
      kind: "ramp",
      gradient: "linear-gradient(90deg, #0a0a0a, #8a8a8a, #f2f2f2)",
      minLabel: "dark",
      maxLabel: "bright",
      note: `Grayscale image, ${ctx.optical.resolution_m ?? "?"} m/pixel. ${ctx.optical.uncertainty_note ?? ""}`.trim(),
    });
  }
  if (on(states, "slope", false)) {
    const max = SLOPE_STOPS[SLOPE_STOPS.length - 1]!.deg;
    out.push({
      id: "slope",
      title: "Slope",
      unit: "deg",
      kind: "ramp",
      gradient: slopeGradientCss(),
      minLabel: "0 deg",
      maxLabel: `${max}+ deg`,
      classes: [{ label: `No-go above ${noGo} deg (walking limit)`, color: "rgb(120,8,12)" }],
      note: ["Finite differences on the elevation grid.", res].filter(Boolean).join(" "),
    });
  }
  if (on(states, "hillshade", false)) {
    out.push({ id: "hillshade", title: "Hillshade", kind: "ramp", gradient: "linear-gradient(90deg, #000, #fff)", minLabel: "shadow", maxLabel: "sunlit" });
  }
  if (ctx.walkability && on(states, "walkability", false)) {
    const bands = readClasses(ctx.walkability);
    out.push({
      id: "walkability",
      title: "Walkability index",
      unit: ctx.walkability.unit,
      kind: "classes",
      classes: [...bands].sort((a, b) => b.min - a.min).map((b) => ({ label: `${b.label} (${b.min}-${b.max})`, color: b.color })),
      note: ctx.walkability.uncertainty_note,
    });
  }
  if (on(states, "viewshed", false)) {
    out.push({
      id: "viewshed",
      title: "Line of sight",
      kind: "classes",
      classes: [
        { label: "Visible from the observer", color: "rgb(20,184,166)" },
        { label: "Shadowed (no line of sight / radio)", color: "rgb(8,12,16)" },
      ],
      note: "Approximate: bilinear rays on the grid, curvature included.",
    });
  }
  if (on(states, "isochrones", false)) {
    const mins = ctx.isochroneMinutes ?? [15, 30, 60, 90, 120];
    out.push({
      id: "isochrones",
      title: "Return time to base",
      unit: "min",
      kind: "classes",
      classes: mins.map((m, i) => ({ label: `${m} min walking`, color: isochroneColor(i, mins.length) })),
      note: "Time-optimal walking return (F34).",
    });
  }
  if (on(states, "traverse", true)) {
    out.push({ id: "traverse", title: "Curiosity traverse", kind: "line", classes: [{ label: "Real path, sols 3-5073 (NASA MMGIS)", color: "#E3B341" }] });
  }
  return out;
}
