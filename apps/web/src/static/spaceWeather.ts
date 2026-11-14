/**
 * Space weather at Mars without a server: the browser asks NASA DONKI (WSA-ENLIL solar-wind model, NASA Goddard CCMC) itself.
 * api.nasa.gov answers with `Access-Control-Allow-Origin: *`, so a plain fetch works from any static host. No private key is
 * shipped: the request uses NASA's published public `DEMO_KEY` (tiny rate limit). When the request fails (offline, rate limit,
 * blocked) the committed snapshot `public/data/static/space_weather.json` is used and every alert is labelled as a snapshot with
 * its date, never as live. Port of apps/api/app/spaceweather.py `mars_cme_alerts`.
 */
import { STATIC_DATA, withBase } from "./config";

const DONKI_URL = "https://api.nasa.gov/DONKI/WSAEnlilSimulations";
const PUBLIC_DEMO_KEY = "DEMO_KEY";
const DAY = 86_400_000;
const LIVE_TIMEOUT_MS = 7000;

export interface SpaceWeatherAlert {
  id: string;
  kind: string;
  severity: string;
  start: string;
  end: string | null;
  source: string;
  message: string;
  mode: "live" | "snapshot";
  link?: string | null;
  /** only on snapshot alerts: when the snapshot was taken */
  snapshot_utc?: string;
}

export interface SpaceWeatherResult {
  origin: "live" | "snapshot";
  /** ISO time the data was taken: now for live data, the snapshot date for a snapshot; null when nothing could be loaded */
  asOf: string | null;
  alerts: SpaceWeatherAlert[];
  /** why live data was not used (snapshot origin only) */
  liveError?: string;
}

const isoZ = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sim = Record<string, any>;

/** Alerts for CMEs that WSA-ENLIL forecasts to reach Mars. Severity "warning" when arrival is within [-1 day, +3 days] of now. */
export function marsCmeAlerts(sims: Sim[], now: Date, mode: "live" | "snapshot" = "live"): SpaceWeatherAlert[] {
  const out: SpaceWeatherAlert[] = [];
  for (const sim of sims) {
    for (const imp of (sim.impactList as Sim[] | undefined) ?? []) {
      if (imp.location !== "Mars" || !imp.arrivalTime) continue;
      const arr = new Date(String(imp.arrivalTime).includes("Z") ? imp.arrivalTime : `${imp.arrivalTime}Z`);
      if (!Number.isFinite(arr.getTime())) continue;
      const inputs = ((sim.cmeInputs as Sim[] | undefined) ?? [{}])[0] ?? {};
      const speed = inputs.speed as number | undefined;
      const dt = arr.getTime() - now.getTime();
      const near = dt >= -DAY && dt <= 3 * DAY;
      const facts = [`CME forecast to reach Mars on ${hm(arr)} UTC`];
      if (speed) facts.push(`launch speed about ${Math.round(speed)} km/s`);
      if (imp.isGlancingBlow) facts.push("glancing blow");
      if (imp.isMinorImpact) facts.push("minor impact");
      out.push({
        id: `donki-${sim.simulationID ?? arr.toISOString()}`,
        kind: "CME",
        severity: near ? "warning" : "info",
        start: isoZ(arr),
        end: null,
        source: "NASA DONKI, WSA-ENLIL model (NASA Goddard CCMC)",
        message:
          facts.join("; ") +
          ". Advisory only: the model does not predict solar energetic particle events at Mars. Keep the walk inside the storm-shelter time.",
        mode,
        link: sim.link ?? null,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

async function fetchJson<T>(url: string, f: typeof fetch, timeoutMs: number): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await f(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Live DONKI forecasts of the last 30 days. Throws when the feed cannot be reached. */
export async function fetchLiveSpaceWeather(now: Date, f: typeof fetch = fetch): Promise<SpaceWeatherAlert[]> {
  const start = new Date(now.getTime() - 30 * DAY);
  const url = `${DONKI_URL}?startDate=${ymd(start)}&endDate=${ymd(now)}&api_key=${PUBLIC_DEMO_KEY}`;
  const data = await fetchJson<unknown>(url, f, LIVE_TIMEOUT_MS);
  if (!Array.isArray(data)) throw new Error("unexpected DONKI answer");
  return marsCmeAlerts(data as Sim[], now, "live");
}

interface SnapshotFile {
  snapshot_utc: string;
  alerts: SpaceWeatherAlert[];
}

/** The committed snapshot, every alert marked mode "snapshot" with the date it was taken. */
export async function loadSnapshot(f: typeof fetch = fetch): Promise<{ asOf: string; alerts: SpaceWeatherAlert[] }> {
  const snap = await fetchJson<SnapshotFile>(withBase(`${STATIC_DATA}/space_weather.json`), f, 8000);
  return { asOf: snap.snapshot_utc, alerts: snap.alerts.map((a) => ({ ...a, mode: "snapshot" as const, snapshot_utc: snap.snapshot_utc })) };
}

// The public DEMO_KEY allows only about 30 requests an hour per IP, so a live answer is kept for 30 minutes and a failure for
// 10 minutes (per browser): visitors do not burn the quota with every page and do not see a red console line each time.
const CACHE_KEY = "d4-donki-v1";
const LIVE_TTL_MS = 30 * 60_000;
const FAIL_TTL_MS = 10 * 60_000;
type Cached = { at: number; ok: boolean; alerts?: SpaceWeatherAlert[]; error?: string };

function readCache(nowMs: number): Cached | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Cached | null;
    if (c && typeof c.at === "number" && nowMs - c.at < (c.ok ? LIVE_TTL_MS : FAIL_TTL_MS) && nowMs >= c.at) return c;
  } catch {
    /* storage blocked or corrupt: no cache */
  }
  return null;
}
function writeCache(c: Cached): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* quota or blocked: fine */
  }
}

/** Live first; the snapshot when live fails; `asOf: null` and no alerts when even the snapshot is missing. */
export async function loadSpaceWeather(now: Date = new Date(), f: typeof fetch = fetch): Promise<SpaceWeatherResult> {
  const cached = readCache(now.getTime());
  if (cached?.ok && cached.alerts) return { origin: "live", asOf: isoZ(new Date(cached.at)), alerts: cached.alerts };
  try {
    if (cached && !cached.ok) throw new Error(cached.error ?? "live feed failed recently");
    const alerts = await fetchLiveSpaceWeather(now, f);
    writeCache({ at: now.getTime(), ok: true, alerts });
    return { origin: "live", asOf: isoZ(now), alerts };
  } catch (e) {
    const liveError = e instanceof Error ? e.message : String(e);
    if (!cached) writeCache({ at: now.getTime(), ok: false, error: liveError });
    try {
      const s = await loadSnapshot(f);
      return { origin: "snapshot", asOf: s.asOf, alerts: s.alerts, liveError };
    } catch {
      return { origin: "snapshot", asOf: null, alerts: [], liveError };
    }
  }
}

/** Human label for a snapshot, shown wherever an alert from it is displayed. */
export function snapshotLabel(asOf: string): string {
  return `snapshot of ${asOf.slice(0, 10)}`;
}
