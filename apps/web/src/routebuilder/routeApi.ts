/**
 * Network layer of the route builder. Unlike `apiClient` it NEVER falls back to mock data: a failed request surfaces as
 * a readable PlanError. `fetch` is injectable for tests.
 */
import type { components } from "../api/schema";
import { apiFetch } from "../static/apiFetch";
import { toWaypoints, type BuilderPoint } from "./model";

export type Profile = components["schemas"]["Profile"];
export type RouteResult = components["schemas"]["RouteResult"];
export type AlternativesResult = components["schemas"]["AlternativesResult"];
export type AlternativesRequest = components["schemas"]["AlternativesRequest"];
export type BackToBaseResult = components["schemas"]["BackToBaseResult"];
export type OrderResult = components["schemas"]["OrderResult"];

export const ALL_PROFILES: Profile[] = ["FASTEST", "SAFEST", "BALANCED", "SCIENCE"];
export const API_BASE = "/api/v1";

export type PlanErrorCode =
  | "OUT_OF_AOI"
  | "NO_ROUTE"
  | "INVALID_ROUTE"
  | "UNKNOWN_PLACE"
  | "NETWORK"
  | "SERVER"
  | "ABORTED"
  | "TOO_FEW_POINTS"
  | "UNKNOWN";

export class PlanError extends Error {
  readonly code: PlanErrorCode;
  readonly status: number;
  /** True when pressing "Retry" may help (network, server) */
  readonly retryable: boolean;

  constructor(code: PlanErrorCode, message: string, status = 0, retryable = false) {
    super(message);
    this.name = "PlanError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

interface ErrorBody {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
}

/** Maps an HTTP status + JSON body from the API to a PlanError with an operator-readable message. */
export function mapApiError(status: number, body: unknown): PlanError {
  const b = (body && typeof body === "object" ? body : {}) as ErrorBody;
  const code = typeof b.code === "string" ? b.code : "";
  const serverMessage =
    typeof b.message === "string" ? b.message : typeof b.detail === "string" ? b.detail : "";
  switch (code) {
    case "OUT_OF_AOI":
      return new PlanError("OUT_OF_AOI", serverMessage || "A point lies outside the mapped area. Move it inside the boundary.", status);
    case "NO_ROUTE":
      return new PlanError(
        "NO_ROUTE",
        serverMessage || "No walkable route exists between these points. Move a point off the steep terrain or add a waypoint.",
        status,
      );
    case "INVALID_ROUTE":
      return new PlanError("INVALID_ROUTE", serverMessage || "The route request is not valid.", status);
    case "UNKNOWN_PLACE":
      return new PlanError("UNKNOWN_PLACE", serverMessage || "A named place in the route is not known to the server.", status);
    default:
      break;
  }
  if (status >= 500) {
    return new PlanError("SERVER", serverMessage || `The route service failed (HTTP ${status}). Try again in a moment.`, status, true);
  }
  return new PlanError("UNKNOWN", serverMessage || `The route request was rejected (HTTP ${status}).`, status);
}

export interface BuildOptions {
  siteId: string;
  startUtc?: string | null;
  profiles?: Profile[];
  algorithm?: "astar" | "theta";
}

/** `level` is deliberately omitted: the server routes on its default level (L2, about 4 s). */
export function buildAlternativesRequest(points: BuilderPoint[], opts: BuildOptions): AlternativesRequest {
  if (points.length < 2) {
    throw new PlanError("TOO_FEW_POINTS", "Add at least two points: a start and a destination.");
  }
  return {
    site_id: opts.siteId,
    waypoints: toWaypoints(points),
    profiles: opts.profiles ?? ALL_PROFILES,
    algorithm: opts.algorithm ?? "astar",
    optimize_order: false,
    return_to_start: false,
    ...(opts.startUtc ? { start_utc: opts.startUtc } : {}),
  };
}

/** Stable key of a request (FNV-1a over canonical JSON). */
export function requestHash(req: unknown): string {
  const text = JSON.stringify(req);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Small LRU used to avoid re-planning a route the user has already seen. */
export class ResultCache<T> {
  private readonly store = new Map<string, T>();
  constructor(private readonly max = 20) {}

  get(key: string): T | undefined {
    const v = this.store.get(key);
    if (v !== undefined) {
      this.store.delete(key);
      this.store.set(key, v);
    }
    return v;
  }

  set(key: string, value: T): void {
    this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

export interface CallOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

async function postJson<T>(path: string, body: unknown, opts: CallOptions = {}): Promise<T> {
  const doFetch = opts.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => apiFetch(input, init));
  let res: Response;
  try {
    res = await doFetch(`${opts.baseUrl ?? API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new PlanError("ABORTED", "Planning was cancelled.");
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new PlanError("ABORTED", "Planning was cancelled.");
    }
    throw new PlanError("NETWORK", "Cannot reach the route service. Check that the API is running, then retry.", 0, true);
  }
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    throw mapApiError(res.status, parsed);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new PlanError("SERVER", "The route service returned an unreadable answer. Try again.", res.status, true);
  }
}

export function planAlternatives(req: AlternativesRequest, opts?: CallOptions): Promise<AlternativesResult> {
  return postJson<AlternativesResult>("/route/alternatives", req, opts);
}

export interface BackToBaseOptions {
  siteId: string;
  position: { lat: number; lon: number };
  base?: { lat: number; lon: number } | null;
  startUtc?: string | null;
  profile?: Profile;
}

export function planBackToBase(o: BackToBaseOptions, opts?: CallOptions): Promise<BackToBaseResult> {
  return postJson<BackToBaseResult>(
    "/route/back-to-base",
    {
      site_id: o.siteId,
      position: { lat: o.position.lat, lon: o.position.lon },
      ...(o.base ? { base: { lat: o.base.lat, lon: o.base.lon } } : {}),
      ...(o.startUtc ? { start_utc: o.startUtc } : {}),
      profile: o.profile ?? "SAFEST",
    },
    opts,
  );
}

export function planOrder(
  points: BuilderPoint[],
  o: { siteId: string; startUtc?: string | null; profile?: Profile; returnToStart?: boolean },
  opts?: CallOptions,
): Promise<OrderResult> {
  return postJson<OrderResult>(
    "/route/order",
    {
      site_id: o.siteId,
      waypoints: toWaypoints(points),
      profile: o.profile ?? "BALANCED",
      return_to_start: o.returnToStart ?? false,
      ...(o.startUtc ? { start_utc: o.startUtc } : {}),
    },
    opts,
  );
}
