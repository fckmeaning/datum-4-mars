import { describe, it, expect } from "vitest";
import { selectBestDataLevel, getBestElevationLayer } from "./layerLevel";
import type { LayerMeta, DataLevel } from "../api/client";

describe("selectBestDataLevel", () => {
  it("prioritizes L3 over L2, L1, and L0", () => {
    const levels: DataLevel[] = ["L0", "L1", "L3", "L2"];
    expect(selectBestDataLevel(levels)).toBe("L3");
  });

  it("prioritizes L2 when L3 is absent", () => {
    const levels: DataLevel[] = ["L0", "L1", "L2"];
    expect(selectBestDataLevel(levels)).toBe("L2");
  });

  it("prioritizes L1 when L3 and L2 are absent", () => {
    const levels: DataLevel[] = ["L0", "L1"];
    expect(selectBestDataLevel(levels)).toBe("L1");
  });

  it("falls back to L0 when only L0 or empty", () => {
    expect(selectBestDataLevel(["L0"])).toBe("L0");
    expect(selectBestDataLevel([])).toBe("L0");
  });

  it("finds best elevation layer from LayerMeta array", () => {
    const layers: Partial<LayerMeta>[] = [
      { id: "elev-l0", family: "topography", level: "L0", name: "Elevation L0" },
      { id: "elev-l1", family: "topography", level: "L1", name: "Elevation L1" },
      { id: "optical-l2", family: "optical", level: "L2", name: "CTX Mosaic" },
    ];

    const best = getBestElevationLayer(layers as LayerMeta[]);
    expect(best?.id).toBe("elev-l1");
  });
});
