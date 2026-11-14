import React from "react";
import "./StatTile.css";

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  status?: "normal" | "warning" | "danger" | "ok";
  subtitle?: string;
  className?: string;
}

export function StatTile({
  label,
  value,
  unit,
  icon,
  status = "normal",
  subtitle,
  className = "",
}: StatTileProps) {
  return (
    <div
      role="group"
      aria-label={`${label}: ${value} ${unit ?? ""}`.trim()}
      className={`stat-tile stat-tile--${status} ${className}`.trim()}
    >
      <div className="stat-tile__header">
        <span className="stat-tile__label">{label}</span>
        {icon && <span className="stat-tile__icon">{icon}</span>}
      </div>

      <div className="stat-tile__body">
        <span className="stat-tile__value">{value}</span>
        {unit && <span className="stat-tile__unit">{unit}</span>}
      </div>

      {subtitle && <span className="stat-tile__subtitle">{subtitle}</span>}
    </div>
  );
}
