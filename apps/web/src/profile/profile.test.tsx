import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { cellOf, gridFromDem, type Grid } from "../sites/eva/grid";
import { planEva, type Plan } from "../sites/eva/plan";
import { ProfileView } from "./ProfileView";
import { downloadText, profileOf, routeGeoJSON, routeGpx, thin } from "./profileMath";

/** w x h grid of 20 m cells; `f(c, r)` gives the height. */
function make(w: number, h: number, f: (c: number, r: number) => number = () => 0, cell = 20): Grid {
  const z = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) z[r * w + c] = f(c, r);
  return gridFromDem(z, w, h, cell, cell, 4096);
}

// a gentle hill to the east so that the profile has a shape
const hill = (c: number) => 12 * Math.sin((c / 100) * Math.PI) * 10;
function plan2(mode: "foot" | "rover" = "foot", opts?: { o2CapacityL?: number }): Plan {
  const g = make(100, 60, hill);
  const home = { x: 0, y: 0 };
  void cellOf;
  const p = planEva(g, home, [{ x: 400, y: 100 }, { x: 700, y: -50 }], mode, opts);
  if ("error" in p) throw new Error(p.error);
  return p;
}

const toLatLon = (x: number, y: number) => ({ lat: -4.59 + y / 59_000, lon: 137.44 + x / 59_000 });

afterEach(() => vi.restoreAllMocks());

