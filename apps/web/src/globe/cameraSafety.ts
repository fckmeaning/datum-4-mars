/**
 * cameraSafety.ts - pure camera geometry for the globe, so that no code path can put the camera inside Mars or inside the
 * atmosphere shell, and the free zoom stops where the 4k texture is still sharp.
 *
 * ROOT CAUSE of "I can fly into the planet" (reproduced in cameraSafety.test.ts against the old formula):
 * the old camera was placed with Vector3.lerpVectors between two points, (0, 0, d) and aoiDirection * d. A straight line
 * between two points of a sphere is a chord. When the Gale marker is on the far side of the planet the chord passes through
 * (or very close to) the centre, so at zoom factor 0.85 the camera sat at about 0.7 d, i.e. below the surface for d = 1.18, and
 * inside the atmosphere shell (radius 1.075) for most longitudes. Inside the back-face shell every pixel is "glow": the flat
 * lilac haze on the operator's recording. The fly-in used the same chord from (0, 0, 3.2) and went through the centre of the planet
 * at about 73 % of its progress when the marker faced away.
 * The fix is to move on the sphere (slerp of the direction, scalar distance) and to run every pose through enforceMinRadius.
 */

import { MARS_RADIUS_KM } from "./altitude";

export type Vec3 = readonly [number, number, number];

/** Planet radius in scene units. */
export const PLANET_RADIUS = 1.0;
/** Radius of the back-face atmosphere shell in scene units (about 255 km of "glow"). */
export const ATMOSPHERE_SHELL_RADIUS = 1.075;
/** The free camera never gets closer than this beyond the shell. */
export const SHELL_CLEARANCE = 0.06;
/** Vertical field of view of the globe camera, degrees (must match the Canvas camera prop). */
export const GLOBE_FOV_DEG = 42;
/** Width of the equirectangular colour texture in pixels (360 degrees). */
export const TEXTURE_WIDTH_PX = 4096;
/** Free zoom stops when one texel would be magnified to more than this many screen pixels. */
export const MAX_PX_PER_TEXEL = 3;

