import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComparePage } from "./ComparePage";
import { METRICS, bestIndex, goodness, valuesOf, type SiteInputs } from "./siteMetrics";

const NOW = Date.parse("2026-11-14T12:00:00Z");

function site(id: string, name: string, lat: number, lon: number, v: Partial<SiteInputs> = {}): SiteInputs {
  return { id, name, lat, lon, radiation: 0.7, pressure: 700, slope: 1, hazard: 0.3, elevation: -2000, ...v };
}

const SITES: SiteInputs[] = [
  site("gale", "Gale Crater", -4.59, 137.44, { radiation: 0.65, pressure: 738, slope: 1.2, hazard: 0.25, elevation: -4230 }),
  site("jezero", "Jezero Crater", 18.44, 77.45, { radiation: 0.7, pressure: 700, slope: 0.8, hazard: 0.4, elevation: -2600 }),
  site("meridiani", "Meridiani Planum", -1.95, -5.53, { radiation: 0.62, pressure: 640, slope: 0.3, hazard: 0.1, elevation: -1400 }),
];

describe("goodness and bestIndex", () => {
  it("scores 1 for the best and 0 for the worst, in the direction of the metric", () => {
    expect(goodness([1, 2, 3], "low")).toEqual([1, 0.5, 0]);
    expect(goodness([1, 2, 3], "high")).toEqual([0, 0.5, 1]);
  });
  it("gives 0.5 when all are equal and null for a missing value", () => {
    expect(goodness([4, 4], "low")).toEqual([0.5, 0.5]);
    expect(goodness([1, null, 3], "high")).toEqual([0, null, 1]);
    expect(goodness([null, null], "high")).toEqual([null, null]);
  });
  it("marks no best when all are equal or empty", () => {
    expect(bestIndex([1, 2, 3], "low")).toBe(0);
    expect(bestIndex([1, 2, 3], "high")).toBe(2);
    expect(bestIndex([5, 5], "high")).toBe(-1);
    expect(bestIndex([null, null], "low")).toBe(-1);
    expect(bestIndex([null, 7, 3], "low")).toBe(2);
  });
});

describe("valuesOf", () => {
  it("fills the computed metrics from the position and the date", () => {
    const v = valuesOf(SITES[0]!, NOW);
    expect(v.radiation).toBe(0.65);
    expect(v.sunlight).toBeGreaterThan(150);
    expect(v.sunlight).toBeLessThan(200);
    expect(v.earth).toBeGreaterThan(20);
    expect(v.earth).toBeLessThan(80);
  });
  it("keeps a missing modelled value as null, not zero", () => {
    expect(valuesOf(site("x", "X", 0, 0, { radiation: null }), NOW).radiation).toBeNull();
  });
  it("a high-latitude site gets less sunlight than the equator", () => {
    const eq = valuesOf(site("e", "Equator", 0, 0), NOW).sunlight!;
    const north = valuesOf(site("n", "North", 60, 0), NOW).sunlight!;
    expect(north).toBeLessThan(eq);
    expect(north).toBeGreaterThan(0);
  });
});

function setup(inputs = { sites: SITES, loading: false, offline: false }, url = "/compare") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ComparePage inputs={inputs} nowMs={NOW} />
    </MemoryRouter>,
  );
}

describe("ComparePage", () => {
  it("has a column per site and a row per metric, with origin badges", () => {
    setup();
    const table = screen.getByTestId("compare-table");
    expect(within(table).getAllByRole("columnheader").length).toBe(1 + SITES.length);
    for (const m of METRICS) expect(table.querySelector(`tr[data-metric="${m.id}"]`)).not.toBeNull();
    expect(within(table).getAllByText("MODELED").length).toBe(METRICS.filter((m) => m.origin === "MODELED").length);
    expect(within(table).getAllByText("COMPUTED").length).toBe(METRICS.filter((m) => m.origin === "COMPUTED").length);
  });

  it("marks the best value of each row in the right direction", () => {
    setup();
    const best = (metric: string) => screen.getByTestId("compare-table").querySelector(`tr[data-metric="${metric}"] td.is-best`)?.getAttribute("data-site");
    expect(best("radiation")).toBe("meridiani"); // lowest dose
    expect(best("pressure")).toBe("gale"); // highest pressure
    expect(best("slope")).toBe("meridiani");
    expect(best("hazard")).toBe("meridiani");
    expect(best("elevation")).toBe("gale"); // lowest ground
  });

  it("links every site column to its expedition page", () => {
    setup();
    const link = within(screen.getByTestId("compare-table")).getByRole("link", { name: "Gale" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/site/gale");
  });

  it("draws the radar for the picked sites and lets the user change the picks", () => {
    setup(undefined, "/compare?site=meridiani");
    const polys = () => Array.from(screen.getByTestId("radar").querySelectorAll("polygon.radar__poly")).map((p) => p.getAttribute("data-site"));
    expect(polys()).toEqual(["gale", "jezero", "meridiani"]); // the site of the address is picked first, then the defaults
    // untick one, the radar loses that polygon
    fireEvent.click(screen.getByRole("checkbox", { name: /Jezero Crater/ }));
    expect(polys()).toEqual(["gale", "meridiani"]);
    // ticking a fourth is not possible with three sites: only three exist here; tick it back
    fireEvent.click(screen.getByRole("checkbox", { name: /Jezero Crater/ }));
    expect(polys().length).toBe(3);
  });

  it("keeps at most three sites on the radar", () => {
    const more = [...SITES, site("gusev", "Gusev Crater", -14.57, 175.47), site("elysium", "Elysium Planitia", 4.5, 135.6)];
    setup({ sites: more, loading: false, offline: false }, "/compare");
    const polys = () => screen.getByTestId("radar").querySelectorAll("polygon.radar__poly").length;
    expect(polys()).toBe(3);
    fireEvent.click(screen.getByRole("checkbox", { name: /Gusev Crater/ }));
    expect(polys()).toBe(3);
    expect((screen.getByRole("checkbox", { name: /Gusev Crater/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("shows a loading note and an offline note, and shows dashes where a modelled value is missing", () => {
    const empty = SITES.map((s) => ({ ...s, radiation: null, pressure: null, slope: null, hazard: null, elevation: null }));
    const { unmount } = setup({ sites: empty, loading: true, offline: false });
    expect(screen.getByTestId("compare-loading")).toBeTruthy();
    unmount();
    setup({ sites: empty, loading: false, offline: true });
    expect(screen.getByTestId("compare-offline").textContent).toMatch(/rather than guessed/);
    const row = screen.getByTestId("compare-table").querySelector('tr[data-metric="radiation"]')!;
    expect(row.textContent).toMatch(/—/);
    // the computed rows still have numbers
    expect(screen.getByTestId("compare-table").querySelector('tr[data-metric="sunlight"]')!.textContent).toMatch(/\d\d\d/);
  });
});
