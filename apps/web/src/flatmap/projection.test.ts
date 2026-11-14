import { describe, expect, it } from "vitest";
import {
  KM_PER_DEG,
  MAX_SCALE,
  POLE_MARGIN_PX,
  circleRadiiDeg,
  clampView,
  flyView,
  formatLatLabel,
  formatLonLabel,
  graticuleLines,
  graticuleStep,
  lonDelta,
  minScale,
  panBy,
  project,
  scaleBar,
  unproject,
  viewCentredOn,
  wrapLon,
  zoomAt,
  type MapSize,
  type MapView,
} from "./projection";

const SIZE: MapSize = { w: 1280, h: 800 };

describe("longitude wrapping", () => {
  it("wraps to [-180, 180)", () => {
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(180)).toBe(-180);
    expect(wrapLon(-180)).toBe(-180);
    expect(wrapLon(354.47)).toBeCloseTo(-5.53, 9);
    expect(wrapLon(540)).toBe(-180);
    expect(wrapLon(-190)).toBe(170);
  });

  it("gives the shortest signed difference across the seam", () => {
    expect(lonDelta(170, -170)).toBe(-20);
    expect(lonDelta(-170, 170)).toBe(20);
    expect(lonDelta(10, 0)).toBe(10);
    expect(Math.abs(lonDelta(0, 180))).toBe(180);
  });
});