/** Width of the colour texture currently on the globe; the 8k upgrade lets the free zoom go closer. */
let activeTextureWidthPx = TEXTURE_WIDTH_PX;
export function setActiveTextureWidth(px: number): void {
  activeTextureWidthPx = Number.isFinite(px) && px > 0 ? px : TEXTURE_WIDTH_PX;
}
export function getActiveTextureWidth(): number {
  return activeTextureWidthPx;
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export function normalize(a: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const l = length(a);
  return l < 1e-12 ? fallback : [a[0] / l, a[1] / l, a[2] / l];
}

/** Size of one texel at the equator in km: the globe texture is 360 degrees wide. */
export function texelSizeKm(textureWidthPx: number = TEXTURE_WIDTH_PX, radiusKm: number = MARS_RADIUS_KM): number {
  return (2 * Math.PI * radiusKm) / textureWidthPx;
}

export interface ZoomLimitInput {
  /** Height of the canvas in CSS pixels. */
  viewportHeightPx: number;
  fovDeg?: number;
  textureWidthPx?: number;
  maxPxPerTexel?: number;
  radiusKm?: number;
}

/**
 * Closest free-zoom camera distance in planet radii.
 *
 * At altitude h the camera sees 2 h tan(fov / 2) km of surface straight below (vertical field of view). That strip is
 * viewportHeightPx tall, so one texel (5.2 km for a 4096 px texture) is magnified to
 *     px_per_texel = viewportHeightPx * texel / (2 h tan(fov/2)).
 * Requiring px_per_texel <= maxPxPerTexel gives h >= viewportHeightPx * texel / (maxPxPerTexel * 2 tan(fov/2)).
 * Example: 900 px canvas, 42 deg, 3 px per texel: h = 2036 km, distance 1.60 radii (the old minimum, 1.18, magnified a texel to 13 px).
 * Never closer than the atmosphere shell plus SHELL_CLEARANCE, whatever the viewport.
 */
export function minFreeZoomDistance(input: ZoomLimitInput): number {
  const fov = ((input.fovDeg ?? GLOBE_FOV_DEG) * Math.PI) / 180;
  const radiusKm = input.radiusKm ?? MARS_RADIUS_KM;
  const texel = texelSizeKm(input.textureWidthPx ?? activeTextureWidthPx, radiusKm);
  const maxPx = input.maxPxPerTexel ?? MAX_PX_PER_TEXEL;
  const altKm = (Math.max(1, input.viewportHeightPx) * texel) / (maxPx * 2 * Math.tan(fov / 2));
  return Math.max(ATMOSPHERE_SHELL_RADIUS + SHELL_CLEARANCE, 1 + altKm / radiusKm);
}

/** Free-zoom distance clamp: [minFreeZoomDistance, maxDistance]. NaN input falls back to the maximum. */
export function clampFreeDistance(distance: number, viewportHeightPx: number, maxDistance: number): number {
  if (!Number.isFinite(distance)) return maxDistance;
  return Math.max(minFreeZoomDistance({ viewportHeightPx }), Math.min(maxDistance, distance));
}

/** Wheel / pinch step applied to the target distance; always returns a distance that is allowed. */
export function applyZoomStep(current: number, factor: number, viewportHeightPx: number, maxDistance: number): number {
  return clampFreeDistance(current * factor, viewportHeightPx, maxDistance);
}

/** Spherical interpolation between two directions (unit vectors); a safe perpendicular axis is chosen for opposite directions. */
export function slerpUnit(a: Vec3, b: Vec3, t: number): Vec3 {
  const ua = normalize(a);
  const ub = normalize(b);
  const c = Math.max(-1, Math.min(1, dot(ua, ub)));
  if (c > 0.999999) return normalize(add(scale(ua, 1 - t), scale(ub, t)));
  let axisTarget = ub;
  if (c < -0.999999) {
    // antipodal: go over a perpendicular direction
    const perp = Math.abs(ua[1]) < 0.9 ? cross(ua, [0, 1, 0]) : cross(ua, [1, 0, 0]);
    axisTarget = normalize(perp);
    const half = slerpUnit(ua, axisTarget, Math.min(1, t * 2));
    return t <= 0.5 ? half : slerpUnit(axisTarget, ub, (t - 0.5) * 2);
  }
  const theta = Math.acos(c);
  const s = Math.sin(theta);
  return normalize(add(scale(ua, Math.sin((1 - t) * theta) / s), scale(axisTarget, Math.sin(t * theta) / s)));
}

/** Push a position radially out so that it is at least minRadius from the planet centre. */
export function enforceMinRadius(position: Vec3, minRadius: number): Vec3 {
  const r = length(position);
  if (r >= minRadius) return position;
  if (r < 1e-9) return [0, 0, minRadius];
  return scale(position, minRadius / r);
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/**
 * Free-look camera: the direction blends from +Z towards the (rotated) AOI direction as the user zooms in, on the sphere,
 * at the scalar distance `distance`. Replaces the old chord interpolation.
 */
export function freeCameraPose(distance: number, zoomFactor: number, aoiDir: Vec3, minRadius: number): CameraPose {
  const f = Math.max(0, Math.min(1, zoomFactor)) * 0.85;
  const dir = slerpUnit([0, 0, 1], aoiDir, f);
  const position = enforceMinRadius(scale(dir, distance), minRadius);
  const target = scale(normalize(aoiDir), Math.max(0, Math.min(1, zoomFactor)) * 0.5);
  return { position, target };
}

/** Cubic ease in-out used by the legacy fly-in. */
export function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Legacy fly-in (autopilot, reduced motion): from (0, 0, startDist) to endDist above the AOI. The path is a slerp of the
 * direction with an eased scalar radius, so it can never cut through the planet, whatever side the AOI is on.
 */
export function flyInPose(progress: number, aoiDir: Vec3, startDist: number, endDist: number, minRadius: number): CameraPose & { distance: number } {
  const e = easeInOutCubic(progress);
  const distance = startDist + (endDist - startDist) * e;
  const dir = slerpUnit([0, 0, 1], aoiDir, e);
  return { position: enforceMinRadius(scale(dir, distance), minRadius), target: normalize(aoiDir), distance };
}

/** What the OLD code did, kept only so the regression test can show the bug: a straight line between two points. */
export function legacyChordPosition(distance: number, factor: number, aoiDir: Vec3): Vec3 {
  const a: Vec3 = [0, 0, distance];
  const b = scale(normalize(aoiDir), distance);
  return add(scale(a, 1 - factor), scale(b, factor));
}

/**
 * Opacity multiplier of the atmosphere shell as a function of the camera radius: 1 outside the shell, falling to 0 at
 * 1.015 radii (about 51 km up). Seen from inside, a back-face shell would cover the whole screen with glow (the lilac haze),
 * so inside the shell there is no overlay at all: entry is told by the exposure/dust grade of the director instead.
 */
export function atmosphereFade(cameraRadius: number): number {
  const lo = 1.015;
  const hi = ATMOSPHERE_SHELL_RADIUS;
  const x = Math.max(0, Math.min(1, (cameraRadius - lo) / (hi - lo)));
  return x * x * (3 - 2 * x);
}
