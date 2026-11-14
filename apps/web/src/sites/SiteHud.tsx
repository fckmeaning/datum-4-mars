import { useEffect, useState } from "react";
import { AccentSwitch } from "../app/AccentSwitch";
import { TourButton } from "../app/TourButton";
import { RecButton, SoundButton } from "../app/MediaButtons";
import { fetchMissionClock, formatHours, formatLight, type MissionClock } from "./missionClock";

/** The clock of the mission at the landing station, refreshed every minute; null while the API cannot be reached. */
export function useMissionClock(siteId: string, station: { lat: number; lon: number }): MissionClock | null {
  const [clock, setClock] = useState<MissionClock | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void fetchMissionClock(siteId, station, new Date()).then((c) => alive && setClock(c));
    setClock(null);
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [siteId, station.lat, station.lon]);
  return clock;
}

/** Mission sol, local Mars time, season and the one-way Earth link delay. */
export function SiteHud({ clock, siteName }: { clock: MissionClock | null; siteName: string }) {
  return (
    <div className="site-hud" translate="no" data-testid="site-hud" aria-label="Mission clock">
      <div>
        <i>MISSION SOL</i>
        <b>{clock ? (clock.sol === null ? "ended" : clock.sol.toLocaleString("en-US")) : "…"}</b>
      </div>
      <div>
        <i>LMST {siteName.split(" ")[0]?.toUpperCase()}</i>
        <b>{clock ? formatHours(clock.lmstH) : "…"}</b>
      </div>
      <div>
        <i>SEASON</i>
        <b>{clock ? `Ls ${Math.round(clock.lsDeg)}°` : "…"}</b>
      </div>
      <div>
        <i>EARTH LINK Δ</i>
        <b className="site-hud__link">{clock?.lightS ? formatLight(clock.lightS) : "…"}</b>
      </div>
      <TourButton />
      <SoundButton className="tour-btn" />
      <RecButton className="tour-btn" />
      <AccentSwitch />
    </div>
  );
}
