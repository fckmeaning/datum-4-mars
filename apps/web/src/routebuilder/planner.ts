/**
 * RoutePlanner: debounced, cancellable planning on top of routeApi. It owns the AbortController, the elapsed-time
 * ticker, the request cache and the delivery of results to the builder store and the shared app store.
 */
import { useAppStore } from "../state/store";
import { applyOrder, toWaypoints, normaliseRoles, newPointId, type BuilderPoint } from "./model";
import { backInfoFrom, useRouteBuilderStore } from "./routeBuilderStore";
import {
  PlanError,
  ResultCache,
  buildAlternativesRequest,
  planAlternatives,
  planBackToBase,
  planOrder,
  requestHash,
  type AlternativesResult,
  type RouteResult,
} from "./routeApi";

export interface PlannerOptions {
  fetchImpl?: typeof fetch;
  /** Wait after the last edit before re-planning (ms) */
  debounceMs?: number;
  /** After this long the UI explains the first-run compilation (ms) */
  warmupHintMs?: number;
  tickMs?: number;
  getUtc?: () => string | null;
  cache?: ResultCache<AlternativesResult>;
  /** Mirror routes / selection / waypoints into the shared app store (Map2D, charts) */
  mirrorToApp?: boolean;
}

export const DEFAULT_DEBOUNCE_MS = 800;
export const DEFAULT_WARMUP_HINT_MS = 6000;

/** Keeps the previously selected profile, otherwise the BALANCED knee, otherwise the first route. */
export function pickSelected(routes: RouteResult[], previousProfile: string | null): RouteResult | undefined {
  return (
    (previousProfile ? routes.find((r) => r.profile === previousProfile) : undefined) ??
    routes.find((r) => r.profile === "BALANCED") ??
    routes[0]
  );
}

export class RoutePlanner {
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly debounceMs: number;
  private readonly warmupHintMs: number;
  private readonly tickMs: number;
  private readonly getUtc: () => string | null;
  private readonly cache: ResultCache<AlternativesResult>;
  private readonly mirror: boolean;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private controller: AbortController | null = null;
  private seq = 0;

