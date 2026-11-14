import { useMemo } from "react";
import { EVA } from "../sites/eva/evaModel";
import type { Plan, Verdict } from "../sites/eva/plan";
import { LineChart, ViewCard, niceScale, type ChartSeries } from "../views/charts";
import "../views/views.css";
import { downloadText, profileOf, routeGeoJSON, routeGpx, thin, type RouteMeta } from "./profileMath";

export interface ProfileViewProps {
  plan: Plan | null;
  /** the verdict after the daylight check (falls back to the plan's own) */
  verdict?: Verdict;
  siteName: string;
  siteId: string;
  stopNames: string[];
  /** local metres to latitude and longitude of the elevation tile; null while it loads */
  toLatLon: ((x: number, y: number) => { lat: number; lon: number }) | null;
  /** the planner has no stops yet, or its error */
  error: string | null;
  /** loading the elevation tile */
  loading: boolean;
  onPlan: () => void;
}

const VERDICT_LABEL: Record<Verdict, string> = { READY: "CLEAR", CAUTION: "MARGINAL", NO_GO: "ABORT" };

const hm = (s: number) => `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")} min`;

/** The Profile tab: height, slope and oxygen along the planned sortie, with the stops and the no-return point. */
export function ProfileView({ plan, verdict, siteName, siteId, stopNames, toLatLon, error, loading, onPlan }: ProfileViewProps) {
  const prof = useMemo(() => (plan ? profileOf(plan) : null), [plan]);

  if (!plan || !prof) {
    return (
      <div className="profile-view" data-testid="profile-view">
        <div className="vempty" data-testid="profile-empty">
          <h2>Route profile</h2>
          {loading ? (
            <p>Loading the elevation tile…</p>
          ) : (
            <>
              <p>{error ?? "No sortie is planned yet. Pick a science goal or click the map to add stops, and this view draws the height, the slope and the oxygen along the route."}</p>
              <button type="button" className="vbtn vbtn--primary" onClick={onPlan}>
                Plan a sortie on the map
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const v = verdict ?? plan.verdict;
  const pts = thin(prof.points, 400);
  const total = prof.points[prof.points.length - 1]!.distKm;
  const xTicks = Array.from({ length: 5 }, (_, i) => Number(((total * i) / 4).toFixed(3)));
  const elevScale = niceScale(prof.elevMin - 5, prof.elevMax + 5, 4);
  const o2Scale = niceScale(0, plan.stats.capacityL * 1.05, 4);
  const marks = prof.stops.map((s) => ({ x: s.distKm, label: `S${s.index + 1}`, color: "var(--color-info)" }));
  const noReturnMark = prof.noReturn ? [{ x: prof.noReturn.distKm, label: "no return", color: "var(--color-danger)" }] : [];

  const elevation: ChartSeries[] = [{ id: "elev", label: "Elevation", color: "var(--hz-accent)", points: pts.map((p) => ({ x: p.distKm, y: p.elev })), area: true }];
  const slope: ChartSeries[] = [{ id: "slope", label: "Slope", color: "var(--color-warning)", points: pts.map((p) => ({ x: p.distKm, y: p.slopeDeg })), area: true, step: true }];
  const o2: ChartSeries[] = [{ id: "o2", label: "Oxygen used", color: "var(--color-ok)", points: pts.map((p) => ({ x: p.distKm, y: p.o2L })), area: true }];

  const meta: RouteMeta = { site: siteName, mode: plan.mode, verdict: VERDICT_LABEL[v], stopNames };
  const exportAs = (kind: "geojson" | "gpx") => {
    if (!toLatLon) return;
    if (kind === "geojson") downloadText(`${siteId}-sortie.geojson`, JSON.stringify(routeGeoJSON(plan, toLatLon, meta), null, 2), "application/geo+json");
    else downloadText(`${siteId}-sortie.gpx`, routeGpx(plan, toLatLon, meta), "application/gpx+xml");
  };

  return (
    <div className="profile-view" data-testid="profile-view">
      <header className="vhead">
        <div>
          <div className="vhead__kicker">ROUTE PROFILE</div>
          <h2>{siteName} sortie</h2>
          <div className="vhead__sub">
            {plan.mode === "rover" ? "Rover with walkback" : "On foot"} · {plan.returnHome ? "returns to base" : "one way"} · {prof.stops.length} stop{prof.stops.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="vcontrols">
          <span className={`vverdict vverdict--${v}`} data-testid="profile-verdict">
            {VERDICT_LABEL[v]}
          </span>
          <button type="button" className="vbtn" onClick={() => exportAs("geojson")} disabled={!toLatLon} data-testid="export-geojson">
            Export GeoJSON
          </button>
          <button type="button" className="vbtn" onClick={() => exportAs("gpx")} disabled={!toLatLon} data-testid="export-gpx">
            Export GPX
          </button>
        </div>
      </header>

      <dl className="vstats" data-testid="profile-stats">
        <div>
          <dt>Distance</dt>
          <dd>{(plan.stats.distanceM / 1000).toFixed(2)} km</dd>
        </div>
        <div>
          <dt>EVA time</dt>
          <dd>{hm(plan.stats.timeS)}</dd>
        </div>
        <div>
          <dt>Climb</dt>
          <dd>+{Math.round(plan.stats.ascentM)} m</dd>
        </div>
        <div>
          <dt>Steepest leg</dt>
          <dd>{prof.slopeMaxDeg.toFixed(1)}°</dd>
        </div>
        <div>
          <dt>Oxygen</dt>
          <dd>
            {plan.stats.o2L.toFixed(0)} / {plan.stats.usableL.toFixed(0)} L
          </dd>
        </div>
        <div>
          <dt>Walk to shelter from the farthest point</dt>
          <dd>{hm(plan.stats.shelterWalkS)}</dd>
        </div>
      </dl>
      <p className="vreason">{plan.reason}</p>

      <div className="vgrid vgrid--one">
        <ViewCard title="Elevation along the route" badge="MODELED" testId="profile-elev" note={`From the elevation tile of this site. ${prof.noReturn ? "The red line is the last point from which the crew can still walk home with the reserve intact." : "From every point of the outbound leg the walk home keeps the reserve."}`}>
          <LineChart label="Elevation along the route" series={elevation} xDomain={[0, total]} yDomain={elevScale.domain} yTicks={elevScale.ticks} xTicks={xTicks} xFormat={(x) => `${x.toFixed(1)} km`} yFormat={(y) => `${Math.round(y)} m`} xLabel="distance along the route" yLabel="elevation" marks={[...marks, ...noReturnMark]} />
        </ViewCard>
        <ViewCard title="Slope of each leg" badge="MODELED" testId="profile-slope" note={`Suited walking is blocked above ${EVA.theta_max_deg}° (config astronaut.theta_max_deg); the planner calls a route MARGINAL above 17° (verdict.slope_caution_deg).`}>
          <LineChart label="Slope along the route" series={slope} xDomain={[0, total]} yDomain={[0, 30]} yTicks={[0, 10, 20, 30]} xTicks={xTicks} xFormat={(x) => `${x.toFixed(1)} km`} yFormat={(y) => `${Math.round(y)}°`} xLabel="distance along the route" yLabel="slope" hlines={[{ y: EVA.theta_max_deg, label: "walk limit", color: "var(--color-danger)" }, { y: 17, label: "marginal above", color: "var(--color-warning)" }]} marks={marks} />
        </ViewCard>
        <ViewCard title="Oxygen use" badge="COMPUTED" testId="profile-o2" note="Minetti walking cost on Mars gravity plus the basal rate and the work at each stop (F21-F24). The suit capacity and the reserve are assumptions of config/params.yaml (astronaut).">
          <LineChart label="Oxygen used along the route" series={o2} xDomain={[0, total]} yDomain={o2Scale.domain} yTicks={o2Scale.ticks} xTicks={xTicks} xFormat={(x) => `${x.toFixed(1)} km`} yFormat={(y) => `${Math.round(y)} L`} xLabel="distance along the route" yLabel="oxygen used" hlines={[{ y: plan.stats.usableL, label: "usable (above the reserve)", color: "var(--color-warning)" }, { y: plan.stats.capacityL, label: "suit capacity", color: "var(--color-danger)" }]} marks={[...marks, ...noReturnMark]} />
        </ViewCard>
      </div>
      <p className="vfoot">Exports carry Mars planetocentric coordinates (latitude, east longitude): an Earth GPS app will place them on Earth. Modelled terrain and assumption-based physiology: not for flight use.</p>
    </div>
  );
}
