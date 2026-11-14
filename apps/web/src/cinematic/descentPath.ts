/**
 * descentPath.ts - the whole cinematic as a pure function of time: descentFrame(params, elapsedSeconds).
 * No DOM, no WebGL, no clock: deterministic and testable.
 *
 * World frame during the descent: the planet is turned so that the AOI (Gale) is on +Z, with east = +X and north = +Y
 * (see rotationToFace in globe/scriptedPose.ts). The camera is described around the AOI normal by
 *     position = r * (cos(psi) * Z + sin(psi) * (cos(phi) * E + sin(phi) * N)),   r = 1 + altitude / R_mars,
 * i.e. always on a sphere above the surface: altitude is a separate, monotone, log-space PCHIP curve, so the camera can
 * never cut through the planet. The look-at point slides from the planet centre (matches the free camera at t = 0) to the
 * AOI, then ahead along the Curiosity traverse; the up vector turns from "north up" to "local up" as the horizon appears.
 *
 * Timeline (11 s, seconds):  0-2.4 high orbit (slow spin, slight roll, the AOI marker pulses once)
 *   2.4-7.4 the dive: the planet turns the AOI under the camera while the camera curves round the limb, FOV widens with speed
 *   7.4 "ENTRY INTERFACE" at 120 km (Karman-style threshold, Mars)   7.4-9.0 atmospheric entry (limb glow warms, exposure/dust grade)
 *   9.0-11 low pass: hand-over to the real terrain, glide at about 0.6 km, then a fade into the planner.
 * The altitude counter is real in value (km above the reference sphere) but TIME-COMPRESSED: a real entry takes minutes.
 */

import { MARS_RADIUS_KM, radiusToAltitudeKm } from "../globe/altitude";
import { cross, dot, enforceMinRadius, normalize, scale, add, sub, length, type Vec3 } from "../globe/cameraSafety";
import { latLonToVector3 } from "../globe/orbit";
import { rotationToFace, type ScriptedPose } from "../globe/scriptedPose";
import { CINE_EASE, clamp01, pchip, smootherstep, smoothstep, wrapPi } from "./ease";

export const DESCENT_DURATION_S = 11;
export const REDUCED_MOTION_DURATION_S = 1.5;
export const SKIP_FADE_S = 0.45;
/** Altitude at which the "ENTRY INTERFACE" badge fires, km. */
export const ENTRY_ALTITUDE_KM = 120;
/** The planet's idle spin in the globe (rad/s): the hold phase continues it, so the start is seamless. */
export const IDLE_SPIN_RAD_S = 0.06;
export const START_FOV_DEG = 42;
export const MAX_FOV_DEG = 62;
export const FINAL_ALTITUDE_KM = 0.6;

export interface DescentParams {
  aoi: { lat: number; lon: number };
  /** Planet orientation (Euler XY, radians) and camera distance (radii) when the descent starts. */
  start: { rotX: number; rotY: number; distance: number };
  /** Total duration, seconds (the key times scale with it). */
  durationS?: number;
}

export type DescentPhase = "orbit" | "dive" | "entry" | "lowpass";

export interface DescentOverlay {
  /** 0..1 radial speed streaks (CSS), strongest in the dive. */
  streak: number;
  /** 0..1 vignette strength. */
  vignette: number;
  /** 0..1 dust/exposure grade during entry (warm tint + slight desaturation; never a white flash). */
  dust: number;
  /** 0..1 how much of the real terrain scene is cross-faded in over the globe. */
  terrainMix: number;
  /** 0..1 dark curtain at the very end (the planner fades in from it). */
  curtain: number;
  /** 0..1 intensity of the "ENTRY INTERFACE" badge. */
  entryBadge: number;
}

export interface DescentFrame {
  /** Internal timeline seconds (0..DESCENT_DURATION_S). */
  t: number;
  /** elapsed / duration, 0..1. */
  progress: number;
  done: boolean;
  phase: DescentPhase;
  altitudeKm: number;
  pose: ScriptedPose;
  overlay: DescentOverlay;
  hud: { altitudeText: string; phaseLabel: string; coordsText: string };
}

