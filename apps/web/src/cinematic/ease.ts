/**
 * ease.ts - timing curves for the descent. Nothing in the cinematic moves linearly.
 */

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Ken Perlin's smootherstep: zero first AND second derivative at both ends. */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * CSS-style cubic-bezier(x1, y1, x2, y2) as a function y = f(x), x in [0, 1]: Newton steps with a bisection fallback.
 * x1 and x2 must be in [0, 1] (so that x(t) is monotone), as in CSS.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) throw new RangeError("cubicBezier: x1 and x2 must be within [0, 1]");
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 48; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** The descent's signature curve: a slow committed start, a long glide, a soft landing. */
export const CINE_EASE = cubicBezier(0.65, 0, 0.18, 1);

/**
 * Monotone piecewise-cubic Hermite interpolation (Fritsch-Carlson / PCHIP): passes through every point, never overshoots,
 * and is monotone wherever the data are. Used for altitude (in log space) so that the camera never bounces.
 * Outside [xs[0], xs[n-1]] the end values are held.
 */
export function pchip(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  if (n < 2 || ys.length !== n) throw new RangeError("pchip needs at least two points and matching arrays");
  for (let i = 1; i < n; i++) if (!(xs[i]! > xs[i - 1]!)) throw new RangeError("pchip: xs must be strictly increasing");

  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1]! - xs[i]!);
    delta.push((ys[i + 1]! - ys[i]!) / h[i]!);
  }
  const m = new Array<number>(n).fill(0);
  if (n === 2) {
    m[0] = delta[0]!;
    m[1] = delta[0]!;
  } else {
    for (let i = 1; i < n - 1; i++) {
      const d0 = delta[i - 1]!;
      const d1 = delta[i]!;
      if (d0 * d1 <= 0) {
        m[i] = 0;
      } else {
        const w1 = 2 * h[i]! + h[i - 1]!;
        const w2 = h[i]! + 2 * h[i - 1]!;
        m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
      }
    }
    const endSlope = (h0: number, h1: number, d0: number, d1: number): number => {
      let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
      if (Math.sign(s) !== Math.sign(d0)) s = 0;
      else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > 3 * Math.abs(d0)) s = 3 * d0;
      return s;
    };
    m[0] = endSlope(h[0]!, h[1]!, delta[0]!, delta[1]!);
    m[n - 1] = endSlope(h[n - 2]!, h[n - 3]!, delta[n - 2]!, delta[n - 3]!);
  }

  return (x: number): number => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]!) i++;
    const t = (x - xs[i]!) / h[i]!;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h[i]! * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h[i]! * m[i + 1]!
    );
  };
}

/** Wrap an angle in radians to (-pi, pi]. */
export function wrapPi(a: number): number {
  const twoPi = 2 * Math.PI;
  let r = a % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r <= -Math.PI) r += twoPi;
  return r;
}
