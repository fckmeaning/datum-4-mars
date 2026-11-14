/**
 * useRouteBuilder: owns the planner for one mounted builder, feeds the site context into the store, re-plans after
 * user edits (debounced), mirrors the point list into the shared app store and handles the keyboard shortcuts.
 */
import { useEffect, useMemo, useRef } from "react";
import { useAppStore } from "../state/store";
import { toWaypoints, type BBox, type BaseRef } from "./model";
import { RoutePlanner } from "./planner";
import { useRouteBuilderStore } from "./routeBuilderStore";

export interface UseRouteBuilderOptions {
  siteId?: string;
  bbox?: BBox;
  base?: BaseRef;
  /** Inject a planner (tests); by default one is created per mounted builder */
  planner?: RoutePlanner;
  /** Disable the Enter / Esc / Z / Delete shortcuts (default: enabled) */
  keyboard?: boolean;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

export interface RouteBuilderApi {
  planner: RoutePlanner;
  plan: () => Promise<void>;
  cancel: () => void;
  retry: () => Promise<void>;
  backToBase: () => Promise<void>;
  optimiseOrder: () => Promise<void>;
}

export function useRouteBuilder(options: UseRouteBuilderOptions = {}): RouteBuilderApi {
  const { siteId, bbox, base, planner: injected, keyboard = true } = options;
  const plannerRef = useRef<RoutePlanner | null>(injected ?? null);
  if (!plannerRef.current) plannerRef.current = new RoutePlanner();
  const planner = plannerRef.current;

  // site context -> store
  useEffect(() => {
    const st = useRouteBuilderStore.getState();
    if (siteId) st.setSiteId(siteId);
    if (bbox) st.setBounds(bbox);
    if (base) st.setBase(base);
  }, [siteId, bbox, base]);

  // user edits -> debounced re-plan (only once a plan exists) and mirror to the app store
  useEffect(() => {
    return useRouteBuilderStore.subscribe((state, prev) => {
      if (state.change.seq === prev.change.seq) return;
      useAppStore.getState().setWaypoints(toWaypoints(state.points));
      if (state.change.source !== "user") return;
      if (state.points.length < 2) {
        planner.cancel();
        return;
      }
      if (state.hasPlanned) planner.schedule();
    });
  }, [planner]);

  // keyboard
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const st = useRouteBuilderStore.getState();
      if (!st.active || isTypingTarget(e.target)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void planner.runNow();
      } else if (e.key === "Escape") {
        if (st.status === "planning") planner.cancel();
        else st.setActive(false);
      } else if ((e.key === "z" || e.key === "Z") && !e.altKey && !(e.shiftKey && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        st.undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.selectedPointId) {
        e.preventDefault();
        st.removePointById(st.selectedPointId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, planner]);

  useEffect(() => () => planner.dispose(), [planner]);

  return useMemo<RouteBuilderApi>(
    () => ({
      planner,
      plan: () => planner.runNow(),
      cancel: () => planner.cancel(),
      retry: () => planner.runNow(),
      backToBase: () => planner.backToBase(),
      optimiseOrder: () => planner.optimiseOrder(),
    }),
    [planner],
  );
}
