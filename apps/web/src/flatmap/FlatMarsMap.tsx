/**
 * The flat map of Mars: the whole planet unrolled (longitude -180..180, latitude -90..90), drag to pan, wheel or pinch to zoom,
 * wraps round horizontally. It shows the same mosaic and the same layers as the globe (see globe/globeAssets.ts), the
 * landing sites as pins (click opens the expedition) and the 100 km exploration zones.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { canUse8kMosaic, COMPOSITE_ORDER, compositeUrl, loadGlobeImage, MOSAIC_4K_URL, MOSAIC_8K_URL, type CompositeLayerId } from "../globe/globeAssets";
import type { OverlayId } from "../globe/globeLayers";
import { estimateLabelWidth, hideOverlapping, type LabelBox } from "../globe/labelLayout";
import type { LandingSite } from "../globe/landingSites";
import { EXPLORATION_ZONES, ZONE_RADIUS_KM } from "../globe/zones";
import { createMapRenderer, type MapRenderer } from "./mapRenderer";
import { paintOverlay, type PaintColors, type PaintInsets } from "./overlayPainter";
import {
  MAX_SCALE,
  clampView,
  flyView,
  formatLatLabel,
  formatLonLabel,
  minScale,
  panBy,
  project,
  unproject,
  viewCentredOn,
  zoomAt,
  type MapSize,
  type MapView,
} from "./projection";
import { prefersReducedMotion } from "./viewMode";
import "./flatmap.css";

/** What the side panels of /globe cover, so labels and fly-tos use the free middle. */
export const DEFAULT_MAP_INSETS: PaintInsets = { left: 352, right: 300, top: 70, bottom: 74 };

/** Scale (px per degree) a site is flown to: a region about 100 degrees wide. */
export const SITE_FLY_SCALE = 12;
/** Scale of the dive that ends in the expedition page. */
const DIVE_SCALE = 46;

export interface FlatMarsMapProps {
  /** Shown and listening to the keyboard. */
  active: boolean;
  sites: LandingSite[];
  selectedId: string | null;
  picked: { lat: number; lon: number } | null;
  /** Fly-to request (the site list); a new `nonce` flies again. */
  focus: { lat: number; lon: number; nonce: number } | null;
  /** Dock data layers that are on, with opacity. */
  overlays: Partial<Record<OverlayId, number>>;
  geologyOpacity: number;
  showZones: boolean;
  showTraverse: boolean;
  /** Where to start (the centre of the globe the person was looking at); the selected site when absent. */
  initialCenter?: { lat: number; lon: number } | null;
  insets?: PaintInsets;
  onHover?: (p: { lat: number; lon: number } | null) => void;
  onPick?: (p: { lat: number; lon: number }) => void;
  /** A pin was clicked (after the short dive). */
  onOpenSite?: (id: string) => void;
  /** The centre of the view moved (not called every frame: only when a gesture or fly-to ends). */
  onViewCenter?: (c: { lat: number; lon: number }) => void;
}

function readColors(el: HTMLElement): { colors: PaintColors; mono: string; sans: string } {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    colors: {
      accent: v("--hz-accent", "#2dd4bf"),
      accent2: v("--hz-accent-2", "#7ff0e0"),
      text: v("--hz-text", "#e6edf3"),
      dim: v("--hz-dim", "#8ea3b8"),
      warn: v("--hz-warn", "#ffb000"),
    },
    mono: v("--font-mono", "ui-monospace, Menlo, Consolas, monospace"),
    sans: v("--hz-label", "Inter, system-ui, sans-serif"),
  };
}

