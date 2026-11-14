/**
 * Everything drawn over the raster of the flat map, on one 2D canvas (so lines and text stay crisp at any zoom):
 * graticule with latitude and longitude labels, equator, poles, prime meridian, named regions, the 100 km exploration zones,
 * the Curiosity traverse, the picked point, the cursor ticks and the scale bar. The landing sites are DOM buttons instead
 * (they are clickable), see FlatMarsMap.
 */
import { MAP_FEATURES } from "./features";
import {
  circleRadiiDeg,
  clamp,
  formatLatLabel,
  formatLonLabel,
  graticuleLines,
  graticuleStep,
  project,
  scaleBar,
  type MapSize,
  type MapView,
} from "./projection";

export interface PaintColors {
  accent: string;
  accent2: string;
  text: string;
  dim: string;
  warn: string;
}

export interface PaintInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PaintParams {
  view: MapView;
  size: MapSize;
  dpr: number;
  insets: PaintInsets;
  colors: PaintColors;
  /** CSS font family for the small mono labels. */
  mono: string;
  sans: string;
  zones: readonly { name: string; lat: number; lon: number }[] | null;
  zoneRadiusKm: number;
  /** Curiosity traverse as [lon, lat] pairs, or null while hidden or not loaded. */
  traverse: ReadonlyArray<readonly [number, number]> | null;
  /** Where the traverse starts (the marker that shows at every zoom). */
  traverseAnchor: { lat: number; lon: number } | null;
  picked: { lat: number; lon: number } | null;
  hover: { lat: number; lon: number } | null;
  features: boolean;
}

const HALO = "rgba(4, 8, 13, 0.82)";