// ---------------------------------------------------------------- keyframes (seconds, internal timeline)
const ALT_T = [0, 2.4, 3.6, 4.8, 6.4, 7.4, 8.6, 9.8, 11] as const;
/** Altitude at the default camera distance (3.2 radii), km. */
export const DEFAULT_START_ALTITUDE_KM = 7471.6;

/** Altitude curve (log-space PCHIP) that starts at the camera's actual altitude, so the first frame equals the free camera. */
function makeAltitudeCurve(startAltKm: number): (t: number) => number {
  const a0 = Math.max(startAltKm, 1600);
  const a1 = a0 * 0.91; // the hold phase drifts down slightly
  const a2 = Math.min(4300, a1 * 0.65); // the dive eases in: no abrupt start of the steep part
  const a3 = Math.min(1300, a2 * 0.3);
  const km = [a0, a1, a2, a3, Math.min(320, a3 * 0.25), ENTRY_ALTITUDE_KM, 20, 2.5, FINAL_ALTITUDE_KM];
  return pchip(ALT_T, km.map((a) => Math.log(a)));
}
const curveCache = new Map<number, (t: number) => number>();
function altitudeCurve(startAltKm: number): (t: number) => number {
  const key = Math.round(startAltKm);
  let c = curveCache.get(key);
  if (!c) {
    c = makeAltitudeCurve(startAltKm);
    curveCache.set(key, c);
  }
  return c;
}

/** Angular distance of the camera from the AOI normal, degrees. */
const PSI_T = [0, 2.4, 4.6, 6.4, 7.4, 8.6, 9.8, 11] as const;
const PSI_DEG = [0, 0, 34, 12, 3.2, 0.55, 0.16, (4 / MARS_RADIUS_KM) * (180 / Math.PI)] as const;
const psiDeg = pchip(PSI_T, PSI_DEG);

/** Bearing of the camera around the AOI (degrees, 0 = east, 90 = north): it swings from the south-west round to the north-east. */
const PHI_T = [2.4, 4.6, 6.4, 7.4, 8.6, 11] as const;
const PHI_DEG = [200, 150, 90, 60, 45, 45] as const;
const phiDeg = pchip(PHI_T, PHI_DEG);

/** The planet's turn is timed on the raw (un-eased) clock: the global ease would speed it up 2.6x (210 deg/s); this keeps it near 60 deg/s. */
const RAW_ROTATE_START = 0.02;
const RAW_ROTATE_END = 0.5;
const LOOK_AHEAD_KM = 6;

export function altitudeAt(t: number, startAltKm: number = DEFAULT_START_ALTITUDE_KM): number {
  return Math.exp(altitudeCurve(startAltKm)(Math.max(0, Math.min(DESCENT_DURATION_S, t))));
}

/** Descent rate in km per timeline second (positive when going down). */
export function descentRateAt(t: number, startAltKm: number = DEFAULT_START_ALTITUDE_KM, h = 1e-3): number {
  return (altitudeAt(t - h, startAltKm) - altitudeAt(t + h, startAltKm)) / (2 * h);
}
const RATE_REF = 1100; // km/s of timeline: the fastest part of the dive maps to 1

// ---------------------------------------------------------------- small vector helpers
const E: Vec3 = [1, 0, 0];
const N: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];

/** Rotation R = Rx(x) Ry(y) (three.js Euler XYZ with z = 0) applied to v. */
export function applyPlanetRotation(v: Vec3, x: number, y: number): Vec3 {
  const cb = Math.cos(y);
  const sb = Math.sin(y);
  const v1: Vec3 = [v[0] * cb + v[2] * sb, v[1], -v[0] * sb + v[2] * cb];
  const ca = Math.cos(x);
  const sa = Math.sin(x);
  return [v1[0], v1[1] * ca - v1[2] * sa, v1[1] * sa + v1[2] * ca];
}

function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const k = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add(scale(a, 1 - t), scale(b, t));

// ---------------------------------------------------------------- HUD text
export function formatAltitude(altKm: number): string {
  if (altKm >= 1000) return `${Math.round(altKm).toLocaleString("en-US")} km`;
  if (altKm >= 100) return `${altKm.toFixed(0)} km`;
  if (altKm >= 10) return `${altKm.toFixed(1)} km`;
  if (altKm >= 1) return `${altKm.toFixed(2)} km`;
  return `${Math.round(altKm * 1000)} m`;
}

