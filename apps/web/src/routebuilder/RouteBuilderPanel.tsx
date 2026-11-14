import { useState } from "react";
import { useAppStore } from "../state/store";
import { ROLE_COLORS } from "./olInteractions";
import { cardFacts, chartBars, formatDistance, formatDuration, ribbonPieces, verdictOf, whyRoute, FACTOR_STYLE } from "./explain";
import { formatCoord, type BBox, type BaseRef, type BuilderPoint } from "./model";
import type { RoutePlanner } from "./planner";
import { useRouteBuilderStore } from "./routeBuilderStore";
import type { RouteResult } from "./routeApi";
import { useRouteBuilder } from "./useRouteBuilder";
import "./routeBuilder.css";

export interface RouteBuilderPanelProps {
  siteId?: string;
  /** Site bounds from GET /sites/{id}; defaults to the provisional Gale AOI */
  bbox?: BBox;
  /** Habitat used for snapping and "Back to base" */
  base?: BaseRef;
  /** Inject a planner (tests) */
  planner?: RoutePlanner;
  onClose?: () => void;
  className?: string;
}

const ROLE_LABEL = { start: "Start", via: "Stop", science: "Science stop", goal: "Goal" } as const;

function VerdictChip({ route }: { route: RouteResult }) {
  const v = verdictOf(route);
  return (
    <span className={`rb-chip rb-chip--${v.call.toLowerCase()}`} title={v.reason}>
      {v.call.replace("_", "-")}
    </span>
  );
}

