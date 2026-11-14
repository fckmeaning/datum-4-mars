"""Probe the metadata of the USGS MSL Gale merged DEM mosaics (no pixel data downloaded)."""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import gdal_env, projection  # noqa: E402

URLS = {
    "msl_1m_v3 (Mars/MSL path)": "https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif",
    "msl_1m_v3 (root path)": "https://planetarymaps.usgs.gov/mosaic/MSL_Gale_DEM_Mosaic_1m_v3.tif",
}


def main() -> None:
    import rasterio
    from rasterio.warp import transform_bounds

    p = projection()
    b = p["aoi"]["bbox_geo"]
    print("AOI bbox (lon/lat):", b["lon_min"], b["lat_min"], b["lon_max"], b["lat_max"])
    with rasterio.Env(**gdal_env()):
        for name, url in URLS.items():
            t0 = time.time()
            try:
                with rasterio.open("/vsicurl/" + url) as src:
                    print(f"\n== {name}\n  open {time.time() - t0:.1f}s | size {src.width}x{src.height} | res {src.res} | dtype {src.dtypes[0]} "
                          f"| nodata {src.nodata} | blocks {src.block_shapes[0]} | overviews {src.overviews(1)}")
                    print("  crs:", src.crs.to_proj4() if src.crs else None)
                    print("  bounds:", tuple(round(v, 1) for v in src.bounds))
                    if src.crs:
                        gb = transform_bounds(src.crs, rasterio.crs.CRS.from_proj4(p["proj_geographic"]), *src.bounds)
                        print("  bounds lon/lat:", tuple(round(v, 4) for v in gb))
                        covers = gb[0] <= b["lon_min"] and gb[2] >= b["lon_max"] and gb[1] <= b["lat_min"] and gb[3] >= b["lat_max"]
                        print("  covers the whole AOI:", covers)
                    print("  tags:", {k: v for k, v in list(src.tags().items())[:8]})
            except Exception as e:  # noqa: BLE001
                print(f"\n== {name}\n  FAILED after {time.time() - t0:.1f}s: {e}")


if __name__ == "__main__":
    main()
