/**
 * flyTo.ts - Pure functions for camera path interpolation with smooth ease-in-out,
 * ballistic flight arc, and minimum terrain clearance enforcement.
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vector3D;
  target: Vector3D; // Camera lookAt focal point
}

export interface FlyToOptions {
  /**
   * Minimum vertical clearance above the terrain surface in meters (default: 50m).
   */
  minClearance?: number;
  /**
   * Peak arc altitude offset in meters. If omitted, auto-scaled to 20% of horizontal distance.
   */
  arcHeight?: number;
  /**
   * Optional elevation sampling function getTerrainElevation(x, z) in meters.
   */
  getTerrainElevation?: (x: number, z: number) => number;
}

/**
 * Clamps a number between min and max.
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Linear interpolation between a and b.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Component-wise linear interpolation between two 3D vectors.
 */
export function lerpVector3(a: Vector3D, b: Vector3D, t: number): Vector3D {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

/**
 * Euclidean distance between two 3D vectors.
 */
export function distanceVector3(a: Vector3D, b: Vector3D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Standard cubic ease-in-out function for smooth acceleration and deceleration.
 * Maps t in [0, 1] to [0, 1].
 */
export function easeInOutCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Interpolates smoothly between startPose and endPose at normalized time t in [0, 1].
 * Features:
 * - Cubic ease-in-out timing
 * - Bell-shaped vertical flight arc for cinematic transition
 * - Minimum ground clearance guarantee via optional terrain elevation sampler
 */
export function interpolateCameraPose(
  start: CameraPose,
  end: CameraPose,
  t: number,
  options?: FlyToOptions
): CameraPose {
  const clampedT = clamp(t, 0, 1);
  const eased = easeInOutCubic(clampedT);

  // Smoothly interpolate look-at target
  const target = lerpVector3(start.target, end.target, eased);

  // Base linear path for position
  const basePos = lerpVector3(start.position, end.position, eased);

  // Compute parabolic/sinusoidal flight arc height
  const dist = distanceVector3(start.position, end.position);
  const minClearance = options?.minClearance ?? 50;

  let arcHeight = options?.arcHeight;
  if (arcHeight === undefined) {
    // Auto-scale arc: 20% of distance, clamped between 50m and 2500m
    arcHeight = clamp(dist * 0.2, 50, 2500);
  }

  // Bell-shaped vertical arc offset (sin(pi * eased) reaches 1 at eased=0.5, 0 at endpoints)
  const arcOffset = arcHeight * Math.sin(Math.PI * eased);
  let finalY = basePos.y + arcOffset;

  // Enforce terrain clearance if elevation sampler provided
  if (options?.getTerrainElevation) {
    const groundElevation = options.getTerrainElevation(basePos.x, basePos.z);
    const minAllowedY = groundElevation + minClearance;
    if (finalY < minAllowedY) {
      finalY = minAllowedY;
    }
  }

  return {
    position: {
      x: basePos.x,
      y: finalY,
      z: basePos.z,
    },
    target,
  };
}

/**
 * Creates an offset camera pose looking down at a ground target position.
 * @param target Ground point { x, z, elevation }
 * @param distance Distance from camera to target in meters (default: 2000m)
 * @param pitchDeg Angle above horizon in degrees (default: 45°)
 * @param headingDeg Azimuth heading angle in degrees (default: 0° / looking North)
 */
export function createLookAtPose(
  target: { x: number; z: number; elevation?: number },
  distance = 2000,
  pitchDeg = 45,
  headingDeg = 0
): CameraPose {
  const elev = target.elevation ?? 0;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const headingRad = (headingDeg * Math.PI) / 180;

  const horizDist = distance * Math.cos(pitchRad);
  const vertDist = distance * Math.sin(pitchRad);

  // Camera is positioned back along the heading vector
  const camX = target.x - horizDist * Math.sin(headingRad);
  const camZ = target.z + horizDist * Math.cos(headingRad);
  const camY = elev + vertDist;

  return {
    position: { x: camX, y: camY, z: camZ },
    target: { x: target.x, y: elev, z: target.z },
  };
}
