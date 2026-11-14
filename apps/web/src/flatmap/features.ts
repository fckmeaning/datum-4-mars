/** Named regions of Mars drawn as soft labels on the flat map (IAU names, centre of each feature). */

export interface MapFeature {
  name: string;
  lat: number;
  lon: number;
  /** 1 = a major province (shown from the whole-planet view), 2 = shown once the map is zoomed in a little. */
  rank: 1 | 2;
}

export const MAP_FEATURES: readonly MapFeature[] = [
  { name: "Olympus Mons", lat: 18.65, lon: -133.8, rank: 1 },
  { name: "Tharsis", lat: 1.0, lon: -105.0, rank: 1 },
  { name: "Valles Marineris", lat: -13.9, lon: -59.2, rank: 1 },
  { name: "Hellas Planitia", lat: -42.4, lon: 70.5, rank: 1 },
  { name: "Utopia Planitia", lat: 46.7, lon: 117.5, rank: 1 },
  { name: "Argyre Planitia", lat: -49.7, lon: -43.3, rank: 1 },
  { name: "Arabia Terra", lat: 22.0, lon: 5.0, rank: 2 },
  { name: "Syrtis Major", lat: 8.4, lon: 69.5, rank: 2 },
  { name: "Acidalia Planitia", lat: 49.8, lon: -21.9, rank: 2 },
  { name: "Elysium Mons", lat: 25.0, lon: 147.2, rank: 2 },
  { name: "Isidis Planitia", lat: 13.0, lon: 87.0, rank: 2 },
  { name: "Noachis Terra", lat: -45.0, lon: 10.0, rank: 2 },
  { name: "Planum Boreum", lat: 83.0, lon: 0.0, rank: 2 },
  { name: "Planum Australe", lat: -84.0, lon: 0.0, rank: 2 },
];
