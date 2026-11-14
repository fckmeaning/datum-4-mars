import { describe, it, expect } from "vitest";
import { getProfileColor, formatRouteTimeBubble, getRouteMidpoint } from "./routeRender";

describe("routeRender helpers", () => {
  it("maps profiles to specified colors", () => {
    expect(getProfileColor("FASTEST")).toBe("#56B4E9");
    expect(getProfileColor("SAFEST")).toBe("#009E73");
    expect(getProfileColor("BALANCED")).toBe("#E69F00");
    expect(getProfileColor("SCIENCE")).toBe("#CC79A7");
  });

  it("formats time bubble text cleanly", () => {
    expect(formatRouteTimeBubble(2700)).toBe("45m");
    expect(formatRouteTimeBubble(4200)).toBe("1h 10m");
    expect(formatRouteTimeBubble(7200)).toBe("2h 00m");
  });

  it("extracts midpoint of route coordinate array", () => {
    const coords = [
      [137.40, -4.72],
      [137.42, -4.70],
      [137.44, -4.68],
    ];
    const mid = getRouteMidpoint(coords);
    expect(mid).toEqual([137.42, -4.70]);
  });
});
