"""Probe the USGS MSL Gale 25 cm Orthophoto mosaic.

Prints size, resolution, CRS, dtype, bands, block shape, overviews,
AOI window size in source pixels, and estimated transfer size.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import aoi_grid, gdal_env

SOURCE_ORTHO = "https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif"


def env() -> dict[str, str]:
    return {
        "CPL_VSIL_CURL_CHUNK_SIZE": "65536",
        "CPL_VSIL_CURL_CACHE_SIZE": "16777216",
        "GDAL_HTTP_MAX_RETRY": "6",
        "GDAL_HTTP_RETRY_DELAY": "3",
        "GDAL_HTTP_MULTIRANGE": "YES",
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    }


def probe_orthophoto() -> dict[str, object]:
    tr2, w2, h2, proj = aoi_grid(2.0)
    left, top = tr2.c, tr2.f
    right, bottom = left + w2 * 2.0, top - h2 * 2.0

    with rasterio.Env(**env()), rasterio.open("/vsicurl/" + SOURCE_ORTHO) as src:
        width = src.width
        height = src.height
        res = src.res
        crs = str(src.crs)
        dtypes = src.dtypes
        count = src.count
        block_shapes = src.block_shapes
        nodata = src.nodata

        # Overviews for band 1
        try:
            overviews = src.overviews(1)
        except Exception:
            overviews = []

        # AOI window in source coordinates
        sb = transform_bounds(CRS.from_proj4(proj), src.crs, left, bottom, right, top, densify_pts=21)
        pad = 60.0
        win = from_bounds(sb[0] - pad, sb[1] - pad, sb[2] + pad, sb[3] + pad, src.transform).round_offsets().round_lengths()

        win_col0 = max(0, int(win.col_off))
        win_row0 = max(0, int(win.row_off))
        win_ncols = min(width - win_col0, int(win.width))
        win_nrows = min(height - win_row0, int(win.height))

        # Check block type: strip (height 1 or small, width == src.width) or tiled
        b_h, b_w = block_shapes[0] if block_shapes else (1, width)
        is_tiled = b_w < width and b_h > 1

        # Calculate estimated transfer:
        # If overviews exist:
        has_2m_overview = 8 in overviews
        if has_2m_overview:
            # Factor 8: decimation by 8 in each dimension
            ov_cols = math.ceil(win_ncols / 8)
            ov_rows = math.ceil(win_nrows / 8)
            # 1 byte per pixel for uint8
            raw_bytes = ov_cols * ov_rows * count
            est_transfer_mb = raw_bytes / (1024 * 1024)
            strategy = f"Internal overview factor 8 (~2 m/pixel, {ov_cols}x{ov_rows} px)"
        else:
            # Without overview: reading full res window and aggregating
            raw_bytes = win_ncols * win_nrows * count
            # Strips compress to ~60-70% if DEFLATE or JPEG
            est_transfer_mb = (raw_bytes * 0.7) / (1024 * 1024)
            strategy = f"Full-res window with block aggregation ({win_ncols}x{win_nrows} px)"

    info = {
        "url": SOURCE_ORTHO,
        "width": width,
        "height": height,
        "res": res,
        "crs": crs,
        "dtypes": dtypes,
        "count": count,
        "block_shapes": block_shapes,
        "is_tiled": is_tiled,
        "nodata": nodata,
        "overviews": overviews,
        "aoi_window": {
            "col0": win_col0,
            "row0": win_row0,
            "ncols": win_ncols,
            "nrows": win_nrows,
        },
        "has_2m_overview": has_2m_overview,
        "strategy": strategy,
        "est_transfer_mb": est_transfer_mb,
    }
    return info


def main() -> None:
    print("=== PROBING USGS MSL GALE 25 CM ORTHOPHOTO MOSAIC ===")
    info = probe_orthophoto()

    print(f"URL:          {info['url']}")
    print(f"Dimensions:   {info['width']} x {info['height']} pixels")
    print(f"Resolution:   {info['res']} (dx, dy)")
    print(f"CRS:          {info['crs']}")
    print(f"Data types:   {info['dtypes']}")
    print(f"Bands:        {info['count']}")
    b_h, b_w = info['block_shapes'][0] if info['block_shapes'] else ('?', '?')
    block_type = "Tiled" if info['is_tiled'] else "Strip-organized"
    print(f"Block shape:  {block_type} ({b_w} x {b_h})")
    print(f"Overviews:    {info['overviews']}")
    print(f"NoData:       {info['nodata']}")

    win = info['aoi_window']
    print(f"\nAOI Window (25 cm source):")
    print(f"  Col range:  {win['col0']} .. {win['col0'] + win['ncols']} ({win['ncols']} columns)")
    print(f"  Row range:  {win['row0']} .. {win['row0'] + win['nrows']} ({win['nrows']} rows)")
    print(f"  Pixels:     {win['ncols'] * win['nrows']:,} px")

    print(f"\nFetch Strategy:")
    print(f"  Plan:       {info['strategy']}")
    print(f"  Est. Size:  {info['est_transfer_mb']:.1f} MB ({info['est_transfer_mb'] / 1024:.2f} GB)")

    if info['est_transfer_mb'] > 2048.0:
        print(f"\n[POLICY TRIGGER] Estimated transfer ({info['est_transfer_mb'] / 1024:.2f} GB) exceeds 2.0 GB policy limit.")
        print("STOPPING download per Decision D-14 / Hard Rules. Recommend bounded corridor download covering the Curiosity traverse.")
    else:
        print(f"\n[OK] Transfer estimate is within policy (< 2.0 GB).")


if __name__ == "__main__":
    main()
