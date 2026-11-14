/**
 * globeMotion.ts - pure helpers for the globe's camera framing and motion (no three.js, no React).
 *
 * - deck framing: the planet shrinks to sit between the top and bottom carousel panels
 * - focus arc: a turn to a point follows a curved path with a slight tilt and a soft landing
 * - click pulse: envelope of the expanding ring drawn on the surface
 */

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

/** Seconds the idle <-> deck transition takes. */
export const FRAMING_SECONDS = 0.7;
/** Share of the viewport height the planet's disc may take in "deck" mode (the rest is the two carousels and the glow). */
export const DECK_PLANET_FRACTION = 0.52;
/** Auto-rotation speed multiplier in "deck" (it slows down but never stops). */
export const DECK_ROTATE_FACTOR = 0.3;

/**
 * Camera distance at which a unit sphere's disc covers `fraction` of the viewport height
 * (also limited to 90 % of the width on narrow screens). Disc height / viewport height = 1 / (sqrt(d^2 - 1) * tan(fov / 2)).
 */
export function deckDistance(fovDeg: number, aspect: number, fraction = DECK_PLANET_FRACTION): number {
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  const f = Math.max(0.05, Math.min(fraction, 0.9 * Math.max(0.1, aspect)));
  const s = 1 / (f * tanHalf);
  return Math.sqrt(1 + s * s);
}

/**
 * Distance with the framing blended in (t = 0 free camera, t = 1 deck). In deck the whole zoom scale is stretched so that
 * the default distance lands on `deckDist`; the user's own zoom still works (zooming in is proportional), and the camera
 * never gets closer than it was.
 */
export function framedDistance(distance: number, deckDist: number, t: number, reference: number): number {
  const k = Math.max(1, deckDist / reference);
  return distance * (1 + (k - 1) * clamp01(t));
}

/** Duration (s) of a turn-to-face arc for an angular span in radians. */
export function arcDuration(span: number): number {
  return Math.max(0.85, Math.min(1.9, 0.75 + span * 0.85));
}

export interface ArcStep {
  /** eased progress 0..1 along the straight rotation difference */
  e: number;
  /** sideways bulge of the rotation path (radians, perpendicular to the move) */
  bulge: number;
  /** view roll (radians) */
  roll: number;
  /** relative camera pull-back at the middle of the move */
  lift: number;
}

/** State of the arc at raw progress u (0..1) for a turn of `span` radians; bulge, roll and lift are 0 at both ends. */
export function arcStep(u: number, span: number): ArcStep {
  const x = clamp01(u);
  const b = Math.sin(Math.PI * x);
  const k = Math.min(1, span / 1.2);
  return { e: easeInOutCubic(x), bulge: b * 0.14 * k, roll: b * 0.07 * k, lift: b * 0.05 * k };
}

/** Pulse ring envelope at time t seconds: radius factor 0..1 and opacity. Ends at `duration`. */
export function pulseEnvelope(t: number, duration = 1.1): { radius: number; opacity: number; done: boolean } {
  const u = clamp01(t / duration);
  return { radius: easeOutCubic(u), opacity: Math.pow(1 - u, 1.6), done: t >= duration };
}
