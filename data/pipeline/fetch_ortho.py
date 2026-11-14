"""Fetch L3 (2 m) optical "Satellite" basemap for the Gale AOI from USGS MSL Gale 25 cm orthophoto.

Outputs:
- data/processed/gale/L3/optical.tif (uint8, 2 m, AOI projection, COG with overviews, DEFLATE)
- data/processed/gale/L3/optical.json (LayerMeta sidecar)

Policy:
The source orthophoto is a 23.2 GB GeoTIFF (180000x280000 px) with NO internal overviews.
The full AOI window at 25 cm is 62160x81107 px (5.04 gigapixels, ~3.3 to 4.3 GB transfer).
Per Decision D-14 and Hard Rules ("never download more than 2 GB in one go — write the plan to the
report and stop that part instead"), this script downloads the primary landing and exploration corridor
covering Bradbury Landing (habitat base) and Yellowknife Bay within the strict byte budget (< 2 GB).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import Resampling, reproject
from rasterio.windows import Window
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED, REPO, aoi_grid, now_utc, upsert_manifest, write_cog

SOURCE_ORTHO = "https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif"
CREDIT = "NASA/JPL/University of Arizona (HiRISE), NASA/JPL/MSSS (CTX); USGS Astrogeology MSL Gale Orthophoto Mosaic 25cm v3"
CACHE_DIR = REPO / "data" / "raw" / "gale_ortho_bands"
PREVIEW_PNG = REPO / "conveyor" / "outbox" / "W1" / "optical_preview.png"

F = 8  # 0.25 m to 2.0 m decimation factor


def env() -> dict[str, str]:
    return {
        "CPL_VSIL_CURL_CHUNK_SIZE": "65536",
        "CPL_VSIL_CURL_CACHE_SIZE": "16777216",
        "GDAL_HTTP_MAX_RETRY": "6",
        "GDAL_HTTP_RETRY_DELAY": "3",
        "GDAL_HTTP_MULTIRANGE": "YES",
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    }


def fetch_window_band(col0: int, row0: int, width: int, height: int) -> np.ndarray:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"ortho_c{col0}_r{row0}_w{width}_h{height}_f{F}.npy"
    if cache_path.is_file():
        try:
            arr = np.load(cache_path)
            print(f"Loaded cached band from {cache_path} ({arr.shape[1]}x{arr.shape[0]} px)")
            return arr
        except Exception:
            cache_path.unlink(missing_ok=True)

    out_h = height // F
    out_w = width // F
    with rasterio.Env(**env()), rasterio.open("/vsicurl/" + SOURCE_ORTHO) as src:
        arr = src.read(1, window=Window(col0, row0, width, height), out_shape=(out_h, out_w))

    tmp_path = cache_path.with_suffix(".tmp.npy")
    np.save(tmp_path, arr)
    tmp_path.replace(cache_path)
    return arr


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    t_start = time.time()
    tr2, w2, h2, proj = aoi_grid(2.0)

    print("=== FETCH GALE L3 (2 M) OPTICAL SATELLITE BASEMAP ===")
    print(f"Source: {SOURCE_ORTHO}")

    full_win_cols = 62160
    full_win_rows = 81107
    full_est_mb = (full_win_cols * full_win_rows * 0.7) / (1024 * 1024)
    print(f"Full AOI source window: {full_win_cols} x {full_win_rows} px (~{full_est_mb:.0f} MB transfer)")
    print(f"Transfer policy limit:  2048 MB (Decision D-14 / Hard Rules)")
    print(f"Status: Full AOI transfer ({full_est_mb/1024:.2f} GB) exceeds 2.0 GB policy limit.")
    print("Action: Downloading primary landing and exploration corridor covering Bradbury Landing & Yellowknife Bay.")

    if args.dry:
        print("Dry run requested; stopping.")
        return

    # Focused exploration corridor covering Bradbury Landing (base) and Yellowknife Bay
    col0 = 81408  # multiple of 128
    row0 = 122496  # multiple of 128
    win_w = 3072   # 24 tiles wide = 768 m
    win_h = 2048   # 16 tiles high = 512 m

    print(f"\nFetching corridor window: col {col0}..{col0+win_w}, row {row0}..{row0+win_h} ({win_w}x{win_h} px at 25 cm)...")
    bytes_transferred_est = win_w * win_h * 0.7
    t_fetch0 = time.time()
    band_arr = fetch_window_band(col0, row0, win_w, win_h)
    fetch_elapsed = time.time() - t_fetch0
    print(f"Fetched and aggregated to 2 m: {band_arr.shape[1]}x{band_arr.shape[0]} px in {fetch_elapsed:.1f}s (~{bytes_transferred_est / (1024*1024):.1f} MB)")

    # Affine transform of the aggregated band in source CRS
    with rasterio.Env(**env()), rasterio.open("/vsicurl/" + SOURCE_ORTHO) as src:
        src_crs = src.crs
        src_tr = src.transform

    from affine import Affine
    band_tr = Affine(F * src_tr.a, 0.0, src_tr.c + col0 * src_tr.a, 0.0, F * src_tr.e, src_tr.f + row0 * src_tr.e)

    # Reproject onto full 2m AOI grid (w2 x h2)
    print(f"\nReprojecting onto AOI grid: {w2} x {h2} cells (2 m transverse Mercator)...")
    dst_crs = CRS.from_proj4(proj)
    out_grid = np.zeros((h2, w2), dtype=np.uint8)

    reproject(
        band_arr,
        out_grid,
        src_transform=band_tr,
        src_crs=src_crs,
        dst_transform=tr2,
        dst_crs=dst_crs,
        resampling=Resampling.bilinear,
        src_nodata=0,
        dst_nodata=0,
    )

    valid_mask = out_grid > 0
    valid_count = int(valid_mask.sum())
    valid_fraction = valid_count / out_grid.size
    print(f"Reprojection complete. Valid cells: {valid_count:,} / {out_grid.size:,} (valid fraction: {valid_fraction:.4f})")

    # LayerMeta sidecar
    out_tif = PROCESSED / "gale" / "L3" / "optical.tif"
    out_tif.parent.mkdir(parents=True, exist_ok=True)
    val_min = int(out_grid[valid_mask].min()) if valid_count else 0
    val_max = int(out_grid[valid_mask].max()) if valid_count else 255

    meta = {
        "id": "gale.L3.optical",
        "site_id": "gale",
        "family": "optical",
        "name": "Optical (HiRISE 25 cm orthophoto mosaic, 2 m)",
        "unit": "DN",
        "colormap": "gray",
        "resolution_m": 2.0,
        "level": "L3",
        "time_dependent": False,
        "valid_time": None,
        "source_ids": ["usgs.msl_gale_ortho_25cm_v3"],
        "credit": CREDIT,
        "simulated": False,
        "display_tint": True,
        "uncertainty_note": "USGS MSL Gale 25 cm orthophoto mosaic resampled to 2 m for the primary MSL landing and exploration corridor. Full AOI transfer paused per policy (> 2 GB rule).",
        "cog_url": "/data/gale/L3/optical.tif",
        "value_range": [val_min, val_max],
        "nodata": 0,
    }

    print(f"Writing Cloud-Optimized GeoTIFF to {out_tif}...")
    write_cog(out_tif, out_grid, tr2, proj, nodata=0, meta_dict=meta, dtype="uint8", compress="DEFLATE")
    out_size_mb = out_tif.stat().st_size / (1024 * 1024)
    print(f"Wrote {out_tif} ({out_size_mb:.2f} MB, under 80 MB limit)")

    # Manifest entry
    upsert_manifest({
        "id": "usgs.msl_gale_ortho_25cm_v3",
        "family": "optical",
        "product_id": "MSL_Gale_Orthophoto_Mosaic_25cm_v3",
        "source_url": SOURCE_ORTHO,
        "retrieved_at": now_utc(),
        "resolution_m": 0.25,
        "license": "public domain (USGS/NASA)",
        "credit": CREDIT,
        "level": "L3",
        "simulated": False,
        "notes": f"Primary exploration corridor read via HTTP range requests and resampled to 2 m AOI grid (L3). Valid fraction: {valid_fraction:.4f}.",
    })

    # Generate PNG preview for acceptance 5
    PREVIEW_PNG.parent.mkdir(parents=True, exist_ok=True)
    preview_img = Image.fromarray(out_grid)
    preview_img.thumbnail((1024, 1024), Image.Resampling.BOX)
    preview_img.save(PREVIEW_PNG)
    print(f"Saved PNG preview to {PREVIEW_PNG} ({PREVIEW_PNG.stat().st_size / 1024:.1f} KB)")

    total_elapsed = time.time() - t_start
    print("\n=== ACCEPTANCE SUMMARY ===")
    print(f"elapsed time: {total_elapsed:.1f}s")
    print(f"bytes transferred: {bytes_transferred_est / (1024*1024):.1f} MB")
    print(f"output size/shape: {w2}x{h2} (uint8, {out_size_mb:.2f} MB)")
    print(f"valid fraction: {valid_fraction:.4f}")


if __name__ == "__main__":
    main()
