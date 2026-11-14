import { useEffect, useState } from "react";
import { SITE_FACTS } from "../globe/siteCatalog";
import { loadLayerMeta, loadValueSampler, type ValueSampler } from "../globe/globeLayers";
import type { SiteInputs } from "./siteMetrics";

export interface SiteInputsState {
  sites: SiteInputs[];
  /** the layers are being read */
  loading: boolean;
  /** the modelled layers could not be loaded (API down): only the computed columns are filled */
  offline: boolean;
}

const KEYS = ["radiation", "pressure", "slope", "hazard", "elevation"] as const;

/** The eight stations with the modelled layers sampled at them. Missing layers give null, never a made-up value. */
export function useSiteInputs(): SiteInputsState {
  const base: SiteInputs[] = Object.values(SITE_FACTS).map((f) => ({
    id: f.id,
    name: f.name,
    lat: f.stationPos.lat,
    lon: f.stationPos.lon,
    radiation: null,
    pressure: null,
    slope: null,
    hazard: null,
    elevation: null,
  }));
  const [state, setState] = useState<SiteInputsState>({ sites: base, loading: true, offline: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      const meta = await loadLayerMeta();
      if (!alive) return;
      if (!meta) {
        setState({ sites: base, loading: false, offline: true });
        return;
      }
      const samplers: Partial<Record<(typeof KEYS)[number], ValueSampler>> = {};
      for (const k of KEYS) {
        const m = meta[k];
        const s = m ? await loadValueSampler(k, m) : null;
        if (s) samplers[k] = s;
      }
      if (!alive) return;
      const sites = base.map((b) => {
        const at = (k: (typeof KEYS)[number]) => {
          const s = samplers[k];
          return s ? s.at(b.lat, b.lon) : null;
        };
        return { ...b, radiation: at("radiation"), pressure: at("pressure"), slope: at("slope"), hazard: at("hazard"), elevation: at("elevation") };
      });
      setState({ sites, loading: false, offline: Object.keys(samplers).length === 0 });
    })();
    return () => {
      alive = false;
    };
    // the station list is a constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
