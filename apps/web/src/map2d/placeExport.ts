import type { Place } from "../api/client";

/**
 * A place as an RFC 7946 GeoJSON Feature (no `crs` member: RFC 7946 dropped it and fixes WGS 84, so the body is stated
 * in the properties instead). Coordinates are [east longitude in [-180, 180), planetocentric latitude, elevation m].
 */
export interface PlaceFeature {
  type: "Feature";
  properties: Record<string, string | number | boolean | null>;
  geometry: { type: "Point"; coordinates: [number, number] | [number, number, number] };
}

export function placeToGeoJSON(place: Place, elevationM?: number | null): PlaceFeature {
  const lon = ((((place.lon + 180) % 360) + 360) % 360) - 180;
  const coordinates: PlaceFeature["geometry"]["coordinates"] =
    typeof elevationM === "number" && Number.isFinite(elevationM) ? [lon, place.lat, Math.round(elevationM * 100) / 100] : [lon, place.lat];
  return {
    type: "Feature",
    properties: {
      id: place.id,
      name: place.name,
      kind: place.kind,
      science_target: place.science_target ?? false,
      source: place.source,
      description: place.description ?? null,
      body: "Mars",
      coordinate_note: "East-positive longitude, planetocentric latitude, Mars sphere R = 3396190 m; not an Earth WGS 84 position.",
    },
    geometry: { type: "Point", coordinates },
  };
}

/** Save a JSON document in the browser. Returns false where Blob URLs are unavailable (tests, very old browsers). */
export function downloadJson(filename: string, doc: unknown): boolean {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/geo+json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function safeFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "place";
}
