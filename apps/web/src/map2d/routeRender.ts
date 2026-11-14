import type { RouteResult } from "../api/client";

export const ROUTE_COLORS: Record<string, string> = {
  FASTEST: "#56B4E9",
  SAFEST: "#009E73",
  BALANCED: "#E69F00",
  SCIENCE: "#CC79A7",
};

export function getProfileColor(profile: string): string {
  return ROUTE_COLORS[profile] ?? "#56B4E9";
}

export function formatRouteTimeBubble(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}h ${remMins.toString().padStart(2, "0")}m`;
  }
  return `${mins}m`;
}

/**
 * Finds the middle coordinate of a route geometry for placing time bubbles.
 */
export function getRouteMidpoint(coordinates: number[][]): [number, number] {
  if (coordinates.length === 0) return [0, 0];
  const midIndex = Math.floor(coordinates.length / 2);
  const pt = coordinates[midIndex] ?? coordinates[0]!;
  return [pt[0] ?? 0, pt[1] ?? 0];
}
