import { useRef, useState, useEffect, type ReactNode } from "react";
import type { PointReport } from "../api/client";
import { CheckIcon, CopyIcon, DirectionsIcon, MountainIcon, RouteIcon, SlopeIcon, SunIcon, ThermometerIcon, RadiationIcon, CrosshairIcon, CompassIcon, InfoIcon } from "../icons";
import { Button, Chip, KeyValue, KeyValueList, Panel, PanelSection } from "../ui/Panel";
import { bearingMars, coordForClipboard, distanceMars, formatBearing, formatCoord, formatDistance, formatElevation, formatSlope, formatTemperatureK } from "../ui/format";
import "./WhatsHereCard.css";

interface WhatsHereCardProps {
  report: PointReport;
  onClose: () => void;
  onRouteFrom: (lat: number, lon: number) => void;
  onRouteTo: (lat: number, lon: number) => void;
  /** Distance and bearing are measured from here; defaults to Bradbury Landing (D-01). */
  base?: { lat: number; lon: number };
}

const DEFAULT_BASE = { lat: -4.5895, lon: 137.4417 };
const DASH = "—";

function has(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function WhatsHereCard({ report, onClose, onRouteFrom, onRouteTo, base = DEFAULT_BASE }: WhatsHereCardProps) {
  const simulated = new Set(report.simulated_fields ?? []);
  const { lat, lon } = report.point;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coordForClipboard(lat, lon));
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const row = (label: string, icon: ReactNode, value: ReactNode, fieldKey?: string, hint?: string) => (
    <KeyValue
      label={label}
      icon={icon}
      value={value}
      hint={hint}
      chip={fieldKey && simulated.has(fieldKey) ? <Chip tone="warning" title="Simulated input">SIM</Chip> : undefined}
    />
  );

  const dist = distanceMars(base.lat, base.lon, lat, lon);
  const bearing = bearingMars(base.lat, base.lon, lat, lon);

  return (
    <Panel
      label="What's here details"
      className="whats-here"
      icon={<CrosshairIcon size={20} />}
      title={"What’s here"}
      subtitle={
        <span className="whats-here__coord">
          <span className="u-num">{formatCoord(lat, lon)}</span>
          <button type="button" className="whats-here__copy" onClick={handleCopy} aria-label={copied ? "Coordinates copied" : "Copy coordinates"} title="Copy coordinates (lat, lon)">
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
        </span>
      }
      onClose={onClose}
      footer={
        <div className="whats-here__actions">
          <Button variant="secondary" icon={<RouteIcon size={16} />} onClick={() => onRouteFrom(lat, lon)}>
            Route from here
          </Button>
          <Button variant="primary" icon={<DirectionsIcon size={16} />} onClick={() => onRouteTo(lat, lon)}>
            Route to here
          </Button>
        </div>
      }
    >
      <PanelSection title="Terrain">
        <KeyValueList label="Terrain">
          {row("Elevation", <MountainIcon size={16} />, has(report.elevation_m) ? formatElevation(report.elevation_m) : DASH, "elevation_m")}
          {row("Slope", <SlopeIcon size={16} />, has(report.slope_deg) ? formatSlope(report.slope_deg) : DASH, "slope_deg")}
          {row("Roughness", <InfoIcon size={16} />, has(report.roughness_m) ? `${report.roughness_m.toFixed(2)} m` : DASH, "roughness_m", "Residual relief in the analysis window")}
          {row("From base", <CompassIcon size={16} />, `${formatDistance(dist)} · ${formatBearing(bearing)}`, undefined, "Straight-line distance and initial bearing from the base")}
        </KeyValueList>
      </PanelSection>

      <PanelSection title="Light">
        <KeyValueList label="Light">
          {row("Sky fraction", <SunIcon size={16} />, has(report.sky_fraction) ? `${Math.round(report.sky_fraction * 100)}%` : DASH, "sky_fraction", "Share of the sky visible above the local horizon")}
          {row("Sun", <SunIcon size={16} />, report.shadowed === true ? "Shadowed" : "Sunlit", "shadowed")}
        </KeyValueList>
      </PanelSection>

      <PanelSection title="Environment">
        <KeyValueList label="Environment">
          {row("Ground temperature", <ThermometerIcon size={16} />, has(report.surface_temp_K) ? formatTemperatureK(report.surface_temp_K) : DASH, "surface_temp_K")}
          {row("Dose rate", <RadiationIcon size={16} />, has(report.dose_rate_mSv_h) ? `${(report.dose_rate_mSv_h * 1000).toFixed(1)} µSv/h` : DASH, "dose_rate_mSv_h")}
          {row("Thermal inertia", <ThermometerIcon size={16} />, has(report.thermal_inertia) ? `${Math.round(report.thermal_inertia)} tiu` : DASH, "thermal_inertia", "tiu = J m⁻² K⁻¹ s⁻½")}
        </KeyValueList>
      </PanelSection>
    </Panel>
  );
}
