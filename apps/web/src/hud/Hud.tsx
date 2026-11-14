import React from "react";
import { WarningIcon, RouteIcon, BaseIcon, OxygenIcon, RadiationIcon } from "../ui/Icons";
import "./Hud.css";

export interface HudWaypoint {
  name: string;
  bearing_deg: number;
  distance_m: number;
}

export interface HudBackToBase {
  bearing_deg: number;
  distance_m: number;
}

export interface HudEvaDose {
  current_mSv: number;
  max_mSv: number;
  rate_mSv_h?: number;
}

export interface HudLifeSupport {
  o2_percent: number;
  time_remaining_s: number;
}

export interface HudCommsWindow {
  next_aos_in_s: number;
  duration_s: number;
  orbiter_name: string;
}

export interface HudAlert {
  id: string;
  text: string;
  severity?: "danger" | "warning";
}

export interface HudProps {
  heading: number; // 0 to 359
  nextWaypoint?: HudWaypoint;
  backToBase?: HudBackToBase;
  evaDose: HudEvaDose;
  lifeSupport: HudLifeSupport;
  commsWindow?: HudCommsWindow;
  alerts?: HudAlert[];
  isRecalculating?: boolean;
  onTriggerReroute?: () => void;
  onReturnToBase?: () => void;
  onToggleMode?: () => void;
  className?: string;
}

function formatHeading(deg: number): string {
  const norm = Math.round(((deg % 360) + 360) % 360);
  return `${norm.toString().padStart(3, "0")}°`;
}