  constructor(opts: PlannerOptions = {}) {
    this.fetchImpl = opts.fetchImpl;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.warmupHintMs = opts.warmupHintMs ?? DEFAULT_WARMUP_HINT_MS;
    this.tickMs = opts.tickMs ?? 250;
    this.getUtc = opts.getUtc ?? (() => useAppStore.getState().utc ?? null);
    this.cache = opts.cache ?? new ResultCache<AlternativesResult>(20);
    this.mirror = opts.mirrorToApp ?? true;
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  /** Re-plans after `debounceMs` of quiet; every call restarts the wait and stale requests are cancelled on start. */
  schedule(): void {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runNow();
    }, this.debounceMs);
  }

  async runNow(): Promise<void> {
    this.clearDebounce();
    const st = useRouteBuilderStore.getState();
    let req;
    try {
      req = buildAlternativesRequest(st.points, { siteId: st.siteId, startUtc: this.getUtc() });
    } catch (err) {
      this.fail(err);
      return;
    }
    const key = requestHash(req);
    const hit = this.cache.get(key);
    if (hit) {
      this.cancelInFlight();
      this.deliver(hit.routes, true);
      return;
    }

    this.cancelInFlight();
    const mySeq = ++this.seq;
    const controller = new AbortController();
    this.controller = controller;
    useRouteBuilderStore.getState().setPlanning();
    this.startTicker(mySeq);
    try {
      const res = await planAlternatives(req, { signal: controller.signal, ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}) });
      if (mySeq !== this.seq) return; // a newer request superseded this one
      this.cache.set(key, res);
      this.deliver(res.routes, false);
    } catch (err) {
      if (mySeq !== this.seq) return;
      if (err instanceof PlanError && err.code === "ABORTED") {
        useRouteBuilderStore.getState().setIdle();
        return;
      }
      this.fail(err);
    } finally {
      if (mySeq === this.seq) this.stopTicker();
    }
  }

  /** User pressed Cancel / Esc: abort the request, stop the clock and drop a pending debounce. */
  cancel(): void {
    this.clearDebounce();
    const wasPlanning = useRouteBuilderStore.getState().status === "planning";
    this.cancelInFlight();
    if (wasPlanning) useRouteBuilderStore.getState().setIdle();
  }

  /**
   * "Back to base": the most recent point is the current position; the planner asks the API for the return route and
   * shows it as the single result (position to base).
   */
  async backToBase(): Promise<void> {
    const st = useRouteBuilderStore.getState();
    const position = st.points[st.points.length - 1];
    if (!position) {
      st.setNotice("Place your current position on the map first, then ask for the way back.");
      return;
    }
    this.clearDebounce();
    this.cancelInFlight();
    const mySeq = ++this.seq;
    const controller = new AbortController();
    this.controller = controller;
    st.setPlanning();
    this.startTicker(mySeq);
    try {
      const res = await planBackToBase(
        { siteId: st.siteId, position: { lat: position.lat, lon: position.lon }, base: { lat: st.base.lat, lon: st.base.lon }, startUtc: this.getUtc() },
        { signal: controller.signal, ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}) },
      );
      if (mySeq !== this.seq) return;
      const start: BuilderPoint = { ...position, role: "start", dwell_min: 0 };
      const goal: BuilderPoint = {
        id: newPointId(),
        lat: st.base.lat,
        lon: st.base.lon,
        role: "goal",
        dwell_min: 0,
        name: st.base.name,
        placeId: st.base.id,
      };
      useRouteBuilderStore.getState().replacePoints(normaliseRoles([start, goal]), "system");
      useRouteBuilderStore.getState().setBackInfo(backInfoFrom(res));
      this.deliver([res.route], false);
    } catch (err) {
      if (mySeq !== this.seq) return;
      if (err instanceof PlanError && err.code === "ABORTED") {
        useRouteBuilderStore.getState().setIdle();
        return;
      }
      this.fail(err);
    } finally {
      if (mySeq === this.seq) this.stopTicker();
    }
  }

  /** "Optimise order": shortest visiting order (Held-Karp up to 13 stops), then plan straight away. */
  async optimiseOrder(): Promise<void> {
    const st = useRouteBuilderStore.getState();
    if (st.points.length < 3) {
      st.setNotice("Add at least three points (start, a stop and a goal) to optimise the order.");
      return;
    }
    this.clearDebounce();
    this.cancelInFlight();
    const mySeq = ++this.seq;
    const controller = new AbortController();
    this.controller = controller;
    st.setPlanning();
    this.startTicker(mySeq);
    try {
      const res = await planOrder(
        st.points,
        { siteId: st.siteId, startUtc: this.getUtc() },
        { signal: controller.signal, ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}) },
      );
      if (mySeq !== this.seq) return;
      const reordered = applyOrder(st.points, res.order);
      this.stopTicker();
      useRouteBuilderStore.getState().replacePoints(reordered, "system");
      await this.runNow();
    } catch (err) {
      if (mySeq !== this.seq) return;
      if (err instanceof PlanError && err.code === "ABORTED") {
        useRouteBuilderStore.getState().setIdle();
        return;
      }
      this.fail(err);
    } finally {
      if (mySeq === this.seq) this.stopTicker();
    }
  }

  dispose(): void {
    this.clearDebounce();
    this.cancelInFlight();
  }

  // ---------------------------------------------------------------- internals
  private deliver(routes: RouteResult[], fromCache: boolean): void {
    const store = useRouteBuilderStore.getState();
    store.setDone(routes, fromCache);
    if (!this.mirror) return;
    const app = useAppStore.getState();
    const previous = app.routes.find((r) => r.route_id === app.selectedRouteId)?.profile ?? null;
    const chosen = pickSelected(routes, previous);
    app.setRoutes(routes);
    app.setSelectedRouteId(chosen ? chosen.route_id : null);
    app.setWaypoints(toWaypoints(store.points));
  }

  private fail(err: unknown): void {
    const e =
      err instanceof PlanError
        ? err
        : new PlanError("UNKNOWN", err instanceof Error ? err.message : "Route planning failed.");
    useRouteBuilderStore.getState().setFailed({ code: e.code, message: e.message, retryable: e.retryable });
  }

  private startTicker(mySeq: number): void {
    this.stopTicker();
    const t0 = Date.now();
    this.ticker = setInterval(() => {
      if (mySeq !== this.seq) return;
      const elapsed = Date.now() - t0;
      useRouteBuilderStore.getState().setElapsed(elapsed, elapsed >= this.warmupHintMs);
    }, this.tickMs);
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private cancelInFlight(): void {
    this.seq += 1; // invalidates callbacks of the request being aborted
    this.stopTicker();
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }
}
