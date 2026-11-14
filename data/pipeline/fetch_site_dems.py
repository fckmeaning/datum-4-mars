"""Per-site elevation patches from the global MOLA DEM (463 m), read with HTTP range requests (no full download).

Source : USGS Astrogeology, Mars MGS MOLA DEM mosaic global 463 m (int16 metres, equirectangular Mars sphere R = 3396190 m).
Output : data/processed/sites/<id>/dem.png    RGB, value = R*256 + G - 32768 (metres), like the global mars_elev.png
         data/processed/sites/<id>/dem.json   centre, bounds in degrees, pixel size, min/max, source
Each patch is 256 x 256 pixels, about 118 km square. Read size is about 256 rows of the strip layout: roughly 20-25 MB per site.

Run: .venv\\Scripts\\python.exe data\\pipeline\\fetch_site_dems.py [--sites meridiani gusev ...]
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "processed" / "sites"
URL = "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
R_M = 3_396_190.0
SIZE = 256

# same coordinates as apps/web/src/globe/landingSites.ts (lon east-positive, 0..360 allowed)
SITES = {
    "gale": (-4.5895, 137.4417),
    "jezero": (18.38, 77.58),
    "meridiani": (-1.95, 354.47),
    "gusev": (-14.57, 175.47),
    "elysium": (4.50, 135.62),
    "chryse": (22.48, -47.97),
    "utopia": (25.07, 109.93),
    "ares": (19.33, -33.55),
}


def wrap180(lon: float) -> float:
    return ((lon + 180.0) % 360.0) - 180.0


def fetch(site: str, lat: float, lon: float, ds: rasterio.DatasetReader) -> dict:
    lon = wrap180(lon)
    x = math.radians(lon) * R_M  # equirectangular, standard parallel 0
    y = math.radians(lat) * R_M
    row, col = ds.index(x, y)  # rasterio returns (row, col)
    col0, row0 = int(col) - SIZE // 2, int(row) - SIZE // 2
    win = Window(col0, row0, SIZE, SIZE)
    a = ds.read(1, window=win, boundless=False).astype(np.int32)
    if a.shape != (SIZE, SIZE):
        raise RuntimeError(f"{site}: patch hit the edge of the raster {a.shape}")
    px = ds.res[0]
    # corner coordinates of the patch back to degrees
    left, top = ds.xy(row0, col0, offset="ul")
    right, bottom = ds.xy(row0 + SIZE, col0 + SIZE, offset="ul")
    deg = lambda v: math.degrees(v / R_M)  # noqa: E731
    meta = {
        "id": site,
        "centre": {"lat": lat, "lon": lon},
        "bounds": {"west": deg(left), "east": deg(right), "north": deg(top), "south": deg(bottom)},
        "width": SIZE,
        "height": SIZE,
        "pixel_m": px,
        "min_m": int(a.min()),
        "max_m": int(a.max()),
        "offset": 32768,
        "source": "USGS Astrogeology, MGS MOLA DEM mosaic global 463 m",
    }
    v = a + 32768
    rgb = np.stack([(v >> 8) & 255, v & 255, np.zeros_like(v)], axis=-1).astype(np.uint8)
    d = OUT / site
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb, "RGB").save(d / "dem.png", optimize=True)
    (d / "dem.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sites", nargs="*", default=list(SITES))
    args = ap.parse_args()
    os.environ.setdefault("GDAL_HTTP_USERAGENT", "DATUM-4-data-pipeline/0.1 (NASA Space Apps hackathon)")
    os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
    with rasterio.open("/vsicurl/" + URL) as ds:
        for s in args.sites:
            lat, lon = SITES[s]
            m = fetch(s, lat, lon, ds)
            print(f"{s}: {m['min_m']}..{m['max_m']} m, {m['pixel_m']:.0f} m/px, bounds {m['bounds']}")


if __name__ == "__main__":
    main()
