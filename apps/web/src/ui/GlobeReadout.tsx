import { formatLatLon } from "../globe/coords";
import { zoneAt } from "../globe/zones";
import "./GlobeReadout.css";

export interface GlobeTarget {
  title: string;
  subtitle?: string;
  lat: number;
  lon: number;
}

interface Props {
  hover: { lat: number; lon: number } | null;
  target: GlobeTarget | null;
  onOpen?: () => void;
  onClear?: () => void;
}

/** Live cursor coordinates (bottom centre) and a card for the selected site or picked point (bottom right). */
export function GlobeReadout({ hover, target, onOpen, onClear }: Props) {
  const hoverZone = hover ? zoneAt(hover.lat, hover.lon) : null;
  const targetZone = target ? zoneAt(target.lat, target.lon) : null;
  return (
    <>
      <div className="globe-readout__cursor" data-testid="cursor-coords" translate="no">
        {hover ? (
          <>
            <b>CURSOR</b> {formatLatLon(hover.lat, hover.lon, 3)}
            {hoverZone && <em> · {hoverZone.zone.name} zone</em>}
          </>
        ) : (
          <b>CURSOR: move over the planet</b>
        )}
      </div>

      {target && (
        <aside className="globe-readout__card" data-testid="target-card" translate="no">
          <div className="globe-readout__label">{target.subtitle ?? "Selected point"}</div>
          <h3>{target.title}</h3>
          <div className="globe-readout__coords">{formatLatLon(target.lat, target.lon, 4)}</div>
          {targetZone && <div className="globe-readout__zone">{targetZone.zone.name} Exploration Zone</div>}
          <div className="globe-readout__actions">
            {onOpen && (
              <button type="button" onClick={onOpen}>
                Open globe →
              </button>
            )}
            {onClear && (
              <button type="button" className="globe-readout__ghost" onClick={onClear}>
                Clear ✕
              </button>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