function cardinalFromDeg(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
  const dir = directions[Math.round(norm / 45)];
  return dir ?? "N";
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function Hud({
  heading,
  nextWaypoint,
  backToBase,
  evaDose,
  lifeSupport,
  commsWindow,
  alerts = [],
  isRecalculating = false,
  onTriggerReroute,
  onReturnToBase,
  onToggleMode,
  className = "",
}: HudProps) {
  // SVG Heading Tape Calculations
  // View window of +- 45 degrees around current heading
  const tapeWidth = 500;
  const tapeHeight = 52;
  const degreesSpan = 90; // 45 deg left and right
  const pixelsPerDegree = tapeWidth / degreesSpan;

  // Generate tick marks within heading +- 45
  const ticks: Array<{ deg: number; x: number; label?: string; isMajor: boolean }> = [];
  const startDeg = Math.floor(heading - 45);
  const endDeg = Math.ceil(heading + 45);

  for (let d = startDeg; d <= endDeg; d++) {
    if (d % 5 === 0) {
      const offset = (d - heading) * pixelsPerDegree;
      const x = tapeWidth / 2 + offset;
      const normDeg = ((d % 360) + 360) % 360;
      let label: string | undefined;

      if (normDeg === 0) label = "N";
      else if (normDeg === 45) label = "NE";
      else if (normDeg === 90) label = "E";
      else if (normDeg === 135) label = "SE";
      else if (normDeg === 180) label = "S";
      else if (normDeg === 225) label = "SW";
      else if (normDeg === 270) label = "W";
      else if (normDeg === 315) label = "NW";
      else if (normDeg % 15 === 0) label = `${normDeg}`;

      ticks.push({
        deg: normDeg,
        x,
        label,
        isMajor: normDeg % 15 === 0,
      });
    }
  }

  return (
    <div
      role="region"
      aria-label="EVA Visor Heads-Up Display"
      className={`hud ${className}`.trim()}
    >
      {/* Top Bar: Heading Tape */}
      <div className="hud__top">
        <div className="hud__heading-container">
          <svg
            className="hud__tape-svg"
            viewBox={`0 0 ${tapeWidth} ${tapeHeight}`}
            aria-hidden="true"
          >
            {/* Center Reticle Marker */}
            <line
              x1={tapeWidth / 2}
              y1={0}
              x2={tapeWidth / 2}
              y2={tapeHeight}
              stroke="var(--color-accent)"
              strokeWidth="2.5"
            />
            <polygon
              points={`${tapeWidth / 2 - 6},0 ${tapeWidth / 2 + 6},0 ${tapeWidth / 2},8`}
              fill="var(--color-accent)"
            />

            {/* Ticks and Labels */}
            {ticks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={t.x}
                  y1={tapeHeight - (t.isMajor ? 18 : 10)}
                  x2={t.x}
                  y2={tapeHeight}
                  stroke={t.isMajor ? "#ffffff" : "rgba(255,255,255,0.4)"}
                  strokeWidth={t.isMajor ? 2 : 1}
                />
                {t.label && (
                  <text
                    x={t.x}
                    y={18}
                    fill={t.label === "N" ? "var(--color-danger)" : "#E6EDF3"}
                    fontSize={t.label.length <= 2 ? 14 : 11}
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                  >
                    {t.label}
                  </text>
                )}
              </g>
            ))}
          </svg>

          <div
            className="hud__heading-readout"
            aria-label={`Heading ${formatHeading(heading)} ${cardinalFromDeg(heading)}`}
          >
            <span>{formatHeading(heading)}</span>
            <span style={{ color: "var(--color-accent)" }}>
              {cardinalFromDeg(heading)}
            </span>
          </div>
        </div>
      </div>

      {/* Recalculating / Active Alerts Banner */}
      {isRecalculating ? (
        <div className="hud__alerts-container">
          <div className="hud__recalculating" role="status" aria-live="assertive">
            <RouteIcon size={24} />
            <span>Recalculating route from current position...</span>
          </div>
        </div>
      ) : alerts.length > 0 ? (
        <div className="hud__alerts-container">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="hud__alert-item"
              role="alert"
              aria-live="assertive"
            >
              <WarningIcon size={28} />
              <span className="hud__alert-text">{alert.text}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Middle Area: Side info and center visor crosshairs */}
      <div className="hud__middle">
        {/* Left Side: Next Waypoint & Base */}
        <div className="hud__side-panel">
          {nextWaypoint && (
            <div className="hud__widget">
              <span className="hud__widget-title">Next Waypoint</span>
              <span className="hud__widget-value">
                {formatDistance(nextWaypoint.distance_m)}
              </span>
              <span className="hud__widget-sub">
                BRG {formatHeading(nextWaypoint.bearing_deg)} • {nextWaypoint.name}
              </span>
            </div>
          )}

          {backToBase && (
            <div className="hud__widget">
              <span className="hud__widget-title">Return Vector</span>
              <span className="hud__widget-value">
                {formatDistance(backToBase.distance_m)}
              </span>
              <span className="hud__widget-sub">
                BRG {formatHeading(backToBase.bearing_deg)} • BASE
              </span>
            </div>
          )}
        </div>

        {/* Center Visor Reticle */}
        <div className="hud__center-reticle" aria-hidden="true">
          <svg width="60" height="60" viewBox="0 0 60 60">
            <circle
              cx="30"
              cy="30"
              r="24"
              fill="none"
              stroke="rgba(86, 180, 233, 0.3)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <line x1="30" y1="18" x2="30" y2="24" stroke="var(--color-accent)" strokeWidth="2" />
            <line x1="30" y1="36" x2="30" y2="42" stroke="var(--color-accent)" strokeWidth="2" />
            <line x1="18" y1="30" x2="24" y2="30" stroke="var(--color-accent)" strokeWidth="2" />
            <line x1="36" y1="30" x2="42" y2="30" stroke="var(--color-accent)" strokeWidth="2" />
          </svg>
        </div>

        {/* Right Side: Comms & Environmental */}
        <div className="hud__side-panel" style={{ alignItems: "flex-end" }}>
          {commsWindow && (
            <div className="hud__widget" style={{ textAlign: "right" }}>
              <span className="hud__widget-title">Relay Comms</span>
              <span className="hud__widget-value">
                {formatTime(commsWindow.next_aos_in_s)}
              </span>
              <span className="hud__widget-sub">
                AOS in • {commsWindow.orbiter_name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Bar: Telemetry Gauges + Glove Sized Touch Buttons */}
      <div className="hud__bottom">
        {/* O2 & Time Left */}
        <div className="hud__widget">
          <span className="hud__widget-title">Life Support</span>
          <span className="hud__widget-value">
            <OxygenIcon size={20} style={{ verticalAlign: "middle", marginRight: 6 }} />
            O2 {Math.round(lifeSupport.o2_percent)}%
          </span>
          <span className="hud__widget-sub">
            TIME LEFT {formatTime(lifeSupport.time_remaining_s)}
          </span>
        </div>

        {/* EVA Radiation Dose */}
        <div className="hud__widget">
          <span className="hud__widget-title">Radiation Dose</span>
          <span className="hud__widget-value">
            <RadiationIcon size={20} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {evaDose.current_mSv.toFixed(2)} mSv
          </span>
          <span className="hud__widget-sub">
            LIMIT {evaDose.max_mSv.toFixed(2)} mSv
            {evaDose.rate_mSv_h ? ` • ${evaDose.rate_mSv_h.toFixed(3)} mSv/h` : ""}
          </span>
        </div>

        {/* Glove Sized Actions (>= 64px) */}
        <div className="hud__actions">
          {onReturnToBase && (
            <button
              type="button"
              className="hud__glove-btn hud__glove-btn--danger"
              onClick={onReturnToBase}
              title="Return to Habitat"
              aria-label="Return to Habitat"
            >
              <BaseIcon size={28} />
            </button>
          )}

          {onTriggerReroute && (
            <button
              type="button"
              className="hud__glove-btn"
              onClick={onTriggerReroute}
              title="Recalculate Route"
              aria-label="Recalculate Route"
            >
              <RouteIcon size={28} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
