import type { components } from "../api/schema";

export type Site = components["schemas"]["Site"];
export type LayerMeta = components["schemas"]["LayerMeta"];
export type Place = components["schemas"]["Place"];
export type RouteResult = components["schemas"]["RouteResult"];
export type AlternativesResult = components["schemas"]["AlternativesResult"];

export const MOCK_SITE_GALE: Site = {
  id: "gale",
  name: "Gale crater - lower Mount Sharp",
  center: { lat: -4.72, lon: 137.40 },
  bbox: {
    lat_min: -4.89,
    lat_max: -4.55,
    lon_min: 137.27,
    lon_max: 137.53,
  },
  proj_aoi: "+proj=tmerc +lat_0=-4.72 +lon_0=137.40 +k=1 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs +type=crs",
  base: {
    id: "bradbury",
    name: "Bradbury Landing (habitat)",
    kind: "base",
    lat: -4.5895,
    lon: 137.4417,
    x: 1417.2,
    y: 4438.1,
    source: "Curiosity landing site, NASA/JPL",
    description: "Primary habitat base location at Bradbury Landing.",
  },
  data_levels: ["L0", "L1", "L2", "L3"],
  default_level: "L0",
  hazard_resolution_m: 5.0,
};

export const MOCK_LAYERS_GALE: LayerMeta[] = [
  {
    id: "elevation",
    site_id: "gale",
    family: "topography",
    name: "Elevation (DTM)",
    unit: "m",
    value_range: [-4500, -1500],
    nodata: -9999,
    colormap: "cividis",
    resolution_m: 20,
    level: "L0",
    time_dependent: false,
    source_ids: ["SIMULATED_MOLA_HRSC"],
    credit: "SIMULATED elevation model for Gale crater",
    simulated: true,
    cog_url: "/data/gale/L0/elevation.tif",
  },
  {
    id: "optical",
    site_id: "gale",
    family: "optical",
    name: "Orbital Mosaic (Satellite)",
    unit: "reflectance",
    colormap: "gray",
    resolution_m: 5,
    level: "L0",
    time_dependent: false,
    source_ids: ["SIMULATED_CTX"],
    credit: "SIMULATED CTX mosaic",
    simulated: true,
    cog_url: "/data/gale/L0/optical.tif",
  },
  {
    id: "slope",
    site_id: "gale",
    family: "topography",
    name: "Slope",
    unit: "deg",
    value_range: [0, 45],
    colormap: "inferno",
    resolution_m: 20,
    level: "L0",
    time_dependent: false,
    source_ids: ["SIMULATED_DERIVED"],
    credit: "SIMULATED slope map",
    simulated: true,
    cog_url: "/data/gale/L0/slope.tif",
  },
  {
    id: "hazard",
    site_id: "gale",
    family: "topography",
    name: "Traverse Hazard",
    unit: "score",
    value_range: [0, 1],
    colormap: "magma",
    resolution_m: 20,
    level: "L0",
    time_dependent: false,
    source_ids: ["SIMULATED_F09"],
    credit: "SIMULATED multi-hazard cost field",
    simulated: true,
    cog_url: "/data/gale/L0/hazard.tif",
  },
];

export const MOCK_PLACES_GALE: Place[] = [
  {
    id: "bradbury",
    name: "Bradbury Landing (Habitat)",
    kind: "base",
    lat: -4.5895,
    lon: 137.4417,
    x: 1417.2,
    y: 4438.1,
    source: "Curiosity landing site, NASA/JPL",
    description: "Main habitat base camp and airlock.",
    science_target: false,
  },
  {
    id: "boxwork",
    name: "Boxwork Outcrops",
    kind: "mission_informal",
    lat: -4.7550,
    lon: 137.3820,
    x: -600.5,
    y: -2070.3,
    source: "Curiosity traverse target 2025",
    description: "Primary EVA mission science target: mineralized subsurface boxwork ridges.",
    science_target: true,
  },
  {
    id: "yellowknife",
    name: "Yellowknife Bay",
    kind: "mission_informal",
    lat: -4.5900,
    lon: 137.4450,
    x: 1515.0,
    y: 4410.0,
    source: "Curiosity first drill site",
    description: "Historic ancient mudstone lakebed site with phyllosilicates.",
    science_target: true,
  },
  {
    id: "namib_dune",
    name: "Namib Dune",
    kind: "mission_informal",
    lat: -4.6850,
    lon: 137.3950,
    x: -170.0,
    y: 1210.0,
    source: "Bagnold Dune Field exploration",
    description: "Active dark basaltic sand dune field (mobility hazard).",
    science_target: false,
  },
  {
    id: "vera_rubin",
    name: "Vera Rubin Ridge",
    kind: "mission_informal",
    lat: -4.7280,
    lon: 137.3800,
    x: -670.0,
    y: -890.0,
    source: "Hematite-bearing ridge, Curiosity MSL",
    description: "Prominent hematite-bearing topographic bench.",
    science_target: true,
  },
  {
    id: "gediz_vallis",
    name: "Gediz Vallis Ridge",
    kind: "mission_informal",
    lat: -4.7420,
    lon: 137.3750,
    x: -840.0,
    y: -1520.0,
    source: "Debris flow ridge, MSL traverse",
    description: "Young debris-flow deposit ridge with boulders.",
    science_target: true,
  },
  {
    id: "mount_sharp_peak",
    name: "Aeolis Mons (Mount Sharp) Peak",
    kind: "gazetteer",
    lat: -5.08,
    lon: 137.85,
    x: 15300.0,
    y: -13400.0,
    source: "USGS Gazetteer of Planetary Nomenclature",
    description: "Central mound of Gale Crater, rising 5.5 km above crater floor.",
    science_target: false,
  },
];

