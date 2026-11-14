import React from "react";
import { useAutopilot } from "./useAutopilot";
import "./AutopilotBanner.css";

export function AutopilotBanner() {
  const { running, caption, stop } = useAutopilot();

  if (!running || !caption) {
    return null;
  }
  // "TITLE · subtitle"
  const cut = caption.indexOf(" · ");
  const title = cut > 0 ? caption.slice(0, cut) : "";
  const sub = cut > 0 ? caption.slice(cut + 3) : caption;

  return (
    <div
      role="status"
      aria-live="polite"
      className="autopilot-banner"
    >
      <div className="autopilot-banner__indicator">
        <span className="autopilot-banner__pulse" />
        <span className="autopilot-banner__tag">GUIDED TOUR</span>
      </div>

      <div className="autopilot-banner__content">
        <p className="autopilot-banner__caption">
          {title ? <strong>{title}</strong> : null}
          {sub ? <span> {sub}</span> : null}
        </p>
      </div>

      <button
        type="button"
        className="autopilot-banner__cancel-btn"
        onClick={stop}
        aria-label="Stop Autopilot Tour"
      >
        <span>Exit [Esc]</span>
      </button>
    </div>
  );
}
