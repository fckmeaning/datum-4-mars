/**
 * Projection math of the flat map of Mars: the whole planet unrolled, longitude -180..180, latitude -90..90
 * (equirectangular, like the classroom wall map of the Earth).
 *
 * The view is a centre (lon, lat) and a scale in CSS pixels per degree. Longitude wraps: the map is a cylinder, so a
 * point is always drawn at the copy of itself that is nearest to the centre of the view.
 */

export const MARS_RADIUS_KM = 3396.19;
/** Surface distance of one degree along a meridian (and along the equator). */
export const KM_PER_DEG = (2 * Math.PI * MARS_RADIUS_KM) / 360;

/** Most zoomed in: about 0.7 km per CSS pixel (the 8k mosaic is 0.9 km per texel). */
export const MAX_SCALE = 90;

export interface MapView {
  /** Longitude of the centre of the view, degrees east, kept in [-180, 180). */
  lon: number;
  /** Latitude of the centre of the view. */
  lat: number;
  /** CSS pixels per degree. */
  scale: number;
}

export interface MapSize {
  w: number;
  h: number;
}

/** How far past the poles the map may be dragged, in CSS pixels (room for the pole labels). */
export const POLE_MARGIN_PX = 56;

/** Longitude wrapped to [-180, 180). */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Signed shortest longitude difference `lon - centre`, in [-180, 180). */
export function lonDelta(lon: number, centre: number): number {
  return wrapLon(lon - centre);
}

/** Smallest scale: the whole 360 degrees across the view (never more, so no point is drawn twice). */
export function minScale(size: MapSize): number {
  return Math.max(size.w, 1) / 360;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Keeps the view legal: scale within limits, longitude wrapped, the map never dragged off the planet. */
export function clampView(view: MapView, size: MapSize): MapView {
  const scale = clamp(view.scale, minScale(size), MAX_SCALE);
  const halfDeg = size.h / 2 / scale;
  const marginDeg = POLE_MARGIN_PX / scale;
  const limit = 90 - halfDeg + marginDeg;
  const lat = limit <= 0 ? 0 : clamp(view.lat, -limit, limit);
  return { lon: wrapLon(view.lon), lat, scale };
}

/** Where a place is on screen (px from the top left of the view): the copy nearest to the centre. */
export function project(view: MapView, size: MapSize, lat: number, lon: number): { x: number; y: number } {
  return {
    x: size.w / 2 + lonDelta(lon, view.lon) * view.scale,
    y: size.h / 2 - (lat - view.lat) * view.scale,
  };
}

/** The place under a screen point. `inside` is false above the north or below the south pole. */
export function unproject(
  view: MapView,
  size: MapSize,
  x: number,
  y: number,
): { lat: number; lon: number; inside: boolean } {
  const lat = view.lat + (size.h / 2 - y) / view.scale;
  const lon = wrapLon(view.lon + (x - size.w / 2) / view.scale);
  return { lat, lon, inside: lat >= -90 && lat <= 90 };
}

/** Drag by (dx, dy) screen pixels. */
export function panBy(view: MapView, size: MapSize, dx: number, dy: number): MapView {
  return clampView({ lon: view.lon - dx / view.scale, lat: view.lat + dy / view.scale, scale: view.scale }, size);
}

/** Zoom by `factor`, keeping the place under the screen point (px, py) where it is. */
export function zoomAt(view: MapView, size: MapSize, px: number, py: number, factor: number): MapView {
  const scale = clamp(view.scale * factor, minScale(size), MAX_SCALE);
  const lonUnder = view.lon + (px - size.w / 2) / view.scale;
  const latUnder = view.lat + (size.h / 2 - py) / view.scale;
  return clampView(
    { lon: lonUnder - (px - size.w / 2) / scale, lat: latUnder - (size.h / 2 - py) / scale, scale },
    size,
  );
}

/** A view that puts (lat, lon) in the middle of the free part of the screen (insets are what panels cover). */
export function viewCentredOn(
  lat: number,
  lon: number,
  scale: number,
  size: MapSize,
  insets: { left: number; right: number } = { left: 0, right: 0 },
): MapView {
  const s = clamp(scale, minScale(size), MAX_SCALE);
  // the free area's centre is shifted from the screen centre by (left - right) / 2 px
  const shiftPx = (insets.left - insets.right) / 2;
  return clampView({ lon: lon - shiftPx / s, lat, scale: s }, size);
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * The view part-way through a fly-to (t in 0..1). The longitude goes the short way round, and on a long hop the scale
 * dips in the middle (zooms out and back in) so the eye sees where the camera is going.
 */
export function flyView(from: MapView, to: MapView, t: number): MapView {
  const e = easeInOutCubic(t);
  const dLon = lonDelta(to.lon, from.lon);
  const dLat = to.lat - from.lat;
  const distDeg = Math.hypot(dLon, dLat);
  const dip = Math.min(1.1, 0.32 * Math.log2(1 + distDeg / 12));
  const ln = Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * e - dip * Math.sin(Math.PI * e);
  return { lon: wrapLon(from.lon + dLon * e), lat: from.lat + dLat * e, scale: Math.exp(ln) };
}

/** Graticule spacing in degrees: the smallest round step whose lines are at least `minPx` apart. */
export function graticuleStep(scale: number, minPx = 62): number {
  const steps = [60, 30, 15, 10, 5, 2, 1, 0.5, 0.25, 0.1];
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]! * scale >= minPx) return steps[i]!;
  }
  return steps[0]!;
}

