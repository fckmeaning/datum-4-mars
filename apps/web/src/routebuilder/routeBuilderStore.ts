/**
 * Zustand store of the route builder: the editable point list (with undo), planning status and the last results.
 * Mutations go through the pure reducers in model.ts. The shared app store is only touched by the planner and the hook.
 */
import { create } from "zustand";
import {
  GALE_BASE,
  GALE_BBOX,
  MAX_HISTORY,
  OUT_OF_AOI_MESSAGE,
  addPoint,
  applyOrder,
  insideBBox,
  movePoint,
  newPointId,
  normaliseRoles,
  removePoint,
  reorderPoint,
  reversePoints,
  setDwell,
  snapToBase,
  type BBox,
  type BaseRef,
  type BuilderPoint,
} from "./model";
import type { BackToBaseResult, PlanErrorCode, RouteResult } from "./routeApi";

export type PlanStatus = "idle" | "planning" | "done" | "error";

export interface PlanErrorState {
  code: PlanErrorCode;
  message: string;
  retryable: boolean;
}

export interface BackInfo {
  bearing_deg: number;
  distance_m: number;
  eta_s: number;
  dose_mSv: number;
}

export type ChangeSource = "user" | "system";

export interface AddResult {
  ok: boolean;
  message?: string;
  id?: string;
}

export interface RouteBuilderState {
  /** "Plan route" mode: map clicks add points */
  active: boolean;
  points: BuilderPoint[];
  history: BuilderPoint[][];
  selectedPointId: string | null;
  siteId: string;
  base: BaseRef;
  bbox: BBox;
  status: PlanStatus;
  elapsedMs: number;
  /** Shown after a few seconds: the first call compiles the numerical kernels */
  warmupHint: boolean;
  fromCache: boolean;
  error: PlanErrorState | null;
  /** Transient message (e.g. point refused outside the AOI) */
  notice: string | null;
  results: RouteResult[];
  hasPlanned: boolean;
  backInfo: BackInfo | null;
  /** Counter + source of the last edit of `points`; the hook re-plans only after user edits */
  change: { seq: number; source: ChangeSource };

  setActive: (active: boolean) => void;
  setSiteId: (siteId: string) => void;
  setBase: (base: BaseRef) => void;
  setBounds: (bbox: BBox) => void;
  addPointAt: (lat: number, lon: number) => AddResult;
  movePointTo: (id: string, lat: number, lon: number) => AddResult;
  removePointById: (id: string) => void;
  reorder: (from: number, to: number) => void;
  reverse: () => void;
  clear: () => void;
  undo: () => void;
  setDwellFor: (id: string, minutes: number) => void;
  selectPoint: (id: string | null) => void;
  /** Replaces the list (used by back-to-base and order optimisation) */
  replacePoints: (points: BuilderPoint[], source?: ChangeSource) => void;
  applyPermutation: (order: number[]) => void;
  setNotice: (notice: string | null) => void;
  setPlanning: () => void;
  setElapsed: (elapsedMs: number, warmupHint: boolean) => void;
  setDone: (results: RouteResult[], fromCache: boolean) => void;
  setFailed: (error: PlanErrorState) => void;
  setIdle: () => void;
  setBackInfo: (info: BackInfo | null) => void;
  reset: () => void;
}

const initial = () => ({
  active: false,
  points: [] as BuilderPoint[],
  history: [] as BuilderPoint[][],
  selectedPointId: null as string | null,
  siteId: "gale",
  base: GALE_BASE,
  bbox: GALE_BBOX,
  status: "idle" as PlanStatus,
  elapsedMs: 0,
  warmupHint: false,
  fromCache: false,
  error: null as PlanErrorState | null,
  notice: null as string | null,
  results: [] as RouteResult[],
  hasPlanned: false,
  backInfo: null as BackInfo | null,
  change: { seq: 0, source: "user" as ChangeSource },
});

function sameList(a: BuilderPoint[], b: BuilderPoint[]): boolean {
  return a === b || (a.length === b.length && a.every((p, i) => p === b[i]));
}

