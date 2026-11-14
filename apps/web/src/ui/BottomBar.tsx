import React from "react";
import { AutopilotButton } from "./AutopilotButton";
import { InfoIcon } from "./Icons";
import "./BottomBar.css";

export interface BottomBarProps {
  altitudeKm?: number;
  onOpenDataSources: () => void;
  autopilotRunning: boolean;
  onToggleAutopilot: (running: boolean) => void;
  className?: string;
}

export function BottomBar({
  altitudeKm = 1.8,
  onOpenDataSources,
  autopilotRunning,
  onToggleAutopilot,
  className = "",
}: BottomBarProps) {
  return (
    <footer
      role="contentinfo"
      aria-label="Mission Telemetry Bottom Bar"
      className={`bottom-bar ${className}`.trim()}
    >
      {/* Left section: Altitude readout & Data sources button */}
      <div className="bottom-bar__left">
        <div className="bottom-bar__telemetry">
          <span className="bottom-bar__telemetry-label">ALT</span>
          <span className="bottom-bar__telemetry-val">
            {altitudeKm.toFixed(1)} km
          </span>
        </div>

        <button
          type="button"
          className="bottom-bar__btn"
          onClick={onOpenDataSources}
          aria-label="Open Data Sources and Attribution"
        >
          <InfoIcon size={14} />
          <span>DATA SOURCES</span>
        </button>
      </div>

      {/* Center section: Autopilot Toggle */}
      <div className="bottom-bar__center">
        <AutopilotButton
          isRunning={autopilotRunning}
          onToggle={onToggleAutopilot}
        />
      </div>

      {/* Right section: Disabled feature stubs with tooltips */}
      <div className="bottom-bar__right">
        <button
          type="button"
          disabled
          title="coming soon"
          className="bottom-bar__btn"
          aria-label="Record flight simulation (coming soon)"
        >
          REC
        </button>

        <button
          type="button"
          disabled
          title="coming soon"
          className="bottom-bar__btn"
          aria-label="Audio telemetry sound effects (coming soon)"
        >
          SOUND
        </button>
      </div>
    </footer>
  );
}
