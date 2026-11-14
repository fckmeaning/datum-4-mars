import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { applyAccent } from "../app/accent";
import { globalAutopilot } from "../app/autopilot";
import { SITE_VIEWS, requestSiteView } from "../sites/viewBus";
import { CommandPalette, ShortcutsOverlay } from "./CommandPalette";
import { buildCommands } from "./commands";
import "./palette.css";

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** Mounted once at the root of the router: Ctrl+K palette, the ? shortcuts list, the 1-6 view keys on a site page. */
export function PaletteHost() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const siteId = /^\/site\/([^/?#]+)/.exec(pathname)?.[1] ?? null;

  const commands = useMemo(
    () =>
      buildCommands({
        siteId,
        go: (p) => navigate(p),
        view: requestSiteView,
        startTour: () => globalAutopilot.start(),
        setAccent: applyAccent,
        showShortcuts: () => setHelp(true),
        copyLink: () => void navigator.clipboard?.writeText(window.location.href).catch(() => undefined),
      }),
    [siteId, navigate],
  );

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setHelp(false);
        setOpen((o) => !o);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || open) return;
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelp((h) => !h);
      } else if (siteId && /^[1-9]$/.test(e.key)) {
        const v = SITE_VIEWS[Number(e.key) - 1];
        if (v) requestSiteView(v);
      }
    },
    [open, siteId],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <>
      <button type="button" className="palette-chip" onClick={() => setOpen(true)} aria-label="Open the command palette" title="Command palette" data-testid="palette-chip">
        <kbd>{isMac ? "⌘" : "Ctrl"}</kbd>
        <kbd>K</kbd>
      </button>
      <CommandPalette open={open} onClose={() => setOpen(false)} commands={commands} />
      <ShortcutsOverlay open={help} onClose={() => setHelp(false)} />
    </>
  );
}

export default PaletteHost;