describe("project / unproject", () => {
  const view: MapView = { lon: 20, lat: 10, scale: 8 };

  it("puts the view centre in the middle of the screen", () => {
    const p = project(view, SIZE, 10, 20);
    expect(p.x).toBe(640);
    expect(p.y).toBe(400);
  });

  it("north is up and east is right", () => {
    const c = project(view, SIZE, 10, 20);
    expect(project(view, SIZE, 20, 20).y).toBeLessThan(c.y);
    expect(project(view, SIZE, 10, 30).x).toBeGreaterThan(c.x);
    expect(project(view, SIZE, 20, 20).y).toBeCloseTo(c.y - 10 * 8, 9);
  });

  it("round-trips any point on screen", () => {
    for (const [x, y] of [
      [100, 120],
      [640, 400],
      [1200, 700],
      [3, 790],
    ] as const) {
      const g = unproject(view, SIZE, x, y);
      const back = project(view, SIZE, g.lat, g.lon);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
  });

  it("wraps horizontally: a site at 354.47 E sits beside one at -5 E", () => {
    const v: MapView = { lon: -5, lat: 0, scale: 4 };
    const a = project(v, SIZE, -1.95, 354.47);
    const b = project(v, SIZE, -1.95, -5.53);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(Math.abs(a.x - 640)).toBeLessThan(4);
  });

  it("draws a place at the copy nearest the centre when the view crosses the antimeridian", () => {
    const v: MapView = { lon: 179, lat: 0, scale: 4 };
    // Gusev at 175.47 E is just west of the centre; Chryse at -47.97 E is far; a point at -179 E is 2 degrees east
    expect(project(v, SIZE, 0, 175.47).x).toBeLessThan(640);
    expect(project(v, SIZE, 0, -179).x).toBeCloseTo(640 + 2 * 4, 9);
  });

  it("reports points beyond the poles as outside", () => {
    const v: MapView = { lon: 0, lat: 80, scale: 8 };
    expect(unproject(v, SIZE, 640, 10).inside).toBe(false);
    expect(unproject(v, SIZE, 640, 400).inside).toBe(true);
  });
});

describe("clampView", () => {
  it("never shows more than 360 degrees", () => {
    const v = clampView({ lon: 0, lat: 0, scale: 0.1 }, SIZE);
    expect(v.scale).toBeCloseTo(minScale(SIZE), 9);
    expect(v.scale).toBeCloseTo(1280 / 360, 9);
  });

  it("caps the zoom", () => {
    expect(clampView({ lon: 0, lat: 0, scale: 5000 }, SIZE).scale).toBe(MAX_SCALE);
  });

  it("centres the map when the whole planet is shorter than the screen", () => {
    const v = clampView({ lon: 10, lat: 40, scale: 1280 / 360 }, SIZE);
    expect(v.lat).toBe(0);
  });

  it("stops dragging past the poles (with a small margin)", () => {
    const scale = 20;
    const v = clampView({ lon: 0, lat: 89, scale }, SIZE);
    const limit = 90 - SIZE.h / 2 / scale + POLE_MARGIN_PX / scale;
    expect(v.lat).toBeCloseTo(limit, 9);
    // the pole is then on screen at most POLE_MARGIN_PX away from the edge
    expect(project(v, SIZE, 90, 0).y).toBeCloseTo(SIZE.h / 2 - (90 - limit) * scale, 9);
  });

  it("wraps the longitude", () => {
    expect(clampView({ lon: 190, lat: 0, scale: 8 }, SIZE).lon).toBe(-170);
  });
});

describe("pan and zoom", () => {
  it("dragging right moves the map right (the centre longitude decreases) and wraps across the seam", () => {
    const v = panBy({ lon: -170, lat: 0, scale: 8 }, SIZE, 160, 0);
    expect(v.lon).toBeCloseTo(-190 + 360, 9); // -170 - 20 = -190 -> 170
    expect(panBy({ lon: 0, lat: 0, scale: 8 }, SIZE, 80, 0).lon).toBeCloseTo(-10, 9);
  });

  it("dragging down moves the map down (the centre latitude increases)", () => {
    const v = panBy({ lon: 0, lat: 0, scale: 20 }, SIZE, 0, 100);
    expect(v.lat).toBeCloseTo(5, 9);
  });

  it("zooming keeps the place under the cursor where it is", () => {
    const v: MapView = { lon: 30, lat: 15, scale: 6 };
    const px = 900;
    const py = 250;
    const before = unproject(v, SIZE, px, py);
    for (const f of [1.5, 3, 0.7]) {
      const z = zoomAt(v, SIZE, px, py, f);
      const after = unproject(z, SIZE, px, py);
      expect(after.lat).toBeCloseTo(before.lat, 6);
      expect(after.lon).toBeCloseTo(before.lon, 6);
    }
  });

  it("zooming out stops at the whole planet", () => {
    const z = zoomAt({ lon: 0, lat: 0, scale: 6 }, SIZE, 400, 300, 0.001);
    expect(z.scale).toBeCloseTo(minScale(SIZE), 9);
  });

  it("zooming in stops at the cap", () => {
    expect(zoomAt({ lon: 0, lat: 0, scale: 80 }, SIZE, 400, 300, 50).scale).toBe(MAX_SCALE);
  });
});

describe("viewCentredOn", () => {
  it("puts the place in the middle of the free area between the side panels", () => {
    const insets = { left: 352, right: 300 };
    const v = viewCentredOn(-4.59, 137.44, 12, SIZE, insets);
    const p = project(v, SIZE, -4.59, 137.44);
    expect(p.x).toBeCloseTo(640 + (352 - 300) / 2, 6);
    expect(p.y).toBeCloseTo(400, 6);
  });

  it("works for sites given in 0..360 east", () => {
    const v = viewCentredOn(-1.95, 354.47, 10, SIZE);
    expect(project(v, SIZE, -1.95, 354.47).x).toBeCloseTo(640, 6);
  });
});

describe("flyView", () => {
  const a: MapView = { lon: -170, lat: 0, scale: 4 };
  const b: MapView = { lon: 170, lat: 10, scale: 12 };

  it("starts and ends exactly at the two views", () => {
    const s = flyView(a, b, 0);
    const e = flyView(a, b, 1);
    expect(s.lon).toBeCloseTo(a.lon, 9);
    expect(s.scale).toBeCloseTo(a.scale, 9);
    expect(e.lon).toBeCloseTo(b.lon, 9);
    expect(e.lat).toBeCloseTo(b.lat, 9);
    expect(e.scale).toBeCloseTo(b.scale, 9);
  });

  it("goes the short way round the seam", () => {
    const mid = flyView(a, b, 0.5);
    expect(Math.abs(lonDelta(mid.lon, 180))).toBeLessThan(1); // crosses the antimeridian, not Greenwich
  });

  it("zooms out in the middle of a long hop", () => {
    const mid = flyView(a, b, 0.5);
    expect(mid.scale).toBeLessThan(Math.sqrt(a.scale * b.scale));
  });

  it("does not dip when the target is the same place", () => {
    const same = flyView(a, a, 0.5);
    expect(same.scale).toBeCloseTo(a.scale, 9);
  });
});

describe("graticule and labels", () => {
  it("uses coarser lines when zoomed out and finer ones when zoomed in", () => {
    expect(graticuleStep(3.5)).toBe(30);
    expect(graticuleStep(10)).toBe(10);
    expect(graticuleStep(60)).toBe(2);
    expect(graticuleStep(90)).toBe(1);
    let prev = Infinity;
    for (const s of [3, 6, 12, 25, 50, 90]) {
      const step = graticuleStep(s);
      expect(step).toBeLessThanOrEqual(prev);
      expect(step * s).toBeGreaterThanOrEqual(60);
      prev = step;
    }
  });

  it("lists the multiples of the step inside a range", () => {
    expect(graticuleLines(-95, 95, 30)).toEqual([-90, -60, -30, 0, 30, 60, 90]);
    expect(graticuleLines(2, 28, 10)).toEqual([10, 20]);
    expect(graticuleLines(0.05, 0.45, 0.1)).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("formats latitude and longitude as wall maps do", () => {
    expect(formatLatLabel(0)).toBe("0°");
    expect(formatLatLabel(30)).toBe("30° N");
    expect(formatLatLabel(-45)).toBe("45° S");
    expect(formatLonLabel(0)).toBe("0°");
    expect(formatLonLabel(120)).toBe("120° E");
    expect(formatLonLabel(-90)).toBe("90° W");
    expect(formatLonLabel(180)).toBe("180°");
    expect(formatLonLabel(270)).toBe("90° W");
    expect(formatLonLabel(0.5)).toBe("0.5° E");
  });
});

describe("scale bar", () => {
  it("picks a round distance that fits and measures it in pixels exactly", () => {
    for (const scale of [3.56, 8, 20, 90]) {
      const bar = scaleBar(scale);
      expect(bar.px).toBeLessThanOrEqual(130 + 1e-6);
      expect(bar.px).toBeGreaterThan(130 / 5 - 1);
      expect(bar.px).toBeCloseTo((bar.km * scale) / KM_PER_DEG, 9);
      const m = bar.km / Math.pow(10, Math.floor(Math.log10(bar.km)));
      expect([1, 2, 5]).toContain(Math.round(m));
    }
  });

  it("reads 1 degree as about 59.27 km", () => {
    expect(KM_PER_DEG).toBeCloseTo(59.27, 1);
  });

  it("labels small distances in metres", () => {
    expect(scaleBar(90).label).toMatch(/km$/);
    const fine = scaleBar(20000); // far past the cap, only to exercise the label
    expect(fine.label).toMatch(/ m$/);
  });
});

describe("exploration zone circles", () => {
  it("are 100 km tall everywhere and stretch sideways towards the poles", () => {
    const eq = circleRadiiDeg(0, 100);
    expect(eq.lat).toBeCloseTo(100 / KM_PER_DEG, 9);
    expect(eq.lon).toBeCloseTo(eq.lat, 9);
    const high = circleRadiiDeg(60, 100);
    expect(high.lat).toBeCloseTo(eq.lat, 9);
    expect(high.lon).toBeCloseTo(eq.lat * 2, 6);
  });

  it("stay finite at the pole", () => {
    expect(Number.isFinite(circleRadiiDeg(90, 100).lon)).toBe(true);
  });
});
