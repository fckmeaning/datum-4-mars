import { EVA } from "./evaModel";
import { StopInfo } from "./StopPhotos";
import type { Goal, SiteGoals } from "../goals";
import { formatHours } from "../missionClock";
import type { DaylightCheck } from "./plan";
import type { Alert } from "../useSpaceWeather";
import { MAX_STOPS, WARPS, type EvaPlanner } from "./useEvaPlanner";
import type { EvaAt } from "./plan";
import "./eva.css";

function hm(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

const VERDICT_TEXT = { READY: "SORTIE CLEAR", CAUTION: "MARGINAL", NO_GO: "ABORT" } as const;

/** Planner card: stops, mode, the oxygen budget with its verdict, the point of no return and the walk simulation controls. */
export function EvaCard({
  p,
  siteId,
  goals,
  onGoal,
  daylight,
  alert,
}: {
  p: EvaPlanner;
  siteId: string;
  goals?: SiteGoals | null;
  onGoal?: (g: Goal) => void;
  daylight?: DaylightCheck | null;
  alert?: Alert | null;
}) {
  const { plan } = p;
  const activeGoal = goals?.goals.find((g) => g.id === p.goalId);
  const sel = p.selected !== null ? p.stops[p.selected] : undefined;
  const selStop = sel?.id ? goals?.stops.find((s) => s.id === sel.id) : undefined;
  const capL = p.o2CapacityL;
  const usedPct = plan ? Math.min(100, (plan.stats.o2L / capL) * 100) : 0;
  const reservePct = EVA.reserve_fraction * 100;
  return (
    <aside className="eva-card" aria-label="Sortie planner" translate="no" data-testid="eva-card">
      <header>
        <strong>Sortie planner</strong>
        <label className="eva-card__switch">
          <input type="checkbox" checked={p.enabled} onChange={(e) => p.setEnabled(e.target.checked)} /> Plan
        </label>
      </header>

      {!p.enabled ? (
        <p className="eva-card__hint">Plan a walk from the landing station: oxygen, time, a verdict and the point of no return.</p>
      ) : (
        <>
          {goals && goals.goals.length > 0 && onGoal && (
            <div className="eva-card__goals" role="group" aria-label="Science goals">
              <span className="eva-card__label">SCIENCE GOALS</span>
              {goals.goals.map((g) => (
                <button key={g.id} type="button" className={p.goalId === g.id ? "is-on" : ""} onClick={() => onGoal(g)} aria-pressed={p.goalId === g.id} title={g.why}>
                  {g.name}
                </button>
              ))}
            </div>
          )}
          {activeGoal && <p className="eva-card__why">{activeGoal.why}</p>}
          <p className="eva-card__hint">
            {goals ? "Pick a goal, or click" : "Click"} the map to add science stops (up to {MAX_STOPS}). The walk starts and ends at the landing station.
          </p>
          <ol className="eva-card__stops">
            {p.stops.map((s, i) => (
              <li key={`${s.x}-${s.y}-${i}`} className={p.selected === i ? "is-selected" : ""}>
                <button type="button" className="eva-card__stopname" onClick={() => p.setSelected(p.selected === i ? null : i)} aria-expanded={p.selected === i}>
                  {i + 1}. {s.name ?? "Stop"}
                </button>
                <small>
                  {Math.round(s.x)} m E, {Math.round(s.y)} m N
                </small>
                <button type="button" onClick={() => p.removeStop(i)} aria-label={`Remove stop ${i + 1}`}>
                  ✕
                </button>
              </li>
            ))}
          </ol>
          {selStop && <StopInfo siteId={siteId} stop={selStop} />}
          <div className="eva-card__row" role="group" aria-label="Mode">
            <button type="button" className={p.mode === "foot" ? "is-on" : ""} onClick={() => p.setMode("foot")} aria-pressed={p.mode === "foot"}>
              On foot
            </button>
            <button type="button" className={p.mode === "rover" ? "is-on" : ""} onClick={() => p.setMode("rover")} aria-pressed={p.mode === "rover"}>
              Rover + walkback
            </button>
            <button type="button" onClick={p.reset} disabled={!p.stops.length}>
              Reset
            </button>
          </div>
          <div className="eva-card__row" role="group" aria-label="Route options">
            <button type="button" className={p.returnHome ? "is-on" : ""} onClick={() => p.setReturnHome(!p.returnHome)} aria-pressed={p.returnHome}>
              Come back to base
            </button>
            <button type="button" className={p.followCam ? "is-on" : ""} onClick={() => p.setFollowCam(!p.followCam)} aria-pressed={p.followCam}>
              Chase cam
            </button>
          </div>

          {p.error && <p className="eva-card__error">{p.error}</p>}

          {plan && (
            <>
              <div className={`eva-card__verdict eva-card__verdict--${daylight?.verdict ?? plan.verdict}`} data-testid="eva-verdict">
                {VERDICT_TEXT[daylight?.verdict ?? plan.verdict]}
              </div>
              <p className="eva-card__reason">{daylight?.reason ?? plan.reason}</p>
              <dl className="eva-card__stats">
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
                  <dt>Max grade</dt>
                  <dd>{plan.stats.maxGradeDeg.toFixed(1)}°</dd>
                </div>
              </dl>
              <div className="eva-card__o2" aria-label="Oxygen budget">
                <div className="eva-card__o2-head">
                  <span>O₂ used</span>
                  <span>
                    {plan.stats.o2L.toFixed(0)} / {capL} L
                  </span>
                </div>
                <div className="eva-card__bar">
                  <i className={`is-${plan.verdict}`} style={{ width: `${usedPct}%` }} />
                  <b style={{ left: `${100 - reservePct}%` }} title="start of the reserve" />
                </div>
                <small>Reserve {reservePct.toFixed(0)} % ({(capL * EVA.reserve_fraction).toFixed(0)} L) is not to be touched.</small>
                <label className="eva-card__whatif">
                  Stress test: a tank of <b>{capL} L</b>
                  <input type="range" min={100} max={EVA.o2_capacity_l} step={10} value={capL} onChange={(e) => p.setO2CapacityL(Number(e.target.value))} aria-label="Suit oxygen capacity" />
                </label>
              </div>
              {daylight && (
                <div className="eva-card__line" data-testid="eva-daylight">
                  Daylight <b>{formatHours(daylight.startH)} → {formatHours(daylight.endH)}</b> · sunset {formatHours(daylight.sunsetH)}
                </div>
              )}
              <div className="eva-card__line" data-testid="eva-shelter">
                Storm shelter, walk back <b>≤ {hm(plan.stats.shelterWalkS)}</b>
              </div>
              <div className="eva-card__line">
                Radiation this EVA <b>≈ {plan.stats.doseMSv.toFixed(2)} mSv</b> <span className="eva-card__tag">MODELED</span>
              </div>
              <div className="eva-card__line eva-card__weather" data-testid="eva-weather">
                <b>SPACE WEATHER AT MARS</b>{" "}
                {alert ? (
                  <>
                    {alert.message} <a href={alert.link} target="_blank" rel="noreferrer">forecast</a>
                  </>
                ) : (
                  "no coronal mass ejection forecast within 3 days (or the service is not reachable)."
                )}
              </div>
              {plan.noReturn !== null ? (
                <div className="eva-card__line eva-card__line--warn">
                  Point of no return after {(plan.nodes[plan.noReturn]!.cumD / 1000).toFixed(2)} km, {hm(plan.nodes[plan.noReturn]!.cumT)}: beyond it the walk home
                  does not keep the reserve.
                </div>
              ) : (
                <div className="eva-card__line">The whole outbound leg stays within a safe walk home.</div>
              )}
              <div className="eva-card__row">
                <button type="button" className="eva-card__primary" onClick={p.toggleSim}>
                  {p.playing ? "■ Stop EVA" : p.at ? "▶ Resume EVA" : "▶ Simulate EVA"}
                </button>
                <label className="eva-card__switch" title="Keep the camera on EV1 during the simulation">
                  <input type="checkbox" checked={p.followCam} onChange={(e) => p.setFollowCam(e.target.checked)} /> Follow
                </label>
                <select value={p.warp} onChange={(e) => p.setWarp(Number(e.target.value))} aria-label="Simulation speed">
                  {WARPS.map((w) => (
                    <option key={w} value={w}>
                      ×{w}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}

const STATE_TEXT = { nominal: "NOMINAL", "past-no-return": "PAST THE POINT OF NO RETURN", reserve: "RESERVE REACHED" } as const;

/** The wrist display of EV1 during the simulation. */
export function EvaWrist({ at, stopsLabel }: { at: EvaAt; stopsLabel: (i: number | null) => string }) {
  return (
    <div className={`eva-wrist eva-wrist--${at.state}`} translate="no" data-testid="eva-wrist">
      <div className="eva-wrist__head">
        <span>EV1 · WRIST</span>
        <span>{STATE_TEXT[at.state]}</span>
      </div>
      <div className="eva-wrist__next">
        {at.phase === "done" ? "AIRLOCK · EVA COMPLETE" : <>NEXT ▸ {stopsLabel(at.nextStop)}</>}
        <b>{at.phase === "done" ? "" : at.toNextM >= 1000 ? `${(at.toNextM / 1000).toFixed(2)} km` : `${Math.round(at.toNextM)} m`}</b>
      </div>
      <div className="eva-wrist__grid">
        <div>
          <i>O₂ LEFT</i>
          <b>{at.remainingL.toFixed(0)} L</b>
        </div>
        <div>
          <i>PHASE</i>
          <b>{at.phase.toUpperCase()}</b>
        </div>
        <div>
          <i>WALKED</i>
          <b>{(at.distM / 1000).toFixed(2)} km</b>
        </div>
      </div>
    </div>
  );
}
