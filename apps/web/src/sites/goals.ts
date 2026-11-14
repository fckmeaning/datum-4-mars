/**
 * Science goals: pick a question and the planner puts the stops for it on the map.
 *
 * Gale: the stops are the real places of data/processed/gale/places.json (positions and sols derived from the NASA MMGIS rover
 * waypoints, D-13); the goal texts are ours and follow those places' descriptions.
 * Jezero: goals, stops and the four bundled Perseverance photos come from an external reference dataset (used with the owners'
 * permission, D-16); positions are the published ones in that dataset.
 */

export interface StaticPhoto {
  file: string;
  camera: string;
  sol: number;
  date: string;
  credit: string;
  note?: string;
}

export interface GoalStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** what the crew does there */
  reason?: string;
  text: string;
  source: string;
  /** mission sols the rover spent at the place: used to look up raw images */
  sols?: [number, number];
  photo?: StaticPhoto;
}

export interface Goal {
  id: string;
  name: string;
  why: string;
  /** stop ids, in walking order */
  stops: string[];
}

export interface SiteGoals {
  stops: GoalStop[];
  goals: Goal[];
}

export interface GalePlace {
  id: string;
  name: string;
  kind?: string;
  lat: number;
  lon: number;
  description?: string;
  evidence?: string;
  source?: string;
  sols?: [number, number];
}

const GALE_GOALS: Goal[] = [
  {
    id: "lake",
    name: "Read the ancient lake",
    stops: ["gale.yellowknife_bay", "gale.pahrump_hills"],
    why: "Yellowknife Bay is the lake mudstone where Curiosity first showed that Mars once had habitable conditions; Pahrump Hills is the base of the Murray formation, the lake record that continues up Mount Sharp.",
  },
  {
    id: "wind",
    name: "Wind and sand",
    stops: ["gale.dingo_gap", "gale.bagnold_dunes"],
    why: "A gateway across an active dune, then the Bagnold dune field, where ripple migration and wind transport of sand were studied.",
  },
  {
    id: "grand",
    name: "Grand tour",
    stops: ["gale.yellowknife_bay", "gale.dingo_gap", "gale.kimberley", "gale.pahrump_hills"],
    why: "The first four chapters of the climb in one loop: the lake mudstone, the dune gateway, the three-unit junction at Kimberley and the foot of Mount Sharp.",
  },
  {
    id: "clay",
    name: "Find the clays",
    stops: ["gale.glen_torridon"],
    why: "Glen Torridon is a trough south of the ridge with clay minerals (phyllosilicates), which need water to form.",
  },
  {
    id: "boxwork",
    name: "Boxwork on Mount Sharp",
    stops: ["gale.boxwork_region"],
    why: "A network of resistant mineral ridges and hollows that Curiosity has explored since sol 4600. It is far from the landing site: a rover trip, not a walk.",
  },
];

/** Gale's goals over the real places (ids as in places.json); places that are missing are left out. */
export function galeGoals(places: GalePlace[]): SiteGoals {
  const byId = new Map(places.map((p) => [p.id, p]));
  const stops: GoalStop[] = [];
  for (const g of GALE_GOALS) {
    for (const id of g.stops) {
      const p = byId.get(id);
      if (!p || stops.some((s) => s.id === id)) continue;
      stops.push({
        id,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        text: p.description ?? "",
        source: p.evidence ?? p.source ?? "NASA/JPL-Caltech MMGIS waypoints",
        sols: p.sols,
      });
    }
  }
  const have = new Set(stops.map((s) => s.id));
  const goals = GALE_GOALS.map((g) => ({ ...g, stops: g.stops.filter((id) => have.has(id)) })).filter((g) => g.stops.length > 0);
  return { stops, goals };
}

export const JEZERO_GOALS: SiteGoals = {
  stops: [
    {
      id: "depot",
      name: "Three Forks Sample Depot",
      lat: 18.45283,
      lon: 77.40821,
      reason: "Collect sealed sample tubes for the trip home",
      text: "10 sealed sample tubes laid at the foot of the delta, sols 653-690 (Dec 2022 - Jan 2023), spaced 5-15 m apart in a zig-zag. The backup cache for Mars Sample Return.",
      source: "NASA PDS Geosciences Node, Mars 2020 Three Forks Depot bundle (rover position at each tube drop)",
      photo: { file: "photos/depot.jpg", camera: "Mastcam-Z", sol: 690, date: "28 Jan 2023", credit: "NASA/JPL-Caltech/ASU", note: "the day the last tube went down, looking at the delta" },
    },
    {
      id: "seitah",
      name: "Séítah",
      lat: 18.43394,
      lon: 77.44302,
      reason: "Sample olivine-rich igneous bedrock",
      text: "Ridges of olivine-rich igneous rock broken up by sand ripples. Perseverance parked on Séítah's edge for sols 248-278 and cored Coulettes on sol 271, now one of the ten tubes at Three Forks. Tough walking, high science value.",
      source: "NASA/JPL-Caltech MMGIS waypoints (rover position); PDS Three Forks Depot bundle (sample IDs)",
      photo: { file: "photos/seitah.jpg", camera: "Navcam", sol: 249, date: "1 Nov 2021", credit: "NASA/JPL-Caltech" },
    },
    {
      id: "front",
      name: "Delta front",
      lat: 18.45887,
      lon: 77.40613,
      reason: "Log layered lake sediments for biosignatures",
      text: "The front of the delta: layered sandstone and mudstone laid down in the old lake. Perseverance parked here for sols 477-502 and cored Skyland on sol 495, now one of the ten tubes at Three Forks. The slope layer shows the steep edge to go around.",
      source: "NASA/JPL-Caltech MMGIS waypoints (rover position); PDS Three Forks Depot bundle (sample IDs)",
      photo: { file: "photos/front.jpg", camera: "Navcam", sol: 502, date: "19 Jul 2022", credit: "NASA/JPL-Caltech", note: "layered rock on the delta front" },
    },
  ],
  goals: [
    {
      id: "tour",
      name: "Grand tour",
      stops: ["depot", "seitah"],
      why: "The things only this spot has: Perseverance's sample depot and Séítah's olivine bedrock in one loop from the landing site.",
    },
    {
      id: "samples",
      name: "Bring the samples home",
      stops: ["depot"],
      why: "Three Forks holds 10 sealed tubes Perseverance left as the backup cache for Mars Sample Return (Dec 2022 - Jan 2023). A crew on foot could collect them: the shortest, safest science walk here. Source: NASA/JPL-Caltech.",
    },
    {
      id: "igneous",
      name: "Date the crater floor",
      stops: ["seitah"],
      why: "Séítah is olivine-rich igneous rock that settled out of a thick body of melt. Samples from it can date the crater floor, and so the lake that came after it (Liu et al. 2022, Science).",
    },
    {
      id: "life",
      name: "Look for signs of ancient life",
      stops: ["front"],
      why: "The delta front exposes layered lake sediments, the rocks most likely to have preserved signs of past life (Mangold et al. 2021, Science). The scarp is steep, so the route has to find a way around it.",
    },
  ],
};

/** Goals for a site, or null when it has none (only Gale and Jezero have real places to go to today). */
export function goalsFor(siteId: string, galePlaces: GalePlace[] | null): SiteGoals | null {
  if (siteId === "jezero") return JEZERO_GOALS;
  if (siteId === "gale" && galePlaces && galePlaces.length) return galeGoals(galePlaces);
  return null;
}
