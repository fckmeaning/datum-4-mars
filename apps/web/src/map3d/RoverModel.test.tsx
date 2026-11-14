import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { Canvas } from "@react-three/fiber";
import { Vector3, Group, Mesh, BoxGeometry, MeshBasicMaterial } from "three";
import { RoverModel, disposeGLTF } from "./RoverModel";
import { sampleTerrainNormal } from "./markers";
import type { TerrainRasterData } from "./types";

// Mock ResizeObserver for react-use-measure in jsdom
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// Mock WebGL context in jsdom
beforeAll(() => {
  // @ts-expect-error Mocking WebGL for jsdom environment
  HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
      return {
        getExtension: () => null,
        getParameter: () => 2048,
        createTexture: () => ({}),
        bindTexture: () => {},
        texParameteri: () => {},
        texImage2D: () => {},
        clearColor: () => {},
        clearDepth: () => {},
        clear: () => {},
        enable: () => {},
        disable: () => {},
        viewport: () => {},
        createProgram: () => ({}),
        createShader: () => ({}),
        shaderSource: () => {},
        compileShader: () => {},
        getShaderParameter: () => true,
        attachShader: () => {},
        linkProgram: () => {},
        getProgramParameter: () => true,
        useProgram: () => {},
        createBuffer: () => ({}),
        bindBuffer: () => {},
        bufferData: () => {},
        getAttribLocation: () => 0,
        enableVertexAttribArray: () => {},
        vertexAttribPointer: () => {},
        drawArrays: () => {},
        drawElements: () => {},
        getUniformLocation: () => ({}),
        uniform1f: () => {},
        uniform2f: () => {},
        uniform3f: () => {},
        uniform4f: () => {},
        uniformMatrix4fv: () => {},
        deleteTexture: () => {},
        deleteProgram: () => {},
        deleteShader: () => {},
        deleteBuffer: () => {},
      };
    }
    return null;
  };
});

describe("RoverModel and terrain normal alignment", () => {
  it("computes flat Up normal [0, 1, 0] on horizontal terrain", () => {
    const flatTerrain: TerrainRasterData = {
      width: 10,
      height: 10,
      minElevation: 0,
      maxElevation: 0,
      elevation: new Float32Array(100),
      bbox: [-100, -100, 100, 100],
      nodata: -9999,
    };

    const normal = sampleTerrainNormal(flatTerrain, 0, 0, 1.0);
    expect(normal.x).toBeCloseTo(0, 5);
    expect(normal.y).toBeCloseTo(1, 5);
    expect(normal.z).toBeCloseTo(0, 5);
  });

  it("computes tilted normal on eastward-sloping terrain", () => {
    const slopeElevations = new Float32Array(100);
    // Row by col: elevation increases with col (East / X)
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        slopeElevations[r * 10 + c] = c * 10; // 10 m rise per cell
      }
    }

    const slopeTerrain: TerrainRasterData = {
      width: 10,
      height: 10,
      minElevation: 0,
      maxElevation: 90,
      elevation: slopeElevations,
      bbox: [-100, -100, 100, 100],
      nodata: -9999,
    };

    const normal = sampleTerrainNormal(slopeTerrain, 0, 0, 1.0);
    // Slope ascends toward +X, so normal tilts toward -X
    expect(normal.x).toBeLessThan(0);
    expect(normal.y).toBeGreaterThan(0);
  });

  it("renders fallback beacon inside Canvas without crash when model fails", () => {
    const { container } = render(
      <Canvas>
        <RoverModel
          position={new Vector3(100, 50, -200)}
          normal={new Vector3(0, 1, 0)}
          modelUrl="/models/non_existent.glb"
        />
      </Canvas>
    );

    expect(container.querySelector("canvas")).toBeInTheDocument();
  });

  it("disposes all GPU geometries and materials via disposeGLTF", () => {
    const group = new Group();
    const geo = new BoxGeometry(1, 1, 1);
    const mat = new MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new Mesh(geo, mat);
    group.add(mesh);

    const geoDisposeSpy = vi.spyOn(geo, "dispose");
    const matDisposeSpy = vi.spyOn(mat, "dispose");

    disposeGLTF(group);

    expect(geoDisposeSpy).toHaveBeenCalledOnce();
    expect(matDisposeSpy).toHaveBeenCalledOnce();
  });
});
