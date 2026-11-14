/**
 * Facts about each landing site, for the expedition page. Dates and coordinates are the published landing values
 * (NASA/JPL mission pages, CNSA for Zhurong); the wording is ours. Ares Vallis: 19.33 N, 33.55 W (the data/processed/landing_sites.json
 * entry says -34.34, which disagrees with the published value). `detail` says what data the app really has:
 *   "local"   : a local elevation model exists, so 3D terrain and the first-person view are real (Gale: 10 m DEM in this
 *               repo, Jezero: the high-resolution crater and landing-site rasters of an external reference dataset);
 *   "orbital" : orbital imagery tiles (Viking MDIM 232 m, CTX about 5 m) and a MOLA 463 m elevation patch: a real 2D map and a
 *               coarse 3D relief, but no first-person view (that needs metre-scale terrain).
 */

export type DetailTier = "local" | "orbital";

export interface SiteFacts {
  id: string;
  name: string;
  station: string;
  /** The landing station itself (published landing coordinates); the globe marker is only the region. */
  stationPos: { lat: number; lon: number };
  craft: string;
  landed: string; // ISO date, UTC
  status: string;
  summary: string;
  detail: DetailTier;
  /** Initial CTX/MDIM map zoom level (CTX level; 11 is about 10 m per pixel). */
  zoom: number;
}

export const SITE_FACTS: Record<string, SiteFacts> = {
  gale: {
    id: "gale",
    name: "Gale Crater",
    station: "Bradbury Landing",
    stationPos: { lat: -4.5895, lon: 137.4416 },
    craft: "Curiosity (Mars Science Laboratory)",
    landed: "2012-08-06",
    status: "Active",
    summary:
      "Curiosity landed on the floor of Gale Crater and has been climbing the lower slopes of Mount Sharp, reading layers of rock that record how Mars dried out.",
    detail: "local",
    zoom: 10,
  },
  jezero: {
    id: "jezero",
    name: "Jezero Crater",
    station: "Octavia E. Butler Landing",
    stationPos: { lat: 18.4447, lon: 77.4508 },
    craft: "Perseverance and the Ingenuity helicopter",
    landed: "2021-02-18",
    status: "Active",
    summary:
      "Perseverance landed beside the delta of an ancient river that once fed a lake. It caches rock samples for a future return to Earth. Ingenuity flew 72 times before it was retired.",
    detail: "local",
    zoom: 10,
  },
  meridiani: {
    id: "meridiani",
    name: "Meridiani Planum",
    station: "Challenger Memorial Station",
    stationPos: { lat: -1.9462, lon: -5.5266 },
    craft: "Opportunity (Mars Exploration Rover B)",
    landed: "2004-01-25",
    status: "Mission ended, last contact 10 June 2018",
    summary:
      "Opportunity landed on a flat plain rich in the mineral hematite and drove about 45 km before a global dust storm in 2018 ended the mission.",
    detail: "orbital",
    zoom: 10,
  },
  gusev: {
    id: "gusev",
    name: "Gusev Crater",
    station: "Columbia Memorial Station",
    stationPos: { lat: -14.5684, lon: 175.4726 },
    craft: "Spirit (Mars Exploration Rover A)",
    landed: "2004-01-04",
    status: "Mission ended, last contact 22 March 2010",
    summary:
      "Spirit landed in a basin that may once have held a lake and explored the Columbia Hills until it became stuck in soft soil in 2009.",
    detail: "orbital",
    zoom: 10,
  },
  elysium: {
    id: "elysium",
    name: "Elysium Planitia",
    station: "InSight landing site",
    stationPos: { lat: 4.5024, lon: 135.6234 },
    craft: "InSight (stationary lander)",
    landed: "2018-11-26",
    status: "Mission ended, December 2022",
    summary:
      "InSight sat in one place on a smooth plain and listened to marsquakes, measuring the size and structure of the planet's interior.",
    detail: "orbital",
    zoom: 10,
  },
  chryse: {
    id: "chryse",
    name: "Chryse Planitia",
    station: "Thomas Mutch Memorial Station",
    stationPos: { lat: 22.27, lon: -47.95 },
    craft: "Viking 1 lander",
    landed: "1976-07-20",
    status: "Mission ended, 1982",
    summary:
      "Viking 1 was the first Mars lander to work for an extended time. It sent back the first lasting views of the surface and tested the soil for signs of life.",
    detail: "orbital",
    zoom: 10,
  },
  utopia: {
    id: "utopia",
    name: "Utopia Planitia",
    station: "Zhurong landing site",
    stationPos: { lat: 25.066, lon: 109.925 },
    craft: "Zhurong rover (Tianwen-1)",
    landed: "2021-05-14",
    status: "Dormant since May 2022",
    summary:
      "Zhurong, China's first Mars rover, landed in southern Utopia Planitia and studied the surface before going dormant for the Martian winter.",
    detail: "orbital",
    zoom: 10,
  },
  ares: {
    id: "ares",
    name: "Ares Vallis",
    station: "Carl Sagan Memorial Station",
    stationPos: { lat: 19.33, lon: -33.55 },
    craft: "Mars Pathfinder and the Sojourner rover",
    landed: "1997-07-04",
    status: "Mission ended, last contact 27 September 1997",
    summary:
      "Pathfinder landed in the mouth of an ancient flood channel and released Sojourner, the first wheeled rover to drive on Mars.",
    detail: "orbital",
    zoom: 10,
  },
};

export function siteFacts(id: string): SiteFacts | undefined {
  return SITE_FACTS[id];
}

/** Whole days between the landing date and a reference date (UTC midnight to midnight). */
export function daysSinceLanding(landedIso: string, now: Date = new Date()): number {
  const t0 = Date.parse(`${landedIso}T00:00:00Z`);
  const t1 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((t1 - t0) / 86_400_000));
}

/** Longitude wrapped to [-180, 180), the convention of the tile services. */
export function wrapLon180(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
