/**
 * arrivalCurtain.ts - the dark curtain the next screen fades in from.
 *
 * The director ends on a dark curtain and then navigates; the director unmounts with the old screen, so the fade-out of the
 * curtain must live outside React. This adds a fixed div to <body> that starts opaque, fades to transparent and removes itself.
 */

export const ARRIVAL_FADE_MS = 900;
const BG = "#0B0F14";

export function startArrivalCurtain(doc: Document = document, fadeMs: number = ARRIVAL_FADE_MS): HTMLElement | null {
  if (!doc.body) return null;
  doc.getElementById("descent-arrival-curtain")?.remove();
  const el = doc.createElement("div");
  el.id = "descent-arrival-curtain";
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    inset: "0",
    background: BG,
    opacity: "1",
    zIndex: "2147483000",
    pointerEvents: "none",
    transition: `opacity ${fadeMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  });
  doc.body.appendChild(el);

  const win = doc.defaultView;
  const cleanup = () => el.remove();
  if (win) {
    // two frames so the browser paints the opaque curtain first, then the transition runs
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => (el.style.opacity = "0")));
    win.setTimeout(cleanup, fadeMs + 250);
  } else {
    el.style.opacity = "0";
    setTimeout(cleanup, fadeMs + 250);
  }
  el.addEventListener("transitionend", cleanup, { once: true });
  return el;
}
