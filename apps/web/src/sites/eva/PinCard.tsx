import { formatLatLon } from "../../globe/coords";
import type { PinInfo } from "./pin";
import type { RangeRing } from "./range";

/** The dropped pin: where it is, how steep, how far from the station, and what to do with it. */
export function PinCard({
  pin,
  range,
  modelLabel,
  onRoute,
  onAdd,
  onStand,
  onClose,
}: {
  pin: PinInfo;
  /** the range ring of the pin (null while it is not known) */
  range?: RangeRing | null;
  modelLabel: string;
  onRoute: () => void;
  onAdd: () => void;
  onStand: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="pin-card" translate="no" aria-label="Pinned point" data-testid="pin-card">
      <header>
        <strong>Pinned point</strong>
        <button type="button" onClick={onClose} aria-label="Close the pin">
          ✕
        </button>
      </header>
      <div className="pin-card__coords">{formatLatLon(pin.lat, pin.lon, 4)}</div>
      <dl>
        <dt>ELEVATION</dt>
        <dd>{Math.round(pin.elevation)} m</dd>
        <dt>SLOPE</dt>
        <dd className={pin.walkable ? "is-ok" : "is-bad"}>
          {pin.walkable ? "✓" : "✗"} {pin.slopeDeg.toFixed(0)}° · {pin.walkable ? "walkable" : "too steep to walk"}
        </dd>
        <dt>FROM STATION</dt>
        <dd>{(pin.fromStationM / 1000).toFixed(2)} km direct</dd>
      </dl>
      {range && (
        <div className="pin-card__range" data-testid="pin-range">
          <i aria-hidden /> <b>RANGE RING</b>{" "}
          {range.reachable ? (
            <>
              from here you can reach up to <b>{(range.maxRadiusM / 1000).toFixed(1)} km</b> and still walk back to the station: {range.budgetL.toFixed(0)} L of usable oxygen are left after the {range.toPinL.toFixed(0)} L it takes to get here
            </>
          ) : (
            <>not reachable: getting here takes {Number.isFinite(range.toPinL) ? `${range.toPinL.toFixed(0)} L` : "more than the whole tank"}, nothing is left for the way back</>
          )}
        </div>
      )}
      <div className="pin-card__actions">
        <button type="button" className="pin-card__primary" onClick={onRoute}>
          → ROUTE HERE
        </button>
        <button type="button" onClick={onAdd}>
          + ADD STOP
        </button>
        <button type="button" onClick={onStand}>
          ◉ STAND HERE
        </button>
      </div>
      <p className="pin-card__note">Least-energy route from the station, solved on the {modelLabel} elevation model.</p>
    </aside>
  );
}
