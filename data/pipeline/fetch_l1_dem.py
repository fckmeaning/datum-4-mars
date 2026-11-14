"""L1 elevation for the Gale AOI from the USGS HRSC/MOLA blended global DEM (200 m), read as a remote window.

Usage:  .venv\\Scripts\\python.exe data\\pipeline\\fetch_l1_dem.py
Output: data/processed/gale/L1/elevation.tif (+ .json LayerMeta), manifest entry.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED, aoi_grid, gdal_env, now_utc, upsert_manifest, write_cog  # noqa: E402

SOURCE_URL = "https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif"
RES = 200.0
NODATA = -32768.0


def main() -> None:
    import rasterio
    from rasterio.warp import Resampling, reproject, transform_bounds
    from rasterio.windows import from_bounds

    dst_transform, width, height, proj = aoi_grid(RES)
    t0 = time.time()
    with rasterio.Env(**gdal_env()), rasterio.open("/vsicurl/" + SOURCE_URL) as src:
        print("source:", SOURCE_URL)
        print("source crs:", src.crs.to_proj4() if src.crs else None, "| res:", src.res, "| dtype:", src.dtypes[0],
              "| nodata:", src.nodata, "| scale/offset:", src.scales[0], src.offsets[0], "| units:", src.units)
        left, bottom = dst_transform.c, dst_transform.f - height * RES
        right, top = dst_transform.c + width * RES, dst_transform.f
        sb = transform_bounds(rasterio.crs.CRS.from_proj4(proj), src.crs, left, bottom, right, top, densify_pts=21)
        pad = 5 * src.res[0]
        win = from_bounds(sb[0] - pad, sb[1] - pad, sb[2] + pad, sb[3] + pad, src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win, masked=True).astype("float64")
        scale, offset = (src.scales[0] or 1.0), (src.offsets[0] or 0.0)
        data = data * scale + offset
        src_tr = src.window_transform(win)
        src_crs = src.crs
        print(f"window: {win} -> {data.shape}, read in {time.time() - t0:.1f}s")
    out = np.full((height, width), np.nan)
    reproject(data.filled(np.nan), out, src_transform=src_tr, src_crs=src_crs, dst_transform=dst_transform,
              dst_crs=rasterio.crs.CRS.from_proj4(proj), resampling=Resampling.bilinear, src_nodata=np.nan, dst_nodata=np.nan)
    path = PROCESSED / "gale" / "L1" / "elevation.tif"
    meta = {
        "id": "gale.L1.elevation", "site_id": "gale", "family": "topography", "name": "Elevation (HRSC/MOLA blend, 200 m)",
        "unit": "m", "colormap": "cividis", "resolution_m": RES, "level": "L1", "time_dependent": False, "valid_time": None,
        "source_ids": ["usgs.hrsc_mola_blend_200m_v2"], "credit": "NASA/JPL/GSFC (MOLA), ESA/DLR/FU Berlin (HRSC); USGS Astrogeology",
        "simulated": False, "display_tint": False, "uncertainty_note": "200 m posting: hazards smaller than ~200 m are not resolved.",
        "cog_url": "/data/gale/L1/elevation.tif",
    }
    write_cog(path, out, dst_transform, proj, NODATA, meta)
    upsert_manifest({"id": "usgs.hrsc_mola_blend_200m_v2", "family": "topography",
                     "product_id": "Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2", "source_url": SOURCE_URL,
                     "retrieved_at": now_utc(), "resolution_m": RES, "license": "public domain (USGS/NASA); HRSC ESA/DLR/FU Berlin [verify]",
                     "credit": meta["credit"], "level": "L1", "simulated": False,
                     "notes": "AOI window read via HTTP range requests and reprojected (bilinear) to the AOI transverse Mercator grid."})
    finite = out[np.isfinite(out)]
    print(f"output: {path} shape={out.shape} min={finite.min():.1f} max={finite.max():.1f} m "
          f"nodata_frac={1 - finite.size / out.size:.3f}")


if __name__ == "__main__":
    main()
