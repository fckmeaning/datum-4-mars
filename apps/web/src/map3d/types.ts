/**
 * types.ts - Shared 3D types and store interfaces for Lane W7.
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface AppStoreFlyTo {
  target: {
    lat: number;
    lon: number;
  };
  zoomHint?: number;
  nonce?: number;
}

export interface TerrainMetadata {
  id: string;
  name: string;
  unit: string;
  resolution_m: number;
  value_range: [number, number]; // [minElevation, maxElevation] in meters
  nodata: number;
  cog_url: string;
}

export interface TerrainRasterData {
  width: number;
  height: number;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY] in AOI meters
  elevation: Float32Array;
  minElevation: number;
  maxElevation: number;
  nodata: number;
}

export interface TerrainSceneProps {
  /**
   * URL to elevation COG raster (defaults to /data/gale/L1/elevation.tif or L3 if available).
   */
  cogUrl?: string;
  /**
   * Vertical exaggeration factor (default: 2.0).
   */
  verticalExaggeration?: number;
  /**
   * FlyTo command payload (lat/lon target, zoomHint, nonce).
   */
  flyTo?: AppStoreFlyTo | null;
  /**
   * Callback fired when a flyTo camera animation completes.
   */
  onFlyToComplete?: () => void;
  /**
   * Pre-loaded terrain raster data if available (e.g. for offline/tests).
   */
  initialData?: TerrainRasterData;
  /**
   * Specific simulation UTC time to drive sun direction and shadows.
   */
  timeOfDay?: string;
  /**
   * Solar azimuth and elevation angles override.
   */
  sunAngles?: {
    azimuth_deg: number;
    elevation_deg: number;
  };
  /**
   * Elevation layer draping opacity in [0, 1] (default: 1.0).
   */
  elevationOpacity?: number;
  /**
   * Slope layer draping opacity in [0, 1] (default: 0.0 or from store).
   */
  slopeOpacity?: number;
  /**
   * Hillshade draping opacity in [0, 1] (default: 0.85).
   */
  hillshadeOpacity?: number;
  /**
   * Whether to render 3D route tube 1m above surface (default: true).
   */
  showRouteTube?: boolean;
  /**
   * Whether to display 3D waypoint and place markers (default: true).
   */
  showMarkers?: boolean;
  /**
   * Whether to display real Curiosity traverse track (default: true).
   */
  showTraverse?: boolean;
  /**
   * Callback reporting FPS and frame times.
   */
  onFpsUpdate?: (fps: number, frameTimeMs: number) => void;
}
