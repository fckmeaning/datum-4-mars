import { useMemo, useState } from "react";
import { LineChart, ViewCard, niceScale, type ChartSeries } from "../views/charts";
import "../views/views.css";
import { MISSION, SURFACE_DOSE_REF_MSV_PER_DAY, doseBudget, findMissionEvents, inDustSeason, type MissionEvent } from "./missionMath";
import { dateForLs, mars24 } from "../sky/marsSky";

export interface MissionViewProps {
  siteName: string;
  /** modelled surface dose rate [mSv/day] at the station; null when the layer is not loaded (the reference value is used and said so) */
  surfaceMSvPerDay: number | null;
  /** the radiation layer is still loading */
  loading?: boolean;
  /** the instant to start from (tests) */
  startMs?: number;
  /** how many years of calendar to scan */
  years?: number;
}

const DAY = 86_400_000;
const KIND_LABEL: Record<MissionEvent["kind"], string> = { launch: "Launch window", opposition: "Opposition", conjunction: "Solar conjunction" };
const KIND_NOTE: Record<MissionEvent["kind"], string> = {
  launch: "Mars leads Earth by the minimum-energy angle: the geometry, not a launch date",
  opposition: "Closest approach, shortest radio delay",
  conjunction: "Sun between the planets: radio blackout",
};

