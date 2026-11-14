import { describe, it, expect } from "vitest";
import { applyDisplaySettings } from "./applySettings";

describe("applyDisplaySettings", () => {
  it("sets and clears the data attributes", () => {
    const root = document.createElement("html");
    applyDisplaySettings({ reducedMotion: true, reducedTransparency: false }, root);
    expect(root.getAttribute("data-reduced-motion")).toBe("true");
    expect(root.hasAttribute("data-reduced-transparency")).toBe(false);

    applyDisplaySettings({ reducedMotion: false, reducedTransparency: true }, root);
    expect(root.hasAttribute("data-reduced-motion")).toBe(false);
    expect(root.getAttribute("data-reduced-transparency")).toBe("true");
  });
});
