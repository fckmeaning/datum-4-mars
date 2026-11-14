/** Photos of a stop: the bundled Perseverance photos at Jezero, raw Curiosity images from NASA's public raw-image feed at Gale. */

import type { GoalStop, StaticPhoto } from "./goals";

export interface StopPhoto {
  src: string;
  title: string;
  sol: number;
  camera: string;
  credit: string;
  /** what the picture is, when known */
  note?: string;
}

/** The fields of NASA's raw_image_items records that are used here. */
export interface RawItem {
  https_url?: string;
  url?: string;
  title?: string;
  sol?: number;
  instrument?: string;
  is_thumbnail?: boolean;
  image_credit?: string;
  imageid?: string;
}

const FEED = "https://mars.nasa.gov/api/v1/raw_image_items/";

export function staticPhoto(siteId: string, p: StaticPhoto): StopPhoto {
  return { src: `/data/sites/${siteId}/${p.file}`, title: `${p.camera}, sol ${p.sol} (${p.date})`, sol: p.sol, camera: p.camera, credit: p.credit, note: p.note };
}

const CAMERA_NAME: Record<string, string> = { MAST_LEFT: "Mastcam (left)", MAST_RIGHT: "Mastcam (right)" };

/** Colour Mastcam frames, full size (no thumbnails), `n` of them spread evenly through the sol. */
export function pickMastcam(items: RawItem[], n = 6): StopPhoto[] {
  const good = items
    .filter((i) => (i.https_url || i.url) && (i.instrument ?? "").startsWith("MAST") && !i.is_thumbnail)
    .sort((a, b) => (a.imageid ?? "").localeCompare(b.imageid ?? ""));
  if (good.length === 0) return [];
  const count = Math.min(n, good.length);
  const out: StopPhoto[] = [];
  for (let k = 0; k < count; k++) {
    const it = good[count === 1 ? 0 : Math.round((k * (good.length - 1)) / (count - 1))]!;
    out.push({
      src: (it.https_url ?? it.url)!,
      title: it.title ?? `Sol ${it.sol}`,
      sol: it.sol ?? 0,
      camera: CAMERA_NAME[it.instrument ?? ""] ?? it.instrument ?? "Mastcam",
      credit: it.image_credit ?? "NASA/JPL-Caltech/MSSS",
    });
  }
  return out;
}

/**
 * Mastcam images from the days around the middle of the rover's stay at a place: a window of +-8 sols, widened to +-40 when
 * that has too few (the feed has gaps). They show the neighbourhood the rover was in, not necessarily the exact spot.
 */
export async function fetchMslPhotos(sol: number, n = 6, fetchImpl: typeof fetch = fetch): Promise<StopPhoto[]> {
  for (const half of [8, 40]) {
    const lo = Math.max(0, sol - half);
    const url = `${FEED}?order=sol+desc&per_page=200&page=0&condition_1=msl:mission&condition_2=${lo}:sol:gte&condition_3=${sol + half}:sol:lte`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`NASA image feed answered HTTP ${res.status}`);
    const j = (await res.json()) as { items?: RawItem[] };
    const picked = pickMastcam(j.items ?? [], n);
    if (picked.length >= 3) return picked;
  }
  return [];
}

export async function loadStopPhotos(siteId: string, stop: GoalStop, fetchImpl: typeof fetch = fetch): Promise<StopPhoto[]> {
  if (stop.photo) return [staticPhoto(siteId, stop.photo)];
  if (siteId === "gale" && stop.sols) return fetchMslPhotos(Math.round((stop.sols[0] + stop.sols[1]) / 2), 6, fetchImpl);
  return [];
}
