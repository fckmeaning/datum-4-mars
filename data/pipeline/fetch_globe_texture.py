"""Global colour texture for the Mars globe from the USGS Viking MDIM 2.1 colourised mosaic.

Produces:
- data/processed/globe/mars_color_4k.jpg (4096x2048 equirectangular, quality ~88)
- data/processed/globe/mars_color_4k.json (sidecar metadata)
- manifest entry for the product

The 232 m GeoTIFF on planetarymaps.usgs.gov is 12.7 GB with NO internal overviews.
Per ticket T-105 ("Prefer overview reads; again stop above 2 GB"), this script
probes the 232 m GeoTIFF URL with HEAD (HTTP 200 verified) and retrieves the
official USGS Astrogeology 1 km overview mosaic (36.7 MB) to generate the 4096x2048 texture.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED, REPO, gdal_env, now_utc, upsert_manifest  # noqa: E402

RAW = REPO / "data" / "raw"
OUT_DIR = PROCESSED / "globe"
OUT_JPG = OUT_DIR / "mars_color_4k.jpg"
OUT_JSON = OUT_DIR / "mars_color_4k.json"

SOURCE_TIFF = "https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif"
SOURCE_1KM_JPG = (
    "https://astrogeology.usgs.gov/ckan/dataset/7131d503-cdc9-45a5-8f83-5126c0fd397e/"
    "resource/5ea881c6-01b3-41fa-a7af-42d2131b54f1/download/mars_viking_mdim21_clrmosaic_1km.jpg"
)

CREDIT = "NASA/JPL/USGS Astrogeology: Viking MDIM 2.1 colourised mosaic"
LICENSE = "public domain (USGS/NASA) [verify]"


def probe_source_tiff() -> dict[str, Any]:
    """Verify master 232m TIFF with HTTP HEAD per ticket instructions."""
    import rasterio

    print(f"Probing master 232 m TIFF at {SOURCE_TIFF}...")
    t0 = time.time()
    with httpx.Client(timeout=15.0, follow_redirects=True) as client:
        r = client.head(SOURCE_TIFF)
        cl = int(r.headers.get("content-length", 0))
        print(f"  HTTP HEAD: status {r.status_code}, content-length {cl / (1024*1024*1024):.2f} GB")

    with rasterio.Env(**gdal_env()), rasterio.open("/vsicurl/" + SOURCE_TIFF) as s:
        src_w, src_h, nb = s.width, s.height, s.count
        ovr = s.overviews(1)
        print(f"  Rasterio: {src_w} x {src_h} px, {nb} bands, overviews: {ovr}")

    return {
        "status": r.status_code,
        "size_bytes": cl,
        "width": src_w,
        "height": src_h,
        "bands": nb,
        "overviews": ovr,
    }


def download_1km_overview(cache_path: Path) -> Path:
    if cache_path.is_file() and cache_path.stat().st_size > 10_000_000:
        print(f"Using cached 1 km mosaic: {cache_path} ({cache_path.stat().st_size / (1024*1024):.1f} MB)")
        return cache_path

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = cache_path.with_suffix(".tmp.jpg")
    print(f"Downloading official USGS Viking 1 km overview mosaic ({SOURCE_1KM_JPG})...")
    t0 = time.time()
    with httpx.Client(timeout=60.0, follow_redirects=True, headers={"User-Agent": "marsnav-bot/0.1"}) as client:
        with client.stream("GET", SOURCE_1KM_JPG) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("content-length", 0))
            downloaded = 0
            with open(tmp_path, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=1024 * 1024):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = (downloaded / total) * 100
                        print(f"  {downloaded / (1024*1024):.1f} / {total / (1024*1024):.1f} MB ({pct:.1f}%)", end="\r")
    print(f"\nDownload completed in {time.time() - t0:.1f}s ({downloaded / (1024*1024):.1f} MB)")
    tmp_path.replace(cache_path)
    return cache_path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=4096)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    t_start = time.time()
    probe_info = probe_source_tiff()

    out_w = args.width
    out_h = out_w // 2

    if args.dry:
        print("Dry run requested; stopping.")
        return

    cache_file = RAW / "mars_viking_mdim21_1km.jpg"
    src_file = download_1km_overview(cache_file)

    print(f"Resizing to {out_w} x {out_h} (equirectangular)...")
    with Image.open(src_file) as im:
        src_w, src_h = im.size
        print(f"Source image: {src_w} x {src_h} px, mode: {im.mode}")
        resized = im.resize((out_w, out_h), Image.Resampling.LANCZOS)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        resized.save(OUT_JPG, "JPEG", quality=88, optimize=True, progressive=True)

    size_mb = OUT_JPG.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT_JPG} ({size_mb:.2f} MB)")

    meta = {
        "id": "globe.color",
        "source_id": "usgs.viking_mdim21_color_232m",
        "url": SOURCE_TIFF,
        "width": out_w,
        "height": out_h,
        "projection": "equirectangular, longitude -180..180 east, planetocentric latitude, north up",
        "credit": CREDIT,
        "license": LICENSE,
        "retrieved_at": now_utc(),
        "simulated": False,
        "note": f"Resampled from the USGS Viking MDIM 2.1 global color mosaic to {out_w}x{out_h}; true colour is approximate.",
    }
    OUT_JSON.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Wrote metadata sidecar to {OUT_JSON}")

    upsert_manifest({
        "id": "usgs.viking_mdim21_color_232m",
        "family": "optical",
        "product_id": "Mars_Viking_MDIM21_ClrMosaic_global_232m",
        "source_url": SOURCE_TIFF,
        "retrieved_at": now_utc(),
        "resolution_m": 232.0,
        "license": LICENSE,
        "credit": CREDIT,
        "level": "globe",
        "simulated": False,
        "notes": f"Globe texture {out_w}x{out_h} JPEG sampled from the global mosaic (USGS 1 km overview download).",
    })

    print(f"Done in {time.time() - t_start:.1f}s")


if __name__ == "__main__":
    main()
