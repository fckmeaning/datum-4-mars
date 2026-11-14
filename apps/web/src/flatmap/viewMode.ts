/** Which picture of the planet is shown on /globe: the 3D globe or the flat map. Remembered in localStorage `d4-view`. */

export type ViewMode = "globe" | "flat";

export const VIEW_STORAGE_KEY = "d4-view";
/** Length of the crossfade between the two pictures, in ms. */
export const VIEW_TRANSITION_MS = 500;

export function isViewMode(v: unknown): v is ViewMode {
  return v === "globe" || v === "flat";
}

export function otherView(v: ViewMode): ViewMode {
  return v === "globe" ? "flat" : "globe";
}

export function readStoredView(): ViewMode | null {
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return isViewMode(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeView(v: ViewMode): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  } catch {
    /* private mode or blocked storage: the choice just is not remembered */
  }
}

/** The view to open with: `?view=flat` wins, then the remembered choice, then the globe. */
export function initialView(search: string): ViewMode {
  const fromUrl = new URLSearchParams(search).get("view");
  if (isViewMode(fromUrl)) return fromUrl;
  return readStoredView() ?? "globe";
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}
