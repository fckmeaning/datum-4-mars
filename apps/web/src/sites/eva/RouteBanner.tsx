import type { Plan, Verdict } from "./plan";

const WORD: Record<Verdict, string> = { READY: "CLEAR", CAUTION: "MARGINAL", NO_GO: "ABORT" };

function hm(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)} H ${String(m % 60).padStart(2, "0")} MIN`;
}

/** The one-line route summary at the top of the view: distance, time and the call. */
export function RouteBanner({ plan, verdict }: { plan: Plan; verdict: Verdict }) {
  return (
    <div className={`route-banner route-banner--${verdict}`} translate="no" data-testid="route-banner">
      ROUTE · {(plan.stats.distanceM / 1000).toFixed(2)} KM · {hm(plan.stats.timeS)} · {WORD[verdict]}
    </div>
  );
}