export function generateMockAlternatives(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): AlternativesResult {
  const midLat = (startLat + endLat) / 2;
  const midLon = (startLon + endLon) / 2;

  // FASTEST: Direct straight line
  const fastestCoords = [
    [startLon, startLat],
    [midLon, midLat],
    [endLon, endLat],
  ];

  // SAFEST: Detour around rough terrain / dunes (slight bend)
  const safestCoords = [
    [startLon, startLat],
    [midLon + 0.015, midLat - 0.005],
    [midLon + 0.008, midLat - 0.012],
    [endLon, endLat],
  ];

  // BALANCED: Moderate bend
  const balancedCoords = [
    [startLon, startLat],
    [midLon + 0.006, midLat - 0.003],
    [endLon, endLat],
  ];

  // SCIENCE: Detour toward interesting outcrop
  const scienceCoords = [
    [startLon, startLat],
    [midLon - 0.012, midLat + 0.004],
    [midLon - 0.005, midLat - 0.008],
    [endLon, endLat],
  ];

  function createRoute(
    id: string,
    profile: "FASTEST" | "SAFEST" | "BALANCED" | "SCIENCE",
    coords: number[][],
    time_s: number,
    length_m: number,
    dose_mSv: number,
    risk: number,
    science_score: number,
  ): RouteResult {
    return {
      route_id: id,
      site_id: "gale",
      profile,
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
      xy: coords.map((coord) => {
        const lon = coord[0] ?? 137.4;
        const lat = coord[1] ?? -4.72;
        return [(lon - 137.4) * 59200, (lat - -4.72) * 59200];
      }),
      totals: {
        time_s,
        length_m,
        ascent_m: 85,
        descent_m: 20,
        max_slope_deg: profile === "FASTEST" ? 18.5 : 9.2,
        dose_mSv,
        energy_kJ: 1850,
        o2_l: 120,
        min_temp_K: 245,
        shadow_fraction: 0.12,
        science_score,
        return_margin: 0.42,
        risk,
      },
      segments: coords.slice(0, -1).map((start, i) => {
        const end = coords[i + 1]!;
        return {
          i,
          start: { lat: start[1]!, lon: start[0]! },
          end: { lat: end[1]!, lon: end[0]! },
          length_m: length_m / (coords.length - 1),
          duration_s: time_s / (coords.length - 1),
          slope_deg: profile === "FASTEST" ? 12 : 6,
          components: {
            time: 0.25,
            energy: 0.25,
            dose: 0.25,
            hazard: 0.25,
            science_factor: 0.9,
          },
          cost: 1.0,
          limiting_factor: "slope",
        };
      }),
      feasibility: {
        ok: true,
        violations: [],
      },
      assumptions: [
        "SIMULATED Gale crater terrain",
        "Astronaut mass 80 kg, suit 90 kg",
        "Apollo walking speeds Tobler function F05",
      ],
      data_levels: ["L0"],
      simulated_inputs: ["Elevation L0 synthetic", "Thermal/Radiation L0 models"],
      computed_ms: 124,
    };
  }

  const routes: RouteResult[] = [
    createRoute("route-fastest", "FASTEST", fastestCoords, 4200, 3600, 0.031, 0.65, 0.2),
    createRoute("route-safest", "SAFEST", safestCoords, 5600, 4800, 0.024, 0.18, 0.35),
    createRoute("route-balanced", "BALANCED", balancedCoords, 4700, 4100, 0.028, 0.32, 0.4),
    createRoute("route-science", "SCIENCE", scienceCoords, 6100, 5200, 0.035, 0.41, 0.95),
  ];

  return {
    routes,
    best_time_route_id: "route-fastest",
    best_risk_route_id: "route-safest",
  };
}
