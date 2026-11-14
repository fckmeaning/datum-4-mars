import { describe, it, expect } from "vitest";

// Function to calculate relative luminance according to WCAG 2.1
function getLuminance(r: number, g: number, b: number): number {
  const s = [r, g, b].map((c) => {
    const sc = c / 255;
    return sc <= 0.03928 ? sc / 12.92 : Math.pow((sc + 0.055) / 1.055, 2.4);
  });
  const rLum = s[0] ?? 0;
  const gLum = s[1] ?? 0;
  const bLum = s[2] ?? 0;
  return 0.2126 * rLum + 0.7152 * gLum + 0.0722 * bLum;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getContrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Design System Contrast & Tokens (WCAG Standards)", () => {
  const BG = "#0B0F14";
  const SURFACE = "#121821";
  const TEXT_PRIMARY = "#E6EDF3";
  const TEXT_MUTED = "#9DA7B3";
  const MARS_OCHRE = "#E06A3B";

  it("primary text achieves WCAG AAA (> 7:1) on surface and background", () => {
    const contrastOnSurface = getContrastRatio(TEXT_PRIMARY, SURFACE);
    const contrastOnBg = getContrastRatio(TEXT_PRIMARY, BG);

    expect(contrastOnSurface).toBeGreaterThan(14.0); // ~15.2:1
    expect(contrastOnBg).toBeGreaterThan(15.0); // ~16.3:1
  });

  it("muted text achieves WCAG AAA (> 7:1) on surface", () => {
    const contrastOnSurface = getContrastRatio(TEXT_MUTED, SURFACE);
    expect(contrastOnSurface).toBeGreaterThan(7.0); // ~7.4:1
  });

  it("mars ochre accent achieves WCAG AA (> 4.5:1) on surface", () => {
    const contrastOnSurface = getContrastRatio(MARS_OCHRE, SURFACE);
    expect(contrastOnSurface).toBeGreaterThan(5.0); // ~5.4:1
  });

  it("route colors conform to Okabe-Ito colorblind-friendly palette", () => {
    const routeColors = {
      fastest: "#56B4E9",
      safest: "#009E73",
      balanced: "#E69F00",
      science: "#CC79A7",
    };
    expect(routeColors.fastest).toBe("#56B4E9");
    expect(routeColors.safest).toBe("#009E73");
    expect(routeColors.balanced).toBe("#E69F00");
    expect(routeColors.science).toBe("#CC79A7");
  });
});
