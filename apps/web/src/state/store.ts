import { create } from "zustand";
import type { components } from "../api/schema";

export type Waypoint = components["schemas"]["Waypoint"];
export type RouteResult = components["schemas"]["RouteResult"];
export type DataLevel = components["schemas"]["DataLevel"];
export type GeoPoint = components["schemas"]["GeoPoint"];

export type AppMode = "2d" | "3d" | "globe";

/** How /globe draws the planet: the 3D globe or the flat map (see flatmap/). */
export type PlanetView = "globe" | "flat";

export interface LocalizationEllipse {
  lat: number;
  lon: number;
  a_m: number;
  b_m: number;
  angle_deg: number;
}

export interface LayerState {
  /** Whether the layer is currently rendered on map */
  visible: boolean;
  /** Opacity from 0.0 (transparent) to 1.0 (opaque) */
  opacity: number;
}

export interface CameraState {
  /** Target planetocentric coordinates */
  center: GeoPoint;
  /** Current zoom level */
  zoom: number;
  /** Heading in degrees (0 = North, clockwise) */
  heading_deg: number;
  /** Camera pitch/tilt in degrees (0 = nadir/top-down, 90 = horizon) */
  pitch_deg: number;
}

export interface FlyToRequest {
  /** Destination lat/lon */
  target: GeoPoint;
  /** Optional target zoom hint */
  zoomHint?: number;
  /** Unique sequential identifier to trigger animation even if target coordinates match */
  nonce: number;
}

export interface AppSettings {
  /** Display unit system */
  units: "metric" | "imperial";
  /** UI language code (e.g. 'en') */
  language: string;
  /** Respect user preference to disable smooth camera animations */
  reducedMotion: boolean;
}

export interface AppState {
  /** Active view mode: 2D satellite map, 3D tilted terrain, or global Mars view */
  mode: AppMode;
  /** Active site identifier (e.g. 'gale') */
  siteId: string;
  /** Active resolution data level (L0: synthetic, L1: 200m, L2: 20m CTX, L3: 1m HiRISE) */
  level: DataLevel;
  /** Layer visibility and opacity indexed by layer id */
  layers: Record<string, LayerState>;
  /** Ordered list of route waypoints (start, via, science, goal) */
  waypoints: Waypoint[];
  /** Computed alternative routes */
  routes: RouteResult[];
  /** Selected active route id from routes list */
  selectedRouteId: string | null;
  /** Current simulation time in UTC (ISO 8601 string) */
  utc: string;
  /** Camera state shared between 2D and 3D views */
  camera: CameraState;
  /** Pending fly-to animation target, consumed by map views */
  flyTo: FlyToRequest | null;
  /** Whether the Points of Interest menu is currently open */
  poiOpen: boolean;
  /** Application user settings */
  settings: AppSettings;
  /** ID of currently inspected place for place card modal/sheet */
  selectedPlaceId: string | null;
  /** Directions panel open state */
  directionsOpen: boolean;
  /** Autonomous localization fix error ellipse */
  localizationEllipse: LocalizationEllipse | null;
  /** Camera altitude in kilometers above the Martian datum (used by Globe, 3D terrain, and BottomBar ALT readout) */
  altitude_km: number;
  /** Which picture of the planet /globe shows: the 3D globe or the flat map */
  viewMode: PlanetView;
  /** Whether the automated 90-second mission tour is active */
  autopilotRunning: boolean;
  /** Active step identifier of the autopilot state machine */
  autopilotStep: string | null;
  /** Subtitle/caption for the active autopilot tour step */
  autopilotCaption: string | null;

  // Actions
  setMode: (mode: AppMode) => void;
  setSiteId: (siteId: string) => void;
  setLevel: (level: DataLevel) => void;
  setLayerState: (id: string, state: Partial<LayerState>) => void;
  setWaypoints: (waypoints: Waypoint[]) => void;
  addWaypoint: (waypoint: Waypoint) => void;
  removeWaypoint: (index: number) => void;
  setRoutes: (routes: RouteResult[]) => void;
  setSelectedRouteId: (id: string | null) => void;
  setUtc: (utc: string) => void;
  setCamera: (camera: Partial<CameraState>) => void;
  triggerFlyTo: (target: GeoPoint, zoomHint?: number) => void;
  clearFlyTo: () => void;
  setPoiOpen: (open: boolean) => void;
  setSelectedPlaceId: (id: string | null) => void;
  setDirectionsOpen: (open: boolean) => void;
  setLocalizationEllipse: (ellipse: LocalizationEllipse | null) => void;
  setAltitudeKm: (altitude_km: number) => void;
  setViewMode: (viewMode: PlanetView) => void;
  setAutopilotRunning: (running: boolean) => void;
  setAutopilotStep: (step: string | null, caption?: string | null) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
}

