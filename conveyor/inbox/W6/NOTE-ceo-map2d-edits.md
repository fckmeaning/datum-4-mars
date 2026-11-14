NOTE from the CEO (2026-11-14): I edited `apps/web/src/map2d/Map2D.tsx` (raster section). Re-read the file before you edit it and do not revert these points:
1. GeoTIFF source: `normalize: false` and `nodata: -32768`. Without normalize:false OpenLayers rescales float elevations to 0..1 and every style expression collapses (black map).
2. OpenLayers colours are 0-255 for r,g,b (alpha 0-1). All colour ramps were written in 0-1 and rendered black; now fixed (constants ELEVATION_RAMP, slope stops, hillshade `["*", 255, intensity]`).
3. The elevation layer is now shaded relief (cividis tint x hillshade, sun NW 40 deg, exaggeration 3 for display only); hillshade north/south sign fixed (y offsets point down).
4. The init effect has `[]` deps, so `layers` was always empty and it always loaded the L1 fallback: a second effect `[layers]` now swaps the source of all three raster layers to the best level (L3) and updates the style variable `resM`.
5. Traverse line: solid with a dark casing instead of dashes; places layer `declutter: true`.
Keep the layerLevel.ts helpers; your T-602 can build on this.
