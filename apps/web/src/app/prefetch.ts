/**
 * Route chunk loaders shared by `React.lazy` (routes.tsx) and the prefetcher: one `import()` per screen, so a prefetch
 * that finished is exactly what the navigation then uses, and a screen is never fetched twice.
 */
export const loaders = {
  start: () => import("../pages/StartMenu").then((m) => ({ default: m.StartMenu })),
  globe: () => import("../pages/GlobeScreen").then((m) => ({ default: m.GlobeScreen })),
  site: () => import("../sites/SiteDetail").then((m) => ({ default: m.SiteDetail })),
  about: () => import("../pages/AboutPage").then((m) => ({ default: m.AboutPage })),
  methods: () => import("../pages/MethodsPage").then((m) => ({ default: m.MethodsPage })),
  uiKit: () => import("../ui/UiKitPage").then((m) => ({ default: m.UiKitPage })),
} as const;

export type RouteKey = keyof typeof loaders;

const started = new Set<RouteKey>();

/** Starts loading a screen's chunk (once). Errors are swallowed: a failed prefetch just means a normal load later. */
export function prefetchRoute(key: RouteKey): void {
  if (started.has(key)) return;
  started.add(key);
  loaders[key]().catch(() => started.delete(key));
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

function lowBandwidth(): boolean {
  const c = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ""));
}

const idle = (fn: () => void, timeout: number): void => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout });
  else window.setTimeout(fn, 200);
};

/** Which screens usually come next from the one the user is on. */
const NEXT: Record<string, RouteKey[]> = {
  "/": ["globe", "site"],
  "/globe": ["site", "methods", "about"],
};

/**
 * Warms the likely next screens once the current one has settled (idle, after the first frames), and the screen behind a
 * link the pointer is about to click. Nothing is fetched on slow or data-saver connections.
 */
export function initPrefetch(): void {
  if (typeof window === "undefined" || lowBandwidth()) return;
  const warm = () => {
    const next = NEXT[window.location.pathname];
    if (next) next.forEach((k, i) => window.setTimeout(() => idle(() => prefetchRoute(k), 3000), 600 * i));
  };
  // after the page's own first load work, not during it
  if (document.readyState === "complete") idle(warm, 4000);
  else window.addEventListener("load", () => window.setTimeout(() => idle(warm, 4000), 800), { once: true });

  const onHover = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const path = a.getAttribute("href") ?? "";
    if (path.startsWith("/site/")) prefetchRoute("site");
    else if (path === "/globe") prefetchRoute("globe");
    else if (path === "/about") prefetchRoute("about");
    else if (path === "/methods") prefetchRoute("methods");
  };
  document.addEventListener("pointerover", onHover, { passive: true });
  document.addEventListener("focusin", onHover, { passive: true });
}
