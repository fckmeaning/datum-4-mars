"""Higher-detail elevation tiers for the sites that have them, in the format the web app reads for every site.

Tiers written to data/processed/sites/<id>/<tier>/ :
  dem.png      RGB PNG, 16-bit linear: q = R*256 + G, height = min_m + q / 65535 * (max_m - min_m)   (row 0 is north)
  dem.json     id, tier, centre, bounds in degrees, width, height, pixel_m, min_m, max_m, q16 = true, source
  imagery.jpg  orthophoto draped on the relief (when the source has one)

  jezero/site     HiRISE 1 m DTM resampled to 1024 x 1024 over 6 x 6 km (about 5.9 m per pixel), from an external reference dataset
  jezero/crater   CTX 20 m DEM resampled to 1024 x 1164 over 89 x 101 km (about 87 m per pixel), from an external reference dataset
  gale/aoi        the 10 m (L3) DEM of this project's AOI, 1538 x 2016 over 15.4 x 20.2 km (USGS 1 m DEM, area-averaged)

Run: .venv\\Scripts\\python.exe data\\pipeline\\make_hires_tiers.py --external <reference checkout>\\public\\data
(--external is optional; without it only the Gale tier is built).
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "processed" / "sites"
R_M = 3_396_190.0


def encode_q16(h: np.ndarray) -> tuple[np.ndarray, float, float]:
    lo, hi = float(np.nanmin(h)), float(np.nanmax(h))
    span = hi - lo or 1.0
    q = np.clip(np.round((h - lo) / span * 65535), 0, 65535).astype(np.uint32)
    rgb = np.stack([(q >> 8) & 255, q & 255, np.zeros_like(q)], axis=-1).astype(np.uint8)
    return rgb, lo, hi


def write_tier(site: str, tier: str, h: np.ndarray, bounds: dict, centre: dict, source: str, imagery: Path | None = None, label: str = "") -> None:
    d = OUT / site / tier
    d.mkdir(parents=True, exist_ok=True)
    rgb, lo, hi = encode_q16(h)
    Image.fromarray(rgb, "RGB").save(d / "dem.png", optimize=True)
    rows, cols = h.shape
    deg = math.pi / 180
    px_m = (bounds["east"] - bounds["west"]) * deg * R_M * math.cos(centre["lat"] * deg) / cols
    meta = {
        "id": site, "tier": tier, "label": label, "centre": centre, "bounds": bounds, "width": cols, "height": rows,
        "pixel_m": px_m, "min_m": lo, "max_m": hi, "offset": 0, "q16": True, "source": source,
    }
    if imagery and imagery.exists():
        shutil.copyfile(imagery, d / "imagery.jpg")
        meta["imagery"] = "imagery.jpg"
    (d / "dem.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"{site}/{tier}: {cols}x{rows}, {px_m:.1f} m/px, {lo:.1f}..{hi:.1f} m" + (", with imagery" if "imagery" in meta else ""))


def external_tiers(data: Path) -> None:
    m = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    for key, tier, label, vis in (
        ("site", "site", "Landing site, HiRISE (about 6 m per pixel)", "s_visible.jpg"),
        ("crater", "crater", "Crater, CTX (about 87 m per pixel)", "c_visible.jpg"),
    ):
        e = m[key]
        a = np.array(Image.open(data / e["file"]).convert("RGB")).astype(np.int64)
        q = (a[..., 0] * 256 + a[..., 1]).astype(np.float64)
        h = e["min"] + q / 65535.0 * (e["max"] - e["min"])
        (lon0, lon1), (lat0, lat1) = e["lon"], e["lat"]
        bounds = {"west": lon0, "east": lon1, "north": lat1, "south": lat0}
        centre = {"lat": (lat0 + lat1) / 2, "lon": (lon0 + lon1) / 2}
        write_tier("jezero", tier, h, bounds, centre, "Mars 2020 HiRISE / CTX terrain models via an external reference dataset (NASA/JPL/MSSS/UArizona/USGS)", data / vis, label)


def jezero_photos(data: Path) -> None:
    """Perseverance raw-image photos bundled with an external reference dataset (NASA/JPL-Caltech), shown at the science stops."""
    src = data / "photos"
    if not src.is_dir():
        return
    dst = OUT / "jezero" / "photos"
    dst.mkdir(parents=True, exist_ok=True)
    for f in src.glob("*.jpg"):
        shutil.copyfile(f, dst / f.name)
    print(f"jezero/photos: {len(list(dst.glob('*.jpg')))} files")


def gale() -> None:
    import rasterio

    for lvl in ("L3", "L2"):
        p = ROOT / "data" / "processed" / "gale" / lvl / "elevation.tif"
        if p.exists():
            break
    else:
        print("no Gale DEM found, skipping")
        return
    with rasterio.open(p) as ds:
        h = ds.read(1).astype(np.float64)
        nodata = ds.nodata
        left, bottom, right, top = ds.bounds
    if nodata is not None:
        bad = h <= nodata + 100
        h[bad] = h[~bad].min()
    lat0, lon0 = -4.72, 137.40  # tmerc origin of contracts/projection.json
    deg = 180 / math.pi
    north = lat0 + top / R_M * deg
    south = lat0 + bottom / R_M * deg
    k = 1 / math.cos(math.radians(lat0))
    west = lon0 + left / R_M * deg * k
    east = lon0 + right / R_M * deg * k
    centre = {"lat": (north + south) / 2, "lon": (west + east) / 2}
    write_tier("gale", "aoi", h, {"west": west, "east": east, "north": north, "south": south}, centre,
               f"USGS MSL Gale DEM mosaic 1 m, area-averaged to {10 if lvl == 'L3' else 20} m (data/pipeline/fetch_gale_dem.py)", None,
               f"Planner area, DEM {10 if lvl == 'L3' else 20} m")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--external", type=Path, help="public/data folder of the external reference checkout")
    args = ap.parse_args()
    if args.external:
        external_tiers(args.external)
        jezero_photos(args.external)
    gale()


if __name__ == "__main__":
    main()
