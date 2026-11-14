import { rampGradient, type LayerMeta } from "../globe/globeLayers";
import "./GlobeLegend.css";

export interface LegendEntry {
  id: string;
  meta: LayerMeta;
}

/** Colour-bar legend for each active data layer; says plainly when a layer is modeled rather than measured. */
export function GlobeLegend({ entries }: { entries: LegendEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <aside className="globe-legend" aria-label="Layer legend" translate="no">
      {entries.map(({ id, meta }) => (
        <div key={id} className="globe-legend__row" data-testid={`legend-${id}`}>
          <div className="globe-legend__head">
            <strong>{meta.name}</strong>
            <span className={meta.modeled ? "globe-legend__tag globe-legend__tag--modeled" : "globe-legend__tag"}>
              {meta.modeled ? "MODELED" : "MEASURED"}
            </span>
          </div>
          {meta.ramp && meta.min !== undefined && meta.max !== undefined ? (
            <>
              <div className="globe-legend__bar" style={{ background: rampGradient(meta.ramp) }} />
              <div className="globe-legend__scale">
                <span>{meta.min}</span>
                <span>{meta.unit}</span>
                <span>{meta.max}</span>
              </div>
            </>
          ) : null}
          <div className="globe-legend__source">{meta.source}</div>
        </div>
      ))}
    </aside>
  );
}
