import { useEffect, useState } from "react";
import { loadSpaceWeather, snapshotLabel } from "../static/spaceWeather";

export interface Alert {
  id: string;
  kind: string;
  start: string;
  message: string;
  source: string;
  mode?: string;
  link?: string;
}

const DAY = 86_400_000;

/** The CME alert closest to now within 3 days ahead or 1 day behind (the advisory window the page shows). */
export function pickAlert(alerts: Alert[], now: Date): Alert | null {
  const t = now.getTime();
  const near = alerts
    .filter((a) => a.kind === "CME")
    .map((a) => ({ a, dt: Date.parse(a.start) - t }))
    .filter((x) => Number.isFinite(x.dt) && x.dt <= 3 * DAY && x.dt >= -DAY)
    .sort((p, q) => Math.abs(p.dt) - Math.abs(q.dt));
  return near[0]?.a ?? null;
}

/**
 * Space weather advisories for Mars, with no server: the browser asks NASA DONKI itself (`static/spaceWeather.ts`); when that fails
 * the committed snapshot is used and every message says "snapshot of <date>, not live". `origin` tells which one it was.
 */
export function useSpaceWeather(): { alert: Alert | null; checked: boolean; origin: "live" | "snapshot" | null; asOf: string | null } {
  const [state, setState] = useState<{ alert: Alert | null; checked: boolean; origin: "live" | "snapshot" | null; asOf: string | null }>({
    alert: null,
    checked: false,
    origin: null,
    asOf: null,
  });
  useEffect(() => {
    let alive = true;
    const now = new Date();
    loadSpaceWeather(now)
      .then((r) => {
        if (!alive) return;
        const snap = r.origin === "snapshot";
        const label = r.asOf ? snapshotLabel(r.asOf) : "snapshot";
        const list: Alert[] = r.alerts.map((a) => ({ ...a, message: snap ? `[${label}, not live] ${a.message}` : a.message, link: a.link ?? undefined }));
        let alert = pickAlert(list, now);
        if (!alert && snap && r.asOf) {
          // never present a snapshot as live: say what the snapshot covers instead of silently showing "no forecast"
          alert = {
            id: "snapshot-none",
            kind: "SNAPSHOT",
            start: r.asOf,
            message: `[${label}, not live] no coronal mass ejection forecast for the next 3 days was in this snapshot. The live feed was not reachable.`,
            source: "NASA DONKI (snapshot)",
            mode: "snapshot",
            link: "https://ccmc.gsfc.nasa.gov/DONKI/",
          };
        }
        setState({ alert, checked: r.asOf !== null, origin: r.asOf !== null ? r.origin : null, asOf: r.asOf });
      })
      .catch(() => alive && setState({ alert: null, checked: false, origin: null, asOf: null }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
