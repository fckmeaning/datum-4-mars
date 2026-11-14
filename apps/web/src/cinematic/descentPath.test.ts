import { describe, it, expect } from "vitest";
import { Euler, Vector3 } from "three";
import {
  DESCENT_DURATION_S,
  ENTRY_ALTITUDE_KM,
  FINAL_ALTITUDE_KM,
  MAX_FOV_DEG,
  REDUCED_MOTION_DURATION_S,
  SKIP_FADE_S,
  START_FOV_DEG,
  altitudeAt,
  applyPlanetRotation,
  descentFrame,
  formatAltitude,
  reducedMotionFrame,
  skipFrame,
  subCameraPoint,
  type DescentFrame,
  type DescentParams,
} from "./descentPath";
import { length, type Vec3 } from "../globe/cameraSafety";
import { latLonToVector3 } from "../globe/orbit";
import { rotationToFace } from "../globe/scriptedPose";

const GALE = { lat: -4.5895, lon: 137.4417 };
const PARAMS: DescentParams = { aoi: GALE, start: { rotX: 0.12, rotY: 0.7, distance: 3.2 } };
const FPS = 60;

function frames(params: DescentParams = PARAMS, seconds = DESCENT_DURATION_S, fps = FPS): DescentFrame[] {
  const out: DescentFrame[] = [];
  const n = Math.round(seconds * fps);
  for (let i = 0; i <= n; i++) out.push(descentFrame(params, i / fps));
  return out;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("start: the first frame equals the free camera", () => {
  it("camera at (0, 0, distance), looking at the planet centre, FOV 42, north up, planet unchanged", () => {
    const f = descentFrame(PARAMS, 0);
    expect(f.pose.position[0]).toBeCloseTo(0, 6);
    expect(f.pose.position[1]).toBeCloseTo(0, 6);
    expect(f.pose.position[2]).toBeCloseTo(3.2, 4);
    expect(length(f.pose.target)).toBeCloseTo(0, 9);
    expect(f.pose.fovDeg).toBeCloseTo(START_FOV_DEG, 6);
    expect(f.pose.up[1]).toBeCloseTo(1, 6);
    expect(f.pose.planetRotation.x).toBeCloseTo(0.12, 9);
    expect(f.pose.planetRotation.y).toBeCloseTo(0.7, 9);
    expect(f.phase).toBe("orbit");
    expect(f.overlay.curtain).toBe(0);
  });

  it("also matches when the user had zoomed in before starting (altitude curve starts at the actual altitude)", () => {
    const f = descentFrame({ ...PARAMS, start: { rotX: 0, rotY: 0, distance: 1.9 } }, 0);
    expect(length(f.pose.position)).toBeCloseTo(1.9, 4);
    expect(f.altitudeKm).toBeCloseTo(0.9 * 3396.19, 0);
  });
});

describe("altitude", () => {
  it("is monotone non-increasing over the whole sequence and reaches the final altitude", () => {
    const all = frames();
    for (let i = 1; i < all.length; i++) expect(all[i]!.altitudeKm).toBeLessThanOrEqual(all[i - 1]!.altitudeKm + 1e-9);
    expect(all.at(-1)!.altitudeKm).toBeCloseTo(FINAL_ALTITUDE_KM, 3);
  });

  it("crosses the 120 km entry threshold once, at the keyed time", () => {
    let crossings = 0;
    const all = frames();
    for (let i = 1; i < all.length; i++) {
      if (all[i - 1]!.altitudeKm > ENTRY_ALTITUDE_KM && all[i]!.altitudeKm <= ENTRY_ALTITUDE_KM) crossings++;
    }
    expect(crossings).toBe(1);
    expect(altitudeAt(7.4)).toBeCloseTo(ENTRY_ALTITUDE_KM, 6);
  });

  it("the camera radius is always above the surface by the altitude (never inside the planet)", () => {
    for (const f of frames()) {
      expect(length(f.pose.position)).toBeGreaterThan(1.0);
      expect(length(f.pose.position)).toBeGreaterThanOrEqual(1 + (FINAL_ALTITUDE_KM / 3396.19) * 0.5 - 1e-12);
    }
  });
});

describe("continuity at 60 fps (no jumps)", () => {
  const all = frames();
  it("camera position steps are bounded and have no kinks (second difference is small)", () => {
    let worst = 0;
    let kink = 0;
    for (let i = 1; i < all.length; i++) {
      worst = Math.max(worst, dist(all[i]!.pose.position, all[i - 1]!.pose.position));
      if (i >= 2) {
        const a = all[i - 2]!.pose.position;
        const b = all[i - 1]!.pose.position;
        const c = all[i]!.pose.position;
        kink = Math.max(kink, Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]));
      }
    }
    expect(worst).toBeLessThan(0.08); // scene units = planet radii per frame (about 4.8 radii/s at the fastest point of the dive)
    expect(kink).toBeLessThan(0.012);
  });

  it("look-at, up vector, FOV and planet rotation are continuous", () => {
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]!.pose;
      const b = all[i]!.pose;
      expect(dist(a.target, b.target)).toBeLessThan(0.04);
      expect(dist(a.up, b.up)).toBeLessThan(0.05);
      expect(Math.abs(a.fovDeg - b.fovDeg)).toBeLessThan(0.8); // a deliberate fast widening, not a jump (a jump is > 1 degree)
      expect(Math.abs(a.planetRotation.y - b.planetRotation.y)).toBeLessThan(0.025); // peak about 1.2 degrees per frame (about 60 deg/s): Gale starts on the far side, the planet turns about 180 degrees
      expect(Math.abs(a.planetRotation.x - b.planetRotation.x)).toBeLessThan(0.025);
      expect(length(b.up)).toBeCloseTo(1, 6);
    }
  });

  it("FOV has no kinks (second difference of the FOV curve is tiny)", () => {
    let kink = 0;
    for (let i = 2; i < all.length; i++) kink = Math.max(kink, Math.abs(all[i]!.pose.fovDeg - 2 * all[i - 1]!.pose.fovDeg + all[i - 2]!.pose.fovDeg));
    expect(kink).toBeLessThan(0.15);
  });

  it("FOV stays inside 42..62 degrees and widens during the dive", () => {
    let max = 0;
    for (const f of all) {
      expect(f.pose.fovDeg).toBeGreaterThanOrEqual(START_FOV_DEG - 1e-9);
      expect(f.pose.fovDeg).toBeLessThanOrEqual(MAX_FOV_DEG + 1e-9);
      max = Math.max(max, f.pose.fovDeg);
    }
    expect(max).toBeGreaterThan(55);
  });

  it("the global ease is not linear: slow start, fast middle, soft end", () => {
    const at = (s: number) => descentFrame(PARAMS, s).t;
    expect(at(0.5)).toBeLessThan(0.5 * (DESCENT_DURATION_S / 11) * 0.9); // slower than linear early on
    const mid = at(DESCENT_DURATION_S / 2 + 0.1) - at(DESCENT_DURATION_S / 2 - 0.1);
    const early = at(1.1) - at(0.9);
    expect(mid).toBeGreaterThan(early * 2);
  });
});