let flyToNonce = 0;

export const useAppStore = create<AppState>((set) => ({
  mode: "2d",
  siteId: "gale",
  level: "L0",
  layers: {
    elevation: { visible: true, opacity: 1.0 },
    optical: { visible: true, opacity: 1.0 },
    slope: { visible: false, opacity: 0.8 },
    hazard: { visible: false, opacity: 0.8 },
    hillshade: { visible: false, opacity: 0.8 },
    traverse: { visible: true, opacity: 1.0 },
    geology: { visible: false, opacity: 0.8 },
    zones: { visible: false, opacity: 1.0 },
    thermal: { visible: false, opacity: 0.8 },
    topo: { visible: false, opacity: 0.8 },
    radiation: { visible: false, opacity: 0.85 },
    pressure: { visible: false, opacity: 0.85 },
  },
  waypoints: [
    { role: "start", dwell_min: 0, lat: -4.5895, lon: 137.4417 },
  ],
  routes: [],
  selectedRouteId: null,
  utc: new Date("2026-10-01T12:00:00Z").toISOString(),
  camera: {
    center: { lat: -4.72, lon: 137.40 },
    zoom: 12,
    heading_deg: 0,
    pitch_deg: 0,
  },
  flyTo: null,
  poiOpen: false,
  selectedPlaceId: null,
  directionsOpen: false,
  localizationEllipse: null,
  altitude_km: 1800,
  viewMode: "globe",
  autopilotRunning: false,
  autopilotStep: null,
  autopilotCaption: null,
  settings: {
    units: "metric",
    language: "en",
    reducedMotion: false,
  },

  setMode: (mode) => set({ mode }),
  setSiteId: (siteId) => set({ siteId }),
  setLevel: (level) => set({ level }),
  setLayerState: (id, partial) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [id]: {
          visible: partial.visible ?? state.layers[id]?.visible ?? true,
          opacity: partial.opacity ?? state.layers[id]?.opacity ?? 1.0,
        },
      },
    })),
  setWaypoints: (waypoints) => set({ waypoints }),
  addWaypoint: (waypoint) =>
    set((state) => ({ waypoints: [...state.waypoints, waypoint] })),
  removeWaypoint: (index) =>
    set((state) => ({
      waypoints: state.waypoints.filter((_, i) => i !== index),
    })),
  setRoutes: (routes) => set({ routes }),
  setSelectedRouteId: (selectedRouteId) => set({ selectedRouteId }),
  setUtc: (utc) => set({ utc }),
  setCamera: (partial) =>
    set((state) => ({ camera: { ...state.camera, ...partial } })),
  triggerFlyTo: (target, zoomHint) =>
    set({
      flyTo: {
        target,
        zoomHint,
        nonce: ++flyToNonce,
      },
      camera: {
        ...useAppStore.getState().camera,
        center: target,
        ...(zoomHint !== undefined ? { zoom: zoomHint } : {}),
      },
    }),
  clearFlyTo: () => set({ flyTo: null }),
  setPoiOpen: (poiOpen) => set({ poiOpen }),
  setSelectedPlaceId: (selectedPlaceId) => set({ selectedPlaceId }),
  setDirectionsOpen: (directionsOpen) => set({ directionsOpen }),
  setLocalizationEllipse: (localizationEllipse) => set({ localizationEllipse }),
  setAltitudeKm: (altitude_km) => set({ altitude_km }),
  setViewMode: (viewMode) => set({ viewMode }),
  setAutopilotRunning: (autopilotRunning) => set({ autopilotRunning }),
  setAutopilotStep: (autopilotStep, caption) =>
    set({
      autopilotStep,
      ...(caption !== undefined ? { autopilotCaption: caption } : {}),
    }),
  updateSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
}));
