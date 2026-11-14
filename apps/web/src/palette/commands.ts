import { ACCENTS, type AccentId } from "../app/accent";
import { SITE_FACTS } from "../globe/siteCatalog";
import { SITE_VIEWS, VIEW_LABEL, type SiteView } from "../sites/viewBus";

export type CommandGroup = "Go to" | "View" | "Page" | "Action" | "Accent";

export interface Command {
  id: string;
  title: string;
  /** right-hand hint: a key, a place */
  hint?: string;
  group: CommandGroup;
  /** extra words the search matches */
  keywords?: string;
  run: () => void;
}

export interface CommandContext {
  /** the id of the site page that is open, or null */
  siteId: string | null;
  go: (path: string) => void;
  /** switch the tab of the open site page */
  view: (v: SiteView) => void;
  startTour: () => void;
  setAccent: (id: AccentId) => void;
  showShortcuts: () => void;
  /** copy the address of the page (it carries the tab and the sky time) */
  copyLink: () => void;
}

/** Everything the palette can do, built for the page that is open. */
export function buildCommands(ctx: CommandContext): Command[] {
  const out: Command[] = [];
  for (const f of Object.values(SITE_FACTS)) {
    out.push({ id: `site:${f.id}`, title: `Open ${f.name}`, hint: `${f.craft.split(" (")[0]} · ${f.landed.slice(0, 4)}`, group: "Go to", keywords: `${f.station} ${f.craft} expedition site`, run: () => ctx.go(`/site/${f.id}`) });
  }
  SITE_VIEWS.forEach((v, i) => {
    out.push({
      id: `view:${v}`,
      title: `${VIEW_LABEL[v]}${ctx.siteId ? "" : " (Gale)"}`,
      hint: ctx.siteId ? String(i + 1) : undefined,
      group: "View",
      keywords: `tab view ${v}`,
      run: () => (ctx.siteId ? ctx.view(v) : ctx.go(`/site/gale?view=${v}`)),
    });
  });
  for (const f of Object.values(SITE_FACTS)) {
    for (const v of ["sky", "profile", "mission"] as const) {
      out.push({ id: `site:${f.id}:${v}`, title: `${VIEW_LABEL[v]}: ${f.name}`, group: "Go to", keywords: `${f.station} ${v}`, run: () => ctx.go(`/site/${f.id}?view=${v}`) });
    }
  }
  out.push(
    { id: "page:globe", title: "3D globe", group: "Page", keywords: "mars planet layers", run: () => ctx.go("/globe") },
    { id: "page:compare", title: "Compare all sites", group: "Page", keywords: "table radar versus", run: () => ctx.go("/compare") },
    { id: "page:start", title: "Start menu", group: "Page", keywords: "home", run: () => ctx.go("/") },
    { id: "page:methods", title: "Methods and formulas", group: "Page", keywords: "math science sources", run: () => ctx.go("/methods") },
    { id: "page:about", title: "About Datum-4", group: "Page", keywords: "credits", run: () => ctx.go("/about") },
    { id: "act:tour", title: "Start the guided tour", group: "Action", keywords: "autopilot demo", run: ctx.startTour },
    { id: "act:keys", title: "Keyboard shortcuts", hint: "?", group: "Action", keywords: "help keys", run: ctx.showShortcuts },
    { id: "act:link", title: "Copy link to this view", group: "Action", keywords: "share url address", run: ctx.copyLink },
  );
  for (const a of ACCENTS) out.push({ id: `accent:${a.id}`, title: `Accent: ${a.label}`, group: "Accent", keywords: "colour color theme", run: () => ctx.setAccent(a.id) });
  return out;
}

/**
 * Scores a query against a command: every word of the query must be found (at the start of a word, inside a word, or as a
 * subsequence of the text); higher is better. Returns null when a word is not found.
 */
export function matchScore(query: string, c: Pick<Command, "title" | "keywords">): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = c.title.toLowerCase();
  const hay = `${title} ${(c.keywords ?? "").toLowerCase()}`;
  let total = 0;
  for (const w of q.split(/\s+/)) {
    let s = 0;
    const words = hay.split(/[^a-z0-9]+/);
    if (title.startsWith(w)) s = 6;
    else if (words.some((x) => x.startsWith(w))) s = 4;
    else if (hay.includes(w)) s = 2.5;
    else {
      let i = 0;
      for (const ch of hay) if (ch === w[i]) i++;
      if (i === w.length && w.length >= 2) s = 1;
    }
    if (s === 0) return null;
    total += s + (title.includes(w) ? 1 : 0);
  }
  return total;
}

/** Commands matching a query, best first; with no query, all of them in their order. */
export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;
  return commands
    .map((c, i) => ({ c, i, s: matchScore(query, c) }))
    .filter((x): x is { c: Command; i: number; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}
