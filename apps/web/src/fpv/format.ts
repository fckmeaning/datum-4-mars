/** format.ts - number and text formatting for the helmet HUD (pure, unit-tested). */

import { wrapDeg360 } from "./fpvMath";

const POINTS_16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;

/** 16-point compass label for a heading. */
export function compassLabel(deg: number): string {
  return POINTS_16[Math.round(wrapDeg360(deg) / 22.5) % 16] ?? "N";
}

/** Three-digit heading, e.g. 7 -> "007", 359.6 -> "000". */
export function formatHeading(deg: number): string {
  return String(Math.round(wrapDeg360(deg)) % 360).padStart(3, "0");
}

/** Distance with a unit that keeps three significant figures: "38 m", "1.24 km". */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return "--";
  const a = Math.abs(m);
  if (a < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(a < 10_000 ? 2 : 1)} km`;
}

/** Duration as "h:mm:ss" (or "m:ss" below an hour). */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "--:--";
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Signed angle with one decimal: "+3.4 deg" style used for slope and elevation angles. */
export function formatSigned(value: number, digits = 1, unit = "°"): string {
  if (!Number.isFinite(value)) return `--${unit}`;
  const v = Number(value.toFixed(digits));
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;
}

/** Elevation in metres with a thousands separator: "-4 501 m". */
export function formatElevation(m: number): string {
  if (!Number.isFinite(m)) return "-- m";
  return `${Math.round(m).toLocaleString("en-US").replace(/,/g, " ")} m`;
}

/** UTC clock "HH:MM:SS" from an ISO string. */
export function formatClock(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toISOString().slice(11, 19);
}

/** Playback label: "PAUSED" or "4x". */
export function formatPlayback(speed: number, paused: boolean): string {
  return paused ? "PAUSED" : `${speed}x`;
}

/** Remaining fraction of a consumable as a clamped percentage. */
export function remainingPercent(left: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(left)) return 0;
  return Math.max(0, Math.min(100, (left / total) * 100));
}
