/** The switchable accent colour of the HUD theme, kept in the browser and set on <html data-accent>. */

export const ACCENTS = [
  { id: "teal", label: "Teal", color: "#2dd4bf" },
  { id: "red", label: "Red", color: "#ff6a5c" },
  { id: "orange", label: "Orange", color: "#ff9a2e" },
  { id: "crimson", label: "Crimson", color: "#ff4d73" },
  { id: "gold", label: "Gold", color: "#f2c230" },
  { id: "ice", label: "Ice", color: "#6cb4ff" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
const KEY = "d4-accent";

/** The colour of the current accent, for canvases that cannot read CSS variables (map and 3D strokes). */
export function accentColor(): string {
  const id = typeof document !== "undefined" ? document.documentElement.dataset["accent"] : undefined;
  return (ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]).color;
}

export function readAccent(): AccentId {
  try {
    const v = window.localStorage.getItem(KEY);
    if (ACCENTS.some((a) => a.id === v)) return v as AccentId;
  } catch {
    /* storage may be blocked */
  }
  return "teal";
}

export function applyAccent(id: AccentId): void {
  document.documentElement.dataset["accent"] = id;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* storage may be blocked */
  }
}

export function initAccent(): void {
  document.documentElement.dataset["accent"] = readAccent();
}