const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Mission tab: dose budget of a round trip, launch windows, conjunctions and the season of arrival. */
export function MissionView({ siteName, surfaceMSvPerDay, loading, startMs, years = 8 }: MissionViewProps) {
  const [now] = useState(() => startMs ?? Date.now());
  const [stay, setStay] = useState<number>(MISSION.surface_stay_d);
  const [transit, setTransit] = useState<number>(MISSION.transit_days);
  const [shield, setShield] = useState<number>(MISSION.shielding_default);

  const rate = surfaceMSvPerDay ?? SURFACE_DOSE_REF_MSV_PER_DAY;
  const budget = useMemo(() => doseBudget({ surfaceMSvPerDay: rate, shielding: shield, transitDays: transit, stayDays: stay }), [rate, shield, transit, stay]);
  const events = useMemo(() => findMissionEvents(now - 30 * DAY, now + years * 365.25 * DAY), [now, years]);
  const t = mars24(now);
  const dust = inDustSeason(t.lsDeg);
  const nextDust = useMemo(() => {
    const start = dateForLs(MISSION.dust_storm_ls_start_deg, now);
    return start < now ? start + 686.98 * DAY : start;
  }, [now]);

  const pct = (budget.totalMSv / budget.limitMSv) * 100;
  const over = budget.totalMSv > budget.limitMSv;
  const phaseSeries = (phase: "outbound" | "surface" | "return", color: string, label: string): ChartSeries => {
    const pts = budget.points;
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i]!.phase !== phase) continue;
      if (out.length === 0) out.push({ x: pts[i - 1]!.day, y: pts[i - 1]!.mSv });
      out.push({ x: pts[i]!.day, y: pts[i]!.mSv });
    }
    return { id: phase, label, color, points: out };
  };
  const series = [phaseSeries("outbound", "var(--color-info)", "Outbound cruise"), phaseSeries("surface", "var(--hz-accent)", `Surface (${siteName.split(" ")[0]})`), phaseSeries("return", "var(--color-warning)", "Return cruise")].filter((s) => s.points.length > 0);
  const doseScale = niceScale(0, Math.max(budget.limitMSv * 1.15, budget.totalMSv * 1.05), 4);

  return (
    <div className="mission-view" data-testid="mission-view">
      <header className="vhead">
        <div>
          <div className="vhead__kicker">MISSION</div>
          <h2>{siteName}: dose and calendar</h2>
          <div className="vhead__sub">{loading ? "Loading the radiation layer…" : surfaceMSvPerDay === null ? `Surface dose: reference value ${SURFACE_DOSE_REF_MSV_PER_DAY} mSv/day (Gale RAD), the modelled layer is not available` : `Surface dose here: ${rate.toFixed(2)} mSv/day (modelled layer)`}</div>
        </div>
        <div className="vcontrols">
          <span className={`vverdict ${over ? "vverdict--NO_GO" : pct > 80 ? "vverdict--CAUTION" : "vverdict--READY"}`} data-testid="dose-verdict">
            {Math.round(pct)} % of the career limit
          </span>
        </div>
      </header>

      <div className="vgrid">
        <ViewCard title="Cumulative dose of a round trip" badge="MODELED" wide testId="dose-chart" note={<>Surface rate from the global radiation layer (a model, MODELED); cruise rate is the MSL RAD measurement of Zeitlin et al. 2013. The career limit is NASA-STD-3001 (2022); dose equivalent is used as a stand-in for effective dose. Planning numbers are assumptions (config/params.yaml, section mission), not a flight plan.</>}>
          <div className="vsliders">
            <label>
              <span>
                Surface stay <b>{stay} days</b>
              </span>
              <input type="range" min={30} max={600} step={10} value={stay} onChange={(e) => setStay(Number(e.target.value))} aria-label="Surface stay in days" />
            </label>
            <label>
              <span>
                Transit each way <b>{transit} days</b>
              </span>
              <input type="range" min={150} max={270} step={5} value={transit} onChange={(e) => setTransit(Number(e.target.value))} aria-label="Transit time in days" />
            </label>
            <label>
              <span>
                Shielding at the surface <b>{shield === 1 ? "none (exposed)" : `×${shield.toFixed(2)} of the open dose`}</b>
              </span>
              <input type="range" min={0.2} max={1} step={0.05} value={shield} onChange={(e) => setShield(Number(e.target.value))} aria-label="Shielding factor" />
            </label>
          </div>
          <LineChart
            label="Cumulative effective dose against mission day"
            series={series}
            xDomain={[0, budget.totalDays]}
            yDomain={doseScale.domain}
            xTicks={Array.from({ length: 5 }, (_, i) => Math.round((budget.totalDays * i) / 4))}
            yTicks={doseScale.ticks}
            xFormat={(x) => `day ${Math.round(x)}`}
            yFormat={(y) => String(Math.round(y))}
            xLabel="mission day"
            yLabel="cumulative dose, mSv"
            hlines={[{ y: budget.limitMSv, label: "career limit 600 mSv", color: "var(--color-danger)" }]}
            marks={[
              { x: transit, label: "landing", color: "var(--hz-dim)" },
              { x: transit + stay, label: "ascent", color: "var(--hz-dim)" },
              ...(budget.limitDay !== null ? [{ x: budget.limitDay, label: "limit", color: "var(--color-danger)" }] : []),
            ]}
          />
          <dl className="vstats" data-testid="dose-stats">
            <div>
              <dt>Cruise (both ways)</dt>
              <dd>{budget.transitMSv.toFixed(0)} mSv</dd>
            </div>
            <div>
              <dt>Surface</dt>
              <dd>{budget.surfaceMSv.toFixed(0)} mSv</dd>
            </div>
            <div>
              <dt>Round trip total</dt>
              <dd>{budget.totalMSv.toFixed(0)} mSv</dd>
            </div>
            <div>
              <dt>Longest stay inside the limit</dt>
              <dd data-testid="max-stay">{budget.maxStayDays === Infinity ? "unlimited" : budget.maxStayDays <= 0 ? "none: the cruise alone is over" : `${Math.floor(budget.maxStayDays)} days`}</dd>
            </div>
          </dl>
        </ViewCard>

        <ViewCard title="Season now" badge="COMPUTED" testId="season-now">
          <p className="vbig" translate="no">
            Ls {t.lsDeg.toFixed(0)}°
          </p>
          <p>{dust ? "Dust-storm season is on (Ls 180–360). Regional and global storms cut sunlight and raise the risk for solar power." : "Outside the dust-storm season (Ls 180–360)."}</p>
          <p className="vcard__note">Next dust-storm season starts about {fmtDate(nextDust)} (Ls {MISSION.dust_storm_ls_start_deg}°). The window is climatological: individual storms are not predicted.</p>
        </ViewCard>

        <ViewCard title="Launch windows, oppositions and conjunctions" badge="COMPUTED" wide testId="mission-calendar" note={<>From approximate Keplerian elements of JPL (the table of the API's F52), daily scan. Launch windows use the minimum-energy geometry (about 259 days): real windows are set by trajectory design and differ by weeks. Blackout counts days with the Sun-Earth-Mars angle under {MISSION.conjunction_sep_deg}° (ASSUMPTION).</>}>
          <table className="vtable">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Ls then</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={`${e.kind}-${e.ms}`} className={`vrow vrow--${e.kind}`}>
                  <th scope="row">{KIND_LABEL[e.kind]}</th>
                  <td translate="no">{fmtDate(e.ms)}</td>
                  <td translate="no">{Math.round(e.lsDeg)}°</td>
                  <td>
                    {e.kind === "launch" && e.arrival && (
                      <>
                        Arrival {fmtDate(e.arrival.ms)} at Ls {Math.round(e.arrival.lsDeg)}°{" "}
                        <span className={`vtag ${e.arrival.inDustSeason ? "vtag--warn" : ""}`}>{e.arrival.inDustSeason ? "dust season" : "clear season"}</span>
                      </>
                    )}
                    {e.kind === "conjunction" && <>blackout about {e.blackoutDays} days</>}
                    {e.kind === "opposition" && KIND_NOTE.opposition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ViewCard>
      </div>
    </div>
  );
}
