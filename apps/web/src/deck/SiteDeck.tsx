import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import type { LandingSite } from "../globe/landingSites";
import { isTypingTarget, useDeckCarousel } from "./useDeckCarousel";
import "./deck.css";

export interface SiteDeckProps {
  open: boolean;
  sites: LandingSite[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000;
}

/** Stable pseudo-terrain: crater blobs positioned by the site id, marker by lat/lon. */
function thumbStyle(site: LandingSite): CSSProperties {
  const h = hash(site.id);
  const lon = ((site.lon % 360) + 360) % 360;
  return {
    "--px": 18 + (h % 60),
    "--py": 22 + ((h >> 3) % 50),
    "--qx": 20 + ((h * 7) % 65),
    "--qy": 30 + ((h * 3) % 55),
    "--mix": 25 + (h % 55),
    "--mx": ((lon / 360) * 100).toFixed(2),
    "--my": (((90 - site.lat) / 180) * 100).toFixed(2),
  } as CSSProperties;
}

export function SiteDeck({ open, sites, selectedId, onSelect, onOpen }: SiteDeckProps) {
  const { ref, scrollToIndex, handlers } = useDeckCarousel(open);
  const index = useMemo(() => sites.findIndex((s) => s.id === selectedId), [sites, selectedId]);

  // keep the selected card centred (instantly while closed, smoothly afterwards)
  useEffect(() => {
    if (index >= 0) scrollToIndex(index, !open);
  }, [index, open, scrollToIndex]);

  // <- / -> move the selection while the deck is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (isTypingTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey || !sites.length) return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = Math.min(sites.length - 1, Math.max(0, (index < 0 ? 0 : index) + dir));
      if (sites[next] && sites[next].id !== selectedId) onSelect(sites[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sites, index, selectedId, onSelect]);

  return (
    <section
      className="deck deck--top site-deck"
      data-open={open ? "true" : "false"}
      aria-label="Landing sites"
      aria-hidden={!open}
      inert={!open}
    >
      <header className="deck__head">
        <span className="deck__title">EXPEDITIONS</span>
        <span className="deck__hint">
          <kbd>←</kbd> <kbd>→</kbd> rotate · scroll or drag
        </span>
        <span className="deck__count">
          {String(Math.max(index, 0) + 1).padStart(2, "0")} / {String(sites.length).padStart(2, "0")}
        </span>
      </header>
      <ul className="deck__rail" ref={ref} {...handlers} data-testid="site-rail">
        {sites.map((site, i) => {
          const selected = site.id === selectedId;
          const locked = site.status === "locked";
          return (
            <li
              key={site.id}
              className="deck__item site-card"
              data-selected={selected ? "true" : "false"}
              data-locked={locked ? "true" : "false"}
              data-site-id={site.id}
              style={{ "--i": i } as CSSProperties}
              tabIndex={open ? 0 : -1}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(site.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelect(site.id);
                }
              }}
            >
              <div className="deck__card">
                <div className="site-card__thumb" style={thumbStyle(site)} aria-hidden="true">
                  <span className="site-card__marker" />
                  <span className="site-card__scan" />
                </div>
                <div className="site-card__body">
                  <div className="site-card__row">
                    <span className="deck__badge" data-tone={locked ? "locked" : "open"}>
                      {locked ? "Phase 2" : "Open"}
                    </span>
                    {site.detail && (
                      <span className="deck__tag">{site.detail === "local" ? "3D · 2D" : "2D"}</span>
                    )}
                  </div>
                  <h3 className="site-card__name">{site.name}</h3>
                  <p className="site-card__mission">
                    {site.mission} <span>· {site.year}</span>
                  </p>
                  <p className="site-card__coord">
                    {Math.abs(site.lat).toFixed(2)}°{site.lat >= 0 ? "N" : "S"} {site.lon.toFixed(2)}°E
                  </p>
                </div>
                <button
                  type="button"
                  className="deck__go"
                  disabled={locked}
                  tabIndex={open ? 0 : -1}
                  aria-label={locked ? `${site.name}: Phase 2` : `Open ${site.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(site.id);
                  }}
                >
                  {locked ? "Phase 2" : "Open →"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
