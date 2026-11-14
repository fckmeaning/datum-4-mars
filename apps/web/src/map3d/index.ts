export { TerrainScene } from "./TerrainScene";
export {
  interpolateCameraPose,
  createLookAtPose,
  easeInOutCubic,
  type CameraPose,
  type FlyToOptions,
  type Vector3D,
} from "./flyTo";
export {
  sampleCividisRgb,
  createCividisLutTexture,
  sampleMagmaRgb,
  createMagmaLutTexture,
  getLayerLegend,
} from "./colormap";
export {
  selectTerrainLOD,
  selectOverviewIndex,
  type LODConfig,
} from "./lod";
export {
  sunAnglesToVector3,
  computeHillshade,
  computeApproximateMarsSun,
  fetchSunPosition,
} from "./sun";
export {
  getLimitingFactorColor,
  buildRouteTubeSegments,
  buildTraversePathPoints,
  type RouteSegment3D,
} from "./routeTube";
export {
  buildPlaceMarkers,
  buildWaypointMarkers,
  sampleTerrainNormal,
  getWaypointRoleColor,
  type Marker3DItem,
  type PlaceInput,
  type WaypointInput,
} from "./markers";
export { RoverModel, disposeGLTF, type RoverModelProps } from "./RoverModel";
export {
  geoToAoi,
  aoiToGeo,
  aoiToScene,
  sceneToAoi,
  PROJ_MARS_GEO,
  PROJ_GALE_AOI,
} from "./projection";
export {
  loadElevationCOG,
  loadBestElevationCOG,
  generateSyntheticGaleDEM,
  sampleTerrainElevation,
  createHeightDataTexture,
  DEFAULT_AOI_BBOX,
} from "./terrainLoader";
export type {
  TerrainSceneProps,
  TerrainRasterData,
  TerrainMetadata,
  AppStoreFlyTo,
} from "./types";
