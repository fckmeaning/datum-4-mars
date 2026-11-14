import { MOSAIC_4K_URL } from "../globe/globeAssets";
import { otherView, type ViewMode } from "./viewMode";
import "./ViewSwitch.css";

export interface ViewSwitchProps {
  view: ViewMode;
  onChange: (next: ViewMode) => void;
}

/**
 * A mini tile in the corner of /globe, like the globe toggle of 2GIS: it shows a preview of the picture you would switch TO
 * (a small globe while you look at the flat map, a small flat map while you look at the globe). The key M does the same.
 */
export function ViewSwitch({ view, onChange }: ViewSwitchProps) {
  const next = otherView(view);
  const label = next === "flat" ? "Flat map" : "Globe";
  return (
    <button
      type="button"
      className="viewswitch"
      data-testid="view-switch"
      data-view={view}
      data-next={next}
      aria-label={`Switch to the ${label.toLowerCase()} (M)`}
      title={`${label} (M)`}
      onClick={() => onChange(next)}
    >
      <span className="viewswitch__thumb" data-kind={next} style={{ backgroundImage: `url(${MOSAIC_4K_URL})` }} aria-hidden="true" />
      <span className="viewswitch__label">
        {label}
        <kbd>M</kbd>
      </span>
    </button>
  );
}
