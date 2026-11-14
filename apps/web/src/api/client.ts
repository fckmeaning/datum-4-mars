import type { components } from "./schema";
import { apiFetch } from "../static/apiFetch";
import {
  MOCK_SITE_GALE,
  MOCK_LAYERS_GALE,
  MOCK_PLACES_GALE,
  MOCK_SITE_CLOCK,
  createMockPointReport,
  MOCK_SOURCES,
  generateMockAlternatives,
  createMockBackToBase,
} from "../mocks/data";

export type Health = components["schemas"]["Health"];
export type Site = components["schemas"]["Site"];
export type LayerMeta = components["schemas"]["LayerMeta"];
export type Place = components["schemas"]["Place"];
export type DataLevel = components["schemas"]["DataLevel"];
export type AlternativesRequest = components["schemas"]["AlternativesRequest"];
export type AlternativesResult = components["schemas"]["AlternativesResult"];
export type RouteResult = components["schemas"]["RouteResult"];
export type SiteClock = components["schemas"]["SiteClock"];
export type PointReport = components["schemas"]["PointReport"];
export type SourceEntry = components["schemas"]["SourceEntry"];
export type ParetoRequest = components["schemas"]["ParetoRequest"];
export type ParetoResult = components["schemas"]["ParetoResult"];
export type BackToBaseRequest = components["schemas"]["BackToBaseRequest"];
export type BackToBaseResult = components["schemas"]["BackToBaseResult"];
export type PlaceKind = "gazetteer" | "mission_informal" | "base" | "user" | "coordinate";