/** Graticule line positions (degrees) that fall in [lo, hi], multiples of `step`. */
export function graticuleLines(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(lo / step - 1e-9);
  const last = Math.floor(hi / step + 1e-9);
  for (let i = first; i <= last; i++) out.push(Math.round(i * step * 1e6) / 1e6);
  return out;
}

function trimNumber(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** "30° N", "0°", "45° S" */
export function formatLatLabel(lat: number): string {
  if (Math.abs(lat) < 1e-9) return "0°";
  return `${trimNumber(Math.abs(lat))}° ${lat > 0 ? "N" : "S"}`;
}

/** Longitude as -180..180 with E and W: "120° E", "0°", "90° W", "180°". */
export function formatLonLabel(lon: number): string {
  const w = Math.abs(lon) > 180 ? wrapLon(lon) : lon;
  if (Math.abs(w) < 1e-9) return "0°";
  if (Math.abs(Math.abs(w) - 180) < 1e-9) return "180°";
  return `${trimNumber(Math.abs(w))}° ${w > 0 ? "E" : "W"}`;
}

/** Kilometres per CSS pixel along a meridian (true everywhere on this projection). */
export function kmPerPixel(scale: number): number {
  return KM_PER_DEG / scale;
}

/** A scale bar: the longest round distance (1, 2 or 5 times a power of ten) that fits in `maxPx`. */
export function scaleBar(scale: number, maxPx = 130): { km: number; px: number; label: string } {
  const maxKm = kmPerPixel(scale) * maxPx;
  const pow = Math.pow(10, Math.floor(Math.log10(maxKm)));
  let km = pow;
  for (const m of [5, 2, 1]) {
    if (m * pow <= maxKm) {
      km = m * pow;
      break;
    }
  }
  const label = km >= 1 ? `${km.toLocaleString("en-US").replace(/,/g, " ")} km` : `${Math.round(km * 1000)} m`;
  return { km, px: km / kmPerPixel(scale), label };
}

/**
 * Radii, in degrees of latitude and of longitude, of a circle of `km` radius around a point at `lat`. Meridians converge
 * towards the poles, so on this map the circle is stretched sideways by 1 / cos(lat).
 */
export function circleRadiiDeg(lat: number, km: number): { lat: number; lon: number } {
  const ry = km / KM_PER_DEG;
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
  return { lat: ry, lon: ry / cos };
}
