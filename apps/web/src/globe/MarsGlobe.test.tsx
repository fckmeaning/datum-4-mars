import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MarsGlobe } from "./MarsGlobe";

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

describe("MarsGlobe component", () => {
  it("renders globe container with accessibility label and overlay badges", () => {
    render(<MarsGlobe interactive={true} autoRotate={false} showOrbiters={true} />);

    const region = screen.getByRole("region", { name: /interactive 3d mars globe/i });
    expect(region).toBeInTheDocument();

    // Check placeholder texture overlay badge
    expect(screen.getByText(/procedural shading \(placeholder texture\)/i)).toBeInTheDocument();
    expect(screen.getByText(/orbiters: approximate/i)).toBeInTheDocument();
    expect(screen.getByText(/aoi: gale crater/i)).toBeInTheDocument();
  });

  it("renders with custom AOI coordinates", () => {
    render(<MarsGlobe aoi={{ lat: 18.65, lon: -133.8 }} showOrbiters={false} />);

    expect(screen.getByText(/18.65°/)).toBeInTheDocument();
    expect(screen.queryByText(/orbiters: approximate/i)).not.toBeInTheDocument();
  });

  it("handles reduced motion during flyIn without crash", () => {
    const onFlyInComplete = vi.fn();
    render(<MarsGlobe flyIn={true} onFlyInComplete={onFlyInComplete} />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});
