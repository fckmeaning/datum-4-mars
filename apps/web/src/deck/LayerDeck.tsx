import { useEffect } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DockLayerItem } from "../ui/LayerDock";
import { isTypingTarget, useDeckCarousel } from "./useDeckCarousel";
import "./deck.css";

export interface LayerDeckProps {
  open: boolean;
  layers: DockLayerItem[];
  onToggle: (id: string, visible: boolean) => void;
  onOpacity: (id: string, opacity: number) => void;
}

function familyIndex(family: string): number {
  let h = 0;
  for (let i = 0; i < family.length; i++) h = (h * 31 + family.charCodeAt(i)) >>> 0;
  return h % 6;
}

/** Plain-language meaning of each global layer, with the ends of its colour scale. */
const LAYER_INFO: Record<string, { hint: string; lo: string; hi: string }> = {
  topo: { hint: "Height of the ground in colour: where the basins and the volcanoes are.", lo: "low", hi: "high" },
  optical: { hint: "The real orbital photo mosaic of Mars, the base picture.", lo: "dark", hi: "bright" },
  thermal: { hint: "Night-time infrared: warm rock and cold dust, a hint of what the ground is made of.", lo: "cold", hi: "warm" },
  slope: { hint: "How steep the ground is on a regional scale: where a rover can drive.", lo: "flat", hi: "steep" },
  hazard: { hint: "Combined danger: steep ground plus radiation, normalised 0 to 1.", lo: "safe", hi: "risky" },
  traverse: { hint: "The path Curiosity has actually driven in Gale Crater.", lo: "start", hi: "now" },
  radiation: { hint: "Estimated radiation dose a person would take on the surface.", lo: "low dose", hi: "high dose" },
  pressure: { hint: "Air pressure at the surface: lower on the peaks, higher in the basins.", lo: "thin", hi: "thicker" },
  geology: { hint: "USGS map of rock types and their age.", lo: "young", hi: "old" },
  zones: { hint: "The 100 km areas NASA proposed for the first human landings.", lo: "", hi: "" },
};

export function LayerDeck({ open, layers, onToggle, onOpacity }: LayerDeckProps) {
  const { ref, scrollByCards, handlers } = useDeckCarousel(open);

  // digits 1-9 toggle the matching layer (same contract as LayerDock)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      const n = parseInt(e.key, 10);
      if (!(n >= 1 && n <= 9)) return;
      const hit = layers.find((l) => l.shortcutNumber === n);
      if (hit) {
        e.preventDefault();
        onToggle(hit.id, !hit.visible);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, layers, onToggle]);

  // arrows scroll the rail only while focus is inside it (the site deck owns global arrows)
  const onRailKey = (e: ReactKeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      scrollByCards(e.key === "ArrowRight" ? 1 : -1);
    }
  };

  const active = layers.filter((l) => l.visible).length;

  return (
    <section
      className="deck deck--bottom layer-deck"
      data-open={open ? "true" : "false"}
      aria-label="Orbital data layers"
      aria-hidden={!open}
      inert={!open}
      onKeyDown={onRailKey}
    >
      <ul className="deck__rail" ref={ref} {...handlers} data-testid="layer-rail">
        {layers.map((l, i) => {
          const pct = Math.round(l.opacity * 100);
          const info = LAYER_INFO[l.id];
          return (
            <li
              key={l.id}
              className="deck__item layer-card"
              data-on={l.visible ? "true" : "false"}
              data-layer-id={l.id}
              data-fam={familyIndex(l.family)}
              style={{ "--i": i, "--fam": familyIndex(l.family) } as CSSProperties}
              onClick={(e) => {
                // a click anywhere on the card flips the layer; the switch and the slider keep their own meaning
                if ((e.target as HTMLElement).closest("input,button")) return;
                onToggle(l.id, !l.visible);
              }}
            >
              <div className="deck__card">
                <div className="layer-card__top">
                  <kbd className="layer-card__key">{l.shortcutNumber}</kbd>
                  <div className="layer-card__titles">
                    <h3 className="layer-card__name">{l.name}</h3>
                    <p className="layer-card__src">{l.source}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={l.visible}
                    aria-label={`${l.name} visibility`}
                    className="layer-card__switch"
                    tabIndex={open ? 0 : -1}
                    onClick={() => onToggle(l.id, !l.visible)}
                  >
                    <span />
                  </button>
                </div>
                <div className="layer-card__strip" data-family={l.family} aria-hidden="true">
                  <i />
                </div>
                {info && (info.lo || info.hi) && (
                  <div className="layer-card__legend" aria-hidden="true">
                    <span>{info.lo}</span>
                    <span>{info.hi}</span>
                  </div>
                )}
                {info && <p className="layer-card__hint">{info.hint}</p>}
                <div className="layer-card__foot">
                  <span className="layer-card__tags">
                    {l.modeled && (
                      <span className="deck__tag" data-tone="warn">
                        MODELED
                      </span>
                    )}
                    {l.simulated && (
                      <span className="deck__tag" data-tone="warn">
                        SIMULATED
                      </span>
                    )}
                    {l.approximate && (
                      <span className="deck__tag" data-tone="warn">
                        APPROX
                      </span>
                    )}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pct}
                    className="layer-card__range"
                    aria-label={`${l.name} opacity`}
                    tabIndex={open ? 0 : -1}
                    onChange={(e) => onOpacity(l.id, Number(e.target.value) / 100)}
                  />
                  <output className="layer-card__pct">{pct}%</output>
                  <span className="layer-card__state" aria-hidden="true">{l.visible ? "ON" : "OFF"}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <footer className="deck__foot">
        <span className="deck__title">DATA LAYERS</span>
        <span className="deck__hint">
          press <kbd>1</kbd>–<kbd>9</kbd> or click a card to switch a layer on and off · scroll or drag to browse
        </span>
        <span className="deck__count">{active} ON</span>
      </footer>
    </section>
  );
}