describe("arrival", () => {
  const last = descentFrame(PARAMS, DESCENT_DURATION_S);

  it("ends done, above Gale at the final altitude, within 5 km of the AOI", () => {
    expect(last.done).toBe(true);
    const sc = subCameraPoint(last, GALE);
    expect(sc.altitudeKm).toBeCloseTo(FINAL_ALTITUDE_KM, 2);
    expect(sc.distanceToAoiKm).toBeLessThan(5);
    expect(sc.distanceToAoiKm).toBeGreaterThan(2); // an approach pass, not a hover over the marker
  });

  it("the planet is turned so that Gale sits on +Z (east +X, north +Y), matching rotationToFace and three's Euler", () => {
    const a = latLonToVector3(GALE.lat, GALE.lon, 1);
    const v: Vec3 = [a.x, a.y, a.z];
    const { x, y } = last.pose.planetRotation;
    const mine = applyPlanetRotation(v, x, y);
    const three = new Vector3(v[0], v[1], v[2]).applyEuler(new Euler(x, y, 0, "XYZ"));
    expect(mine[0]).toBeCloseTo(three.x, 9);
    expect(mine[2]).toBeCloseTo(three.z, 9);
    expect(mine[2]).toBeCloseTo(1, 6);
    const face = rotationToFace(v);
    expect(Math.cos(x - face.x)).toBeCloseTo(1, 9);
    expect(Math.cos(y - face.y)).toBeCloseTo(1, 9);
  });

  it("looks ahead along the traverse with a gentle pitch-down (target on the ground ahead, camera at 0.6 km)", () => {
    const view: Vec3 = [last.pose.target[0] - last.pose.position[0], last.pose.target[1] - last.pose.position[1], last.pose.target[2] - last.pose.position[2]];
    const horizonal = Math.hypot(view[0], view[1], view[2]);
    const up = last.pose.position;
    const pitch = Math.asin((view[0] * up[0] + view[1] * up[1] + view[2] * up[2]) / (horizonal * length(up)));
    expect((pitch * 180) / Math.PI).toBeLessThan(-2);
    expect((pitch * 180) / Math.PI).toBeGreaterThan(-20);
  });

  it("cross-fades terrain in during the low pass and fades to dark only at the very end", () => {
    expect(descentFrame(PARAMS, 0).overlay.terrainMix).toBe(0);
    expect(last.overlay.terrainMix).toBe(1);
    expect(last.overlay.curtain).toBe(1);
    const midLow = frames().find((f) => f.t > 9.6)!;
    expect(midLow.overlay.terrainMix).toBeGreaterThan(0.3);
    expect(midLow.overlay.curtain).toBe(0);
  });
});

