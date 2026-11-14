/**
 * <TerrainArrival/> - the real 3D terrain scene (src/map3d/TerrainScene) as the descent's `terrainLayer`.
 *
 * It fills its parent and starts its own camera fly-to over Gale (about 800 m from the ground, zoomHint 5) when it mounts, which is
 * the low pass the director cross-fades into. TerrainScene is loaded lazily so that the start menu does not pay for it.
 *
 * LIMIT (map3d is not ours to edit): TerrainScene has its own OrbitControls camera and only accepts a flyTo target, so the exact
 * 600 m altitude and the look-along-the-traverse heading cannot be scripted from here. A `cameraPath` prop on TerrainScene would
 * close that gap; see the patch note in the CINEMATIC report.
 */

import { lazy, Suspense } from "react";

const TerrainScene = lazy(() => import("../map3d/TerrainScene").then((m) => ({ default: m.TerrainScene })));

export interface TerrainArrivalProps {
  aoi: { lat: number; lon: number };
  /** Elevation COG: the 20 m level loads fast (2 MB); L3 is 10 m (8 MB). */
  cogUrl?: string;
  nonce?: number;
}

export function TerrainArrival({ aoi, cogUrl = "/data/gale/L2/elevation.tif", nonce = 1 }: TerrainArrivalProps) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Suspense fallback={null}>
        <TerrainScene cogUrl={cogUrl} flyTo={{ target: aoi, zoomHint: 5, nonce }} showMarkers={false} showRouteTube={false} />
      </Suspense>
    </div>
  );
}
