import { useEffect } from "react";
import { Outlet, useSearchParams } from "react-router-dom";
import { AutopilotBanner } from "./AutopilotBanner";
import { globalAutopilot } from "./autopilot";
import { useAutopilot } from "./useAutopilot";

/** Root of every route: gives the tour its navigation and Esc key, shows the caption, and starts it for `?autopilot`. */
export function AutopilotHost() {
  useAutopilot();
  const [params] = useSearchParams();
  const auto = params.has("autopilot");
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => globalAutopilot.start(), 1500);
    return () => window.clearTimeout(t);
    // once, when the page was opened with ?autopilot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Outlet />
      <AutopilotBanner />
    </>
  );
}