describe("phases, overlay and atmosphere", () => {
  const all = frames();
  it("phases run orbit -> dive -> entry -> lowpass, in order, each at least once", () => {
    const order = ["orbit", "dive", "entry", "lowpass"];
    let idx = 0;
    const seen = new Set<string>();
    for (const f of all) {
      const i = order.indexOf(f.phase);
      expect(i).toBeGreaterThanOrEqual(idx);
      idx = i;
      seen.add(f.phase);
    }
    expect([...seen]).toEqual(order);
  });

  it("the ENTRY badge appears once the camera passes 120 km, and never before", () => {
    for (const f of all) if (f.altitudeKm > ENTRY_ALTITUDE_KM) expect(f.overlay.entryBadge).toBe(0);
    expect(Math.max(...all.map((f) => f.overlay.entryBadge))).toBeGreaterThan(0.9);
  });

  it("limb glow grows and warms on approach (bounded), the AOI pulse completes once during the orbit hold", () => {
    const glows = all.map((f) => f.pose.atmosphereGlow);
    expect(Math.min(...glows)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...glows)).toBeLessThanOrEqual(1.71);
    const at24 = descentFrame(PARAMS, DESCENT_DURATION_S * 0.5).pose.atmosphereWarm;
    expect(at24).toBeGreaterThan(0);
    const pulses = all.map((f) => f.pose.aoiPulse);
    expect(Math.max(...pulses)).toBe(1);
    // monotone 0 -> 1: one pulse, not a loop
    for (let i = 1; i < pulses.length; i++) expect(pulses[i]!).toBeGreaterThanOrEqual(pulses[i - 1]! - 1e-12);
  });

  it("streaks are strongest in the dive and gone before the low pass; dust grade peaks in entry", () => {
    const dive = all.filter((f) => f.phase === "dive");
    expect(Math.max(...dive.map((f) => f.overlay.streak))).toBeGreaterThan(0.5);
    expect(all.filter((f) => f.phase === "lowpass").every((f) => f.overlay.streak < 0.05)).toBe(true);
    expect(all.filter((f) => f.phase === "orbit").every((f) => f.overlay.dust === 0)).toBe(true);
    for (const f of all) {
      for (const v of Object.values(f.overlay)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("duration, skip and reduced motion", () => {
  it("durationS scales the whole timeline", () => {
    const fast = { ...PARAMS, durationS: 5 };
    expect(descentFrame(fast, 4.99).done).toBe(false);
    expect(descentFrame(fast, 5).done).toBe(true);
    expect(descentFrame(fast, 5).altitudeKm).toBeCloseTo(FINAL_ALTITUDE_KM, 3);
  });

  it("skip is a 0.45 s curtain; reduced motion is a 1.5 s fade with no camera script", () => {
    expect(skipFrame(0)).toEqual({ done: false, curtain: 0 });
    expect(skipFrame(SKIP_FADE_S)).toEqual({ done: true, curtain: 1 });
    expect(skipFrame(SKIP_FADE_S / 2).curtain).toBeGreaterThan(0);
    expect(reducedMotionFrame(0).curtain).toBe(0);
    expect(reducedMotionFrame(REDUCED_MOTION_DURATION_S - 0.01).done).toBe(false);
    expect(reducedMotionFrame(REDUCED_MOTION_DURATION_S)).toEqual({ done: true, curtain: 1 });
  });

  it("altitude text uses real units with the right precision", () => {
    expect(formatAltitude(7471.6)).toBe("7,472 km");
    expect(formatAltitude(320.4)).toBe("320 km");
    expect(formatAltitude(18.26)).toBe("18.3 km");
    expect(formatAltitude(2.5)).toBe("2.50 km");
    expect(formatAltitude(0.6)).toBe("600 m");
  });
});
