import { describe, it, expect } from "vitest";
import { estimateLabelWidth, hideOverlapping, type LabelBox } from "./labelLayout";

const box = (id: string, x: number, y: number, priority: number, visible = true): LabelBox => ({ id, x, y, w: 100, h: 22, priority, visible });

describe("hideOverlapping", () => {
  it("keeps the higher priority label when two overlap", () => {
    const hidden = hideOverlapping([box("a", 100, 100, 1), box("b", 130, 105, 5)]);
    expect([...hidden]).toEqual(["a"]);
  });
  it("keeps labels that do not overlap", () => {
    expect(hideOverlapping([box("a", 100, 100, 1), box("b", 400, 100, 1)]).size).toBe(0);
  });
  it("ignores labels that are already off the visible hemisphere", () => {
    expect(hideOverlapping([box("a", 100, 100, 1, false), box("b", 100, 100, 1)]).size).toBe(0);
  });
  it("estimates a wider box for longer names", () => {
    expect(estimateLabelWidth("Utopia Planitia", "2D")).toBeGreaterThan(estimateLabelWidth("Gale", "2D"));
  });
});
