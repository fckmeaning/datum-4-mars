import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../state/store";
import { alternativesBody, jsonResponse, makeRoute } from "./fixtures";
import { GALE_BASE } from "./model";
import { RoutePlanner, pickSelected } from "./planner";
import { useRouteBuilderStore } from "./routeBuilderStore";

const S = () => useRouteBuilderStore.getState();
type FetchFn = typeof fetch;

function twoPoints() {
  S().addPointAt(-4.7, 137.4);
  S().addPointAt(-4.65, 137.35);
}

/** A fetch that stays pending until `release()` and rejects with AbortError when its signal fires. */
function pendingFetch() {
  const calls: { signal: AbortSignal | null | undefined; release: (r: Response) => void }[] = [];
  const impl = vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const call = { signal: init?.signal, release: resolve };
        calls.push(call);
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  );
  return { impl: impl as unknown as FetchFn, mock: impl, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
  S().reset();
  useAppStore.setState({ routes: [], selectedRouteId: null, waypoints: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("debounced re-planning", () => {
  it("waits 800 ms after the last edit and sends exactly one request", async () => {
    twoPoints();
    const fetchImpl = vi.fn(async () => jsonResponse(alternativesBody()));
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn, getUtc: () => "2026-11-14T15:30:00Z" });

    planner.schedule();
    await vi.advanceTimersByTimeAsync(300);
    planner.schedule();
    await vi.advanceTimersByTimeAsync(300);
    planner.schedule();
    await vi.advanceTimersByTimeAsync(799);
    expect(fetchImpl).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(S().status).toBe("done");
    expect(S().results).toHaveLength(4);
    planner.dispose();
  });

  it("does not fire after cancel()", async () => {
    twoPoints();
    const fetchImpl = vi.fn(async () => jsonResponse(alternativesBody()));
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn });
    planner.schedule();
    planner.cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("cancellation of stale requests", () => {
  it("aborts the first request when a newer one starts and shows only the newer result", async () => {
    twoPoints();
    const f = pendingFetch();
    const planner = new RoutePlanner({ fetchImpl: f.impl });

    const first = planner.runNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls).toHaveLength(1);

    S().addPointAt(-4.6, 137.3); // the user keeps editing
    const second = planner.runNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0]?.signal?.aborted).toBe(true);
    expect(f.calls[1]?.signal?.aborted).toBe(false);

    const body = alternativesBody();
    body.routes[0] = makeRoute("FASTEST", { time_s: 1234 });
    f.calls[1]?.release(jsonResponse(body));
    await Promise.all([first, second]);

    expect(S().status).toBe("done");
    expect(S().results[0]?.totals.time_s).toBe(1234);
  });

  it("cancel() stops the request, the clock and returns to idle without an error", async () => {
    twoPoints();
    const f = pendingFetch();
    const planner = new RoutePlanner({ fetchImpl: f.impl });
    const run = planner.runNow();
    await vi.advanceTimersByTimeAsync(1000);
    expect(S().status).toBe("planning");
    expect(S().elapsedMs).toBeGreaterThanOrEqual(750);

    planner.cancel();
    await run;
    expect(f.calls[0]?.signal?.aborted).toBe(true);
    expect(S().status).toBe("idle");
    expect(S().error).toBeNull();
    const frozen = S().elapsedMs;
    await vi.advanceTimersByTimeAsync(2000);
    expect(S().elapsedMs).toBe(frozen);
  });
});

describe("progress", () => {
  it("shows the kernel-compilation hint only after 6 s", async () => {
    twoPoints();
    const f = pendingFetch();
    const planner = new RoutePlanner({ fetchImpl: f.impl });
    void planner.runNow();
    await vi.advanceTimersByTimeAsync(5500);
    expect(S().warmupHint).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(S().warmupHint).toBe(true);
    expect(S().elapsedMs).toBeGreaterThanOrEqual(6000);
    planner.cancel();
  });
});

