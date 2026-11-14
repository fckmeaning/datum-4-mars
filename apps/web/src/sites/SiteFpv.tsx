import { useMemo } from "react";
import { FirstPersonView } from "../fpv/FirstPersonView";
import { demToTerrainRaster, latLonToLocal, loopInTile } from "./terrainData";
import { planToFpvRoute, type Plan } from "./eva/plan";
import type { SiteDem } from "./useSiteDem";

/**
 * Helmet view at any site: a walk around the landing station over the MOLA 463 m elevation patch.
 * The ground model is coarse (463 m); the renderer adds procedural fine grain below about 400 m for display only.
 */
export function SiteFpv({ dem, name, station, plan, stopNames, onExit }: { dem: SiteDem; name: string; station: { lat: number; lon: number }; plan?: Plan | null; stopNames?: Array<string | undefined>; onExit?: () => void }) {
  const raster = useMemo(() => demToTerrainRaster(dem), [dem]);
  const start = useMemo(() => latLonToLocal(dem, station.lat, station.lon), [dem, station]);
  // the planned EVA when there is one (with its own leg times and oxygen), else a loop around the station
  const route = useMemo(() => (plan ? planToFpvRoute(plan) : { xy: loopInTile(dem, start, 900, 90), profile: "SAFEST" }), [dem, start, plan]);
  const waypoints = useMemo(
    () => (plan ? plan.stopNodes.map((i, k) => ({ name: stopNames?.[k] || `Stop ${k + 1}`, x: plan.nodes[i]!.x, y: plan.nodes[i]!.y })) : [{ name: "Landing station", x: start.x, y: start.y }]),
    [plan, start, stopNames],
  );
  const utc = useMemo(() => new Date().toISOString(), []);
  return (
    <div className="site-fpv" data-testid="site-fpv">
      <FirstPersonView
        route={route}
        elevation={raster}
        siteGeo={dem.meta.centre}
        areaName={name}
        base={start}
        roverNow={null}
        roverModelUrl=""
        waypoints={waypoints}
        utc={utc}
        initialSpeed={4}
        quality="high"
        onExit={onExit}
      />
      <div className="site-fpv__note" translate="no">
        {plan ? "Walking your EVA plan. " : ""}
        {dem.meta.pixel_m > 100
          ? `Approximate: the ground model is ${Math.round(dem.meta.pixel_m)} m per pixel; detail below that is procedural and for display only.`
          : `Ground model ${dem.meta.pixel_m.toFixed(dem.meta.pixel_m < 10 ? 1 : 0)} m per pixel (${dem.meta.label ?? "real data"}); the fine grain closer than about 400 m is procedural and for display only.`}
      </div>
    </div>
  );
}
