import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { TerrainScene } from "./TerrainScene";
import { generateSyntheticGaleDEM } from "./terrainLoader";

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

  it("renders terrain scene with accessibility label and initial data", () => {
    render(<TerrainScene initialData={mockDEM} verticalExaggeration={2.0} />);

    const region = screen.getByRole("region", { name: /3d gale crater terrain/i });
    expect(region).toBeInTheDocument();

    // Check telemetry overlay
    expect(screen.getByText(/gale crater 3d terrain \(l1 hrsc\/mola\)/i)).toBeInTheDocument();
    expect(screen.getByText(/colormap: cividis \(lut\)/i)).toBeInTheDocument();
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

  it("renders with custom vertical exaggeration", () => {
    render(<TerrainScene initialData={mockDEM} verticalExaggeration={3.5} />);
    expect(screen.getByText(/exaggeration: 3.5x/i)).toBeInTheDocument();
  });
});
