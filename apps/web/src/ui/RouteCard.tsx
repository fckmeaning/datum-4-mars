import React from "react";
import type { components } from "../api/schema";
import { Badge } from "./Badge";
import { Chip, type ChipTone } from "./Panel";
import { CautionIcon, NoGoIcon, ReadyIcon, WarningIcon } from "../icons";
import { VERDICT_LABEL, formatDistance, formatDose, formatDuration, formatOxygen, formatSlope, formatSunset } from "./format";
import "./RouteCard.css";

export type RouteResultData = components["schemas"]["RouteResult"];

export interface RouteCardProps {
  route: RouteResultData;
  selected?: boolean;
  onSelect?: (routeId: string) => void;
  className?: string;
}

const VERDICT_TONE: Record<"READY" | "CAUTION" | "NO_GO", ChipTone> = { READY: "ok", CAUTION: "warning", NO_GO: "danger" };

function VerdictIcon({ call }: { call: "READY" | "CAUTION" | "NO_GO" }) {
  if (call === "READY") return <ReadyIcon size={13} />;
  if (call === "CAUTION") return <CautionIcon size={13} />;
  return <NoGoIcon size={13} />;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  return (
    <div className="route-card__stat-item">
      <span className="route-card__stat-label">{label}</span>
      <span className={`route-card__stat-value u-num${tone ? ` route-card__stat-value--${tone}` : ""}`}>{value}</span>
    </div>
  );
}

export function RouteCard({ route, selected = false, onSelect, className = "" }: RouteCardProps) {
  const { profile, totals, feasibility, route_id, verdict } = route;
  const isOk = feasibility?.ok ?? true;
  const violations = feasibility?.violations ?? [];

  // Determine risk level badge
  const riskValue = totals.risk ?? 0.2;
  const riskBadgeVariant = riskValue < 0.25 ? "ok" : riskValue < 0.6 ? "warning" : "danger";
  const riskLabel = riskValue < 0.25 ? "Low Risk" : riskValue < 0.6 ? "Mod Risk" : "High Risk";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(route_id);
    }
  };

  const reason = verdict?.reasons?.[0] ?? violations[0]?.message ?? null;
  const sunset = totals.sunset_in_s;
  const sunsetTone = typeof sunset === "number" && sunset > 0 && sunset < totals.time_s ? "warning" : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(route_id)}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
      aria-label={`Route profile ${profile}, duration ${formatDuration(totals.time_s)}, distance ${formatDistance(totals.length_m)}${
        verdict ? `, verdict ${VERDICT_LABEL[verdict.call]}` : ""
      }`}
      className={`route-card route-card--${profile} ${selected ? "route-card--selected" : ""} ${className}`.trim()}
    >
      <div className="route-card__header">
        <div className="route-card__profile">
          <Badge variant={profile} />
          {verdict ? (
            <Chip tone={VERDICT_TONE[verdict.call]} icon={<VerdictIcon call={verdict.call} />}>
              {VERDICT_LABEL[verdict.call]}
            </Chip>
          ) : null}
          {!isOk && !verdict ? (
            <Badge variant="warning" size="sm">
              Violation
            </Badge>
          ) : null}
        </div>
        <div className="route-card__time u-num">{formatDuration(totals.time_s)}</div>
      </div>

      <div className="route-card__stats">
        <Stat label="Dist" value={formatDistance(totals.length_m)} />
        <Stat label="Dose" value={formatDose(totals.dose_mSv)} />
        <Stat label={"O₂"} value={formatOxygen(totals.o2_l)} />
        <Stat label="Max Slope" value={formatSlope(totals.max_slope_deg)} />
        {typeof totals.turnback_distance_m === "number" ? <Stat label="Turn back" value={formatDistance(totals.turnback_distance_m)} tone="warning" /> : null}
        {typeof sunset === "number" ? <Stat label="Sunset" value={formatSunset(sunset)} tone={sunsetTone} /> : null}
      </div>

      <div className="route-card__footer">
        <div className="route-card__risk">
          <Badge variant={riskBadgeVariant} size="sm">
            {riskLabel}
          </Badge>
        </div>
        {violations[0] ? (
          <div className="route-card__warnings" title={violations[0].message}>
            <WarningIcon size={14} />
            <span>{violations[0].kind}</span>
          </div>
        ) : reason ? (
          <div className="route-card__reason" title={reason}>
            {reason}
          </div>
        ) : null}
      </div>
    </div>
  );
}
