/**
 * autopilot.ts - the scripted demo tour of the whole product (two to three seconds a step; it shows nearly everything of the
 * first menu).
 *
 * The script runs on its own and drives the real pages through director.ts, as a person would: the layers of the globe
 * (topography, thermal, hazard, geology, exploration zones), a descent to Gale Crater, the 2D map with its data layers and
 * base maps, the 3D relief and its surface colours, the regional tile, a dropped pin with its range ring, an EVA plan by
 * rover with walkback, the oxygen what-if, the simulated walk of EV1 and the first-person view of that walk.
 * Every step has a caption "TITLE · subtitle". Esc, the button or the TOUR button stops it; a page that is not there
 * (slow network, no data) is skipped and the tour goes on.
 *
 * Start: the AUTOPILOT button (globe), the TOUR button on an expedition page, or `?autopilot` in the address.
 */

import { useAppStore } from "../state/store";
import { director, waitForPage, type SiteCommand } from "./director";
import { sound } from "./sound";

export type AutopilotStepId =
  | "survey"
  | "g_topo"
  | "g_thermal"
  | "g_slope"
  | "g_hazard"
  | "g_traverse"
  | "g_geology"
  | "g_zones"
  | "g_radiation"
  | "g_pressure"
  | "pick_site"
  | "descent"
  | "map_2d"
  | "map_slope"
  | "map_radiation"
  | "map_pressure"
  | "map_hazard"
  | "map_elevation"
  | "map_mola"
  | "relief_3d"
  | "relief_elevation"
  | "relief_slope"
  | "relief_radiation"
  | "relief_pressure"
  | "relief_hazard"
  | "relief_regional"
  | "pin_range"
  | "eva_plan"
  | "what_if"
  | "eva_sim"
  | "first_person"
  | "finale";

export interface AutopilotToast {
  message: string;
  severity?: "ok" | "warning" | "danger" | "info";
}

export interface AutopilotContext {
  navigate?: (path: string) => void;
  showToast?: (toast: AutopilotToast) => void;
  setFlyIn?: (flyIn: boolean) => void;
}

export interface AutopilotStepConfig {
  id: AutopilotStepId;
  /** "TITLE · subtitle" */
  caption: string;
  /** how long the step stays after its `run` has finished */
  durationMs: number;
  /** true: the step lasts exactly `durationMs` from its start (not shortened by TOUR_SPEED) */
  exact?: boolean;
  run: (ctx: AutopilotContext) => Promise<void> | void;
}

/** the script runs this much faster than the durations written in it (10 % quicker) */
export const TOUR_SPEED = 1.1;

const SITE = "gale";
/** the simulated walk of EV1 lasts exactly this long: 57 seconds */
export const SIM_MS = 57_000;
/** the what-if of the tour: far less oxygen than the 450 L of the model */
export const WHAT_IF_O2_L = 100;
/** the pin of the demo: about 1.9 km from the station, inside the range ring of the oxygen */
export const DEMO_PIN = { dxM: -400, dyM: -1900 } as const;

const running = () => useAppStore.getState().autopilotRunning;

/** Every layer of the globe dock (keys 1 to 9 and the pressure layer). */
const GLOBE_LAYER_IDS = ["topo", "optical", "thermal", "slope", "hazard", "traverse", "geology", "zones", "radiation", "pressure"];

/** Layers of the globe: exactly these are on (the rest off). */
function globeLayers(on: string[]): void {
  const store = useAppStore.getState();
  for (const id of GLOBE_LAYER_IDS) {
    store.setLayerState(id, { visible: on.includes(id) });
  }
}

async function until(test: () => boolean, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!running()) return false;
    if (test()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return test();
}

function goTo(ctx: AutopilotContext, path: string): void {
  if (window.location.pathname + window.location.search !== path && window.location.pathname !== path.split("?")[0]) ctx.navigate?.(path);
}

/** How long a quick step stays: the modes are flipped through one after another. */
const QUICK_MS = 1100;

