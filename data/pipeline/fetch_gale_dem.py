"""L2 (20 m) and L3 (10 m) elevation for the Gale AOI from the USGS MSL Gale merged 1 m DEM (HiRISE/CTX derived).

The source is a 3.7 GB strip-organised float32 GeoTIFF without overviews, so the AOI window is read in row bands by several
threads, area-averaged from 1 m to 10 m (NaN-aware), then reprojected onto the AOI transverse-Mercator grid.

Usage:  .venv\\Scripts\\python.exe data\\pipeline\\fetch_gale_dem.py [--dry] [--threads 6]
Output: data/processed/gale/L3/elevation.tif (10 m) and L2/elevation.tif (20 m) with LayerMeta sidecars, manifest entry.
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED, aoi_grid, gdal_env, now_utc, upsert_manifest, write_cog  # noqa: E402

SOURCE = "https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif"
F = 10  # source pixels (1 m) per aggregated cell (10 m)
BAND_ROWS = 2000
NODATA = -32768.0
CREDIT = "NASA/JPL/University of Arizona (HiRISE), NASA/JPL/MSSS (CTX); USGS Astrogeology MSL Gale merged DEM v3"


def env() -> dict[str, str]:
    e = gdal_env()
    e.update({"CPL_VSIL_CURL_CHUNK_SIZE": str(8 * 1024 * 1024), "CPL_VSIL_CURL_CACHE_SIZE": str(256 * 1024 * 1024),
              "GDAL_HTTP_MAX_RETRY": "6", "GDAL_HTTP_RETRY_DELAY": "3", "VSI_CACHE_SIZE": str(64 * 1024 * 1024)})
    return e


def aggregate(a: np.ndarray, f: int) -> np.ndarray:
    """NaN-aware block mean; blocks with fewer than half valid samples become NaN."""
    h, w = a.shape
    blk = a.reshape(h // f, f, w // f, f)
    ok = np.isfinite(blk)
    cnt = ok.sum(axis=(1, 3))
    s = np.where(ok, blk, 0.0).sum(axis=(1, 3), dtype=np.float64)
    out = np.where(cnt >= 0.5 * f * f, s / np.maximum(cnt, 1), np.nan)
    return out.astype("float32")


def read_band(url: str, col0: int, ncols: int, row: int, nrows: int) -> np.ndarray:
    import rasterio
    from rasterio.windows import Window

    last: Exception | None = None
    for attempt in range(3):
        try:
            with rasterio.Env(**env()), rasterio.open("/vsicurl/" + url) as src:
                a = src.read(1, window=Window(col0, row, ncols, nrows), out_dtype="float32")
            a[(a < -30000) | ~np.isfinite(a)] = np.nan
            return aggregate(a, F)
        except Exception as e:  # noqa: BLE001 - retry any transport error
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"band at row {row} failed after retries: {last}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--threads", type=int, default=6)
    args = ap.parse_args()

    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import Resampling, reproject, transform_bounds
    from rasterio.windows import from_bounds

    tr10, w10, h10, proj = aoi_grid(10.0)
    left, top = tr10.c, tr10.f
    right, bottom = left + w10 * 10.0, top - h10 * 10.0
    with rasterio.Env(**env()), rasterio.open("/vsicurl/" + SOURCE) as src:
        print("source:", SOURCE, "| size", src.width, "x", src.height, "| res", src.res, "| nodata", src.nodata)
        sb = transform_bounds(CRS.from_proj4(proj), src.crs, left, bottom, right, top, densify_pts=21)
        pad = 60.0
        win = from_bounds(sb[0] - pad, sb[1] - pad, sb[2] + pad, sb[3] + pad, src.transform).round_offsets().round_lengths()
        row0, col0 = (int(win.row_off) // F) * F, (int(win.col_off) // F) * F
        nrows = math.ceil((int(win.row_off) + int(win.height) - row0) / F) * F
        ncols = math.ceil((int(win.col_off) + int(win.width) - col0) / F) * F
        src_tr, src_crs = src.transform, src.crs
    print(f"AOI 10 m grid: {w10} x {h10} cells; source window: {ncols} x {nrows} px (rows {row0}..{row0 + nrows}, cols {col0}..{col0 + ncols})")
    bands = [(r, min(BAND_ROWS, row0 + nrows - r)) for r in range(row0, row0 + nrows, BAND_ROWS)]
    print(f"{len(bands)} bands of up to {BAND_ROWS} rows; ~{nrows * 64 / 1024:.0f} MB to transfer if rows compress to ~64 KB")
    if args.dry:
        return

    t0 = time.time()
    agg = np.full((nrows // F, ncols // F), np.nan, dtype="float32")
    with ThreadPoolExecutor(max_workers=args.threads) as pool:
        futs = {pool.submit(read_band, SOURCE, col0, ncols, r, n): (r, n) for r, n in bands}
        done = 0
        for fut in as_completed(futs):
            r, n = futs[fut]
            agg[(r - row0) // F:(r - row0 + n) // F, :] = fut.result()
            done += 1
            print(f"  band {done}/{len(bands)} (rows {r}..{r + n}) at {time.time() - t0:.0f}s", flush=True)
    print(f"transfer + aggregation done in {time.time() - t0:.0f}s; valid fraction {np.isfinite(agg).mean():.3f}")

    from affine import Affine

    agg_tr = Affine(F * src_tr.a, 0.0, src_tr.c + col0 * src_tr.a, 0.0, F * src_tr.e, src_tr.f + row0 * src_tr.e)
    dst_crs = CRS.from_proj4(proj)
    outputs = {}
    for level, res, resampling in (("L3", 10.0, Resampling.bilinear), ("L2", 20.0, Resampling.average)):
        tr, w, h, _ = aoi_grid(res)
        out = np.full((h, w), np.nan, dtype="float32")
        reproject(agg, out, src_transform=agg_tr, src_crs=src_crs, dst_transform=tr, dst_crs=dst_crs, resampling=resampling,
                  src_nodata=np.nan, dst_nodata=np.nan)
        outputs[level] = out
        meta = {
            "id": f"gale.{level}.elevation", "site_id": "gale", "family": "topography",
            "name": f"Elevation (MSL Gale merged DEM, {int(res)} m)", "unit": "m", "colormap": "cividis", "resolution_m": res,
            "level": level, "time_dependent": False, "valid_time": None, "source_ids": ["usgs.msl_gale_dem_1m_v3"], "credit": CREDIT,
            "simulated": False, "display_tint": False,
            "uncertainty_note": f"Area-averaged from the 1 m source to {int(res)} m; rocks and boulders smaller than {int(res)} m are not resolved.",
            "cog_url": f"/data/gale/{level}/elevation.tif",
        }
        path = write_cog(PROCESSED / "gale" / level / "elevation.tif", out, tr, proj, NODATA, meta)
        fin = out[np.isfinite(out)]
        print(f"{level}: {path.name} {w}x{h} min {fin.min():.1f} max {fin.max():.1f} m, nodata {1 - fin.size / out.size:.3f}")

    # datum check against the independent HRSC/MOLA 200 m product (L1)
    l1 = PROCESSED / "gale" / "L1" / "elevation.tif"
    if l1.is_file():
        with rasterio.open(l1) as s1:
            ref = s1.read(1, masked=True).astype("float64").filled(np.nan)
            ref_tr = s1.transform
        tr20, w20, h20, _ = aoi_grid(20.0)
        down = np.full(ref.shape, np.nan)
        reproject(outputs["L2"], down, src_transform=tr20, src_crs=dst_crs, dst_transform=ref_tr, dst_crs=dst_crs,
                  resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
        ok = np.isfinite(down) & np.isfinite(ref)
        d = down[ok] - ref[ok]
        print(f"vertical check vs L1 (HRSC/MOLA 200 m): n={ok.sum()} mean diff {d.mean():+.1f} m, RMS {np.sqrt(np.mean(d**2)):.1f} m")

    upsert_manifest({"id": "usgs.msl_gale_dem_1m_v3", "family": "topography", "product_id": "MSL_Gale_DEM_Mosaic_1m_v3",
                     "source_url": SOURCE, "retrieved_at": now_utc(), "resolution_m": 1.0,
                     "license": "public domain (USGS/NASA) [verify]", "credit": CREDIT, "level": "L2/L3", "simulated": False,
                     "notes": "AOI window read via HTTP range requests, area-averaged 1 m -> 10 m, reprojected to the AOI grid at 10 m (L3) and 20 m (L2)."})


if __name__ == "__main__":
    main()
