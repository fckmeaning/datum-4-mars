/** The views (tabs) of a site page, and a tiny bus so the command palette can switch the tab of the page that is open. */

export const SITE_VIEWS = ["2d", "3d", "fpv", "sky", "profile", "mission"] as const;
export type SiteView = (typeof SITE_VIEWS)[number];

export const VIEW_LABEL: Record<SiteView, string> = {
  "2d": "2D top-down",
  "3d": "3D terrain",
  fpv: "First person",
  sky: "Sky and Sun",
  profile: "Route profile",
  mission: "Mission",
};

/** Short names for the tab row. */
export const VIEW_TAB: Record<SiteView, string> = {
  "2d": "2D top-down",
  "3d": "3D terrain",
  fpv: "First person",
  sky: "Sky",
  profile: "Profile",
  mission: "Mission",
};

export function isSiteView(v: unknown): v is SiteView {
  return typeof v === "string" && (SITE_VIEWS as readonly string[]).includes(v);
}

const EVENT = "d4:site-view";

/** Ask the open site page to switch to a view. */
export function requestSiteView(view: SiteView): void {
  window.dispatchEvent(new CustomEvent<SiteView>(EVENT, { detail: view }));
}

/** Listen for view requests; returns the unsubscribe function. */
export function onSiteViewRequest(cb: (view: SiteView) => void): () => void {
  const h = (e: Event) => {
    const v = (e as CustomEvent<unknown>).detail;
    if (isSiteView(v)) cb(v);
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
