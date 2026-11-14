import React from "react";
import type { components } from "../api/schema";
import { Badge } from "../ui/Badge";
import { WarningIcon, CheckIcon } from "../ui/Icons";
import "./RouteCompareTable.css";

export type RouteResultData = components["schemas"]["RouteResult"];

export interface RouteCompareTableProps {
  routes: RouteResultData[];
  selectedRouteId?: string;
  onSelect: (routeId: string) => void;
  className?: string;
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h === 0) return `${mins}m`;
  return `${h}h ${mins.toString().padStart(2, "0")}m`;
}

export function RouteCompareTable({
  routes,
  selectedRouteId,
  onSelect,
  className = "",
}: RouteCompareTableProps) {
  if (!routes || routes.length === 0) {
    return (
      <div className={`route-compare-container ${className}`.trim()}>
        <p style={{ color: "var(--color-text-muted)" }}>No routes to compare.</p>
      </div>
    );
  }

  // Calculate best values per column
  const best = {
    time: Math.min(...routes.map((r) => r.totals.time_s)),
    length: Math.min(...routes.map((r) => r.totals.length_m)),
    ascent: Math.min(...routes.map((r) => r.totals.ascent_m)),
    maxSlope: Math.min(...routes.map((r) => r.totals.max_slope_deg)),
    dose: Math.min(...routes.map((r) => r.totals.dose_mSv)),
    energy: Math.min(...routes.map((r) => r.totals.energy_kJ)),
    o2: Math.min(...routes.map((r) => r.totals.o2_l)),
    minTemp: Math.max(...routes.map((r) => r.totals.min_temp_K ?? 0)),
    shadow: Math.min(...routes.map((r) => r.totals.shadow_fraction ?? 0)),
    risk: Math.min(...routes.map((r) => r.totals.risk ?? 1)),
    margin: Math.max(...routes.map((r) => r.totals.return_margin ?? 0)),
  };

  return (
    <div
      role="region"
      aria-label="Route Alternatives Comparison Table"
      className={`route-compare-container ${className}`.trim()}
    >
      <div className="route-compare-header">
        <h3 className="route-compare-title">Route Alternatives Comparison</h3>
        <span style={{ fontSize: "11px", color: "var(--color-ok)", fontFamily: "var(--font-mono)" }}>
          ● Highlighted cells indicate optimal metric
        </span>
      </div>

      <table className="route-compare-table">
        <thead>
          <tr>
            <th>Profile</th>
            <th>Time</th>
            <th>Length</th>
            <th>Ascent</th>
            <th>Max Slope</th>
            <th>Dose</th>
            <th>Energy</th>
            <th>O₂</th>
            <th>Min Temp</th>
            <th>Shadow</th>
            <th>Risk</th>
            <th>Margin</th>
            <th>Feasibility</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => {
            const isSelected = selectedRouteId === route.route_id;
            const t = route.totals;
            const violations = route.feasibility?.violations ?? [];
            const isOk = route.feasibility?.ok ?? violations.length === 0;

            const isBestTime = t.time_s === best.time;
            const isBestLength = t.length_m === best.length;
            const isBestAscent = t.ascent_m === best.ascent;
            const isBestSlope = t.max_slope_deg === best.maxSlope;
            const isBestDose = t.dose_mSv === best.dose;
            const isBestEnergy = t.energy_kJ === best.energy;
            const isBestO2 = t.o2_l === best.o2;
            const isBestTemp = t.min_temp_K !== null && t.min_temp_K !== undefined && t.min_temp_K === best.minTemp;
            const isBestShadow = t.shadow_fraction !== null && t.shadow_fraction !== undefined && t.shadow_fraction === best.shadow;
            const isBestRisk = t.risk !== undefined && t.risk === best.risk;
            const isBestMargin = t.return_margin !== null && t.return_margin !== undefined && t.return_margin === best.margin;

            return (
              <tr
                key={route.route_id}
                onClick={() => onSelect(route.route_id)}
                role="row"
                tabIndex={0}
                aria-selected={isSelected}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(route.route_id);
                  }
                }}
                className={`route-compare-row ${
                  isSelected ? "route-compare-row--selected" : ""
                }`}
              >
                <td>
                  <Badge variant={route.profile} size="sm" />
                </td>
                <td className={isBestTime ? "route-compare-cell--best" : ""}>
                  {formatDuration(t.time_s)}
                </td>
                <td className={isBestLength ? "route-compare-cell--best" : ""}>
                  {(t.length_m / 1000).toFixed(2)} km
                </td>
                <td className={isBestAscent ? "route-compare-cell--best" : ""}>
                  +{Math.round(t.ascent_m)} m
                </td>
                <td className={isBestSlope ? "route-compare-cell--best" : ""}>
                  {t.max_slope_deg.toFixed(1)}°
                </td>
                <td className={isBestDose ? "route-compare-cell--best" : ""}>
                  {t.dose_mSv.toFixed(2)} mSv
                </td>
                <td className={isBestEnergy ? "route-compare-cell--best" : ""}>
                  {Math.round(t.energy_kJ)} kJ
                </td>
                <td className={isBestO2 ? "route-compare-cell--best" : ""}>
                  {Math.round(t.o2_l)} L
                </td>
                <td className={isBestTemp ? "route-compare-cell--best" : ""}>
                  {t.min_temp_K ? `${Math.round(t.min_temp_K)} K` : "—"}
                </td>
                <td className={isBestShadow ? "route-compare-cell--best" : ""}>
                  {t.shadow_fraction !== null && t.shadow_fraction !== undefined
                    ? `${Math.round(t.shadow_fraction * 100)}%`
                    : "0%"}
                </td>
                <td className={isBestRisk ? "route-compare-cell--best" : ""}>
                  {t.risk !== undefined ? t.risk.toFixed(2) : "—"}
                </td>
                <td className={isBestMargin ? "route-compare-cell--best" : ""}>
                  {t.return_margin !== null && t.return_margin !== undefined
                    ? `${Math.round(t.return_margin * 100)}%`
                    : "—"}
                </td>
                <td>
                  {isOk ? (
                    <span style={{ color: "var(--color-ok)", display: "flex", alignItems: "center", gap: 4 }}>
                      <CheckIcon size={14} /> Passed
                    </span>
                  ) : (
                    <div className="route-compare-violations" title={violations[0]?.message}>
                      <WarningIcon size={14} />
                      <span>{violations[0]?.kind ?? "Violation"}</span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
