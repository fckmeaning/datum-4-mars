/**
 * lod.ts - Terrain Level-of-Detail (LOD) computation and overview selection.
 * Ensures the GPU terrain mesh never exceeds the 1,000,000 triangle performance ceiling.
 */

export interface LODConfig {
  segmentsX: number;
  segmentsZ: number;
  triangleCount: number;
  stepX: number;
  stepZ: number;
}

/**
 * Calculates optimal mesh grid subdivisions [segmentsX, segmentsZ] to balance visual
 * detail with rendering performance.
 *
 * @param gridWidth Number of raster columns (e.g. 78 for L1, 770 for L2, 1538 for L3)
 * @param gridHeight Number of raster rows (e.g. 102 for L1, 1008 for L2, 2016 for L3)
 * @param maxTriangles Maximum allowed triangle count (default: 800,000; strict limit <= 1M)
 */
export function selectTerrainLOD(
  gridWidth: number,
  gridHeight: number,
  maxTriangles = 800_000
): LODConfig {
  const fullTriangles = 2 * Math.max(1, gridWidth - 1) * Math.max(1, gridHeight - 1);

  if (fullTriangles <= maxTriangles) {
    const segmentsX = Math.max(1, gridWidth - 1);
    const segmentsZ = Math.max(1, gridHeight - 1);
    return {
      segmentsX,
      segmentsZ,
      triangleCount: 2 * segmentsX * segmentsZ,
      stepX: 1,
      stepZ: 1,
    };
  }

  // Decimation factor needed to stay under maxTriangles
  const ratio = Math.sqrt(fullTriangles / maxTriangles);
  const step = Math.max(1, Math.ceil(ratio));

  const segmentsX = Math.max(1, Math.floor((gridWidth - 1) / step));
  const segmentsZ = Math.max(1, Math.floor((gridHeight - 1) / step));
  const triangleCount = 2 * segmentsX * segmentsZ;

  return {
    segmentsX,
    segmentsZ,
    triangleCount,
    stepX: step,
    stepZ: step,
  };
}

/**
 * Selects the GeoTIFF overview pyramid level index based on camera distance.
 * @param overviewCount Number of overviews present in the COG
 * @param cameraDistance Altitude / distance from camera to center of terrain in meters
 */
export function selectOverviewIndex(
  overviewCount: number,
  cameraDistance: number,
  nearThreshold = 6000,
  farThreshold = 20000
): number {
  if (overviewCount <= 0) return 0;

  if (cameraDistance < nearThreshold) {
    // High detail for close-up inspection
    return 0;
  } else if (cameraDistance < farThreshold) {
    // Medium overview for regional viewing
    return Math.min(overviewCount - 1, 1);
  } else {
    // Coarsest overview for global/far context
    return overviewCount - 1;
  }
}
