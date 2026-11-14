import { describe, it, expect } from "vitest";
import { DOCK_TO_OVERLAY, OVERLAY_IDS, OVERLAY_TEXTURE_URL, formatLayerValue, rampGradient, valueFromByte } from "./globeLayers";

describe("globe layers", () => {
  it("has a texture for every overlay slot", () => {
    for (const id of OVERLAY_IDS) expect(OVERLAY_TEXTURE_URL[id]).toMatch(/^\/data\/globe\/mars_.*\.jpg$/);
  });
  it("maps the dock rows to overlay slots", () => {
    expect(DOCK_TO_OVERLAY["topo"]).toBe("topo");
    expect(DOCK_TO_OVERLAY["elevation"]).toBeUndefined();
    expect(DOCK_TO_OVERLAY["radiation"]).toBe("radiation");
    expect(DOCK_TO_OVERLAY["traverse"]).toBeUndefined();
  });
  it("decodes 8-bit values between min and max", () => {
    expect(valueFromByte(0, 0.45, 2)).toBeCloseTo(0.45);
    expect(valueFromByte(255, 0.45, 2)).toBeCloseTo(2);
    expect(valueFromByte(300, 0, 10)).toBeCloseTo(10); // clamped
  });
  it("formats with unit and digits", () => {
    expect(formatLayerValue(0.6412, { name: "r", unit: "mSv/day", digits: 2, modeled: true, source: "" })).toBe("0.64 mSv/day");
    expect(formatLayerValue(3, { name: "x", unit: "", modeled: false, source: "" })).toBe("3.0");
  });
  it("builds a css gradient", () => {
    expect(rampGradient(["#000000", "#ffffff"])).toBe("linear-gradient(90deg, #000000, #ffffff)");
  });
});