function phaseAt(t: number, altKm: number): DescentPhase {
  if (t < ALT_T[1]) return "orbit";
  if (altKm > ENTRY_ALTITUDE_KM) return "dive";
  if (t < 9.0) return "entry";
  return "lowpass";
}

const PHASE_LABEL: Record<DescentPhase, string> = {
  orbit: "HIGH ORBIT",
  dive: "DESCENT",
  entry: "ATMOSPHERIC ENTRY",
  lowpass: "LOW PASS",
};

// ---------------------------------------------------------------- the frame
export function descentFrame(params: DescentParams, elapsedS: number): DescentFrame {
  const duration = params.durationS ?? DESCENT_DURATION_S;
  const raw = clamp01(elapsedS / duration);
  // the single clock: a global ease (slow committed start, long glide, soft end) over the internal key times
  const t = CINE_EASE(raw) * DESCENT_DURATION_S;
  const done = elapsedS >= duration;

  const startAltKm = Math.max(1, (params.start.distance - 1) * MARS_RADIUS_KM);
  const altKm = altitudeAt(t, startAltKm);
  const r = 1 + altKm / MARS_RADIUS_KM;
  const rate = descentRateAt(t, startAltKm);
  // speed-driven effects use a smooth "dive" envelope modulated by the actual descent rate (a raw rate has kinks)
  const dive = smootherstep(2.3, 5.4, t) * (1 - smootherstep(6.2, 8.2, t));
  const speedNorm = dive * (0.7 + 0.3 * Math.tanh(rate / RATE_REF)); // tanh: smooth saturation, a clamp would put a kink in the FOV

  // planet orientation: continues the idle spin, then turns the AOI to +Z
  const aoiLocal = latLonToVector3(params.aoi.lat, params.aoi.lon, 1);
  const aoiVec: Vec3 = [aoiLocal.x, aoiLocal.y, aoiLocal.z];
  const face = rotationToFace(aoiVec);
  const w = smootherstep(RAW_ROTATE_START, RAW_ROTATE_END, raw);
  const ryDriftAtBlendStart = params.start.rotY + IDLE_SPIN_RAD_S * RAW_ROTATE_START * duration;
  const ryTarget = ryDriftAtBlendStart + wrapPi(face.y - ryDriftAtBlendStart);
  const ryDrift = params.start.rotY + IDLE_SPIN_RAD_S * Math.min(elapsedS, RAW_ROTATE_START * duration);
  const rotY = ryDrift * (1 - w) + ryTarget * w;
  const rotX = params.start.rotX * (1 - w) + face.x * w;
  const aoiWorld = applyPlanetRotation(aoiVec, rotX, rotY);

  // camera position on the sphere around +Z
  const psi = (psiDeg(t) * Math.PI) / 180;
  const phi = (phiDeg(Math.max(t, PHI_T[0])) * Math.PI) / 180;
  const tangent = add(scale(E, Math.cos(phi)), scale(N, Math.sin(phi)));
  const dirAbove = add(scale(Z, Math.cos(psi)), scale(tangent, Math.sin(psi)));
  // at t = 0: psi = 0 and the altitude equals the free camera's, so the pose is exactly (0, 0, distance)
  const position = enforceMinRadius(scale(dirAbove, r), 1 + (FINAL_ALTITUDE_KM / MARS_RADIUS_KM) * 0.5);

  // look-at: planet centre -> AOI -> ahead along the traverse
  const heading = scale(add(scale(E, Math.cos(phi)), scale(N, Math.sin(phi))), -1);
  const aheadAngle = LOOK_AHEAD_KM / MARS_RADIUS_KM;
  const aheadPoint = add(scale(Z, Math.cos(aheadAngle)), scale(heading, Math.sin(aheadAngle)));
  const kAoi = smoothstep(2.4, 5.0, t);
  const kAhead = smoothstep(7.8, 10.6, t);
  const toAoi = lerp3([0, 0, 0], aoiWorld, kAoi);
  const target = lerp3(toAoi, aheadPoint, kAhead);

  // up vector: north-up from orbit, local up near the ground, with a little roll in orbit
  const localUp = normalize(position);
  const lp = smoothstep(5.2, 8.6, t);
  let up = normalize(lerp3(N, localUp, lp));
  const view = normalize(sub(target, position), [0, 0, -1]);
  const roll = ((2.2 * Math.PI) / 180) * Math.sin(Math.PI * smoothstep(0, 4.6, t)) * (1 - lp);
  up = rotateAbout(up, view, roll);
  // keep up well-defined (not parallel to the view direction)
  if (Math.abs(dot(normalize(up), view)) > 0.999) up = normalize(cross(view, E));

  // field of view widens with speed, then relaxes into a wide terrain lens
  const lowpass = smoothstep(8.6, 11, t);
  const fovDeg = Math.min(MAX_FOV_DEG, START_FOV_DEG + 20 * speedNorm + 11 * lowpass);

  // atmosphere: the limb glow grows and warms on approach; the shell itself fades with the camera radius (MarsGlobe)
  const glow = 1 + 0.7 * smoothstep(3.0, 6.4, t);
  const warm = smoothstep(5.0, 7.0, t);
  const pulse = clamp01((t - 0.6) / 1.6);

  const phase = phaseAt(t, altKm);
  const entryEnd = 7.4 + 1.4;
  const entryBadge = t >= 7.4 && t <= entryEnd + 0.4 ? smoothstep(7.4, 7.7, t) * (1 - smoothstep(entryEnd - 0.3, entryEnd + 0.4, t)) : 0;

  const overlay: DescentOverlay = {
    streak: speedNorm * (1 - smoothstep(7.0, 8.4, t)),
    vignette: 0.22 + 0.33 * smoothstep(6.4, 8.4, t),
    dust: smoothstep(7.0, 9.2, t) * (1 - 0.35 * smoothstep(9.8, 11, t)),
    terrainMix: smoothstep(9.0, 10.2, t),
    curtain: smoothstep(10.45, 11, t),
    entryBadge,
  };

  const lat = params.aoi.lat;
  const lon = params.aoi.lon;
  return {
    t,
    progress: raw,
    done,
    phase,
    altitudeKm: altKm,
    pose: {
      position,
      target,
      up,
      fovDeg,
      planetRotation: { x: rotX, y: rotY },
      atmosphereGlow: glow,
      atmosphereWarm: warm,
      aoiPulse: pulse,
    },
    overlay,
    hud: {
      altitudeText: formatAltitude(altKm),
      phaseLabel: PHASE_LABEL[phase],
      coordsText: `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? "S" : "N"}  ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? "W" : "E"}`,
    },
  };
}