/** The layers of the globe in the order of the dock (keys 1 to 9, then the pressure layer): shown one by one, quickly. */
const GLOBE_MODES: Array<[AutopilotStepId, string, string[]]> = [
  ["g_topo", "LAYER 1 · Height, from laser altimetry (MOLA)", ["topo"]],
  ["g_thermal", "LAYER 3 · Heat, night infrared (THEMIS)", ["thermal"]],
  ["g_slope", "LAYER 4 · Steepness, modeled from the heights", ["slope"]],
  ["g_hazard", "LAYER 5 · Risk, steepness and radiation combined", ["hazard"]],
  ["g_traverse", "LAYER 6 · Curiosity's trail, 5 km long: a dot at this scale", ["optical", "traverse"]],
  ["g_geology", "LAYER 7 · Rock, USGS geologic units", ["geology"]],
  ["g_zones", "LAYER 8 · Candidate zones, where NASA wants to land people", ["optical", "zones"]],
  ["g_radiation", "LAYER 9 · Dose, radiation modeled from the instrument on Curiosity", ["radiation"]],
  ["g_pressure", "LAYER 10 · Air, surface pressure modeled from height", ["pressure"]],
];

/** The 2D map of the expedition page: data layers and base maps, quickly. */
const MAP_MODES: Array<[AutopilotStepId, string, SiteCommand[]]> = [
  ["map_slope", "FLAT MAP · steepness", [{ type: "layers", layers: ["slope"] }]],
  ["map_radiation", "FLAT MAP · radiation dose", [{ type: "layers", layers: ["radiation"] }]],
  ["map_pressure", "FLAT MAP · air pressure", [{ type: "layers", layers: ["pressure"] }]],
  ["map_hazard", "FLAT MAP · risk", [{ type: "layers", layers: ["hazard"] }]],
  ["map_elevation", "BASE MAP · colour by height", [{ type: "layers", layers: [] }, { type: "basemap", basemap: "elev" }]],
  ["map_mola", "BASE MAP · MOLA colours", [{ type: "basemap", basemap: "mola" }]],
];

/** The surface colours of the 3D relief, quickly. */
const RELIEF_MODES: Array<[AutopilotStepId, string, "elevation" | "slope" | "radiation" | "pressure" | "hazard"]> = [
  ["relief_elevation", "RELIEF · colour by height", "elevation"],
  ["relief_slope", "RELIEF · steepness", "slope"],
  ["relief_radiation", "RELIEF · radiation dose", "radiation"],
  ["relief_pressure", "RELIEF · air pressure", "pressure"],
  ["relief_hazard", "RELIEF · risk", "hazard"],
];