function halo(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, width = 3): void {
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = HALO;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

function crisp(v: number): number {
  return Math.round(v) + 0.5;
}

export function paintOverlay(ctx: CanvasRenderingContext2D, p: PaintParams): void {
  const { view, size, insets, colors } = p;
  const w = size.w;
  const h = size.h;
  const s = view.scale;
  ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (w <= 0 || h <= 0) return;

  const xOf = (lon: number) => w / 2 + (lon - view.lon) * s;
  const yOf = (lat: number) => h / 2 - (lat - view.lat) * s;
  const lonLo = view.lon - w / 2 / s;
  const lonHi = view.lon + w / 2 / s;
  const latTop = Math.min(90, view.lat + h / 2 / s);
  const latBot = Math.max(-90, view.lat - h / 2 / s);
  const yTop = yOf(latTop);
  const yBot = yOf(latBot);
  const step = graticuleStep(s);

  // ---- graticule
  ctx.save();
  ctx.lineWidth = 1;
  for (const lat of graticuleLines(latBot, latTop, step)) {
    const y = crisp(yOf(lat));
    const major = Math.abs(lat % 30) < 1e-9;
    ctx.strokeStyle = major ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.13)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (const lon of graticuleLines(lonLo, lonHi, step)) {
    const x = crisp(xOf(lon));
    const major = Math.abs(((lon % 30) + 30) % 30) < 1e-9;
    ctx.strokeStyle = major ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.13)";
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
  }

  // equator, prime meridian, antimeridian seam, poles
  if (latBot <= 0 && latTop >= 0) {
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.25;
    const y = crisp(yOf(0));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.setLineDash([3, 5]);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1;
  for (const lon of graticuleLines(lonLo, lonHi, 360)) {
    // multiples of 360 are the prime meridian's copies: the line at lon 0 only
    const x = crisp(xOf(lon));
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = colors.text;
  for (let k = Math.ceil((lonLo - 180) / 360); k <= Math.floor((lonHi - 180) / 360); k++) {
    const x = crisp(xOf(180 + k * 360));
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = colors.accent2;
  for (const pole of [90, -90]) {
    if (pole > latTop + 0.0001 || pole < latBot - 0.0001) continue;
    const y = pole > 0 ? Math.round(yOf(pole)) + 1 : Math.round(yOf(pole)) - 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  const freeLeft = insets.left;
  const freeRight = w - insets.right;
  const freeMid = (freeLeft + freeRight) / 2;

  // ---- pole captions
  ctx.save();
  ctx.font = `700 11px ${p.mono}`;
  ctx.textAlign = "center";
  setSpacing(ctx, 2);
  if (latTop >= 90) {
    const y = yOf(90) - 9;
    if (y > 12) halo(ctx, "NORTH POLE  90° N", freeMid, y, colors.accent2);
  }
  if (latBot <= -90) {
    const y = yOf(-90) + 19;
    if (y < h - 6) halo(ctx, "SOUTH POLE  90° S", freeMid, y, colors.accent2);
  }
  ctx.restore();

  // ---- named regions
  if (p.features && s >= 2.6) {
    const fade = clamp((70 - s) / 30, 0.28, 1);
    ctx.save();
    const fontPx = Math.round(clamp(10 + s * 0.1, 10.5, 15));
    ctx.font = `600 ${fontPx}px ${p.sans}`;
    ctx.textAlign = "center";
    setSpacing(ctx, 2.2);
    const placed: Array<{ l: number; r: number; t: number; b: number }> = [];
    for (const f of MAP_FEATURES) {
      if (f.rank === 2 && s < 6.5) continue;
      const pt = project(view, size, f.lat, f.lon);
      if (pt.x < -80 || pt.x > w + 80 || pt.y < -20 || pt.y > h + 20) continue;
      const text = f.name.toUpperCase();
      const tw = ctx.measureText(text).width;
      const box = { l: pt.x - tw / 2 - 6, r: pt.x + tw / 2 + 6, t: pt.y - fontPx, b: pt.y + 4 };
      if (placed.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) continue;
      placed.push(box);
      ctx.globalAlpha = 0.62 * fade;
      halo(ctx, text, pt.x, pt.y + fontPx / 3, "#ffffff", 3.5);
    }
    ctx.restore();
  }

  // ---- 100 km exploration zones
  if (p.zones) {
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = colors.accent2;
    ctx.fillStyle = colors.accent2;
    ctx.font = `600 10.5px ${p.mono}`;
    ctx.textAlign = "center";
    for (const z of p.zones) {
      const pt = project(view, size, z.lat, z.lon);
      const r = circleRadiiDeg(z.lat, p.zoneRadiusKm);
      const rx = Math.max(r.lon * s, 2.5);
      const ry = Math.max(r.lat * s, 2.5);
      for (const k of [-1, 0, 1]) {
        const cx = pt.x + k * 360 * s;
        if (cx + rx < 0 || cx - rx > w || pt.y + ry < 0 || pt.y - ry > h) continue;
        ctx.globalAlpha = 0.09;
        ctx.beginPath();
        ctx.ellipse(cx, pt.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.stroke();
        if (s >= 14) {
          ctx.globalAlpha = 1;
          halo(ctx, z.name, cx, pt.y + ry + 13, colors.accent2, 3);
        }
      }
    }
    ctx.restore();
  }

  // ---- Curiosity traverse
  if (p.traverseAnchor) {
    const a = project(view, size, p.traverseAnchor.lat, p.traverseAnchor.lon);
    ctx.save();
    if (p.traverse && s >= 28) {
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.strokeStyle = colors.warn;
      ctx.shadowColor = colors.warn;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      p.traverse.forEach(([lon, lat], i) => {
        const q = project(view, size, lat, lon);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // a ring that says "a route is here" even when the route itself is far smaller than a pixel
    ctx.strokeStyle = colors.warn;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.95;
    const r = 11;
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `600 10.5px ${p.mono}`;
    ctx.textAlign = "left";
    halo(ctx, "CURIOSITY TRAVERSE", a.x + r + 6, a.y + 18, colors.warn, 3);
    ctx.restore();
  }

  // ---- picked point and cursor ticks
  if (p.picked) {
    const q = project(view, size, p.picked.lat, p.picked.lon);
    ctx.save();
    ctx.strokeStyle = colors.accent2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 7, 0, Math.PI * 2);
    ctx.moveTo(q.x - 14, q.y);
    ctx.lineTo(q.x - 4, q.y);
    ctx.moveTo(q.x + 4, q.y);
    ctx.lineTo(q.x + 14, q.y);
    ctx.moveTo(q.x, q.y - 14);
    ctx.lineTo(q.x, q.y - 4);
    ctx.moveTo(q.x, q.y + 4);
    ctx.lineTo(q.x, q.y + 14);
    ctx.stroke();
    ctx.restore();
  }

  // ---- axis labels (kept inside the free area, between the side panels)
  ctx.save();
  ctx.font = `600 10.5px ${p.mono}`;
  setSpacing(ctx, 0.4);
  ctx.textAlign = "left";
  for (const lat of graticuleLines(latBot, latTop, step)) {
    const y = yOf(lat);
    if (y < insets.top + 14 || y > h - insets.bottom - 4) continue;
    const text = Math.abs(lat) < 1e-9 ? "EQUATOR" : formatLatLabel(lat);
    halo(ctx, text, freeLeft + 12, y - 4, Math.abs(lat) < 1e-9 ? colors.accent : colors.text, 3);
  }
  ctx.textAlign = "center";
  for (const lon of graticuleLines(lonLo, lonHi, step)) {
    const x = xOf(lon);
    if (x < freeLeft + 40 || x > freeRight - 40) continue;
    const text = Math.abs(lon) < 1e-9 ? "PRIME MERIDIAN 0°" : formatLonLabel(lon);
    halo(ctx, text, x, insets.top + 12, Math.abs(lon) < 1e-9 ? colors.accent : colors.text, 3);
  }
  if (p.hover) {
    const y = yOf(p.hover.lat);
    const x = xOf(p.hover.lon);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    if (y > insets.top && y < h - insets.bottom) {
      ctx.beginPath();
      ctx.moveTo(freeLeft + 2, Math.round(y) + 0.5);
      ctx.lineTo(freeLeft + 10, Math.round(y) + 0.5);
      ctx.stroke();
    }
    for (const k of [-1, 0, 1]) {
      const xx = x + k * 360 * s;
      if (xx > freeLeft + 20 && xx < freeRight - 20) {
        ctx.beginPath();
        ctx.moveTo(Math.round(xx) + 0.5, insets.top + 17);
        ctx.lineTo(Math.round(xx) + 0.5, insets.top + 25);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // ---- scale bar (kilometres along a meridian, true everywhere on this projection)
  const bar = scaleBar(s);
  const bx = freeLeft + 14;
  const by = h - insets.bottom - 8;
  ctx.save();
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 5;
  ctx.lineCap = "butt";
  const drawBar = () => {
    ctx.beginPath();
    ctx.moveTo(bx + 0.5, by - 5);
    ctx.lineTo(bx + 0.5, by);
    ctx.lineTo(bx + bar.px + 0.5, by);
    ctx.lineTo(bx + bar.px + 0.5, by - 5);
    ctx.stroke();
  };
  drawBar();
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 1.6;
  drawBar();
  ctx.font = `600 11px ${p.mono}`;
  ctx.textAlign = "left";
  setSpacing(ctx, 0.4);
  halo(ctx, bar.label, bx, by - 10, colors.text, 3);
  ctx.restore();
}