describe("cache", () => {
  it("serves an identical request from the cache without a second fetch", async () => {
    twoPoints();
    const fetchImpl = vi.fn(async () => jsonResponse(alternativesBody()));
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn, getUtc: () => "2026-11-14T15:30:00Z" });
    await planner.runNow();
    expect(S().fromCache).toBe(false);
    await planner.runNow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(S().fromCache).toBe(true);
    expect(S().status).toBe("done");
    expect(planner.cacheSize).toBe(1);

    S().addPointAt(-4.6, 137.3); // different points: a real request again
    await planner.runNow();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("errors", () => {
  it("shows a NO_ROUTE answer as a non-retryable error", async () => {
    twoPoints();
    const fetchImpl = vi.fn(async () => jsonResponse({ code: "NO_ROUTE", message: "No feasible route: blocked. Try other points." }, 422));
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn });
    await planner.runNow();
    expect(S().status).toBe("error");
    expect(S().error).toMatchObject({ code: "NO_ROUTE", retryable: false });
    expect(S().error?.message).toContain("No feasible route");
  });

  it("shows a network failure as retryable and recovers on retry", async () => {
    twoPoints();
    let up = false;
    const fetchImpl = vi.fn(async () => {
      if (!up) throw new TypeError("Failed to fetch");
      return jsonResponse(alternativesBody());
    });
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn });
    await planner.runNow();
    expect(S().error).toMatchObject({ code: "NETWORK", retryable: true });
    up = true;
    await planner.runNow();
    expect(S().status).toBe("done");
    expect(S().error).toBeNull();
  });

  it("refuses to plan with fewer than two points", async () => {
    S().addPointAt(-4.7, 137.4);
    const fetchImpl = vi.fn();
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn });
    await planner.runNow();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(S().error?.code).toBe("TOO_FEW_POINTS");
  });
});

describe("delivery to the shared app store", () => {
  it("selects BALANCED first and keeps the user's profile on re-plan", async () => {
    twoPoints();
    const fetchImpl = vi.fn(async () => jsonResponse(alternativesBody()));
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn });
    await planner.runNow();
    expect(useAppStore.getState().routes).toHaveLength(4);
    expect(useAppStore.getState().selectedRouteId).toBe("r-balanced");
    expect(useAppStore.getState().waypoints).toHaveLength(2);

    useAppStore.getState().setSelectedRouteId("r-safest");
    S().addPointAt(-4.6, 137.3);
    await planner.runNow();
    expect(useAppStore.getState().selectedRouteId).toBe("r-safest");
  });

  it("pickSelected falls back to the first route", () => {
    expect(pickSelected([makeRoute("FASTEST"), makeRoute("SAFEST")], null)?.profile).toBe("FASTEST");
    expect(pickSelected([], null)).toBeUndefined();
  });
});

describe("back to base and order optimisation", () => {
  it("asks for a position first when there are no points", async () => {
    const fetchImpl = vi.fn();
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn });
    await planner.backToBase();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(S().notice).toContain("current position");
  });

  it("replaces the list by position -> base and shows the return route", async () => {
    S().addPointAt(-4.7, 137.4);
    const route = makeRoute("SAFEST");
    const fetchImpl = vi.fn(async () => jsonResponse({ bearing_deg: 215, distance_m: 1200, eta_s: 1500, dose_mSv: 0.12, route }));
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn });
    await planner.backToBase();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/route/back-to-base");
    expect(JSON.parse(String(init.body)).position).toEqual({ lat: -4.7, lon: 137.4 });
    expect(S().points.map((p) => p.role)).toEqual(["start", "goal"]);
    expect(S().points[1]).toMatchObject({ lat: GALE_BASE.lat, lon: GALE_BASE.lon, placeId: GALE_BASE.id });
    expect(S().results).toEqual([route]);
    expect(S().backInfo).toMatchObject({ distance_m: 1200, bearing_deg: 215 });
    expect(S().change.source).toBe("system"); // must not trigger an automatic re-plan
  });

  it("needs three points to optimise the order", async () => {
    twoPoints();
    const planner = new RoutePlanner({ fetchImpl: vi.fn() as unknown as FetchFn });
    await planner.optimiseOrder();
    expect(S().notice).toContain("three points");
  });

  it("reorders by the returned permutation and then plans", async () => {
    S().addPointAt(-4.7, 137.4);
    S().addPointAt(-4.68, 137.38);
    S().addPointAt(-4.6, 137.3);
    const ids = S().points.map((p) => p.id);
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).endsWith("/route/order")
        ? jsonResponse({ order: [0, 2, 1], cost_matrix: [], total_cost: 1, method: "held_karp" })
        : jsonResponse(alternativesBody()),
    );
    const planner = new RoutePlanner({ fetchImpl: fetchImpl as unknown as FetchFn });
    await planner.optimiseOrder();
    expect(S().points.map((p) => p.id)).toEqual([ids[0], ids[2], ids[1]]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(S().status).toBe("done");
  });
});
