import { globalAutopilot } from "./autopilot";
import { useAppStore } from "../state/store";

/** Starts and stops the autopilot tour from an expedition page (the globe has its own AUTOPILOT button). */
export function TourButton() {
  const running = useAppStore((s) => s.autopilotRunning);
  return (
    <button
      type="button"
      className={`tour-btn${running ? " is-on" : ""}`}
      aria-pressed={running}
      title="Autopilot tour of the whole product, about one minute (Esc stops it)"
      onClick={() => (running ? globalAutopilot.stop() : globalAutopilot.start())}
    >
      {running ? "■ Stop tour" : "▶ Guided tour"}
    </button>
  );
}
