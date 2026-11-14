import { useState, useEffect, useRef, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../state/store";
import { MarsGlobe } from "@/globe/MarsGlobe";

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

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exitNotice, setExitNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const menuContainerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "var(--color-bg, #080C10)",
        color: "var(--color-text, #E6EDF3)",
        fontFamily: "var(--font-ui, system-ui, sans-serif)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Background: W7 MarsGlobe or Starfield fallback */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
          pointerEvents: "auto",
        }}
      >
        <MarsGlobe interactive autoRotate />
      </div>

      {/* Header overlay */}
      <header
        style={{
          position: "relative",
          zIndex: 10,
          padding: "32px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(180deg, rgba(8,12,16,0.8) 0%, transparent 100%)",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              letterSpacing: "3px",
              color: "var(--color-accent, #56B4E9)",
              textTransform: "uppercase",
              marginBottom: "4px",
            }}
          >
            NASA Space Apps 2026 · Challenge
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              fontWeight: 800,
              letterSpacing: "-1px",
              background: "linear-gradient(135deg, #FFFFFF 30%, #56B4E9 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            AreoNav
          </h1>
          <div
            style={{
              fontFamily: "var(--font-ui, sans-serif)",
              fontSize: "14px",
              color: "#8B949E",
              marginTop: "4px",
            }}
          >
            Hyperlocal Surface Navigation & Mission Planner · Gale Crater
          </div>
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "12px",
            background: "rgba(22, 27, 34, 0.75)",
            backdropFilter: "blur(8px)",
            padding: "8px 16px",
            borderRadius: "var(--radius-lg, 8px)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#8B949E",
          }}
        >
          AOI: -4.72° S, 137.40° E · Gale
        </div>
      </header>

      {/* Main Menu Box */}
      <main
        style={{
          position: "relative",
          zIndex: 10,
          padding: "0 48px",
          maxWidth: "460px",
          marginBottom: "auto",
          marginTop: "40px",
        }}
      >
        <div
          ref={menuContainerRef}
          role="menu"
          aria-label="Main menu"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {menuItems.map((item, index) => {
            const isSelected = selectedIndex === index;
            return (
              <button
                key={item.id}
                role="menuitem"
                tabIndex={0}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  textAlign: "left",
                  padding: "16px 20px",
                  borderRadius: "var(--radius-lg, 12px)",
                  background: isSelected
                    ? "linear-gradient(90deg, rgba(86, 180, 233, 0.25) 0%, rgba(22, 27, 34, 0.85) 100%)"
                    : "rgba(16, 24, 38, 0.65)",
                  backdropFilter: "blur(12px)",
                  border: isSelected
                    ? "1px solid var(--color-accent, #56B4E9)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: isSelected
                    ? "0 4px 20px rgba(86, 180, 233, 0.2)"
                    : "none",
                  cursor: "pointer",
                  color: "#FFFFFF",
                  transition: "all 0.15s ease",
                  outline: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: isSelected ? "var(--color-accent, #56B4E9)" : "transparent",
                      boxShadow: isSelected ? "0 0 8px #56B4E9" : "none",
                      transition: "all 0.15s ease",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      letterSpacing: "0.2px",
                      color: isSelected ? "#FFFFFF" : "#E6EDF3",
                    }}
                  >
                    {item.label}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#8B949E",
                    marginTop: "4px",
                    marginLeft: "16px",
                  }}
                >
                  {item.sublabel}
                </div>
              </button>
            );
          })}
        </div>

        {exitNotice && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              background: "rgba(227, 179, 65, 0.15)",
              border: "1px solid #E3B341",
              borderRadius: "8px",
              color: "#F0883E",
              fontSize: "13px",
            }}
          >
            {exitNotice}
          </div>
        )}
      </main>

      {/* Footer / Keyboard hints */}
      <footer
        style={{
          position: "relative",
          zIndex: 10,
          padding: "24px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: "#6E7681",
          fontFamily: "var(--font-mono, monospace)",
          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
          background: "rgba(8, 12, 16, 0.75)",
        }}
      >
        <div style={{ display: "flex", gap: "16px" }}>
          <span><kbd style={{ background: "#21262D", padding: "2px 6px", borderRadius: "4px" }}>↑</kbd> <kbd style={{ background: "#21262D", padding: "2px 6px", borderRadius: "4px" }}>↓</kbd> Navigate</span>
          <span><kbd style={{ background: "#21262D", padding: "2px 6px", borderRadius: "4px" }}>Enter</kbd> Select</span>
        </div>
        <div>
          <span>AreoNav v1.0 · PWA Ready</span>
        </div>
      </footer>

      {/* Settings Modal */}
      {settingsOpen && (
        <div
          role="dialog"
          aria-label="Settings modal"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            style={{
              background: "var(--color-surface, #161B22)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "var(--radius-lg, 16px)",
              padding: "32px",
              width: "min(440px, 90vw)",
              color: "#E6EDF3",
              boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0, fontSize: "20px" }}>Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#8B949E",
                  cursor: "pointer",
                  fontSize: "18px",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
                  Units
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => updateSettings({ units: "metric" })}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: settings.units === "metric" ? "var(--color-accent, #56B4E9)" : "#21262D",
                      color: settings.units === "metric" ? "#080C10" : "#E6EDF3",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Metric (m, km, °C)
                  </button>
                  <button
                    onClick={() => updateSettings({ units: "imperial" })}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: settings.units === "imperial" ? "var(--color-accent, #56B4E9)" : "#21262D",
                      color: settings.units === "imperial" ? "#080C10" : "#E6EDF3",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Imperial (ft, mi, °F)
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
                  Reduced Motion
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", color: "#8B949E" }}>
                  <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                    style={{ cursor: "pointer", width: "18px", height: "18px" }}
                  />
                  Disable fast map fly-to animations
                </label>
              </div>

              <div style={{ marginTop: "12px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setSettingsOpen(false)}
                  style={{
                    padding: "8px 20px",
                    background: "#238636",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
