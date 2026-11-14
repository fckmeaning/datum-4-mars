import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerMeta } from "../api/client";

// Record what the map does with its raster layers without needing WebGL.
const created = vi.hoisted(() => ({ sources: [] as { url: string; nodata: number | undefined }[], tiles: [] as unknown[] }));

vi.mock("ol/source/GeoTIFF", () => ({
  default: class FakeGeoTIFF {
    constructor(opts: { sources: { url: string; nodata?: number }[] }) {
      created.sources.push({ url: opts.sources[0]!.url, nodata: opts.sources[0]!.nodata });
    }
    on(): void {}
    getState(): string {
      return "ready";
    }
  },
}));

// The OpenLayers Map itself needs a real canvas/WebGL; the swap logic only needs the layer calls.
vi.mock("ol/Map", () => ({
  default: class FakeMap {
    private viewport = document.createElement("div");
    on(): void {}
    un(): void {}
    addInteraction(): void {}
    addLayer(): void {}
    removeLayer(): void {}
    getViewport(): HTMLElement {
      return this.viewport;
    }
    setTarget(): void {}
    dispose(): void {}
    getSize(): number[] {
      return [800, 600];
    }
    render(): void {}
    getEventPixel(): number[] {
      return [0, 0];
    }
    getCoordinateFromPixel(): number[] {
      return [0, 0];
    }
    forEachFeatureAtPixel(): undefined {
      return undefined;
    }
  },
}));

vi.mock("ol/layer/WebGLTile", () => ({
  default: class FakeTile {
    source: unknown = null;
    style: unknown = null;
    visible: boolean;
    opacity: number;
    constructor(opts: { visible: boolean; opacity: number }) {
      this.visible = opts.visible;
      this.opacity = opts.opacity;
      created.tiles.push(this);
    }
    setSource(s: unknown): void {
      this.source = s;
    }
    setStyle(s: unknown): void {
      this.style = s;
    }
    setVisible(v: boolean): void {
      this.visible = v;
    }
    getVisible(): boolean {
      return this.visible;
    }
    setOpacity(o: number): void {
      this.opacity = o;
    }
    getData(): null {
      return null;
    }
    setZIndex(): void {}
    on(): void {}
    getZIndex(): number {
      return 0;
    }
  },
}));

import { Map2D } from "./Map2D";

function meta(over: Partial<LayerMeta> & { id: string }): LayerMeta {
  return {
    site_id: "gale",
    family: "topography",
    name: over.id,
    unit: "m",
    level: "L1",
    time_dependent: false,
    credit: "t",
    simulated: false,
    cog_url: `/data/${over.id}.tif`,
    ...over,
  } as LayerMeta;
}

const L1 = meta({ id: "gale.L1.elevation", level: "L1", resolution_m: 200, cog_url: "/data/gale/L1/elevation.tif" });
const L3 = meta({ id: "gale.L3.elevation", level: "L3", resolution_m: 10, cog_url: "/data/gale/L3/elevation.tif" });
const OPT = meta({ id: "gale.L3.optical", family: "optical", level: "L3", resolution_m: 2, nodata: 0, cog_url: "/data/gale/L3/optical.tif" });
const WALK = meta({ id: "gale.L3.walkability", family: "hazard", level: "L3", nodata: 255, cog_url: "/data/gale/L3/walkability.tif", ...({ classes: [{ min: 0, max: 100, label: "All", color: "#112233" }] } as object) });

describe("Map2D raster level swap", () => {
  beforeEach(() => {
    created.sources.length = 0;
    created.tiles.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not load a raster until the layer list arrives, then loads the best level once", () => {
    const { rerender } = render(<Map2D layers={[]} />);
    expect(created.sources).toHaveLength(0);
    rerender(<Map2D layers={[L1, L3]} />);
    expect(created.sources.map((s) => s.url)).toEqual(["/data/gale/L3/elevation.tif"]);
    expect(created.sources[0]!.nodata).toBe(-32768);
    rerender(<Map2D layers={[L3, L1]} />);
    expect(created.sources).toHaveLength(1); // same level: no reload
  });

  it("falls back to the L1 file when the API never delivers a layer list", () => {
    render(<Map2D layers={[]} />);
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(created.sources.map((s) => s.url)).toEqual(["/data/gale/L1/elevation.tif"]);
  });

  it("gives the optical and walkability layers their own sources with the nodata from the meta", () => {
    render(<Map2D layers={[L3, OPT, WALK]} />);
    const byUrl = Object.fromEntries(created.sources.map((s) => [s.url, s.nodata]));
    expect(byUrl["/data/gale/L3/elevation.tif"]).toBe(-32768);
    expect(byUrl["/data/gale/L3/optical.tif"]).toBe(0);
    expect(byUrl["/data/gale/L3/walkability.tif"]).toBe(255);
  });

  it("swaps to a better level when it appears later", () => {
    const { rerender } = render(<Map2D layers={[L1]} />);
    rerender(<Map2D layers={[L1, L3]} />);
    expect(created.sources.map((s) => s.url)).toEqual(["/data/gale/L1/elevation.tif", "/data/gale/L3/elevation.tif"]);
  });

  it("renders the legend for the default visible layers and no time slider without snapshots", () => {
    const { container, queryByLabelText } = render(<Map2D layers={[L3]} />);
    expect(container.querySelector('[data-legend="elevation"]')).not.toBeNull();
    expect(queryByLabelText("Time slider")).toBeNull();
  });
});
