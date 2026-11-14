import "@testing-library/jest-dom/vitest";

// jsdom has no 2D canvas; give uPlot (and friends) a no-op context instead of null.
if (typeof HTMLCanvasElement !== "undefined") {
  const noop = () => {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : k === "canvas" ? undefined : noop),
    set: (t, k, v) => ((t[k as string] = v), true),
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
}

if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
  (globalThis as { Path2D?: unknown }).Path2D = class Path2D {
    addPath() {}
    moveTo() {}
    lineTo() {}
    rect() {}
    arc() {}
    closePath() {}
  };
}

// jsdom has no matchMedia; uPlot calls it at import time.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
