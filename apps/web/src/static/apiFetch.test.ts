import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const STATIC_DIR = path.resolve(__dirname, "../../public/data/static");

function mockFetch(apiStatus: number | "down") {
  const calls: string[] = [];
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.startsWith("http://api.test")) {
      if (apiStatus === "down") throw new TypeError("connection refused");
      return new Response(JSON.stringify({ from: "api" }), { status: apiStatus });
    }
    const m = /\/data\/static\/(.+)$/.exec(url);
    if (m && fs.existsSync(path.join(STATIC_DIR, m[1]!))) return new Response(fs.readFileSync(path.join(STATIC_DIR, m[1]!)));
    return new Response("nope", { status: 404 });
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("apiFetch with VITE_API_BASE (opt-in API)", () => {
  it("uses the API when it answers", async () => {
    vi.stubEnv("VITE_API_BASE", "http://api.test/");
    vi.resetModules();
    const calls = mockFetch(200);
    const { apiFetch } = await import("./apiFetch");
    const r = await apiFetch("/api/v1/health");
    expect(await r.json()).toEqual({ from: "api" });
    expect(calls).toEqual(["http://api.test/api/v1/health"]);
  });

  it("falls back to the static layer when the API is down, and stops asking it for a minute", async () => {
    vi.stubEnv("VITE_API_BASE", "http://api.test");
    vi.resetModules();
    const calls = mockFetch("down");
    const { apiFetch } = await import("./apiFetch");
    const a = await apiFetch("/api/v1/health");
    expect((await a.json()).api_version).toBe("static");
    const b = await apiFetch("/api/v1/sources");
    expect((await b.json()).length).toBeGreaterThan(0);
    expect(calls.filter((u) => u.startsWith("http://api.test"))).toHaveLength(1); // second call did not retry the dead API
  });

  it("treats HTTP 5xx like an outage", async () => {
    vi.stubEnv("VITE_API_BASE", "http://api.test");
    vi.resetModules();
    mockFetch(503);
    const { apiFetch } = await import("./apiFetch");
    expect((await (await apiFetch("/api/v1/health")).json()).api_version).toBe("static");
  });
});

describe("apiFetch without VITE_API_BASE (test mode keeps the MSW path)", () => {
  it("passes straight to fetch so the unit-test mock server answers", async () => {
    const calls = mockFetch(200);
    const { apiFetch, stripApiPrefix } = await import("./apiFetch");
    await apiFetch("/api/v1/health").catch(() => undefined);
    expect(calls[0]).toBe("/api/v1/health");
    expect(stripApiPrefix("/repo/api/v1/sun?x=1")).toBe("/sun?x=1");
    expect(stripApiPrefix("/sources")).toBe("/sources");
  });
});
