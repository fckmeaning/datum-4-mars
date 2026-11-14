import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutopilotController, AUTOPILOT_STEPS, DEMO_PIN, SIM_MS, WHAT_IF_O2_L } from "./autopilot";
import { registerGlobeDirector, registerReliefDirector, registerSiteDirector, type GlobeCommand, type ReliefCommand, type SiteCommand } from "./director";
import { useAppStore } from "../state/store";

describe("Autopilot tour", () => {
  let unregister: Array<() => void> = [];
  const globeLog: GlobeCommand[] = [];
  const siteLog: SiteCommand[] = [];
  const reliefLog: ReliefCommand[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    window.history.pushState({}, "", "/globe");
    globeLog.length = 0;
    siteLog.length = 0;
    reliefLog.length = 0;
    useAppStore.setState({ autopilotRunning: false, autopilotStep: null, autopilotCaption: null });
    unregister = [
      registerGlobeDirector((cmd) => {
        globeLog.push(cmd);
        return cmd.type === "ready" ? true : undefined;
      }),
      registerSiteDirector((cmd) => {
        siteLog.push(cmd);
        return cmd.type === "ready" ? true : undefined;
      }),
      registerReliefDirector((cmd) => {
        reliefLog.push(cmd);
        return cmd.type === "ready" ? true : undefined;
      }),
    ];
  });

  afterEach(() => {
    unregister.forEach((u) => u());
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("is a script about a minute and a half: the modes go by quickly, the planning and the walk are slower", () => {
    const ids = AUTOPILOT_STEPS.map((s) => s.id);
    // the nine layers of the globe (keys 1 to 9, the mosaic being the intro) and the pressure layer, one after another
    expect(ids.slice(0, 11)).toEqual(["survey", "g_topo", "g_thermal", "g_slope", "g_hazard", "g_traverse", "g_geology", "g_zones", "g_radiation", "g_pressure", "pick_site"]);
    expect(ids.indexOf("descent")).toBe(11);
    // every 2D data layer and base map, every 3D surface colour
    for (const id of ["map_slope", "map_radiation", "map_pressure", "map_hazard", "map_elevation", "map_mola", "relief_elevation", "relief_slope", "relief_radiation", "relief_pressure", "relief_hazard"] as const) expect(ids).toContain(id);
    // then the slow part: pin, plan, what-if, the walk at top speed, the helmet, the end
    expect(ids.slice(-7)).toEqual(["relief_regional", "pin_range", "eva_plan", "what_if", "eva_sim", "first_person", "finale"]);

    const byId = new Map(AUTOPILOT_STEPS.map((s) => [s.id, s]));
    for (const id of ["g_topo", "g_pressure", "map_slope", "map_mola", "relief_elevation", "relief_hazard"] as const) expect(byId.get(id)!.durationMs).toBeLessThanOrEqual(1200); // quick
    for (const id of ["pin_range", "eva_plan", "what_if"] as const) expect(byId.get(id)!.durationMs).toBeGreaterThanOrEqual(2500); // slower
    expect(byId.get("eva_sim")!.durationMs).toBe(57_000); // the simulated walk lasts exactly 57 seconds
    expect(byId.get("eva_sim")!.exact).toBe(true);
    expect(SIM_MS).toBe(57_000);

    const total = AUTOPILOT_STEPS.reduce((sum, s) => sum + s.durationMs, 0);
    expect(total).toBeGreaterThanOrEqual(85_000); // the quick modes, then the walk of 57 seconds
    expect(total).toBeLessThanOrEqual(115_000);
    for (const s of AUTOPILOT_STEPS) expect(s.caption).toMatch(/^[^·]+ · .+/);
  });

  it("drives the globe and the expedition page in order and finishes", async () => {
    const navigate = vi.fn();
    const setFlyIn = vi.fn((on: boolean) => {
      if (on) window.history.pushState({}, "", "/site/gale"); // the descent ends on the expedition page
    });
    const controller = new AutopilotController({ navigate, setFlyIn });
    const order: string[] = [];
    controller.onStep((s) => order.push(s.id));
    const complete = vi.fn();
    controller.onComplete(complete);

    controller.start();
    expect(useAppStore.getState().autopilotRunning).toBe(true);
    await vi.advanceTimersByTimeAsync(200_000);

    expect(order).toEqual(AUTOPILOT_STEPS.map((s) => s.id));
    expect(complete).toHaveBeenCalled();
    expect(controller.running).toBe(false);
    expect(useAppStore.getState().autopilotRunning).toBe(false);

    // the globe: the site is picked like a click on its row, then the camera descends
    expect(globeLog).toContainEqual({ type: "select", id: "gale" });
    expect(setFlyIn).toHaveBeenCalledWith(true);
    expect(navigate).not.toHaveBeenCalled(); // already on /globe, and the descent arrived by itself

    // the expedition page: map, relief, pin with its range ring, a science goal, the walk, and the end of the walk
    const cmds = siteLog.filter((c) => c.type !== "ready");
    expect(cmds[0]).toEqual({ type: "view", view: "2d" });
    expect(cmds).toContainEqual({ type: "view", view: "3d" });
    expect(cmds).toContainEqual({ type: "pin", dxM: DEMO_PIN.dxM, dyM: DEMO_PIN.dyM });
    expect(cmds).toContainEqual({ type: "mode", mode: "rover" }); // on foot every goal of Gale is NO-GO, the rover with walkback is GO
    expect(cmds).toContainEqual({ type: "goal", index: 0 });
    expect(cmds).toContainEqual({ type: "o2", l: WHAT_IF_O2_L });
    expect(cmds.findIndex((c) => c.type === "o2" && c.l === null)).toBeGreaterThan(cmds.findIndex((c) => c.type === "o2" && c.l === WHAT_IF_O2_L)); // the full suit comes back before the walk
    expect(cmds).toContainEqual({ type: "sim", on: true, withinS: 57 }); // the whole plan in exactly 57 seconds

    // nearly everything of the first menu: the data layers and base maps of the 2D map, the 3D surface colours,
    // the regional tile and back, and the first-person view of EV1
    for (const layer of ["slope", "radiation", "pressure", "hazard"] as const) expect(cmds).toContainEqual({ type: "layers", layers: [layer] });
    expect(cmds).toContainEqual({ type: "basemap", basemap: "mola" });
    expect(cmds).toContainEqual({ type: "basemap", basemap: "elev" });
    for (const mode of ["imagery", "elevation", "slope", "radiation", "pressure", "hazard"] as const) expect(reliefLog).toContainEqual({ type: "mode", mode });
    const tiers = cmds.filter((c) => c.type === "tier").map((c) => (c as { tier: string }).tier);
    expect(tiers.slice(0, 2)).toEqual(["regional", "best"]);
    expect(cmds).toContainEqual({ type: "view", view: "fpv" });
    expect(cmds.findIndex((c) => c.type === "view" && c.view === "fpv")).toBeGreaterThan(cmds.findIndex((c) => c.type === "sim" && c.on)); // EV1 walks, then the helmet view
    const on = cmds.findIndex((c) => c.type === "sim" && c.on);
    const off = cmds.map((c) => c.type === "sim" && !c.on).lastIndexOf(true);
    expect(off).toBeGreaterThan(on);
  });

  it("goes to /site/gale itself when the descent does not arrive", async () => {
    const navigate = vi.fn();
    const controller = new AutopilotController({ navigate, setFlyIn: vi.fn() });
    controller.start();
    await vi.advanceTimersByTimeAsync(200_000);
    expect(navigate).toHaveBeenCalledWith("/site/gale");
    controller.stop();
  });

  it("starts from another page by going to the globe", () => {
    window.history.pushState({}, "", "/site/jezero");
    const navigate = vi.fn();
    const controller = new AutopilotController({ navigate });
    controller.start();
    expect(navigate).toHaveBeenCalledWith("/globe");
    controller.stop();
  });

  it("puts the globe layers back and stops the walk when it is stopped", async () => {
    useAppStore.getState().setLayerState("topo", { visible: false });
    useAppStore.getState().setLayerState("optical", { visible: true });
    const controller = new AutopilotController({});
    controller.start();
    await vi.advanceTimersByTimeAsync(2600); // survey -> topography
    expect(useAppStore.getState().layers.topo?.visible).toBe(true);
    expect(useAppStore.getState().layers.optical?.visible).toBe(false);

    controller.stop();
    expect(controller.running).toBe(false);
    expect(controller.stepIndex).toBe(-1);
    expect(useAppStore.getState().layers.topo?.visible).toBe(false);
    expect(useAppStore.getState().layers.optical?.visible).toBe(true);
    expect(siteLog).toContainEqual({ type: "sim", on: false });
  });

  it("cancels immediately when stop() is called", () => {
    const cancelMock = vi.fn();
    const controller = new AutopilotController();
    controller.onCancel(cancelMock);
    controller.start();
    expect(controller.running).toBe(true);
    controller.stop();
    expect(controller.running).toBe(false);
    expect(useAppStore.getState().autopilotStep).toBeNull();
    expect(cancelMock).toHaveBeenCalled();
  });

  it("skips a step that fails, with a toast, and carries on", async () => {
    const toast = vi.fn();
    const failing = vi.fn(() => {
      throw new Error("Simulated failure");
    });
    const original = AUTOPILOT_STEPS[1]!.run;
    AUTOPILOT_STEPS[1]!.run = failing;
    const controller = new AutopilotController({ showToast: toast });
    try {
      controller.start();
      await vi.advanceTimersByTimeAsync(6000);
      expect(failing).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("skipped"), severity: "warning" }));
      expect(controller.stepIndex).toBeGreaterThanOrEqual(1);
    } finally {
      AUTOPILOT_STEPS[1]!.run = original;
      controller.stop();
    }
  });

  it("a stopped tour does not touch the next one", async () => {
    const controller = new AutopilotController({});
    controller.start();
    await vi.advanceTimersByTimeAsync(100);
    controller.stop();
    controller.start();
    siteLog.length = 0;
    globeLog.length = 0;
    await vi.advanceTimersByTimeAsync(1500);
    // the first tour was still waiting for the globe in step 1 when it was stopped; the second is on step 1 as well
    expect(controller.stepIndex).toBe(0);
    controller.stop();
  });
  it("really switches every layer of the globe, one at a time", async () => {
    const controller = new AutopilotController({});
    const seen: Record<string, string[]> = {};
    controller.onStep((step) => {
      if (!step.id.startsWith("g_") && step.id !== "survey") return;
      // read the store right after the step's run (it is synchronous for the layer steps)
      setTimeout(() => {
        const on = Object.entries(useAppStore.getState().layers).filter(([, v]) => v.visible).map(([k]) => k);
        seen[step.id] = on;
      }, 0);
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(14_000);
    controller.stop();
    expect(seen["g_topo"]).toContain("topo");
    expect(seen["g_thermal"]).toContain("thermal");
    expect(seen["g_slope"]).toContain("slope");
    expect(seen["g_hazard"]).toContain("hazard");
    expect(seen["g_geology"]).toContain("geology"); // these four were never switched before
    expect(seen["g_zones"]).toContain("zones");
    expect(seen["g_radiation"]).toContain("radiation");
    expect(seen["g_pressure"]).toContain("pressure");
    // and only that one: the layer of the step before is off again
    expect(seen["g_radiation"]).not.toContain("geology");
    expect(seen["g_pressure"]).not.toContain("radiation");
  });

  it("holds the simulated walk for exactly 57 seconds", async () => {
    const controller = new AutopilotController({ setFlyIn: () => window.history.pushState({}, "", "/site/gale") });
    const at: Record<string, number> = {};
    controller.onStep((step) => {
      at[step.id] = Date.now();
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(220_000);
    expect(at["eva_sim"]).toBeDefined();
    expect(at["first_person"]! - at["eva_sim"]!).toBe(57_000);
    expect(siteLog.filter((c) => c.type === "view" && c.view === "2d").length).toBeGreaterThan(1); // half way the walk moves to the 2D map
    controller.stop();
  });
});
