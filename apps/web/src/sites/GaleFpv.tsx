import { useEffect, useState } from "react";
import { FirstPersonView, type FpvRouteLike, type FpvWaypoint } from "../fpv/FirstPersonView";
import { apiFetch } from "../static/apiFetch";

interface Place {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
}

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; route: FpvRouteLike; waypoints: FpvWaypoint[]; base: Place; rover: Place | null };

/** First-person walk along a real planned route at Gale (base to the boxwork region), over the 10 m DEM. */
export function GaleFpv({ onExit }: { onExit?: () => void }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const places = (await (await apiFetch("/api/v1/sites/gale/places")).json()) as Place[];
        const base = places.find((p) => /Bradbury/i.test(p.name));
        const goal = places.find((p) => /Boxwork/i.test(p.name));
        const rover = places.find((p) => /Curiosity/i.test(p.name)) ?? null;
        if (!base || !goal) throw new Error("Gale places are not available from the API");
        const res = await apiFetch("/api/v1/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            site_id: "gale",
            start_utc: "2026-11-14T08:30:00Z",
            profile: "SAFEST",
            waypoints: [
              { place_id: base.id, role: "start" },
              { place_id: goal.id, role: "goal" },
            ],
          }),
        });
        if (!res.ok) throw new Error(`The route service answered HTTP ${res.status}`);
        const route = (await res.json()) as FpvRouteLike;
        if (alive) setState({ phase: "ready", route, waypoints: [base, goal].map((p) => ({ name: p.name, x: p.x, y: p.y })), base, rover });
      } catch (e) {
        if (alive) setState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.phase === "loading") return <div className="site-note">Loading the planned route…</div>;
  if (state.phase === "error")
    return (
      <div className="site-note">
        The first-person view could not load its precomputed route. {state.message}
      </div>
    );
  return (
    <FirstPersonView
      route={state.route}
      waypoints={state.waypoints}
      base={{ x: state.base.x, y: state.base.y }}
      roverNow={state.rover ? { x: state.rover.x, y: state.rover.y } : null}
      utc="2026-11-14T08:30:00Z"
      initialSpeed={4}
      quality="high"
      onExit={onExit}
    />
  );
}
