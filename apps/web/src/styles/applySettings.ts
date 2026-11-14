/**
 * Mirrors the in-app display settings onto <html> data attributes so CSS can react to them
 * (see html[data-reduced-motion="true"] and html[data-reduced-transparency="true"] in tokens.css).
 */
export interface DisplaySettings {
  reducedMotion?: boolean;
  reducedTransparency?: boolean;
}

export function applyDisplaySettings(settings: DisplaySettings, root: HTMLElement = document.documentElement): void {
  setFlag(root, "reducedMotion", settings.reducedMotion);
  setFlag(root, "reducedTransparency", settings.reducedTransparency);
}

function setFlag(root: HTMLElement, key: "reducedMotion" | "reducedTransparency", value: boolean | undefined): void {
  if (value) root.dataset[key] = "true";
  else delete root.dataset[key];
}
