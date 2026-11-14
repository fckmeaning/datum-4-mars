import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PerspectiveCamera } from "three";

// The R3F Canvas renders nothing in jsdom (zero size) and has no frame loop, so stand it in: children mount as plain React,
// `useFrame` is inert. That is enough to exercise resource creation and disposal in <Scene>.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="canvas">{children}</div>,
  useFrame: () => undefined,
  useThree: () => ({ camera: new PerspectiveCamera() }),
}));
vi.mock("@react-three/drei", () => ({ Html: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const disposeSpy = vi.fn();
vi.mock("./fpvTerrain", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./fpvTerrain")>();
  return {
    ...orig,
    disposeFpvResources: (res: Parameters<typeof orig.disposeFpvResources>[0]) => {
      disposeSpy(res);
      orig.disposeFpvResources(res);
    },
  };
});

import { FirstPersonView, webglAvailable } from "./FirstPersonView";
import { clipmapLevels } from "./fpvTerrain";
import { generateSyntheticGaleDEM } from "../map3d/terrainLoader";
import { useAppStore } from "../state/store";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let glAvailable = true;

beforeEach(() => {
  glAvailable = true;
  disposeSpy.mockClear();
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function (type: string) {
    return glAvailable && (type === "webgl2" || type === "webgl") ? {} : null;
  };
  // the <primitive> element of R3F is unknown to React DOM: keep the expected warnings out of the test output
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  useAppStore.setState({ settings: { ...useAppStore.getState().settings, reducedMotion: false } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const dem = generateSyntheticGaleDEM(64, 64);
const route = {
  xy: [
    [0, 0],
    [200, -300],
    [450, -320],
  ],
  profile: "SAFEST",
  segments: [
    { length_m: 360, duration_s: 450, limiting_factor: "slope", o2_l: 3, energy_kJ: 120 },
    { length_m: 250, duration_s: 300, limiting_factor: "time", o2_l: 2, energy_kJ: 80 },
  ],
  totals: { o2_l: 5, energy_kJ: 200 },
};

describe("FirstPersonView", () => {
  it("renders the view with the helmet HUD and the initial route telemetry", () => {
    render(<FirstPersonView route={route} elevation={dem} base={{ x: 0, y: 0 }} waypoints={[{ name: "Boxwork", x: 450, y: -320 }]} />);
    expect(screen.getByRole("region", { name: /first-person view/i })).toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /helmet hud/i })).toBeInTheDocument();
    expect(screen.getByText("TO GO")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "O2" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("toggles the instruments with H and leaves with Escape", () => {
    const onExit = vi.fn();
    render(<FirstPersonView route={route} elevation={dem} onExit={onExit} />);
    expect(screen.getByText("TO GO")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "h" });
    expect(screen.queryByText("TO GO")).toBeNull();
    fireEvent.keyDown(window, { key: "H" });
    expect(screen.getByText("TO GO")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /exit first person/i }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it("does not start playing when reduced motion is on", () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, reducedMotion: true } });
    render(<FirstPersonView route={route} elevation={dem} />);
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
  });

  it("starts playing at the requested speed otherwise", () => {
    render(<FirstPersonView route={route} elevation={dem} initialSpeed={16} />);
    expect(screen.getByText("16x")).toBeInTheDocument();
  });

  it("explains itself when WebGL is missing", () => {
    glAvailable = false;
    expect(webglAvailable()).toBe(false);
    const onExit = vi.fn();
    render(<FirstPersonView route={route} elevation={dem} onExit={onExit} />);
    expect(screen.getByText(/3D graphics are not available/i)).toBeInTheDocument();
    expect(screen.queryByTestId("canvas")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /back to map/i }));
    expect(onExit).toHaveBeenCalled();
  });

  it("disposes every GPU resource it created when it unmounts", () => {
    const { unmount } = render(<FirstPersonView route={route} elevation={dem} waypoints={[{ name: "Boxwork", x: 450, y: -320 }]} />);
    expect(disposeSpy).not.toHaveBeenCalled();
    act(() => unmount());
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    const res = disposeSpy.mock.calls[0]![0] as { geometries: unknown[]; materials: unknown[]; textures: unknown[] };
    // clipmap rings (this coarse test DEM gives 5 m cells, hence 7 rings) + sky + ribbon + beacons, one material each,
    // plus the height texture
    expect(res.geometries.length).toBe(clipmapLevels(5) + 3);
    expect(res.materials.length).toBe(res.geometries.length);
    expect(res.textures.length).toBe(1);
  });
});
