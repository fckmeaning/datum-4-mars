import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { TerrainScene, disposeTerrainGPUResources } from "./TerrainScene";
import { generateSyntheticGaleDEM } from "./terrainLoader";
import { PlaneGeometry, ShaderMaterial, DataTexture } from "three";

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

describe("TerrainScene component", () => {
  const mockDEM = generateSyntheticGaleDEM(32, 32);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders terrain scene with accessibility label and initial data", () => {
    render(
      <TerrainScene
        initialData={mockDEM}
        verticalExaggeration={2.0}
        elevationOpacity={1.0}
        slopeOpacity={0.8}
        hillshadeOpacity={0.85}
      />
    );

    const region = screen.getByRole("region", { name: /3d gale crater terrain/i });
    expect(region).toBeInTheDocument();

    // Check telemetry overlay
    expect(screen.getByText(/gale crater 3d topography/i)).toBeInTheDocument();
    expect(screen.getByText(/elev: cividis/i)).toBeInTheDocument();
    expect(screen.getByText(/slope: magma/i)).toBeInTheDocument();
    expect(screen.getByText(/exaggeration: 2x/i)).toBeInTheDocument();
  });

  it("handles flyTo target updates without crashing", () => {
    const onFlyToComplete = vi.fn();
    const { rerender } = render(
      <TerrainScene
        initialData={mockDEM}
        flyTo={null}
        onFlyToComplete={onFlyToComplete}
      />
    );

    expect(screen.getByRole("region")).toBeInTheDocument();

    // Trigger flyTo to Bradbury Landing
    act(() => {
      rerender(
        <TerrainScene
          initialData={mockDEM}
          flyTo={{
            target: { lat: -4.5895, lon: 137.4417 },
            zoomHint: 2.0,
            nonce: 1,
          }}
          onFlyToComplete={onFlyToComplete}
        />
      );
    });

    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("calls dispose on geometries and textures when unmounting to prevent memory leaks", () => {
    const planeGeo = new PlaneGeometry(10, 10);
    const mat = new ShaderMaterial();
    const tex = new DataTexture(new Uint8Array(4), 1, 1);

    const planeDisposeSpy = vi.spyOn(planeGeo, "dispose");
    const matDisposeSpy = vi.spyOn(mat, "dispose");
    const texDisposeSpy = vi.spyOn(tex, "dispose");

    const { unmount } = render(<TerrainScene initialData={mockDEM} />);

    // Test GPU disposal helper invoked during unmount
    disposeTerrainGPUResources({
      planeGeo,
      terrainMaterial: mat,
      heightTexture: tex,
    });

    expect(planeDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
    expect(texDisposeSpy).toHaveBeenCalled();

    act(() => {
      unmount();
    });
  });
});