export const useRouteBuilderStore = create<RouteBuilderState>((set, get) => {
  /** Applies an edit with undo history and the change counter. */
  const commit = (next: BuilderPoint[], source: ChangeSource = "user") =>
    set((s) => {
      if (sameList(next, s.points)) return {}; // no real change: no history entry, no re-plan
      const selected = s.selectedPointId && next.some((p) => p.id === s.selectedPointId) ? s.selectedPointId : null;
      return {
        points: next,
        history: [...s.history.slice(-(MAX_HISTORY - 1)), s.points],
        selectedPointId: selected,
        change: { seq: s.change.seq + 1, source },
        notice: null,
      };
    });

  return {
    ...initial(),

    setActive: (active) => set({ active, ...(active ? {} : { notice: null }) }),
    setSiteId: (siteId) => set({ siteId }),
    setBase: (base) => set({ base }),
    setBounds: (bbox) => set({ bbox }),

    addPointAt: (lat, lon) => {
      const s = get();
      if (!insideBBox(lat, lon, s.bbox)) {
        set({ notice: OUT_OF_AOI_MESSAGE });
        return { ok: false, message: OUT_OF_AOI_MESSAGE };
      }
      const snap = snapToBase(lat, lon, s.base);
      const id = newPointId();
      commit(addPoint(s.points, { id, lat: snap.lat, lon: snap.lon, ...(snap.name ? { name: snap.name } : {}), ...(snap.placeId ? { placeId: snap.placeId } : {}) }));
      set({ selectedPointId: id });
      return { ok: true, id };
    },

    movePointTo: (id, lat, lon) => {
      const s = get();
      if (!insideBBox(lat, lon, s.bbox)) {
        set({ notice: OUT_OF_AOI_MESSAGE });
        // the marker is redrawn at its old place by the map sync
        set((st) => ({ change: { seq: st.change.seq + 1, source: "system" } }));
        return { ok: false, message: OUT_OF_AOI_MESSAGE };
      }
      commit(movePoint(s.points, id, lat, lon, s.base));
      return { ok: true, id };
    },

    removePointById: (id) => commit(removePoint(get().points, id)),
    reorder: (from, to) => commit(reorderPoint(get().points, from, to)),
    reverse: () => commit(reversePoints(get().points)),
    clear: () =>
      set((s) => {
        if (s.points.length === 0) return {};
        return {
          points: [],
          history: [...s.history.slice(-(MAX_HISTORY - 1)), s.points],
          selectedPointId: null,
          results: [],
          hasPlanned: false,
          status: "idle",
          error: null,
          backInfo: null,
          notice: null,
          change: { seq: s.change.seq + 1, source: "system" },
        };
      }),

    undo: () =>
      set((s) => {
        const prev = s.history[s.history.length - 1];
        if (!prev) return {};
        return {
          points: prev,
          history: s.history.slice(0, -1),
          selectedPointId: null,
          change: { seq: s.change.seq + 1, source: "user" },
          notice: null,
        };
      }),

    setDwellFor: (id, minutes) => commit(setDwell(get().points, id, minutes)),
    selectPoint: (id) => set({ selectedPointId: id }),
    replacePoints: (points, source = "user") => commit(normaliseRoles(points), source),
    applyPermutation: (order) => commit(applyOrder(get().points, order)),
    setNotice: (notice) => set({ notice }),

    setPlanning: () => set({ status: "planning", error: null, elapsedMs: 0, warmupHint: false, fromCache: false }),
    setElapsed: (elapsedMs, warmupHint) => set({ elapsedMs, warmupHint }),
    setDone: (results, fromCache) => set({ status: "done", results, hasPlanned: true, error: null, fromCache, warmupHint: false }),
    setFailed: (error) => set({ status: "error", error, warmupHint: false }),
    setIdle: () => set({ status: "idle", warmupHint: false }),
    setBackInfo: (backInfo) => set({ backInfo }),
    reset: () => set({ ...initial() }),
  };
});

export function backInfoFrom(res: BackToBaseResult): BackInfo {
  return { bearing_deg: res.bearing_deg, distance_m: res.distance_m, eta_s: res.eta_s, dose_mSv: res.dose_mSv };
}
