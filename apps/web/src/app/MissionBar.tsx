import { useEffect, useState, useRef } from "react";
import { apiClient, type SiteClock } from "../api/client";
import { useAppStore } from "../state/store";
import { Badge } from "../ui/Badge";
import { PlanetIcon } from "../icons";
import { computeMissionBarLayout, seasonName, type StatId } from "./missionBarLayout";
import { useElementWidth } from "./useElementWidth";
import "./MissionBar.css";

export function formatEarthLinkDelay(seconds: number): string {
  if (seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export function formatLmst(lmstHours: number): string {
  const normalized = ((lmstHours % 24) + 24) % 24;
  const h = Math.floor(normalized);
  const m = Math.floor((normalized * 60) % 60);
  const s = Math.floor((normalized * 3600) % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type Tone = "normal" | "ok" | "warning";

interface Stat {
  id: StatId;
  label: string;
  value: string;
  /** Long form for the tooltip and the accessible name. */
  detail: string;
  tone: Tone;
}

function MissionStat({ stat }: { stat: Stat }) {
  return (
    <div
      className={`mission-stat mission-stat--${stat.tone}`}
      role="group"
      aria-label={`${stat.label}: ${stat.value}`}
      title={`${stat.detail}: ${stat.value}`}
      data-stat={stat.id}
    >
      <span className="mission-stat__label">{stat.label}</span>
      <span className="mission-stat__value u-num">{stat.value}</span>
    </div>
  );
}

export function MissionBar() {
  const siteId = useAppStore((s) => s.siteId);
  const utc = useAppStore((s) => s.utc);

  const [clock, setClock] = useState<SiteClock | null>(null);
  const [currentLmstH, setCurrentLmstH] = useState<number | null>(null);
  const lastSyncRef = useRef<number>(Date.now());
  const [barRef, width] = useElementWidth<HTMLElement>();
  const layout = computeMissionBarLayout(width);

  // Initial and periodic (every 30s) API clock sync
  useEffect(() => {
    let active = true;

    async function syncClock() {
      try {
        const data = await apiClient.getSiteClock(siteId, utc);
        if (active) {
          setClock(data);
          setCurrentLmstH(data.lmst_h);
          lastSyncRef.current = Date.now();
        }
      } catch (err) {
        console.warn("Clock sync failed, using fallback:", err);
      }
    }

    syncClock();
    const interval = setInterval(syncClock, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [siteId, utc]);

  // Local second-by-second LMST ticking
  useEffect(() => {
    if (clock === null) return;

    // 1 Mars second ≈ 1.02749125 Earth seconds; in hours: 1s earth ≈ (24 / 88775.244) hours
    const marsHoursPerEarthSecond = 24 / 88775.244;

    const timer = setInterval(() => {
      setCurrentLmstH((prev) => {
        if (prev === null) return null;
        return (prev + marsHoursPerEarthSecond) % 24;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [clock]);

  const all: Record<StatId, Stat> = {
    sol: {
      id: "sol",
      label: "Mission",
      value: clock ? `SOL ${clock.mission_sol}` : "SOL ---",
      detail: "Mission sol (local mean solar days since landing)",
      tone: "normal",
    },
    lmst: {
      id: "lmst",
      label: "LMST",
      value: currentLmstH !== null ? formatLmst(currentLmstH) : "--:--:--",
      detail: "Local mean solar time at the site (Mars24)",
      tone: "ok",
    },
    link: {
      id: "link",
      label: "Earth link",
      value: clock ? formatEarthLinkDelay(clock.earth_link_one_way_s) : "--m --s",
      detail: `One-way light time to Earth${clock?.earth_link_accuracy === "approximate" ? " (approximate orbit)" : ""}`,
      tone: clock && clock.earth_link_one_way_s > 900 ? "warning" : "normal",
    },
    ls: {
      id: "ls",
      label: "Season",
      value: clock ? `Ls ${clock.ls_deg.toFixed(1)}°` : "Ls --°",
      detail: clock ? `Solar longitude, ${seasonName(clock.ls_deg)}` : "Solar longitude",
      tone: "normal",
    },
  };

  return (
    <header className="mission-bar" ref={barRef} role="banner" aria-label="Mission status bar">
      {layout.showSiteName && (
        <div className="mission-bar__site">
          <PlanetIcon size={18} className="mission-bar__site-icon" />
          <span className="mission-bar__site-name">Gale Crater · Mt. Sharp</span>
          {layout.showBadge && (
            <Badge variant="LIVE" size="sm">
              SURFACE EVA
            </Badge>
          )}
        </div>
      )}

      <div className="mission-bar__stats">
        {layout.stats.map((id) => (
          <MissionStat key={id} stat={all[id]} />
        ))}
      </div>
    </header>
  );
}
