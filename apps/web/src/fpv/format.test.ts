import { describe, expect, it } from "vitest";
import {
  compassLabel,
  formatClock,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeading,
  formatPlayback,
  formatSigned,
  remainingPercent,
} from "./format";

describe("HUD formatting", () => {
  it("formats headings with three digits and wraps 360 to 000", () => {
    expect(formatHeading(7)).toBe("007");
    expect(formatHeading(359.6)).toBe("000");
    expect(formatHeading(-90)).toBe("270");
    expect(formatHeading(180)).toBe("180");
  });

  it("names the 16 compass points", () => {
    expect(compassLabel(0)).toBe("N");
    expect(compassLabel(359)).toBe("N");
    expect(compassLabel(45)).toBe("NE");
    expect(compassLabel(90)).toBe("E");
    expect(compassLabel(202.5)).toBe("SSW");
    expect(compassLabel(270)).toBe("W");
  });

  it("formats distances with a sensible unit", () => {
    expect(formatDistance(38.4)).toBe("38 m");
    expect(formatDistance(999)).toBe("999 m");
    expect(formatDistance(1240)).toBe("1.24 km");
    expect(formatDistance(15_800)).toBe("15.8 km");
    expect(formatDistance(Number.NaN)).toBe("--");
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(-4)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("--:--");
  });

  it("signs slope and elevation angles", () => {
    expect(formatSigned(3.44)).toBe("+3.4°");
    expect(formatSigned(-12.04)).toBe("-12.0°");
    expect(formatSigned(0)).toBe("0.0°");
    expect(formatSigned(-0.01)).toBe("0.0°");
  });

  it("formats elevation with a space as thousands separator", () => {
    expect(formatElevation(-4501.2)).toBe("-4 501 m");
    expect(formatElevation(1234)).toBe("1 234 m");
  });

  it("formats the UTC clock and playback", () => {
    expect(formatClock("2026-11-14T09:05:07.000Z")).toBe("09:05:07");
    expect(formatClock("not a date")).toBe("--:--:--");
    expect(formatPlayback(4, false)).toBe("4x");
    expect(formatPlayback(4, true)).toBe("PAUSED");
  });

  it("clamps remaining percent", () => {
    expect(remainingPercent(50, 200)).toBe(25);
    expect(remainingPercent(300, 200)).toBe(100);
    expect(remainingPercent(-5, 200)).toBe(0);
    expect(remainingPercent(10, 0)).toBe(0);
  });
});