export const AUTOPILOT_STEPS: AutopilotStepConfig[] = [
  {
    id: "survey",
    caption: "DATUM-4 · One planet, ten data layers, every landing site",
    durationMs: 2200,
    run: async (ctx) => {
      goTo(ctx, "/globe");
      await waitForPage("globe");
      globeLayers(["optical", "traverse"]);
    },
  },
  ...GLOBE_MODES.map(
    ([id, caption, on]): AutopilotStepConfig => ({
      id,
      caption,
      durationMs: QUICK_MS,
      run: () => {
        globeLayers(on);
        if (id === "g_traverse") director.globe({ type: "select", id: SITE }); // the globe turns to Gale, where the traverse is
      },
    }),
  ),
  {
    id: "pick_site",
    caption: "FIRST STOP · Gale Crater, 4.6° S",
    durationMs: 2000,
    run: () => {
      globeLayers(["optical", "traverse"]);
      director.globe({ type: "select", id: SITE });
    },
  },
  {
    id: "descent",
    caption: "GOING DOWN · from orbit to the crater floor",
    durationMs: 400,
    run: async (ctx) => {
      ctx.setFlyIn?.(true);
      const arrived = await until(() => window.location.pathname === `/site/${SITE}`, 16000);
      if (!arrived && running()) ctx.navigate?.(`/site/${SITE}`);
      await waitForPage("site", 20000);
    },
  },
  {
    id: "map_2d",
    caption: "FLAT MAP · true colour sharpened by the CTX camera, with Curiosity's real route",
    durationMs: 2200,
    run: () => {
      director.site({ type: "view", view: "2d" });
      director.site({ type: "basemap", basemap: null });
      director.site({ type: "layers", layers: [] });
    },
  },
  ...MAP_MODES.map(
    ([id, caption, cmds]): AutopilotStepConfig => ({
      id,
      caption,
      durationMs: QUICK_MS,
      run: () => {
        for (const c of cmds) director.site(c);
      },
    }),
  ),
  {
    id: "relief_3d",
    caption: "RELIEF · the same ground in 3D, 10 m terrain",
    durationMs: 2500,
    run: async () => {
      director.site({ type: "layers", layers: [] });
      director.site({ type: "basemap", basemap: null });
      director.site({ type: "view", view: "3d" });
      await waitForPage("relief", 15000);
      director.relief({ type: "mode", mode: "imagery" });
    },
  },
  ...RELIEF_MODES.map(
    ([id, caption, mode]): AutopilotStepConfig => ({
      id,
      caption,
      durationMs: QUICK_MS,
      run: () => {
        director.relief({ type: "mode", mode });
      },
    }),
  ),
  {
    id: "relief_regional",
    caption: "WIDE VIEW · 119 km of coarser terrain, with a door into the detailed area",
    durationMs: 2500,
    run: async () => {
      director.relief({ type: "mode", mode: "imagery" });
      director.site({ type: "tier", tier: "regional" });
      await waitForPage("relief", 15000);
    },
  },
  {
    id: "pin_range",
    caption: "PIN A POINT · the blue ring is how far you can go and still get home on your tank",
    durationMs: 3000,
    run: async () => {
      director.site({ type: "tier", tier: "best" });
      await waitForPage("site", 15000);
      director.site({ type: "view", view: "2d" });
      director.site({ type: "plan", on: true });
      director.site({ type: "pin", dxM: DEMO_PIN.dxM, dyM: DEMO_PIN.dyM });
    },
  },
  {
    id: "eva_plan",
    caption: "SORTIE PLAN · a science goal driven by rover, with oxygen, daylight and a verdict",
    durationMs: 3200,
    run: () => {
      director.site({ type: "clearPin" });
      director.site({ type: "mode", mode: "rover" });
      director.site({ type: "goal", index: 0 });
    },
  },
  {
    id: "what_if",
    caption: "STRESS TEST · a smaller tank turns the same drive into ABORT",
    durationMs: 2800,
    run: () => {
      director.site({ type: "o2", l: WHAT_IF_O2_L });
      sound.ping("warn");
    },
  },
  {
    id: "eva_sim",
    caption: "WALKTHROUGH · EV1 follows the plan for 57 seconds: tank, point of no return, way home",
    durationMs: SIM_MS,
    exact: true,
    run: () => {
      director.site({ type: "o2", l: null });
      director.site({ type: "view", view: "3d" });
      // the whole plan is walked in exactly the time the step lasts
      director.site({ type: "sim", on: true, withinS: SIM_MS / 1000 });
      // half of it in 3D with the follow camera, the other half on the 2D map
      const token = useAppStore.getState().autopilotStep;
      setTimeout(() => {
        if (running() && useAppStore.getState().autopilotStep === token) director.site({ type: "view", view: "2d" });
      }, SIM_MS / 2);
    },
  },
  {
    id: "first_person",
    caption: "THROUGH THE HELMET · EV1's view along the plan",
    durationMs: 3500,
    run: async () => {
      director.site({ type: "view", view: "fpv" });
      await until(() => !!document.querySelector(".site-fpv canvas"), 8000);
    },
  },
  {
    id: "finale",
    caption: "DATUM-4 · know where you are, know the way back",
    durationMs: 2200,
    run: () => {
      director.site({ type: "sim", on: false });
      director.site({ type: "view", view: "2d" });
    },
  },
];

export class AutopilotController {
  private currentIndex: number = -1;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isRunning: boolean = false;
  /** bumped on every start and stop: a step of a tour that has been stopped must not touch the next one */
  private token: number = 0;
  private layerSnapshot: Record<string, { visible: boolean }> | null = null;
  private context: AutopilotContext = {};
  private onStepListeners: Array<(step: AutopilotStepConfig, index: number) => void> = [];
  private onCompleteListeners: Array<() => void> = [];
  private onCancelListeners: Array<() => void> = [];

