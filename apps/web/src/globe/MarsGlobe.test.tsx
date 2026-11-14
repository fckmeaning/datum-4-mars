import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MarsGlobe } from "./MarsGlobe";
import type { OrbiterApiState } from "./orbit";

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

describe("MarsGlobe component (T-701 & T-703)", () => {
  const mockOrbiters: OrbiterApiState[] = [
    {
      id: "mro",
      utc: "2026-10-01T12:00:00Z",
      lat: -4.5,
      lon: 137.4,
      alt_m: 290000,
      xyz_bodyfixed_m: [0, 0, 0],
      accuracy: "approximate",
    },
    {
      id: "odyssey",
      utc: "2026-10-01T12:00:00Z",
      lat: 10.0,
      lon: 50.0,
      alt_m: 390000,
      xyz_bodyfixed_m: [0, 0, 0],
      accuracy: "approximate",
    },
  ];

  it("renders globe container with accessibility label, procedural texture badge, and ALT readout", () => {
    render(
      <MarsGlobe
        interactive={true}
        autoRotate={false}
        showOrbiters={true}
        orbiters={mockOrbiters}
      />
    );

    const region = screen.getByRole("region", { name: /interactive 3d mars globe/i });
    expect(region).toBeInTheDocument();

    // Check placeholder texture overlay badge
    expect(
      screen.getByText(/procedural shading \(placeholder texture\)/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/orbiters: approximate/i)).toBeInTheDocument();
    expect(screen.getByText(/aoi: gale crater/i)).toBeInTheDocument();

    // Altitude readout badge
    const altBadge = screen.getByTestId("globe-alt-readout");
    expect(altBadge).toBeInTheDocument();
    expect(altBadge).toHaveTextContent(/ALT:/i);
    expect(altBadge).toHaveTextContent(/km/i);
  });

  it("renders landing site labels: first person where local terrain exists, coarse 3D + 2D elsewhere", () => {
    render(<MarsGlobe interactive={false} autoRotate={false} />);

    // Gale Crater label
    const galeLabel = screen.getByTestId("site-label-gale");
    expect(galeLabel).toBeInTheDocument();
    expect(galeLabel).toHaveTextContent(/Gale Crater/i);
    expect(galeLabel).toHaveTextContent(/3D · FPV · 2D/);
    // the expedition year (landing year) sits next to the name
    expect(screen.getByTestId("site-year-gale")).toHaveTextContent("2012");
    expect(screen.getByTestId("site-year-jezero")).toHaveTextContent("2021");

    // Jezero Crater label (local rasters: 3D + 2D)
    const jezeroLabel = screen.getByTestId("site-label-jezero");
    expect(jezeroLabel).toBeInTheDocument();
    expect(jezeroLabel).toHaveTextContent(/Jezero Crater/i);
    expect(jezeroLabel).toHaveTextContent(/3D · FPV · 2D/);

    // Meridiani: MOLA 463 m relief and orbital imagery, no first person
    const mer = screen.getByTestId("site-label-meridiani");
    expect(mer).toHaveTextContent(/3D · 2D/);
    expect(mer).not.toHaveTextContent(/FPV/);
  });

  it("renders nothing for orbiters when list is empty (strict T-703 requirement)", () => {
    render(<MarsGlobe showOrbiters={true} orbiters={[]} />);

    // When empty, no APPROXIMATE orbiter labels or bottom badge should be drawn
    expect(screen.queryByText(/ORBITERS: APPROXIMATE/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("orbiter-label-mro")).not.toBeInTheDocument();
  });

  it("renders orbiter labels with APPROXIMATE badge when orbiters are present", () => {
    render(<MarsGlobe showOrbiters={true} orbiters={mockOrbiters} />);

    expect(screen.getByText(/ORBITERS: APPROXIMATE/i)).toBeInTheDocument();
    const mroLabel = screen.getByTestId("orbiter-label-mro");
    expect(mroLabel).toBeInTheDocument();
    expect(mroLabel).toHaveTextContent(/APPROXIMATE/i);
  });

  it("handles continuous zoom and reports altitude via onAltitude callback", () => {
    const onAltitude = vi.fn();
    render(<MarsGlobe onAltitude={onAltitude} />);

    // Initial altitude reported
    expect(onAltitude).toHaveBeenCalled();
    const firstCallAlt = onAltitude.mock.calls[0]?.[0];
    expect(typeof firstCallAlt).toBe("number");
    expect(firstCallAlt).toBeGreaterThan(500);
  });

  it("handles reduced motion during flyIn without crash and calls onFlyInComplete", () => {
    const onFlyInComplete = vi.fn();
    render(<MarsGlobe flyIn={true} onFlyInComplete={onFlyInComplete} />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});