export function FlatMarsMap(props: FlatMarsMapProps) {
  const {
    active,
    sites,
    selectedId,
    picked,
    focus,
    overlays,
    geologyOpacity,
    showZones,
    showTraverse,
    initialCenter,
    insets = DEFAULT_MAP_INSETS,
    onHover,
    onPick,
    onOpenSite,
    onViewCenter,
  } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const rasterRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pinRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const rendererRef = useRef<(MapRenderer & { canvas: HTMLCanvasElement }) | null>(null);

  const viewRef = useRef<MapView>({ lon: 0, lat: 0, scale: 1 });
  const sizeRef = useRef<MapSize>({ w: 0, h: 0 });
  const dprRef = useRef(1);
  const viewInit = useRef(false);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const hoverRef = useRef<{ lat: number; lon: number } | null>(null);
  const colorsRef = useRef<{ at: number; v: ReturnType<typeof readColors> | null }>({ at: 0, v: null });
  const traverseRef = useRef<Array<[number, number]> | null>(null);
  const mosaic8kRequested = useRef(false);

  // animation state
  const flyRef = useRef<{ from: MapView; to: MapView; t0: number; dur: number; done?: () => void } | null>(null);
  const zoomGoalRef = useRef<{ scale: number; px: number; py: number } | null>(null);
  const inertiaRef = useRef<{ vx: number; vy: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [rendererKind, setRendererKind] = useState<"webgl" | "canvas">("webgl");

  // the latest props, read by the frame loop and the gesture handlers without re-subscribing
  const live = useRef({ props, insets });
  useLayoutEffect(() => {
    live.current = { props, insets };
  });

  const centreOf = useCallback(() => ({ lat: viewRef.current.lat, lon: viewRef.current.lon }), []);

  // ---- drawing
  const draw = useCallback(() => {
    const size = sizeRef.current;
    const renderer = rendererRef.current;
    const overlay = overlayRef.current;
    const host = hostRef.current;
    if (!renderer || !overlay || !host || size.w <= 0 || size.h <= 0) return;
    const view = viewRef.current;
    const dpr = dprRef.current;
    const L = live.current;

    renderer.draw(view, size, dpr);

    // theme colours follow the CSS variables (the accent can change at any time), read at most four times a second
    const now = performance.now();
    if (!colorsRef.current.v || now - colorsRef.current.at > 250) colorsRef.current = { at: now, v: readColors(host) };
    const { colors, mono, sans } = colorsRef.current.v!;

    if (overlay.width !== Math.round(size.w * dpr) || overlay.height !== Math.round(size.h * dpr)) {
      overlay.width = Math.round(size.w * dpr);
      overlay.height = Math.round(size.h * dpr);
    }
    const ctx = overlay.getContext("2d");
    const gale = L.props.sites.find((s) => s.id === "gale");
    if (ctx) {
      paintOverlay(ctx, {
        view,
        size,
        dpr,
        insets: L.insets,
        colors,
        mono,
        sans,
        zones: L.props.showZones ? EXPLORATION_ZONES : null,
        zoneRadiusKm: ZONE_RADIUS_KM,
        traverse: L.props.showTraverse ? traverseRef.current : null,
        traverseAnchor: L.props.showTraverse ? { lat: gale?.lat ?? -4.59, lon: gale?.lon ?? 137.44 } : null,
        picked: L.props.picked,
        hover: hoverRef.current,
        features: true,
      });
    }

    // site pins: DOM buttons moved with transforms; labels that would overlap are hidden, the selected one wins
    const boxes: LabelBox[] = [];
    for (const site of L.props.sites) {
      const el = pinRefs.current.get(site.id);
      if (!el) continue;
      const pt = project(view, size, site.lat, site.lon);
      const visible = pt.x > -40 && pt.x < size.w + 40 && pt.y > -40 && pt.y < size.h + 40;
      el.style.transform = `translate3d(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0)`;
      el.style.visibility = visible ? "visible" : "hidden";
      el.dataset.edge = pt.x < 190 ? "left" : pt.x > size.w - 190 ? "right" : "mid";
      el.dataset.flip = pt.y > size.h - 200 ? "1" : "0";
      boxes.push({
        id: site.id,
        x: pt.x,
        y: pt.y - 6,
        w: estimateLabelWidth(site.name, String(site.year)) - 6,
        h: 22,
        priority: site.id === L.props.selectedId ? 10 : 1,
        visible,
      });
    }
    const hidden = hideOverlapping(boxes);
    for (const site of L.props.sites) {
      const el = pinRefs.current.get(site.id);
      if (el) el.dataset.label = hidden.has(site.id) ? "off" : "on";
    }

    // 8k mosaic for close zoom: fetched once, when the map gets sharper than the 4k texture can give
    if (!mosaic8kRequested.current && view.scale * dpr > (4096 / 360) * 0.95 && canUse8kMosaic()) {
      mosaic8kRequested.current = true;
      void loadGlobeImage(MOSAIC_8K_URL).then((img) => {
        if (img && rendererRef.current) {
          rendererRef.current.setMosaic(img);
          requestFrame();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frame = useCallback(
    (now: number) => {
      rafRef.current = 0;
      const size = sizeRef.current;
      const dt = Math.min(64, lastFrameRef.current ? now - lastFrameRef.current : 16);
      lastFrameRef.current = now;
      let busy = false;

      const fly = flyRef.current;
      if (fly) {
        const t = fly.dur <= 0 ? 1 : (now - fly.t0) / fly.dur;
        viewRef.current = clampView(flyView(fly.from, fly.to, t), size);
        if (t >= 1) {
          flyRef.current = null;
          viewRef.current = clampView(fly.to, size);
          fly.done?.();
          live.current.props.onViewCenter?.(centreOf());
        } else busy = true;
      } else {
        const goal = zoomGoalRef.current;
        if (goal) {
          const cur = viewRef.current.scale;
          const k = 1 - Math.exp(-dt / 85);
          const next = cur * Math.pow(goal.scale / cur, k);
          if (Math.abs(Math.log(goal.scale / next)) < 0.002) {
            viewRef.current = zoomAt(viewRef.current, size, goal.px, goal.py, goal.scale / cur);
            zoomGoalRef.current = null;
            live.current.props.onViewCenter?.(centreOf());
          } else {
            viewRef.current = zoomAt(viewRef.current, size, goal.px, goal.py, next / cur);
            busy = true;
          }
        }
        const inertia = inertiaRef.current;
        if (inertia) {
          viewRef.current = panBy(viewRef.current, size, inertia.vx * dt, inertia.vy * dt);
          const decay = Math.exp(-dt / 320);
          inertia.vx *= decay;
          inertia.vy *= decay;
          if (Math.hypot(inertia.vx, inertia.vy) < 0.02) {
            inertiaRef.current = null;
            live.current.props.onViewCenter?.(centreOf());
          } else busy = true;
        }
      }
      draw();
      if (busy) rafRef.current = requestAnimationFrame(frame);
      else lastFrameRef.current = 0;
    },
    [draw, centreOf],
  );

  const requestFrame = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(frame);
  }, [frame]);

  // ---- renderer and textures
  useEffect(() => {
    const renderer = createMapRenderer();
    rendererRef.current = renderer;
    setRendererKind(renderer.kind);
    renderer.canvas.className = "flatmap__raster";
    rasterRef.current?.appendChild(renderer.canvas);
    let alive = true;
    void loadGlobeImage(MOSAIC_4K_URL).then((img) => {
      if (!alive) return;
      if (img) renderer.setMosaic(img);
      setReady(true);
      requestFrame();
    });
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      renderer.canvas.remove();
      renderer.dispose();
      rendererRef.current = null;
      mosaic8kRequested.current = false;
    };
  }, [requestFrame]);

  // layers: each image is fetched the first time its layer is switched on
  const weights = useMemo(() => {
    const w: Partial<Record<CompositeLayerId, number>> = {};
    for (const id of COMPOSITE_ORDER) {
      if (id === "geology") w.geology = geologyOpacity > 0 ? geologyOpacity : 0;
      else w[id] = overlays[id as OverlayId] ?? 0;
    }
    return w;
  }, [overlays, geologyOpacity]);
  const requestedLayers = useRef(new Set<CompositeLayerId>());
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setWeights(weights);
    for (const id of COMPOSITE_ORDER) {
      if ((weights[id] ?? 0) <= 0 || requestedLayers.current.has(id)) continue;
      requestedLayers.current.add(id);
      void loadGlobeImage(compositeUrl(id)).then((img) => {
        const r = rendererRef.current;
        if (!r) return;
        if (!img) {
          requestedLayers.current.delete(id);
          return;
        }
        r.setLayer(id, img);
        requestFrame();
      });
    }
    requestFrame();
  }, [weights, ready, requestFrame]);

  // the traverse line is fetched when its layer is first on
  useEffect(() => {
    if (!showTraverse || traverseRef.current) return;
    let alive = true;
    void fetch("/data/gale/traverse.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((g: { features?: Array<{ geometry?: { type?: string; coordinates?: number[][] } }> } | null) => {
        const line = g?.features?.find((f) => f.geometry?.type === "LineString")?.geometry?.coordinates;
        if (alive && line) {
          traverseRef.current = line.map((c) => [c[0] ?? 0, c[1] ?? 0] as [number, number]);
          requestFrame();
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [showTraverse, requestFrame]);

  // redraw whenever something drawn changes
  useEffect(() => {
    requestFrame();
  }, [showZones, showTraverse, picked, sites, selectedId, insets, requestFrame]);

  // ---- size
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      dprRef.current = dpr;
      const size = { w: Math.round(r.width), h: Math.round(r.height) };
      if (size.w <= 0 || size.h <= 0) return;
      sizeRef.current = size;
      const L = live.current;
      if (!viewInit.current) {
        viewInit.current = true;
        const site = L.props.sites.find((s) => s.id === L.props.selectedId);
        const c = L.props.initialCenter ?? (site ? { lat: site.lat, lon: site.lon } : { lat: 0, lon: 0 });
        viewRef.current = clampView({ lon: c.lon, lat: 0, scale: minScale(size) }, size);
      } else {
        viewRef.current = clampView(viewRef.current, size);
      }
      requestFrame();
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [requestFrame]);

  // ---- fly-to
  const flyTo = useCallback(
    (to: MapView, done?: () => void, durMs = 1100) => {
      const size = sizeRef.current;
      if (size.w <= 0) {
        done?.();
        return;
      }
      zoomGoalRef.current = null;
      inertiaRef.current = null;
      const dur = prefersReducedMotion() ? 0 : durMs;
      flyRef.current = { from: viewRef.current, to: clampView(to, size), t0: performance.now(), dur, done };
      requestFrame();
    },
    [requestFrame],
  );

  const lastFocus = useRef(focus?.nonce ?? -1);
  useEffect(() => {
    if (!focus || focus.nonce === lastFocus.current) return;
    lastFocus.current = focus.nonce;
    if (!active) return;
    const size = sizeRef.current;
    const scale = Math.max(viewRef.current.scale, SITE_FLY_SCALE);
    flyTo(viewCentredOn(focus.lat, focus.lon, scale, size, live.current.insets));
  }, [focus, active, flyTo]);

  // ---- gestures
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; moved: boolean; lastT: number; vx: number; vy: number; startX: number; startY: number } | null>(null);
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    hostRef.current?.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    flyRef.current = null;
    zoomGoalRef.current = null;
    inertiaRef.current = null;
    if (pointers.current.size === 1) {
      drag.current = { x: p.x, y: p.y, moved: false, lastT: e.timeStamp, vx: 0, vy: 0, startX: p.x, startY: p.y };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (drag.current) drag.current.moved = true;
    }
    hostRef.current?.classList.add("flatmap--grabbing");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = localPoint(e);
    const size = sizeRef.current;
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, p);
      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        let v = panBy(viewRef.current, size, mx - pinch.current.mx, my - pinch.current.my);
        if (pinch.current.dist > 0) v = zoomAt(v, size, mx, my, dist / pinch.current.dist);
        viewRef.current = v;
        pinch.current = { dist, mx, my };
        requestFrame();
        return;
      }
      const d = drag.current;
      if (d && pointers.current.size === 1) {
        const dx = p.x - d.x;
        const dy = p.y - d.y;
        if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) > 4) d.moved = true;
        if (d.moved) {
          viewRef.current = panBy(viewRef.current, size, dx, dy);
          const dtp = Math.max(1, e.timeStamp - d.lastT);
          d.vx = d.vx * 0.6 + (dx / dtp) * 0.4;
          d.vy = d.vy * 0.6 + (dy / dtp) * 0.4;
          d.lastT = e.timeStamp;
          d.x = p.x;
          d.y = p.y;
          requestFrame();
        }
        return;
      }
    }
    // hover: the readout in the page follows the cursor
    const g = unproject(viewRef.current, size, p.x, p.y);
    const next = g.inside ? { lat: g.lat, lon: g.lon } : null;
    hoverRef.current = next;
    live.current.props.onHover?.(next);
    requestFrame();
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const wasPinch = pointers.current.size >= 2;
    pointers.current.delete(e.pointerId);
    if (hostRef.current?.hasPointerCapture(e.pointerId)) hostRef.current.releasePointerCapture(e.pointerId);
    pinch.current = null;
    const d = drag.current;
    if (pointers.current.size === 0) {
      hostRef.current?.classList.remove("flatmap--grabbing");
      drag.current = null;
      if (d && !d.moved && !wasPinch && e.type === "pointerup") {
        // a click on the bare map picks a point
        const g = unproject(viewRef.current, sizeRef.current, d.startX, d.startY);
        if (g.inside) live.current.props.onPick?.({ lat: g.lat, lon: g.lon });
      } else if (d && d.moved && !prefersReducedMotion() && Math.hypot(d.vx, d.vy) > 0.15) {
        inertiaRef.current = { vx: d.vx, vy: d.vy };
        requestFrame();
      } else if (d?.moved) {
        live.current.props.onViewCenter?.(centreOf());
      }
    } else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()] as [{ x: number; y: number }];
      drag.current = { x: p.x, y: p.y, moved: true, lastT: e.timeStamp, vx: 0, vy: 0, startX: p.x, startY: p.y };
    }
  };

  const onPointerLeave = () => {
    if (pointers.current.size > 0) return;
    hoverRef.current = null;
    live.current.props.onHover?.(null);
    requestFrame();
  };

  // wheel and double click zoom (non-passive, so the page does not scroll)
  const zoomBy = useCallback(
    (factor: number, px?: number, py?: number) => {
      const size = sizeRef.current;
      if (size.w <= 0) return;
      const goal = zoomGoalRef.current?.scale ?? viewRef.current.scale;
      const scale = Math.min(Math.max(goal * factor, minScale(size)), MAX_SCALE);
      flyRef.current = null;
      inertiaRef.current = null;
      const x = px ?? size.w / 2;
      const y = py ?? size.h / 2;
      if (prefersReducedMotion()) {
        viewRef.current = zoomAt(viewRef.current, size, x, y, scale / viewRef.current.scale);
        live.current.props.onViewCenter?.(centreOf());
      } else {
        zoomGoalRef.current = { scale, px: x, py: y };
      }
      requestFrame();
    },
    [requestFrame, centreOf],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      if (!active) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = e.deltaY * unit;
      const k = e.ctrlKey ? 0.012 : 0.0016; // a pinch on a trackpad arrives as ctrl + wheel with small deltas
      const p = localPoint(e);
      zoomBy(Math.exp(-dy * k), p.x, p.y);
    };
    const onDbl = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, a, input")) return;
      const p = localPoint(e);
      zoomBy(e.shiftKey || e.altKey ? 0.5 : 2, p.x, p.y);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("dblclick", onDbl);
    return () => {
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("dblclick", onDbl);
    };
  }, [active, zoomBy]);

  // keyboard: arrows pan, + and - zoom, 0 shows the whole planet
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      const size = sizeRef.current;
      const step = 90;
      let handled = true;
      if (e.key === "ArrowLeft") viewRef.current = panBy(viewRef.current, size, step, 0);
      else if (e.key === "ArrowRight") viewRef.current = panBy(viewRef.current, size, -step, 0);
      else if (e.key === "ArrowUp") viewRef.current = panBy(viewRef.current, size, 0, step);
      else if (e.key === "ArrowDown") viewRef.current = panBy(viewRef.current, size, 0, -step);
      else if (e.key === "+" || e.key === "=") zoomBy(1.6);
      else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.6);
      else if (e.key === "0") flyTo({ lon: viewRef.current.lon, lat: 0, scale: minScale(size) });
      else handled = false;
      if (handled) {
        e.preventDefault();
        requestFrame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, zoomBy, flyTo, requestFrame]);

  // ---- pins
  const openSite = (site: LandingSite) => {
    const size = sizeRef.current;
    const finish = () => onOpenSite?.(site.id);
    if (!active) return;
    flyTo(viewCentredOn(site.lat, site.lon, DIVE_SCALE, size, live.current.insets), finish, 700);
  };

  const aria = `Flat map of Mars. Drag to pan, scroll to zoom, ${sites.length} landing sites.`;

  return (
    <div
      ref={hostRef}
      className="flatmap"
      data-testid="flat-map"
      data-ready={ready ? "1" : "0"}
      data-renderer={rendererKind}
      role="application"
      aria-label={aria}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={onPointerLeave}
    >
      <div ref={rasterRef} className="flatmap__rasterhost" />
      <canvas ref={overlayRef} className="flatmap__overlay" />
      <div className="flatmap__pins">
        {sites.map((site) => {
          const selected = site.id === selectedId && !picked;
          return (
            <button
              type="button"
              key={site.id}
              ref={(el) => {
                pinRefs.current.set(site.id, el);
              }}
              className={`flatmap__pin${selected ? " flatmap__pin--selected" : ""}`}
              data-site={site.id}
              data-label="on"
              onClick={() => openSite(site)}
              aria-label={`${site.name}, ${site.mission}, ${site.year}. Open the expedition page`}
            >
              <span className="flatmap__dot" />
              <span className="flatmap__label">
                <span className="flatmap__label-name">{site.name}</span>
                <span className="flatmap__label-year">{site.year}</span>
              </span>
              <span className="flatmap__card" role="tooltip">
                <strong>{site.name}</strong>
                <span>
                  {site.mission} · {site.year}
                </span>
                <span className="flatmap__card-coords">
                  {formatLatLabel(site.lat)}, {formatLonLabel(site.lon)}
                </span>
                <span className="flatmap__card-cta">Open expedition →</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flatmap__zoom" role="group" aria-label="Map zoom">
        <button type="button" onClick={() => zoomBy(1.6)} aria-label="Zoom in" data-testid="flat-zoom-in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" data-testid="flat-zoom-out">
          −
        </button>
        <button
          type="button"
          onClick={() => flyTo({ lon: viewRef.current.lon, lat: 0, scale: minScale(sizeRef.current) })}
          aria-label="Show the whole planet"
          title="Whole planet (0)"
          data-testid="flat-zoom-fit"
        >
          ⤢
        </button>
      </div>
      {!ready && (
        <div className="flatmap__loading" aria-live="polite">
          Loading the Mars mosaic…
        </div>
      )}
    </div>
  );
}
