/**
 * Pure model of the route builder: points, role rules, geometry helpers and the editing reducers.
 * No React, no OpenLayers, no network: everything here is unit-tested.
 */
import type { components } from "../api/schema";

export type PointRole = components["schemas"]["Waypoint"]["role"];
export type ApiWaypoint = components["schemas"]["Waypoint"];
export type BBox = components["schemas"]["BBox"];

export interface BuilderPoint {
  id: string;
  lat: number;
  lon: number;
  role: PointRole;
  /** Minutes spent at the point (science / via stops) */
  dwell_min: number;
  /** Human label (place name); absent for free coordinates */
  name?: string;
  /** Known place id (e.g. the base) when the point is snapped to a place */
  placeId?: string;
}

export interface BaseRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** Provisional Gale AOI (decision D-01); the panel prefers the bbox returned by GET /sites/{id}. */
export const GALE_BBOX: BBox = { lat_min: -4.89, lat_max: -4.55, lon_min: 137.27, lon_max: 137.53 };
/** Bradbury Landing, the default habitat (decision D-01). */
export const GALE_BASE: BaseRef = { id: "gale.base", name: "Bradbury Landing (habitat)", lat: -4.5895, lon: 137.4417 };
/** A click this close to the base snaps onto it. */
export const SNAP_RADIUS_M = 150;
export const DEFAULT_VIA_DWELL_MIN = 10;
export const MARS_RADIUS_M = 3_396_190;
export const MAX_HISTORY = 50;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function insideBBox(lat: number, lon: number, bbox: BBox): boolean {
  return lat >= bbox.lat_min && lat <= bbox.lat_max && lon >= bbox.lon_min && lon <= bbox.lon_max;
}

export const OUT_OF_AOI_MESSAGE = "That point lies outside the mapped area. Pick a point inside the dashed boundary.";

let idCounter = 0;
export function newPointId(): string {
  idCounter += 1;
  return `pt${idCounter}`;
}

export interface SnapResult {
  lat: number;
  lon: number;
  placeId?: string;
  name?: string;
}

/** Snaps onto the base when closer than `radiusM`; otherwise returns the input unchanged. */
export function snapToBase(lat: number, lon: number, base: BaseRef | null, radiusM = SNAP_RADIUS_M): SnapResult {
  if (base && haversineM(lat, lon, base.lat, base.lon) <= radiusM) {
    return { lat: base.lat, lon: base.lon, placeId: base.id, name: base.name };
  }
  return { lat, lon };
}

/**
 * Roles follow position: the first point is the start, the last of two or more is the goal, everything between is a
 * via point (a "science" stop keeps its flag). Dwell is zero at the ends and defaults to 10 min for stops.
 */
export function normaliseRoles(points: BuilderPoint[]): BuilderPoint[] {
  const n = points.length;
  return points.map((p, i) => {
    let role: PointRole;
    if (i === 0) role = "start";
    else if (i === n - 1) role = "goal";
    else role = p.role === "science" ? "science" : "via";
    if (role === p.role) return p;
    const dwell = role === "start" || role === "goal" ? 0 : p.dwell_min || DEFAULT_VIA_DWELL_MIN;
    return { ...p, role, dwell_min: dwell };
  });
}

export interface NewPoint {
  lat: number;
  lon: number;
  id?: string;
  name?: string;
  placeId?: string;
}

export function addPoint(points: BuilderPoint[], pt: NewPoint): BuilderPoint[] {
  const next: BuilderPoint = {
    id: pt.id ?? newPointId(),
    lat: pt.lat,
    lon: pt.lon,
    role: "via",
    dwell_min: 0,
    ...(pt.name !== undefined ? { name: pt.name } : {}),
    ...(pt.placeId !== undefined ? { placeId: pt.placeId } : {}),
  };
  return normaliseRoles([...points, next]);
}

export function movePoint(points: BuilderPoint[], id: string, lat: number, lon: number, base: BaseRef | null = null): BuilderPoint[] {
  const snap = snapToBase(lat, lon, base);
  return points.map((p) => {
    if (p.id !== id) return p;
    const { name: _name, placeId: _placeId, ...rest } = p;
    return { ...rest, lat: snap.lat, lon: snap.lon, ...(snap.placeId ? { placeId: snap.placeId, name: snap.name } : {}) } as BuilderPoint;
  });
}

export function removePoint(points: BuilderPoint[], id: string): BuilderPoint[] {
  return normaliseRoles(points.filter((p) => p.id !== id));
}

/** Moves the point at `from` to index `to` (both clamped); the roles are recomputed from the new order. */
export function reorderPoint(points: BuilderPoint[], from: number, to: number): BuilderPoint[] {
  if (from < 0 || from >= points.length) return points;
  const target = Math.max(0, Math.min(points.length - 1, to));
  if (target === from) return points;
  const copy = [...points];
  const [moved] = copy.splice(from, 1);
  if (!moved) return points;
  copy.splice(target, 0, moved);
  return normaliseRoles(copy);
}

export function reversePoints(points: BuilderPoint[]): BuilderPoint[] {
  return normaliseRoles([...points].reverse());
}

export function setDwell(points: BuilderPoint[], id: string, minutes: number): BuilderPoint[] {
  const m = Math.max(0, Math.min(240, Math.round(minutes)));
  return points.map((p) => (p.id === id ? { ...p, dwell_min: m } : p));
}

/** Applies a permutation returned by POST /route/order (index 0 stays the start). */
export function applyOrder(points: BuilderPoint[], order: number[]): BuilderPoint[] {
  if (order.length !== points.length) return points;
  const seen = new Set(order);
  if (seen.size !== points.length || order.some((i) => i < 0 || i >= points.length)) return points;
  return normaliseRoles(order.map((i) => points[i] as BuilderPoint));
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** API waypoints: coordinates rounded to 6 decimals (about 0.05 m), place ids kept for named places. */
export function toWaypoints(points: BuilderPoint[]): ApiWaypoint[] {
  return points.map((p) => ({
    role: p.role,
    lat: round6(p.lat),
    lon: round6(p.lon),
    dwell_min: p.dwell_min,
    ...(p.placeId ? { place_id: p.placeId } : {}),
  }));
}

export function formatCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? "W" : "E"}`;
}
