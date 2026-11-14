import React, { lazy, Suspense, useState, useEffect, useRef, useTransition } from "react";
import "./StartMenu.css";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../state/store";
import { loadLandingSites, DEFAULT_LANDING_SITES, type LandingSite } from "@/globe/landingSites";
import { GlobeReadout, type GlobeTarget } from "@/ui/GlobeReadout";
import { formatLatLon } from "@/globe/coords";
import { PlayIcon, SettingsIcon, InfoIcon, ExitIcon } from "@/ui/Icons";

// the globe (three.js, ~1 MB) loads after the menu is on screen: heading, tagline and buttons paint first (perf: load order)
const MarsGlobe = lazy(() => import("@/globe/MarsGlobe").then((m) => ({ default: m.MarsGlobe })));

interface MenuItem {
  id: string;
  label: string;
  sublabel: string;
  action: () => void;
}

export function StartMenu() {
  const navigate = useNavigate();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // the globe mounts after the menu has been painted: creating its WebGL context blocks the page for a moment, and the
  // heading and buttons should not wait for that
  const [globeReady, setGlobeReady] = useState(false);
  useEffect(() => {
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setGlobeReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exitNotice, setExitNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Interactive background globe: live cursor coordinates, click any point, click an expedition label
  const [sites, setSites] = useState<LandingSite[]>(DEFAULT_LANDING_SITES);
  const [hover, setHover] = useState<{ lat: number; lon: number } | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; nonce: number } | null>(null);
  const focusNonce = useRef(0);
  const [descent, setDescent] = useState<LandingSite | null>(null);
  const [viewCenter, setViewCenter] = useState<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLandingSites()
      .then((s) => alive && setSites(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;
  const target: GlobeTarget | null = picked
    ? { title: "Picked point", subtitle: "Surface point", lat: picked.lat, lon: picked.lon }
    : selectedSite
      ? { title: selectedSite.name, subtitle: selectedSite.mission, lat: selectedSite.lat, lon: selectedSite.lon }
      : null;

  const isPwa =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-expect-error navigator standalone is iOS Safari PWA flag
      window.navigator.standalone === true);

  const handleStartSimulation = () => {
    startTransition(() => {
      navigate("/globe");
    });
  };

  const handleExit = () => {
    if (isPwa) {
      window.close();
    } else {
      setExitNotice("In browser mode, tabs cannot be closed programmatically. Redirecting to About...");
      setTimeout(() => {
        startTransition(() => {
          navigate("/about");
        });
      }, 1200);
    }
  };

  const menuItems: MenuItem[] = [
    {
      id: "start",
      label: "Start Simulation",
      sublabel: "Gale Crater & Lower Mount Sharp EVA",
      action: handleStartSimulation,
    },
    {
      id: "settings",
      label: "Settings",
      sublabel: "Units, display, accessibility",
      action: () => setSettingsOpen(true),
    },
    {
      id: "about",
      label: "About / Methods",
      sublabel: "Mission math, data layers, F01-F53",
      action: () => {
        startTransition(() => {
          navigate("/methods");
        });
      },
    },
    {
      id: "exit",
      label: "Exit",
      sublabel: isPwa ? "Close application" : "Return to project info",
      action: handleExit,
    },
  ];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (settingsOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % menuItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          menuItems[selectedIndex]?.action();
          break;
        case "Escape":
          e.preventDefault();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, settingsOpen, menuItems]);

  const itemIcon = (id: string) =>
    id === "start" ? <PlayIcon size={18} /> : id === "settings" ? <SettingsIcon size={18} /> : id === "about" ? <InfoIcon size={18} /> : <ExitIcon size={18} />;

  return (
    <div className="start">
      {/* Background: the interactive globe */}
      <div className="start__globe">
        {globeReady && (
        <Suspense fallback={null}>
        <MarsGlobe
          interactive
          autoRotate
          landingSites={sites}
          pickedPoint={picked}
          focusPoint={focus}
          onHover={setHover}
          onViewCenter={setViewCenter}
          onPick={(p) => {
            setPicked(p);
            setSelectedSiteId(null);
          }}
          onSiteSelect={(id) => {
            const s = sites.find((x) => x.id === id);
            if (s) setDescent(s);
          }}
          aoi={descent ? { lat: descent.lat, lon: descent.lon } : undefined}
          flyIn={!!descent}
          onFlyInComplete={() => descent && navigate(`/site/${descent.id}`)}
        />
        </Suspense>
        )}
      </div>
      <div className="start__veil" aria-hidden="true" />

      <header className="start__header">
        <div>
          <div className="start__eyebrow">
            <i aria-hidden="true" />
            NASA Space Apps 2026 · Challenge
          </div>
          <h1 className="start__title">DATUM-4</h1>
          <div className="start__tagline">Surface navigation & EVA planning · Gale Crater</div>
        </div>

        <div className="start__chip">
          <span translate="no" data-testid="start-chip">
            {hover
              ? `CURSOR ${formatLatLon(hover.lat, hover.lon, 3)}`
              : viewCenter
                ? `VIEW CENTRE ${formatLatLon(viewCenter.lat, viewCenter.lon, 2)}`
                : "Mars"}
          </span>
        </div>
      </header>

      <main className="start__main">
        <div ref={menuContainerRef} role="menu" aria-label="Main menu" className="start__menu">
          {menuItems.map((item, index) => (
            <button
              key={item.id}
              role="menuitem"
              tabIndex={0}
              onClick={item.action}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`start__item${selectedIndex === index ? " is-sel" : ""}`}
              style={{ "--i": index } as React.CSSProperties}
            >
              <span className="start__icon">{itemIcon(item.id)}</span>
              <span>
                <span className="start__label">{item.label}</span>
                <span className="start__sub">{item.sublabel}</span>
              </span>
            </button>
          ))}
        </div>

        {exitNotice && <div className="start__notice">{exitNotice}</div>}
      </main>

      <footer className="start__footer">
        <div className="start__keys">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>Enter</kbd> Select
          </span>
        </div>
        <span className="start__version">DATUM-4 v1.0 · PWA Ready</span>
      </footer>

      {settingsOpen && (
        <div role="dialog" aria-label="Settings modal" className="start__scrim" onClick={() => setSettingsOpen(false)}>
          <div className="start__dialog" onClick={(e) => e.stopPropagation()}>
            <div className="start__dialog-head">
              <h2>Settings</h2>
              <button className="start__close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <span className="start__field">Units</span>
                <div className="start__segment">
                  <button aria-pressed={settings.units === "metric"} onClick={() => updateSettings({ units: "metric" })}>
                    Metric (m, km, °C)
                  </button>
                  <button aria-pressed={settings.units === "imperial"} onClick={() => updateSettings({ units: "imperial" })}>
                    Imperial (ft, mi, °F)
                  </button>
                </div>
              </div>

              <div>
                <span className="start__field">Reduced Motion</span>
                <label className="start__check">
                  <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                  />
                  Disable fast map fly-to animations
                </label>
              </div>

              <div className="start__dialog-foot">
                <button className="start__done" onClick={() => setSettingsOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <GlobeReadout
        hover={hover}
        target={target}
        onOpen={() => navigate("/globe")}
        onClear={() => {
          setPicked(null);
          setSelectedSiteId(null);
        }}
      />
    </div>
  );
}
