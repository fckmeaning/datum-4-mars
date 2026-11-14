import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pixelSizeM } from "../demRaster";
import type { EvaOverlay } from "../SiteMap";
import { latLonToLocal, localToLatLon } from "../terrainData";
import type { SiteDem } from "../useSiteDem";
import { EVA, type Mode } from "./evaModel";
import { gridFromDem, type Pt } from "./grid";
import { rangeRing, type RangeRing } from "./range";
import { evaAt, planEva, type EvaAt, type Plan } from "./plan";

export const MAX_STOPS = 6;
export const WARPS = [60, 300, 900] as const;

/** A stop of the plan; goal stops carry the id and name of the place. */
export interface NamedStop extends Pt {
  id?: string;
  name?: string;
}

export interface EvaPlanner {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  stops: NamedStop[];
  /** the science goal the stops came from, cleared when the stops are edited by hand */
  goalId: string | null;
  /** replace the stops with the places of a goal */
  setStopsFromList: (list: Array<{ id: string; name: string; lat: number; lon: number }>, goalId: string) => void;
  /** index of the stop whose information and photos are shown */
  selected: number | null;
  setSelected: (i: number | null) => void;
  addStop: (lat: number, lon: number) => void;
  /** a stop at local metres (x east, y north from the middle of the tile), e.g. a click on the 3D terrain */
  addStopLocal: (x: number, y: number) => void;
  followCam: boolean;
  setFollowCam: (v: boolean) => void;
  removeStop: (i: number) => void;
  reset: () => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  /** the oxygen the suit carries [L] (a what-if: less than the 450 L of the model makes plans fail) */
  o2CapacityL: number;
  setO2CapacityL: (l: number) => void;
  /** the route comes back to the station (on by default) */
  returnHome: boolean;
  setReturnHome: (v: boolean) => void;
  plan: Plan | null;
  error: string | null;
  /** simulation */
  playing: boolean;
  toggleSim: () => void;
  warp: number;
  setWarp: (w: number) => void;
  at: EvaAt | null;
  overlay: EvaOverlay | null;
  /** the range ring of a point: where one can walk on from it and still get back to the station on the usable oxygen */
  rangeAt: (x: number, y: number) => RangeRing | null;
}

/** State of the EVA planner on a site page: stops, plan, and the simulated walk (EV1) along it. */
export function useEvaPlanner(dem: SiteDem | null, station: { lat: number; lon: number }): EvaPlanner {
  const [enabled, setEnabled] = useState(false);
  const [stops, setStops] = useState<NamedStop[]>([]);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("foot");
  const [returnHome, setReturnHome] = useState(true);
  const [o2CapacityL, setO2CapacityL] = useState<number>(EVA.o2_capacity_l);
  const [simT, setSimT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [warp, setWarp] = useState<number>(WARPS[1]);
  const [followCam, setFollowCam] = useState(true);

  const grid = useMemo(() => {
    if (!dem) return null;
    const { dx, dy } = pixelSizeM(dem.meta);
    return gridFromDem(dem.heights, dem.meta.width, dem.meta.height, dx, dy, 256);
  }, [dem]);
  const home = useMemo(() => (dem ? latLonToLocal(dem, station.lat, station.lon) : null), [dem, station.lat, station.lon]);

  // a new tile or site drops the stops of the old one
  useEffect(() => {
    setStops([]);
    setGoalId(null);
    setSelected(null);
    setSimT(null);
    setPlaying(false);
  }, [dem]);

  const result = useMemo(() => (grid && home && stops.length ? planEva(grid, home, stops, mode, { returnHome, o2CapacityL }) : null), [grid, home, stops, mode, returnHome, o2CapacityL]);
  const plan = result && !("error" in result) ? result : null;
  const error = result && "error" in result ? result.error : null;

  // any change of the plan stops the walk
  useEffect(() => {
    setSimT(null);
    setPlaying(false);
  }, [plan]);

  const total = plan ? plan.nodes[plan.nodes.length - 1]!.cumT : 0;
  const last = useRef(0);
  useEffect(() => {
    if (!playing || !plan) return;
    let raf = 0;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      let finished = false;
      setSimT((t) => {
        const next = (t ?? 0) + dt * warp;
        if (next >= total) {
          finished = true;
          return total;
        }
        return next;
      });
      if (finished) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, plan, warp, total]);

  const rangeAt = useCallback(
    (x: number, y: number) => (grid && home ? rangeRing(grid, home, { x, y }, 72, o2CapacityL) : null),
    [grid, home, o2CapacityL],
  );

  const toggleSim = useCallback(() => {
    if (!plan) return;
    if (playing) setPlaying(false);
    else {
      setSimT((t) => (t === null || t >= total ? 0 : t));
      setPlaying(true);
    }
  }, [plan, playing, total]);

  const addStop = useCallback(
    (lat: number, lon: number) => {
      if (!dem) return;
      setGoalId(null);
      setStops((cur) => (cur.length >= MAX_STOPS ? cur : [...cur, latLonToLocal(dem, lat, lon)]));
    },
    [dem],
  );

  const setStopsFromList = useCallback(
    (list: Array<{ id: string; name: string; lat: number; lon: number }>, goal: string) => {
      if (!dem) return;
      setGoalId(goal);
      setSelected(list.length ? 0 : null);
      setStops(list.slice(0, MAX_STOPS).map((p) => ({ ...latLonToLocal(dem, p.lat, p.lon), id: p.id, name: p.name })));
    },
    [dem],
  );

  const addStopLocal = useCallback((x: number, y: number) => {
    setGoalId(null);
    setStops((cur) => (cur.length >= MAX_STOPS ? cur : [...cur, { x, y }]));
  }, []);

  const at = plan && simT !== null ? evaAt(plan, simT) : null;

  const overlay = useMemo<EvaOverlay | null>(() => {
    if (!dem || !plan) return null;
    const ll = (x: number, y: number): [number, number] => {
      const p = localToLatLon(dem, x, y);
      return [p.lon, p.lat];
    };
    return {
      path: plan.nodes.map((n) => ll(n.x, n.y)),
      stops: plan.stopNodes.map((i) => ll(plan.nodes[i]!.x, plan.nodes[i]!.y)),
      names: plan.stopNodes.map((_, k) => stops[k]?.name ?? ""),
      noReturn: plan.noReturn === null ? null : ll(plan.nodes[plan.noReturn]!.x, plan.nodes[plan.noReturn]!.y),
      ev1: null,
      ev1State: "nominal",
    };
  }, [dem, plan, stops]);

  const overlayWithEv1 = useMemo<EvaOverlay | null>(() => {
    if (!overlay || !dem) return overlay;
    if (!at) return overlay;
    const p = localToLatLon(dem, at.x, at.y);
    return { ...overlay, ev1: [p.lon, p.lat], ev1State: at.state };
  }, [overlay, dem, at]);

  return {
    rangeAt,
    enabled,
    setEnabled,
    stops,
    addStop,
    addStopLocal,
    followCam,
    setFollowCam,
    goalId,
    setStopsFromList,
    selected,
    setSelected,
    removeStop: (i) => {
      setGoalId(null);
      setSelected(null);
      setStops((cur) => cur.filter((_, k) => k !== i));
    },
    reset: () => {
      setGoalId(null);
      setSelected(null);
      setStops([]);
      setSimT(null);
      setPlaying(false);
    },
    mode,
    setMode,
    o2CapacityL,
    setO2CapacityL,
    returnHome,
    setReturnHome,
    plan,
    error,
    playing,
    toggleSim,
    warp,
    setWarp,
    at,
    overlay: overlayWithEv1,
  };
}
