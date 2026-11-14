/** Detail levels (tiers) of a site: the regional MOLA 463 m patch everywhere, plus higher-detail tiers where we have the data. */

export interface SiteTier {
  /** folder under /data/sites/<id>/ ; undefined = the regional patch in the site folder itself */
  id: string | undefined;
  label: string;
}

const REGIONAL: SiteTier = { id: undefined, label: "Regional · MOLA 463 m" };

export const SITE_TIERS: Record<string, SiteTier[]> = {
  gale: [REGIONAL, { id: "aoi", label: "Planner area · DEM 10 m" }],
  jezero: [REGIONAL, { id: "crater", label: "Crater · CTX 87 m" }, { id: "site", label: "Landing site · HiRISE 6 m" }],
};

export function tiersFor(siteId: string): SiteTier[] {
  return SITE_TIERS[siteId] ?? [REGIONAL];
}

/** The most detailed tier, which is what a site opens with. */
export function bestTier(siteId: string): SiteTier {
  const t = tiersFor(siteId);
  return t[t.length - 1]!;
}

/** CTX map level (0.3515625 deg per pixel at level 0) at which a patch of the given degree width fits in `viewPx` pixels. */
export function zoomForBounds(westDeg: number, eastDeg: number, viewPx = 700): number {
  const degPerPx = (eastDeg - westDeg) / viewPx;
  return Math.max(0, Math.min(14, Math.floor(Math.log2(0.3515625 / degPerPx))));
}

/** The finer tile that lies inside a tile (its outline is drawn on the terrain and entered with a click). */
const ZONES: Record<string, Array<{ from: string | undefined; to: string; name: string }>> = {
  gale: [{ from: undefined, to: "aoi", name: "Planner area" }],
  jezero: [
    { from: undefined, to: "crater", name: "Crater overview" },
    { from: "crater", to: "site", name: "Close-up area" },
  ],
};

export function zoneChild(siteId: string, tierId: string | undefined): { to: string; name: string } | null {
  const z = ZONES[siteId]?.find((x) => x.from === tierId);
  return z ? { to: z.to, name: z.name } : null;
}

/** The coarser tile that contains this one, or null at the top. */
export function parentTier(siteId: string, tierId: string | undefined): SiteTier | null {
  const z = ZONES[siteId]?.find((x) => x.to === tierId);
  if (!z) return null;
  return tiersFor(siteId).find((t) => t.id === z.from) ?? null;
}
