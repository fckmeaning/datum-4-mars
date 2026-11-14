/**
 * scriptedPose.ts - the contract between a camera director (src/cinematic) and the globe scene.
 *
 * While `descentPoseRef.current` is not null the globe ignores user input and its own camera logic and applies this pose
 * every frame (world space; the planet is rotated by `planetRotation`, an Euler XYZ pair in radians). The director writes
 * the ref from its own clock; nothing here triggers a React render.
 */

import type { Vec3 } from "./cameraSafety";

export interface ScriptedPose {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  /** Vertical field of view, degrees. */
  fovDeg: number;
  /** Planet orientation (Euler XYZ, radians). */
  planetRotation: { x: number; y: number };
  /** Multiplier of the atmosphere limb glow (1 = normal). */
  atmosphereGlow: number;
  /** 0..1, shifts the glow colour towards warm dust. */
  atmosphereWarm: number;
  /** 0..1, one-shot pulse of the Gale marker ring. */
  aoiPulse: number;
}

export interface PoseRef {
  current: ScriptedPose | null;
}

/** Shared by every MarsGlobe instance (start menu background and /globe), so a director can script whichever is mounted. */
export const descentPoseRef: PoseRef = { current: null };

/**
 * Euler XYZ rotation (x, y in radians; z = 0) that carries the unit vector v to +Z.
 * R = Rx(a) Ry(b): v.y = sin a, tan b = -v.x / v.z.
 */
export function rotationToFace(v: Vec3): { x: number; y: number } {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  const x = v[0] / l;
  const y = v[1] / l;
  const z = v[2] / l;
  return { x: Math.asin(Math.max(-1, Math.min(1, y))), y: Math.atan2(-x, z) };
}

/**
 * Live state of the interactive globe, published by MarsGlobe every frame while nobody scripts it. A director reads it when a
 * descent starts so that the first scripted frame equals the last free frame (no jump).
 */
export interface GlobeLiveState {
  rotX: number;
  rotY: number;
  /** Camera distance in planet radii. */
  distance: number;
}
export const globeStateRef: { current: GlobeLiveState } = { current: { rotX: 0.12, rotY: 0, distance: 3.2 } };
