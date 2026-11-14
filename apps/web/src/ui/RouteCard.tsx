import React from "react";
import type { components } from "../api/schema";
import { Badge } from "./Badge";
import { WarningIcon } from "./Icons";
import "./RouteCard.css";

export type RouteResultData = components["schemas"]["RouteResult"];

export interface RouteCardProps {
  route: RouteResultData;
  selected?: boolean;
  onSelect?: (routeId: string) => void;
  className?: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

function formatDose(mSv: number): string {
  if (mSv < 0.01) return `<0.01 mSv`;
  return `${mSv.toFixed(2)} mSv`;
}

export function RouteCard({
  route,
  selected = false,
  onSelect,
  className = "",
}: RouteCardProps) {
  const { profile, totals, feasibility, route_id } = route;
  const isOk = feasibility?.ok ?? true;
  const violations = feasibility?.violations ?? [];

  // Determine risk level badge
  const riskValue = totals.risk ?? 0.2;
  const riskBadgeVariant =
    riskValue < 0.25 ? "ok" : riskValue < 0.6 ? "warning" : "danger";
  const riskLabel =
    riskValue < 0.25 ? "Low Risk" : riskValue < 0.6 ? "Mod Risk" : "High Risk";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(route_id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(route_id)}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
      aria-label={`Route profile ${profile}, duration ${formatDuration(
        totals.time_s
      )}, distance ${formatDistance(totals.length_m)}`}
      className={`route-card route-card--${profile} ${
        selected ? "route-card--selected" : ""
      } ${className}`.trim()}
    >
      <div className="route-card__header">
        <div className="route-card__profile">
          <Badge variant={profile} />
          {!isOk && (
            <Badge variant="warning" size="sm">
              Violation
            </Badge>
          )}
        </div>
        <div className="route-card__time">{formatDuration(totals.time_s)}</div>
      </div>

      <div className="route-card__stats">
        <div className="route-card__stat-item">
          <span className="route-card__stat-label">Dist</span>
          <span className="route-card__stat-value">
            {formatDistance(totals.length_m)}
          </span>
        </div>
        <div className="route-card__stat-item">
          <span className="route-card__stat-label">Dose</span>
          <span className="route-card__stat-value">
            {formatDose(totals.dose_mSv)}
          </span>
        </div>
        <div className="route-card__stat-item">
          <span className="route-card__stat-label">Max Slope</span>
          <span className="route-card__stat-value">
            {totals.max_slope_deg.toFixed(1)}°
          </span>
        </div>
      </div>

      <div className="route-card__footer">
        <div className="route-card__risk">
          <Badge variant={riskBadgeVariant} size="sm">
            {riskLabel}
          </Badge>
        </div>
        {violations[0] && (
          <div className="route-card__warnings" title={violations[0].message}>
            <WarningIcon size={14} />
            <span>{violations[0].kind}</span>
          </div>
        )}
      </div>
    </div>
  );
}
