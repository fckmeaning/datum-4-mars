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
      aria-label={`Guided tour: ${isRunning ? "running" : "idle"}`}
      onClick={() => onToggle(!isRunning)}
      className={`autopilot-btn ${
        isRunning ? "autopilot-btn--active" : ""
      } ${className}`.trim()}
    >
      <span className="autopilot-btn__indicator" aria-hidden="true" />
      <span className="autopilot-btn__label">Guided tour</span>
      <span className="autopilot-btn__status">
        [{isRunning ? "LIVE" : "READY"}]
      </span>
    </button>
  );
}
