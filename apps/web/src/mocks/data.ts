import type { components } from "../api/schema";

export type Site = components["schemas"]["Site"];
export type LayerMeta = components["schemas"]["LayerMeta"];
export type Place = components["schemas"]["Place"];
export type RouteResult = components["schemas"]["RouteResult"];
export type AlternativesResult = components["schemas"]["AlternativesResult"];
export type SiteClock = components["schemas"]["SiteClock"];
export type PointReport = components["schemas"]["PointReport"];
export type SourceEntry = components["schemas"]["SourceEntry"];

export const MOCK_SITE_CLOCK: SiteClock = {
  utc: "2026-10-01T12:00:00Z",
  mission_name: "Curiosity (MSL)",
  mission_sol: 4362,
  lmst_h: 14.524, // 14:31:26
  ltst_h: 14.712,
  ls_deg: 142.3,
  earth_link_one_way_s: 659.0, // 10m 59s
  earth_link_accuracy: "spice",
};

export function createMockPointReport(lat: number, lon: number): PointReport {
  return {
    site_id: "gale",
    point: { lat, lon },
    xy: { x: (lon - 137.4) * 59200, y: (lat - -4.72) * 59200 },
    utc: "2026-10-01T12:00:00Z",
    elevation_m: -4450.2,
    slope_deg: 7.4,
    aspect_deg: 185.0,
    roughness_m: 0.18,
    sky_fraction: 0.94,
    shadowed: false,
    surface_temp_K: 268.5,
    dose_rate_mSv_h: 0.026,
    thermal_inertia: 320,
    science_value: 0.78,
    samples: [],
    simulated_fields: ["roughness_m", "thermal_inertia"],
  };
}

export const MOCK_SOURCES: SourceEntry[] = [
  {
    id: "gale-l1-elevation",
    family: "topography",
    product_id: "HRSC_MOLA_BLEND",
    source_url: "https://astrogeology.usgs.gov",
    resolution_m: 200,
    credit: "USGS Astrogeology / NASA / ESA",
    level: "L1",
    simulated: false,
  },
  {
    id: "gale-traverse",
    family: "mission",
    product_id: "MSL_TRAVERSE_WAYPOINTS",
    source_url: "https://mars.nasa.gov",
    credit: "NASA/JPL-Caltech MSL",
    level: "L2",
    simulated: false,
  },
];

export const MOCK_SITE_GALE: Site = {
  id: "gale",
  name: "Gale crater - lower Mount Sharp",
  center: { lat: -4.72, lon: 137.4 },
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
  default_level: "L1",
  hazard_resolution_m: 5.0,
};

export const MOCK_LAYERS_GALE: LayerMeta[] = [
  {
    id: "elevation",
    site_id: "gale",
    family: "topography",
    name: "Elevation (HRSC/MOLA)",
    unit: "m",
    value_range: [-4500, -1500],
    nodata: -9999,
    colormap: "cividis",
    resolution_m: 200,
    level: "L1",
    time_dependent: false,
    source_ids: ["HRSC_MOLA_BLEND"],
    credit: "USGS / ESA / NASA HRSC/MOLA blended DEM",
    simulated: false,
    cog_url: "/data/gale/L1/elevation.tif",
  },
  {
    id: "optical",
    site_id: "gale",
    family: "optical",
    name: "Orbital Mosaic (Satellite)",
    unit: "reflectance",
    colormap: "gray",
    resolution_m: 5,
    level: "L1",
    time_dependent: false,
    source_ids: ["CTX_MOSAIC"],
    credit: "NASA/JPL/MSSS CTX Mosaic",
    simulated: false,
    cog_url: "/data/gale/L1/optical.tif",
  },
  {
    id: "slope",
    site_id: "gale",
    family: "topography",
    name: "Slope",
    unit: "deg",
    value_range: [0, 45],
    colormap: "inferno",
    resolution_m: 200,
    level: "L1",
    time_dependent: false,
    source_ids: ["DERIVED_F05"],
    credit: "Derived terrain gradient",
    simulated: false,
    cog_url: "/data/gale/L1/slope.tif",
  },
  {
    id: "hazard",
    site_id: "gale",
    family: "topography",
    name: "Traverse Hazard",
    unit: "score",
    value_range: [0, 1],
    colormap: "magma",
    resolution_m: 200,
    level: "L1",
    time_dependent: false,
    source_ids: ["DERIVED_F09"],
    credit: "Multi-hazard aggregated traversal cost",
    simulated: false,
    cog_url: "/data/gale/L1/hazard.tif",
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
    lat: -4.755,
    lon: 137.382,
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
    lat: -4.59,
    lon: 137.445,
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
    lat: -4.685,
    lon: 137.395,
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
    lat: -4.728,
    lon: 137.38,
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
    lat: -4.742,
    lon: 137.375,
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

  // SAFEST: Detour around rough terrain / dunes
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
        "L1 elevation terrain",
        "Astronaut mass 80 kg, suit 90 kg",
        "Apollo walking speeds Tobler function F05",
      ],
      data_levels: ["L1"],
      simulated_inputs: [],
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

export function createMockBackToBase(
  startLat: number,
  startLon: number,
  baseLat: number = -4.5895,
  baseLon: number = 137.4417,
): components["schemas"]["BackToBaseResult"] {
  const dLat = baseLat - startLat;
  const dLon = baseLon - startLon;
  const rad = Math.atan2(dLon, dLat);
  let bearing = (rad * 180) / Math.PI;
  if (bearing < 0) bearing += 360;

  const alts = generateMockAlternatives(startLat, startLon, baseLat, baseLon);
  const route = alts.routes.find((r) => r.profile === "SAFEST") ?? alts.routes[0]!;

  return {
    bearing_deg: Math.round(bearing * 10) / 10,
    straight_bearing_deg: Math.round(bearing * 10) / 10,
    distance_m: route.totals.length_m,
    straight_distance_m: Math.round(route.totals.length_m * 0.85),
    eta_s: route.totals.time_s,
    dose_mSv: route.totals.dose_mSv,
    route,
  };
}