function PointRow({ point, index, last }: { point: BuilderPoint; index: number; last: boolean }) {
  const st = useRouteBuilderStore.getState();
  const selected = useRouteBuilderStore((s) => s.selectedPointId === point.id);
  const [over, setOver] = useState(false);
  const triggerFlyTo = useAppStore((s) => s.triggerFlyTo);
  return (
    <li
      className={`rb-point${selected ? " is-selected" : ""}${over ? " is-over" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (Number.isInteger(from)) st.reorder(from, index);
      }}
    >
      <span className="rb-grip" aria-hidden="true">
        ⋮⋮
      </span>
      <button
        type="button"
        className="rb-point__main"
        onClick={() => {
          st.selectPoint(point.id);
          triggerFlyTo({ lat: point.lat, lon: point.lon });
        }}
        aria-label={`${ROLE_LABEL[point.role]}: ${point.name ?? formatCoord(point.lat, point.lon)}. Click to centre the map.`}
      >
        <span className="rb-marker" style={{ background: ROLE_COLORS[point.role] }}>
          {point.role === "start" ? "A" : last ? String.fromCharCode(65 + index) : index}
        </span>
        <span className="rb-point__text">
          <span className="rb-point__name">{point.name ?? ROLE_LABEL[point.role]}</span>
          <span className="rb-point__coord">{formatCoord(point.lat, point.lon)}</span>
        </span>
      </button>
      {point.role !== "start" && point.role !== "goal" && (
        <label className="rb-dwell" title="Minutes spent at this stop">
          <input
            type="number"
            min={0}
            max={240}
            value={point.dwell_min}
            onChange={(e) => st.setDwellFor(point.id, Number(e.target.value))}
            aria-label={`Minutes at stop ${index}`}
          />
          <span>min</span>
        </label>
      )}
      <span className="rb-point__moves">
        <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => st.reorder(index, index - 1)}>
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={last} onClick={() => st.reorder(index, index + 1)}>
          ↓
        </button>
      </span>
      <button type="button" className="rb-remove" aria-label={`Remove point ${index + 1}`} onClick={() => st.removePointById(point.id)}>
        ✕
      </button>
    </li>
  );
}

function RouteCardView({ route, selected, onSelect }: { route: RouteResult; selected: boolean; onSelect: () => void }) {
  const f = cardFacts(route);
  const v = verdictOf(route);
  return (
    <button
      type="button"
      className={`rb-card${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      style={{ ["--rb-accent" as string]: `var(--route-${route.profile.toLowerCase()}, #56B4E9)` }}
    >
      <span className="rb-card__head">
        <span className="rb-card__name">{route.profile}</span>
        <VerdictChip route={route} />
      </span>
      <span className="rb-card__time">{f.time}</span>
      <span className="rb-card__dist">{f.distance}</span>
      <dl className="rb-facts">
        <div>
          <dt>Dose</dt>
          <dd>{f.dose}</dd>
        </div>
        <div>
          <dt>O₂</dt>
          <dd>{f.oxygen}</dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>{f.energy}</dd>
        </div>
        <div>
          <dt>Max slope</dt>
          <dd>{f.maxSlope}</dd>
        </div>
        <div>
          <dt>Turn back</dt>
          <dd>{f.turnBack}</dd>
        </div>
        <div>
          <dt>Sunset</dt>
          <dd>{f.sunset}</dd>
        </div>
      </dl>
      <span className="rb-card__reason">{v.reason}</span>
    </button>
  );
}

function CompareChart({ routes }: { routes: RouteResult[] }) {
  const bars = chartBars(routes);
  return (
    <figure className="rb-chart" aria-label="Time and risk compared across the alternatives">
      <figcaption>Time and risk (shorter is better)</figcaption>
      {bars.map((b) => (
        <div className="rb-chart__row" key={b.route_id}>
          <span className="rb-chart__label">{b.profile}</span>
          <span className="rb-chart__bars">
            <span className="rb-bar rb-bar--time" style={{ width: `${Math.max(3, b.time * 100)}%` }} title={`Time ${(b.time * 100).toFixed(0)} % of the longest`} />
            <span className="rb-bar rb-bar--risk" style={{ width: `${Math.max(3, b.risk * 100)}%` }} title={`Risk ${(b.risk * 100).toFixed(0)} % of the highest`} />
          </span>
        </div>
      ))}
      <div className="rb-chart__legend">
        <span>
          <i className="rb-swatch rb-swatch--time" /> time
        </span>
        <span>
          <i className="rb-swatch rb-swatch--risk" /> risk
        </span>
      </div>
    </figure>
  );
}

function Ribbon({ route }: { route: RouteResult }) {
  const pieces = ribbonPieces(route);
  if (pieces.length === 0) return null;
  const legend = [...new Map(pieces.map((p) => [p.factor, p])).values()];
  return (
    <div className="rb-ribbon-wrap">
      <div className="rb-ribbon" role="img" aria-label="Limiting factor along the route">
        {pieces.map((p, i) => (
          <span key={`${p.factor}-${i}`} style={{ width: `${p.fraction * 100}%`, background: p.color }} title={`${p.label}: ${Math.round(p.fraction * 100)} %`} />
        ))}
      </div>
      <ul className="rb-ribbon__legend">
        {legend.map((p) => (
          <li key={p.factor}>
            <i style={{ background: FACTOR_STYLE[p.factor].color }} /> {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RouteBuilderPanel({ siteId, bbox, base, planner: injected, onClose, className }: RouteBuilderPanelProps) {
  const api = useRouteBuilder({ ...(siteId ? { siteId } : {}), ...(bbox ? { bbox } : {}), ...(base ? { base } : {}), ...(injected ? { planner: injected } : {}) });
  const active = useRouteBuilderStore((s) => s.active);
  const points = useRouteBuilderStore((s) => s.points);
  const status = useRouteBuilderStore((s) => s.status);
  const elapsedMs = useRouteBuilderStore((s) => s.elapsedMs);
  const warmupHint = useRouteBuilderStore((s) => s.warmupHint);
  const error = useRouteBuilderStore((s) => s.error);
  const notice = useRouteBuilderStore((s) => s.notice);
  const results = useRouteBuilderStore((s) => s.results);
  const backInfo = useRouteBuilderStore((s) => s.backInfo);
  const fromCache = useRouteBuilderStore((s) => s.fromCache);
  const canUndo = useRouteBuilderStore((s) => s.history.length > 0);
  const selectedRouteId = useAppStore((s) => s.selectedRouteId);
  const setSelectedRouteId = useAppStore((s) => s.setSelectedRouteId);
  const st = useRouteBuilderStore.getState();

  const planning = status === "planning";
  const selected = results.find((r) => r.route_id === selectedRouteId) ?? results[0];
  const canPlan = points.length >= 2 && !planning;

  return (
    <section className={`rb-panel ${className ?? ""}`} aria-label="Route builder">
      <header className="rb-head">
        <div>
          <h2 className="rb-title">Plan a route</h2>
          <p className="rb-sub">{active ? "Click the map to add points. Drag a marker to move it, right-click to remove it." : "Turn on planning, then click the map."}</p>
        </div>
        <div className="rb-head__actions">
          <button
            type="button"
            className={`rb-toggle${active ? " is-on" : ""}`}
            role="switch"
            aria-checked={active}
            onClick={() => st.setActive(!active)}
          >
            <span className="rb-toggle__dot" />
            {active ? "Placing points" : "Place points"}
          </button>
          {onClose && (
            <button type="button" className="rb-iconbtn" aria-label="Close route builder" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
      </header>

      {notice && (
        <p className="rb-notice" role="status">
          {notice}
        </p>
      )}

      <div className="rb-toolbar" role="toolbar" aria-label="Edit points">
        <button type="button" disabled={!canUndo} onClick={() => st.undo()} title="Undo (Z)">
          Undo
        </button>
        <button type="button" disabled={points.length < 2} onClick={() => st.reverse()}>
          Reverse
        </button>
        <button type="button" disabled={points.length === 0} onClick={() => st.clear()}>
          Clear
        </button>
        <button type="button" disabled={points.length < 3 || planning} onClick={() => void api.optimiseOrder()} title="Shortest order of the stops">
          Optimise order
        </button>
        <button type="button" disabled={points.length === 0 || planning} onClick={() => void api.backToBase()} title="Route from the last point back to the habitat">
          Back to base
        </button>
      </div>

      {points.length === 0 ? (
        <p className="rb-empty">No points yet. The first click sets the start (a click within 150 m of the habitat snaps to it).</p>
      ) : (
        <ol className="rb-points" aria-label="Route points">
          {points.map((p, i) => (
            <PointRow key={p.id} point={p} index={i} last={i === points.length - 1} />
          ))}
        </ol>
      )}

      <div className="rb-run">
        {planning ? (
          <button type="button" className="rb-btn rb-btn--ghost" onClick={() => api.cancel()}>
            Cancel (Esc)
          </button>
        ) : (
          <button type="button" className="rb-btn rb-btn--primary" disabled={!canPlan} onClick={() => void api.plan()}>
            Plan routes (Enter)
          </button>
        )}
        {points.length < 2 && !planning && <span className="rb-hint">Add a start and a destination.</span>}
      </div>

      <div aria-live="polite">
        {planning && (
          <div className="rb-progress">
            <div className="rb-progress__bar" aria-hidden="true" />
            <span>Computing four alternatives… {(elapsedMs / 1000).toFixed(1)} s</span>
            {warmupHint && <span className="rb-progress__note">The first run compiles the math kernels, so it takes longer. Later runs take a few seconds.</span>}
          </div>
        )}
        {error && !planning && (
          <div className="rb-error" role="alert">
            <strong>{error.code === "OUT_OF_AOI" ? "Point outside the map" : error.code === "NO_ROUTE" ? "No walkable route" : "Could not plan"}</strong>
            <span>{error.message}</span>
            {error.retryable && (
              <button type="button" className="rb-btn rb-btn--small" onClick={() => void api.retry()}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {backInfo && !planning && (
        <p className="rb-back" role="status">
          Way back: <strong>{formatDistance(backInfo.distance_m)}</strong>, head {Math.round(backInfo.bearing_deg)}° first, about{" "}
          <strong>{formatDuration(backInfo.eta_s)}</strong>, dose {backInfo.dose_mSv.toFixed(2)} mSv.
        </p>
      )}

      {results.length > 0 && (
        <div className="rb-results">
          <div className="rb-cards" role="group" aria-label="Route alternatives">
            {results.map((r) => (
              <RouteCardView key={r.route_id} route={r} selected={selected?.route_id === r.route_id} onSelect={() => setSelectedRouteId(r.route_id)} />
            ))}
          </div>
          {fromCache && <p className="rb-cache">Shown from your earlier calculation for the same points.</p>}
          {results.length > 1 && <CompareChart routes={results} />}
          {selected && (
            <div className="rb-why">
              <h3>Why this route</h3>
              <Ribbon route={selected} />
              <ul>
                {whyRoute(selected, results).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              {selected.feasibility.violations.length > 0 && (
                <ul className="rb-violations" aria-label="Constraint violations">
                  {selected.feasibility.violations.map((v, i) => (
                    <li key={i}>{v.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