  constructor(context: AutopilotContext = {}) {
    this.context = context;
  }

  public setContext(context: Partial<AutopilotContext>) {
    this.context = { ...this.context, ...context };
  }

  public get running(): boolean {
    return this.isRunning;
  }

  public get stepIndex(): number {
    return this.currentIndex;
  }

  public get currentStep(): AutopilotStepConfig | null {
    if (this.currentIndex >= 0 && this.currentIndex < AUTOPILOT_STEPS.length) {
      return AUTOPILOT_STEPS[this.currentIndex] ?? null;
    }
    return null;
  }

  public start(startIndex: number = 0) {
    this.stop();
    this.token++;
    sound.wake(); // starting is a click: the browser lets the sound begin
    const layers = useAppStore.getState().layers;
    this.layerSnapshot = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, { visible: v.visible }]));
    this.isRunning = true;
    useAppStore.getState().setAutopilotRunning(true);
    this.executeStep(startIndex);
  }

  public stop() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    const wasRunning = this.isRunning;
    this.isRunning = false;
    this.token++;
    this.currentIndex = -1;
    if (wasRunning) {
      // leave the pages as the tour found them: the globe layers, no walk in progress
      director.site({ type: "sim", on: false });
      director.site({ type: "o2", l: null });
      director.site({ type: "mode", mode: "foot" });
      director.site({ type: "layers", layers: [] });
      director.site({ type: "basemap", basemap: null });
      director.site({ type: "tier", tier: "best" });
      director.relief({ type: "mode", mode: "imagery" });
      if (this.layerSnapshot) for (const [id, st] of Object.entries(this.layerSnapshot)) useAppStore.getState().setLayerState(id, st);
      this.layerSnapshot = null;
    }
    useAppStore.getState().setAutopilotRunning(false);
    useAppStore.getState().setAutopilotStep(null, null);

    if (wasRunning) {
      this.onCancelListeners.forEach((fn) => fn());
    }
  }

  public next() {
    if (!this.isRunning) return;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.executeStep(this.currentIndex + 1);
  }

  private async executeStep(index: number) {
    if (!this.isRunning) return;

    if (index >= AUTOPILOT_STEPS.length) {
      this.stop();
      this.onCompleteListeners.forEach((fn) => fn());
      return;
    }

    this.currentIndex = index;
    const token = this.token;
    const step = AUTOPILOT_STEPS[index]!;
    useAppStore.getState().setAutopilotStep(step.id, step.caption);
    sound.ping("step");
    this.onStepListeners.forEach((fn) => fn(step, index));

    const began = Date.now();
    try {
      await Promise.resolve(step.run(this.context));
    } catch (err) {
      this.context.showToast?.({
        message: `Step ${step.id} skipped due to an error.`,
        severity: "warning",
      });
    }

    if (!this.isRunning || token !== this.token) return;

    // the time a step spent waiting for its page counts towards its duration
    const dwell = Math.max(400, (step.exact ? step.durationMs : step.durationMs / TOUR_SPEED) - (Date.now() - began));
    this.timerId = setTimeout(() => {
      this.executeStep(index + 1);
    }, dwell);
  }

  public onStep(listener: (step: AutopilotStepConfig, index: number) => void): () => void {
    this.onStepListeners.push(listener);
    return () => {
      this.onStepListeners = this.onStepListeners.filter((l) => l !== listener);
    };
  }

  public onComplete(listener: () => void): () => void {
    this.onCompleteListeners.push(listener);
    return () => {
      this.onCompleteListeners = this.onCompleteListeners.filter((l) => l !== listener);
    };
  }

  public onCancel(listener: () => void): () => void {
    this.onCancelListeners.push(listener);
    return () => {
      this.onCancelListeners = this.onCancelListeners.filter((l) => l !== listener);
    };
  }
}

/** Global singleton instance for seamless cross-component operation */
export const globalAutopilot = new AutopilotController();