describe("profileOf", () => {
  const plan = plan2();
  const prof = profileOf(plan);
  it("has one point per node with growing distance, time and oxygen", () => {
    expect(prof.points.length).toBe(plan.nodes.length);
    for (let i = 1; i < prof.points.length; i++) {
      expect(prof.points[i]!.distKm).toBeGreaterThanOrEqual(prof.points[i - 1]!.distKm);
      expect(prof.points[i]!.timeH).toBeGreaterThanOrEqual(prof.points[i - 1]!.timeH);
      expect(prof.points[i]!.o2L).toBeGreaterThanOrEqual(prof.points[i - 1]!.o2L);
    }
    expect(prof.points[0]!.distKm).toBe(0);
    expect(prof.points.at(-1)!.distKm * 1000).toBeCloseTo(plan.stats.distanceM, 6);
    expect(prof.points.at(-1)!.o2L).toBeCloseTo(plan.stats.o2L, 9);
  });
  it("finds the stops and the extremes", () => {
    expect(prof.stops.length).toBe(2);
    expect(prof.stops[0]!.distKm).toBeLessThan(prof.stops[1]!.distKm);
    expect(prof.elevMax).toBeGreaterThan(prof.elevMin);
    expect(prof.slopeMaxDeg).toBeCloseTo(plan.stats.maxGradeDeg, 1);
  });
  it("marks the no-return point when oxygen is short, and not otherwise", () => {
    expect(prof.noReturn).toBeNull();
    const tight = plan2("foot", { o2CapacityL: 6 });
    const p = profileOf(tight);
    expect(tight.noReturn).not.toBeNull();
    expect(p.noReturn).toBe(p.points[tight.noReturn!]);
  });
  it("thins a long route and keeps both ends", () => {
    const t = thin(prof.points, 10);
    expect(t.length).toBe(10);
    expect(t[0]).toBe(prof.points[0]);
    expect(t.at(-1)).toBe(prof.points.at(-1));
    expect(thin([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
});

describe("route export", () => {
  const plan = plan2();
  const meta = { site: "Gale Crater", mode: "foot" as const, verdict: "CLEAR", stopNames: ["Alpha", "Beta & <Gamma>"] };

  it("GeoJSON follows RFC 7946: a FeatureCollection, [lon, lat, elevation], one point per stop, a closed loop when it returns home", () => {
    const gj = routeGeoJSON(plan, toLatLon, meta);
    expect(gj.type).toBe("FeatureCollection");
    const line = gj.features[0]!;
    expect(line.geometry.type).toBe("LineString");
    const coords = (line.geometry as { coordinates: number[][] }).coordinates;
    expect(coords.length).toBeGreaterThan(10);
    for (const c of coords) {
      expect(c).toHaveLength(3);
      expect(c[0]).toBeGreaterThanOrEqual(-180);
      expect(c[0]).toBeLessThanOrEqual(180);
      expect(c[1]).toBeGreaterThanOrEqual(-90);
    }
    expect(coords[0]![0]).toBeCloseTo(137.44, 3); // longitude first
    expect(coords[0]![1]).toBeCloseTo(-4.59, 3);
    expect(coords[0]).toEqual(coords.at(-1)); // back at the station
    const stops = gj.features.slice(1);
    expect(stops.map((f) => f.properties)).toMatchObject([{ name: "Alpha", stop: 1 }, { name: "Beta & <Gamma>", stop: 2 }]);
    expect(stops.every((f) => f.geometry.type === "Point")).toBe(true);
    expect(gj.marsCoordinateSystem).toMatch(/Mars/);
    expect(JSON.parse(JSON.stringify(gj))).toEqual(gj);
  });

  it("wraps an east longitude above 180 into -180..180", () => {
    const gj = routeGeoJSON(plan, (x, y) => ({ lat: 0 + y / 59_000, lon: 350 + x / 59_000 }), meta);
    const c = (gj.features[0]!.geometry as { coordinates: number[][] }).coordinates[0]!;
    expect(c[0]).toBeCloseTo(-10, 3);
  });

  it("GPX 1.1 has a track with all nodes and escaped waypoint names", () => {
    const gpx = routeGpx(plan, toLatLon, meta);
    expect(gpx).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(gpx).toMatch(/<gpx version="1.1"/);
    expect((gpx.match(/<trkpt /g) ?? []).length).toBe(plan.nodes.length);
    expect((gpx.match(/<wpt /g) ?? []).length).toBe(2);
    expect(gpx).toContain("Beta &amp; &lt;Gamma&gt;");
    expect(gpx).not.toContain("<Gamma>");
    expect(gpx.trim().endsWith("</gpx>")).toBe(true);
  });

  it("downloadText returns false where Blob URLs are not available and true when it can save", () => {
    const saved = URL.createObjectURL;
    // jsdom has no createObjectURL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = undefined;
    expect(downloadText("a.txt", "x", "text/plain")).toBe(false);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    expect(downloadText("a.txt", "x", "text/plain")).toBe(true);
    expect(click).toHaveBeenCalled();
    URL.createObjectURL = saved;
  });
});

describe("ProfileView", () => {
  const base = { siteName: "Gale Crater", siteId: "gale", stopNames: ["Alpha", "Beta"], toLatLon, error: null, loading: false, onPlan: () => undefined };

  it("tells what to do when there is no plan, and the button goes to the planner", () => {
    const onPlan = vi.fn();
    render(<ProfileView {...base} plan={null} onPlan={onPlan} />);
    expect(screen.getByTestId("profile-empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Plan a sortie/ }));
    expect(onPlan).toHaveBeenCalled();
  });

  it("shows the planner's error instead of the hint", () => {
    render(<ProfileView {...base} plan={null} error="No walkable route to stop 1: the slopes around it are too steep." />);
    expect(screen.getByTestId("profile-empty").textContent).toMatch(/too steep/);
  });

  it("shows a loading note while the elevation tile loads", () => {
    render(<ProfileView {...base} plan={null} loading />);
    expect(screen.getByTestId("profile-empty").textContent).toMatch(/Loading the elevation tile/);
    expect(screen.queryByRole("button", { name: /Plan a sortie/ })).toBeNull();
  });

  it("draws elevation, slope and oxygen, with the stops, the verdict and the stats", () => {
    const plan = plan2();
    render(<ProfileView {...base} plan={plan} />);
    expect(screen.getByTestId("profile-elev")).toBeTruthy();
    expect(screen.getByTestId("profile-slope")).toBeTruthy();
    expect(screen.getByTestId("profile-o2")).toBeTruthy();
    expect(screen.getAllByText("S1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("S2").length).toBeGreaterThan(0);
    expect(screen.getByTestId("profile-verdict").textContent).toBe("CLEAR");
    expect(screen.getByTestId("profile-stats").textContent).toMatch(/Distance/);
    expect(screen.getByTestId("profile-stats").textContent).toMatch(new RegExp(`${plan.stats.o2L.toFixed(0)} / ${plan.stats.usableL.toFixed(0)} L`));
  });

  it("shows the no-return mark and ABORT when the oxygen is short", () => {
    const plan = plan2("foot", { o2CapacityL: 6 });
    render(<ProfileView {...base} plan={plan} />);
    expect(screen.getByTestId("profile-verdict").textContent).toBe("ABORT");
    expect(screen.getAllByText("no return").length).toBeGreaterThan(0);
  });

  it("uses the daylight verdict when one is given", () => {
    render(<ProfileView {...base} plan={plan2()} verdict="CAUTION" />);
    expect(screen.getByTestId("profile-verdict").textContent).toBe("MARGINAL");
  });

  it("exports the route as GeoJSON and GPX files", () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<ProfileView {...base} plan={plan2()} />);
    fireEvent.click(screen.getByTestId("export-geojson"));
    fireEvent.click(screen.getByTestId("export-gpx"));
    expect(names).toEqual(["gale-sortie.geojson", "gale-sortie.gpx"]);
  });

  it("disables the exports until the elevation tile can place the route", () => {
    render(<ProfileView {...base} plan={plan2()} toLatLon={null} />);
    expect((screen.getByTestId("export-geojson") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("export-gpx") as HTMLButtonElement).disabled).toBe(true);
  });
});
