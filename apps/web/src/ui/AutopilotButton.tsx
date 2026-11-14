import React from "react";
import "./BottomBar.css";

export interface AutopilotButtonProps {
  isRunning: boolean;
  onToggle: (running: boolean) => void;
  className?: string;
}

export function AutopilotButton({
  isRunning,
  onToggle,
  className = "",
}: AutopilotButtonProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isRunning}
      aria-label={`Autopilot simulation: ${isRunning ? "engaged" : "standby"}`}
      onClick={() => onToggle(!isRunning)}
      className={`autopilot-btn ${
        isRunning ? "autopilot-btn--active" : ""
      } ${className}`.trim()}
    >
      <span className="autopilot-btn__indicator" aria-hidden="true" />
      <span className="autopilot-btn__label">Autopilot</span>
      <span className="autopilot-btn__status">
        [{isRunning ? "ENGAGED" : "STANDBY"}]
      </span>
    </button>
  );
}
