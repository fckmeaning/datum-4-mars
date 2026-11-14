import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** True when the key event comes from a text-like control (digits/arrows belong to it). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
}

/**
 * Horizontal carousel behaviour shared by SiteDeck and LayerDeck:
 * wheel -> horizontal scroll, mouse drag with inertia, per-card --d/--ad (signed and
 * absolute distance from the centre, -1..1) refreshed in rAF for scale/parallax in CSS.
 * Touch uses native scrolling + scroll-snap.
 */
export function useDeckCarousel(open: boolean) {
  const ref = useRef<HTMLUListElement>(null);
  const raf = useRef(0);
  const inertiaRaf = useRef(0);
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0, lastX: 0, lastT: 0, v: 0 });
  const suppressClick = useRef(false);
  const wheelTimer = useRef(0);

  const paint = useCallback(() => {
    raf.current = 0;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    const span = Math.max(1, rect.width * 0.45);
    const reduced = prefersReducedMotion();
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const r = child.getBoundingClientRect();
      const d = reduced ? 0 : clamp((r.left + r.width / 2 - mid) / span, -1, 1);
      child.style.setProperty("--d", d.toFixed(3));
      child.style.setProperty("--ad", Math.abs(d).toFixed(3));
    }
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  }, [paint]);

  const stopInertia = useCallback(() => {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    inertiaRaf.current = 0;
    ref.current?.removeAttribute("data-dragging");
  }, []);

  const scrollToIndex = useCallback(
    (index: number, instant = false) => {
      const el = ref.current;
      const child = el?.children[index] as HTMLElement | undefined;
      if (!el || !child) return;
      stopInertia();
      const left = child.offsetLeft + child.offsetWidth / 2 - el.clientWidth / 2;
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ left, behavior: instant || prefersReducedMotion() ? "auto" : "smooth" });
      } else {
        el.scrollLeft = left;
      }
      schedule();
    },
    [schedule, stopInertia],
  );

  /** Scroll by whole cards (keyboard inside the layer deck). */
  const scrollByCards = useCallback(
    (dir: 1 | -1) => {
      const el = ref.current;
      const first = el?.children[0] as HTMLElement | undefined;
      if (!el || !first) return;
      stopInertia();
      const step = first.offsetWidth + 14;
      const left = el.scrollLeft + dir * step;
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      } else {
        el.scrollLeft = left;
      }
    },
    [stopInertia],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!open) return;
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (dx === 0) return;
      e.preventDefault();
      e.stopPropagation(); // do not zoom the globe underneath
      stopInertia();
      // scroll-snap would pull every small wheel step back to the same card: switch it off while the wheel is turning
      el.setAttribute("data-wheel", "1");
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => el.removeAttribute("data-wheel"), 170);
      el.scrollLeft += dx;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(el);
    schedule();
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      window.clearTimeout(wheelTimer.current);
      el.removeAttribute("data-wheel");
      stopInertia();
    };
  }, [open, schedule, stopInertia]);

  const onPointerDown = (e: ReactPointerEvent<HTMLUListElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("input,button,[data-nodrag]")) return;
    stopInertia();
    suppressClick.current = false;
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startLeft: el.scrollLeft,
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLUListElement>) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d.active) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 5) return;
    if (!d.moved) {
      d.moved = true;
      el.setAttribute("data-dragging", "1");
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* jsdom */
      }
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = 0.8 * d.v + 0.2 * ((d.lastX - e.clientX) / dt) * 16; // px per frame
    d.lastX = e.clientX;
    d.lastT = now;
    el.scrollLeft = d.startLeft - dx;
  };

  const endDrag = (e: ReactPointerEvent<HTMLUListElement>) => {
    const el = ref.current;
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (!el || !d.moved) return;
    suppressClick.current = true;
    try {
      el.releasePointerCapture?.(e.pointerId);
    } catch {
      /* jsdom */
    }
    if (prefersReducedMotion() || Math.abs(d.v) < 0.5) {
      el.removeAttribute("data-dragging");
      return;
    }
    let v = d.v;
    const step = () => {
      v *= 0.94;
      el.scrollLeft += v;
      if (Math.abs(v) > 0.3) inertiaRaf.current = requestAnimationFrame(step);
      else stopInertia();
    };
    inertiaRaf.current = requestAnimationFrame(step);
  };

  /** Swallow the click that ends a drag so a card is not selected by accident. */
  const onClickCapture = (e: ReactMouseEvent<HTMLUListElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return {
    ref,
    scrollToIndex,
    scrollByCards,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture },
  };
}