/** Reduced motion: no camera script, a short fade out of the current screen. */
export function reducedMotionFrame(elapsedS: number): { done: boolean; curtain: number } {
  return { done: elapsedS >= REDUCED_MOTION_DURATION_S, curtain: smootherstep(0, REDUCED_MOTION_DURATION_S, elapsedS) };
}

/** Skip: a quick dark curtain. */
export function skipFrame(sinceSkipS: number): { done: boolean; curtain: number } {
  return { done: sinceSkipS >= SKIP_FADE_S, curtain: smoothstep(0, SKIP_FADE_S, sinceSkipS) };
}

/** Geographic position (lat/lon degrees) straight below the camera, in the planet's rotated frame: used by tests and the HUD. */
export function subCameraPoint(frame: DescentFrame, aoi: { lat: number; lon: number }): { altitudeKm: number; distanceToAoiKm: number } {
  const { position, planetRotation } = frame.pose;
  const aoiLocal = latLonToVector3(aoi.lat, aoi.lon, 1);
  const aoiWorld = applyPlanetRotation([aoiLocal.x, aoiLocal.y, aoiLocal.z], planetRotation.x, planetRotation.y);
  const dirCam = normalize(position);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(dirCam, aoiWorld))));
  return { altitudeKm: radiusToAltitudeKm(length(position)), distanceToAoiKm: angle * MARS_RADIUS_KM };
}
