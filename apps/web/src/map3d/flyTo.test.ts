import { describe, it, expect } from "vitest";
import {
  easeInOutCubic,
  interpolateCameraPose,
  createLookAtPose,
  type CameraPose,
} from "./flyTo";

describe("easeInOutCubic", () => {
  it("starts at 0 and ends at 1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("is symmetric around t = 0.5", () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75), 6);
  });

  it("clamps values outside [0, 1]", () => {
    expect(easeInOutCubic(-0.5)).toBe(0);
    expect(easeInOutCubic(1.5)).toBe(1);
  });
});

describe("interpolateCameraPose", () => {
  const startPose: CameraPose = {
    position: { x: 0, y: 1000, z: 0 },
    target: { x: 0, y: 0, z: 0 },
  };

  const endPose: CameraPose = {
    position: { x: 5000, y: 1200, z: 3000 },
    target: { x: 5000, y: 200, z: 3000 },
  };

  it("returns startPose at t = 0", () => {
    const pose = interpolateCameraPose(startPose, endPose, 0);
    expect(pose.position.x).toBeCloseTo(startPose.position.x, 3);
    expect(pose.position.y).toBeCloseTo(startPose.position.y, 3);
    expect(pose.position.z).toBeCloseTo(startPose.position.z, 3);
    expect(pose.target.x).toBeCloseTo(startPose.target.x, 3);
  });

  it("returns endPose at t = 1", () => {
    const pose = interpolateCameraPose(startPose, endPose, 1);
    expect(pose.position.x).toBeCloseTo(endPose.position.x, 3);
    expect(pose.position.y).toBeCloseTo(endPose.position.y, 3);
    expect(pose.position.z).toBeCloseTo(endPose.position.z, 3);
    expect(pose.target.x).toBeCloseTo(endPose.target.x, 3);
  });

  it("creates a vertical arc at midpoint t = 0.5", () => {
    const pose = interpolateCameraPose(startPose, endPose, 0.5, { arcHeight: 400 });
    // Midpoint Y without arc would be (1000 + 1200) / 2 = 1100
    // With arcHeight 400, sin(pi * 0.5) = 1, so Y should be 1100 + 400 = 1500
    expect(pose.position.y).toBeCloseTo(1500, 1);
    expect(pose.position.x).toBeCloseTo(2500, 1);
    expect(pose.position.z).toBeCloseTo(1500, 1);
  });

  it("enforces minimum clearance above terrain", () => {
    // Terrain has a huge peak at the midpoint
    const peakElevation = 2000;
    const getTerrainElevation = (x: number, z: number) => {
      const distToMid = Math.hypot(x - 2500, z - 1500);
      return Math.max(0, peakElevation - distToMid);
    };

    const pose = interpolateCameraPose(startPose, endPose, 0.5, {
      minClearance: 100,
      arcHeight: 200,
      getTerrainElevation,
    });

    // Peak is 2000, minClearance is 100, so position.y must be at least 2100
    expect(pose.position.y).toBeGreaterThanOrEqual(2100);
  });
});

describe("createLookAtPose", () => {
  it("positions camera at expected distance and elevation above ground target", () => {
    const target = { x: 1000, z: 2000, elevation: 500 };
    const pose = createLookAtPose(target, 1000, 30, 0);

    expect(pose.target.x).toBe(1000);
    expect(pose.target.y).toBe(500);
    expect(pose.target.z).toBe(2000);

    // Height offset: distance * sin(30 deg) = 1000 * 0.5 = 500
    expect(pose.position.y).toBeCloseTo(1000, 1); // 500 + 500
  });
});