export class ApiError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_BASE_URL = "/api/v1";

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<T> {
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    // static build: the default base is answered from the static layer (no /api request); a custom base is a real fetch
    response = await (baseUrl === DEFAULT_BASE_URL ? apiFetch(url, { ...options, headers }) : fetch(url, { ...options, headers }));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new ApiError(`Network connection failed while calling ${endpoint}: ${errorMsg}`, 0);
  }

  if (!response.ok) {
    let errorDetails: unknown;
    let serverMessage = response.statusText;
    try {
      const data = await response.json();
      errorDetails = data;
      if (data && typeof data === "object") {
        if ("message" in data) {
          serverMessage = String(data.message);
        } else if ("detail" in data) {
          serverMessage = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
        }
      }
    } catch {
      // response body is not json
    }
    throw new ApiError(
      `API request to ${endpoint} failed (${response.status}): ${serverMessage}`,
      response.status,
      errorDetails,
    );
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  async getHealth(baseUrl?: string): Promise<Health> {
    try {
      return await request<Health>("/health", { method: "GET" }, baseUrl);
    } catch {
      return {
        status: "ok",
        api_version: "1.1.0 (SIMULATED)",
        contract_version: 1,
        data_levels: ["L0", "L1", "L2", "L3"],
      };
    }
  },

  async getSiteClock(siteId: string, utc?: string, baseUrl?: string): Promise<SiteClock> {
    try {
      const query = utc ? `?utc=${encodeURIComponent(utc)}` : "";
      return await request<SiteClock>(`/sites/${encodeURIComponent(siteId)}/clock${query}`, { method: "GET" }, baseUrl);
    } catch {
      return MOCK_SITE_CLOCK;
    }
  },

  async whatsHere(siteId: string, lat: number, lon: number, utc?: string, baseUrl?: string): Promise<PointReport> {
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
      });
      if (utc) params.set("utc", utc);
      return await request<PointReport>(
        `/sites/${encodeURIComponent(siteId)}/whats-here?${params.toString()}`,
        { method: "GET" },
        baseUrl,
      );
    } catch {
      return createMockPointReport(lat, lon);
    }
  },

  async listSources(baseUrl?: string): Promise<SourceEntry[]> {
    try {
      return await request<SourceEntry[]>("/sources", { method: "GET" }, baseUrl);
    } catch {
      return MOCK_SOURCES;
    }
  },

  async listSites(baseUrl?: string): Promise<Site[]> {
    try {
      return await request<Site[]>("/sites", { method: "GET" }, baseUrl);
    } catch {
      return [MOCK_SITE_GALE];
    }
  },

  async getSite(siteId: string, baseUrl?: string): Promise<Site> {
    try {
      return await request<Site>(`/sites/${encodeURIComponent(siteId)}`, { method: "GET" }, baseUrl);
    } catch {
      if (siteId === "gale") return MOCK_SITE_GALE;
      throw new ApiError(`Site ${siteId} not found`, 404);
    }
  },

  async listLayers(siteId: string, level?: DataLevel, baseUrl?: string): Promise<LayerMeta[]> {
    try {
      const query = level ? `?level=${encodeURIComponent(level)}` : "";
      return await request<LayerMeta[]>(`/sites/${encodeURIComponent(siteId)}/layers${query}`, { method: "GET" }, baseUrl);
    } catch {
      if (siteId === "gale") {
        return level ? MOCK_LAYERS_GALE.filter((l) => l.level === level) : MOCK_LAYERS_GALE;
      }
      return [];
    }
  },

  async listSitePlaces(siteId: string, kinds?: PlaceKind[], baseUrl?: string): Promise<Place[]> {
    try {
      const queryParams = new URLSearchParams();
      if (kinds && kinds.length > 0) {
        for (const kind of kinds) {
          queryParams.append("kind", kind);
        }
      }
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
      return await request<Place[]>(`/sites/${encodeURIComponent(siteId)}/places${queryString}`, { method: "GET" }, baseUrl);
    } catch {
      if (siteId === "gale") {
        return kinds && kinds.length > 0
          ? MOCK_PLACES_GALE.filter((p) => kinds.includes(p.kind))
          : MOCK_PLACES_GALE;
      }
      return [];
    }
  },

  async searchPlaces(q: string, siteId?: string, limit: number = 10, baseUrl?: string): Promise<Place[]> {
    try {
      const queryParams = new URLSearchParams({ q });
      if (siteId) queryParams.set("site_id", siteId);
      queryParams.set("limit", limit.toString());
      return await request<Place[]>(`/places/search?${queryParams.toString()}`, { method: "GET" }, baseUrl);
    } catch {
      const query = q.toLowerCase().trim();
      const pool = MOCK_PLACES_GALE;
      if (!query) return pool.slice(0, limit);
      return pool
        .filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            (p.description && p.description.toLowerCase().includes(query)) ||
            (p.aliases && p.aliases.some((a) => a.toLowerCase().includes(query))),
        )
        .slice(0, limit);
    }
  },

  async routeAlternatives(req: AlternativesRequest, baseUrl?: string): Promise<AlternativesResult> {
    try {
      return await request<AlternativesResult>(
        "/route/alternatives",
        {
          method: "POST",
          body: JSON.stringify(req),
        },
        baseUrl,
      );
    } catch {
      const waypoints = req.waypoints ?? [];
      const startWp = waypoints[0];
      const endWp = waypoints[waypoints.length - 1];

      const startLat = startWp?.lat ?? -4.5895;
      const startLon = startWp?.lon ?? 137.4417;
      const endLat = endWp?.lat ?? -4.755;
      const endLon = endWp?.lon ?? 137.382;

      return generateMockAlternatives(startLat, startLon, endLat, endLon);
    }
  },

  async routePareto(req: ParetoRequest, baseUrl?: string): Promise<ParetoResult> {
    return request<ParetoResult>(
      "/route/pareto",
      {
        method: "POST",
        body: JSON.stringify(req),
      },
      baseUrl,
    );
  },

  async routeBackToBase(req: BackToBaseRequest, baseUrl?: string): Promise<BackToBaseResult> {
    try {
      return await request<BackToBaseResult>(
        "/route/back-to-base",
        {
          method: "POST",
          body: JSON.stringify(req),
        },
        baseUrl,
      );
    } catch {
      const pos = req.position ?? { lat: -4.68, lon: 137.41 };
      const base = req.base ?? { lat: -4.5895, lon: 137.4417 };
      return createMockBackToBase(pos.lat, pos.lon, base.lat, base.lon);
    }
  },
};
