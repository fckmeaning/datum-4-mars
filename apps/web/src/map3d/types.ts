/**
 * types.ts - Shared 3D types and store interfaces for Lane W7.
 */

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
   * URL to elevation COG raster (defaults to /data/gale/L1/elevation.tif).
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
}
