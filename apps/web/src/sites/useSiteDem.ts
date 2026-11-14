import { useEffect, useState } from "react";
import type { DemMeta } from "./reliefMath";
import { decodeDemPng, type DemDecodeJob } from "./demDecodeClient";

export interface SiteDem {
  meta: DemMeta;
  heights: Float32Array;
  /** URL folder of the tile (for the orthophoto next to it) */
  dir: string;
}

/** Loads the MOLA 463 m elevation patch of a site (data/processed/sites/<id>/dem.png + dem.json). */
export function useSiteDem(siteId: string, tier?: string): { dem: SiteDem | null; error: string | null } {
  const key = `${siteId}/${tier ?? ""}`;
  const dir = tier ? `/data/sites/${siteId}/${tier}` : `/data/sites/${siteId}`;
  const [state, setState] = useState<{ id: string; dem: SiteDem | null; error: string | null }>({ id: key, dem: null, error: null });

  useEffect(() => {
    let alive = true;
    let job: DemDecodeJob | null = null;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${dir}/dem.json`, { signal: ac.signal });
        if (!res.ok) throw new Error(`no elevation patch for this site (HTTP ${res.status})`);
        const meta = (await res.json()) as DemMeta;
        job = decodeDemPng(`${dir}/dem.png`, meta.offset, meta.q16 ? [meta.min_m, meta.max_m] : undefined);
        const heights = await job.promise;
        if (alive) setState({ id: key, dem: { meta, heights, dir }, error: null });
      } catch (e) {
        if (alive) setState({ id: key, dem: null, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
      ac.abort();
      job?.cancel();
    };
  }, [key, dir]);

  // while a different site or tier is loading, do not hand out the previous one
  return state.id === key ? { dem: state.dem, error: state.error } : { dem: null, error: null };
}
