/**
 * Standalone dev page for the first-person view (not part of the app build): fetches a real route and the places from the API
 * and mounts <FirstPersonView/>. Open it through the Vite dev server:
 *   http://localhost:5173/src/fpv/dev/index.html[?to=boxwork|rover&from=base|boxwork&speed=1|4|16&quality=low|high&profile=SAFEST]
 * Frame-rate samples are exposed as window.__fpv for measurements.
 */

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../styles/tokens.css";
import { FirstPersonView, type FpvRouteLike, type FpvWaypoint } from "../FirstPersonView";

interface Place {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
}

declare global {
  interface Window {
    __fpvDebug?: import("../FirstPersonView").FpvDebugApi;
    __fpv?: { fps: number[]; ready: boolean; route?: { points: number; length_m: number; time_s: number; levels: string[] } };
  }
}

const q = new URLSearchParams(window.location.search);
window.__fpv = { fps: [], ready: false };

function pick(places: Place[], re: RegExp): Place | undefined {
  return places.find((p) => re.test(p.name) || re.test(p.id));
}

function Dev(): React.ReactElement {
  const [state, setState] = useState<{ route: FpvRouteLike; waypoints: FpvWaypoint[]; base: Place; rover: Place } | string>("Requesting a route from the API…");

  useEffect(() => {
    (async () => {
      try {
        const places = (await (await fetch("/api/v1/sites/gale/places")).json()) as Place[];
        const base = pick(places, /Bradbury/i);
        const box = pick(places, /Boxwork/i);
        const rover = pick(places, /Curiosity/i);
        if (!base || !box || !rover) throw new Error("places missing");
        const lookup: Record<string, Place> = { base, boxwork: box, rover };
        const from = lookup[q.get("from") ?? "base"] ?? base;
        const to = lookup[q.get("to") ?? "boxwork"] ?? box;
        const body = {
          site_id: "gale",
          start_utc: "2026-11-14T08:30:00Z",
          profile: q.get("profile") ?? "SAFEST",
          waypoints: [
            { place_id: from.id, role: "start" },
            { place_id: to.id, role: "goal" },
          ],
        };
        const res = await fetch("/api/v1/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`route HTTP ${res.status}`);
        const route = (await res.json()) as FpvRouteLike & { totals: { length_m: number; time_s: number }; data_levels: string[]; waypoint_order?: number[] };
        window.__fpv!.route = { points: route.xy.length, length_m: route.totals.length_m, time_s: route.totals.time_s, levels: route.data_levels };
        setState({ route, waypoints: [from, to].map((p) => ({ name: p.name, x: p.x, y: p.y })), base, rover });
      } catch (e) {
        setState(`Could not start: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, []);

  if (typeof state === "string") return <div style={{ color: "#9da7b3", font: "14px system-ui", padding: 24 }}>{state}</div>;
  return (
    <FirstPersonView
      route={state.route}
      waypoints={state.waypoints}
      base={{ x: state.base.x, y: state.base.y }}
      roverNow={{ x: state.rover.x, y: state.rover.y }}
      roverHeadingDeg={Number(q.get("rh") ?? 0)}
      initialSpeed={(Number(q.get("speed") ?? 4) as 1 | 4 | 16) || 4}
      quality={q.get("quality") === "low" ? "low" : "high"}
      utc={q.get("utc") ?? "2026-11-14T08:30:00Z"}
      onDebug={(api) => {
        window.__fpvDebug = api;
      }}
      onFps={(f) => {
        window.__fpv!.ready = true;
        window.__fpv!.fps.push(Number(f.toFixed(1)));
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Dev />);
