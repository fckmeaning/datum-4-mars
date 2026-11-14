"""Walkability index W (F54, 0-100) as a classified uint8 COG layer, derived from the elevation layer of the same level.

Usage:  .venv\\Scripts\\python.exe data\\pipeline\\make_walkability.py [--levels L2 L3] [--site gale]
Output: data/processed/<site>/<level>/walkability.tif (uint8 0-100, nodata 255) + walkability.json (LayerMeta with `classes`), manifest entry.
Derived only from the elevation DEM: boulders and steps smaller than the cell are not resolved (see uncertainty_note).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED, now_utc, upsert_manifest, write_cog  # noqa: E402

NODATA = 255
CLASSES = [
    {"min": 70, "max": 100, "label": "Walkable", "color": "#3FB950"},
    {"min": 40, "max": 69, "label": "Use caution", "color": "#D29922"},
    {"min": 0, "max": 39, "label": "Avoid", "color": "#F85149"},
]


def build(site: str, level: str) -> dict:
    import rasterio
    from marsnav.indices import walkability_index
    from marsnav.indices.walkability import LIMITATION
    from marsnav.routing.grid import SiteGrid

    src_path = PROCESSED / site / level / "elevation.tif"
    if not src_path.is_file():
        raise FileNotFoundError(f"{src_path} not found: run the elevation pipeline for {level} first")
    grid = SiteGrid.from_cog(src_path, site, level)
    with rasterio.open(src_path) as src:
        transform, crs = src.transform, src.crs
    elev_meta = json.loads(src_path.with_suffix(".json").read_text(encoding="utf-8")) if src_path.with_suffix(".json").is_file() else {}

    t0 = time.perf_counter()
    res = walkability_index(grid.z, grid.cell, step_max_m=grid.extras.get("step_max_m"), simulated=grid.simulated)
    elapsed = time.perf_counter() - t0
    out = res.to_uint8(NODATA)
    meta = {
        "id": f"{site}.{level}.walkability", "site_id": site, "family": "terrain",
        "name": f"Walkability index ({int(grid.cell)} m, derived from the elevation layer)", "unit": "index 0-100",
        "colormap": "classified", "classes": CLASSES, "resolution_m": grid.cell, "level": level, "time_dependent": False, "valid_time": None,
        "source_ids": elev_meta.get("source_ids", []), "credit": elev_meta.get("credit", ""), "simulated": bool(grid.simulated),
        "display_tint": False, "weights": {k: round(v, 4) for k, v in res.weights.items()},
        "uncertainty_note": f"Derived from the {int(grid.cell)} m elevation model only. {LIMITATION}",
        "cog_url": f"/data/{site}/{level}/walkability.tif", "value_range": [0, 100], "nodata": NODATA,
    }
    path = write_cog(PROCESSED / site / level / "walkability.tif", out, transform, crs, NODATA, meta, dtype="uint8", compress="DEFLATE")
    valid = res.classes >= 0
    n = int(valid.sum())
    shares = {name: float((res.classes == code).sum()) / n for name, code in (("green", 2), ("yellow", 1), ("red", 0))}
    upsert_manifest({"id": f"marsnav.{site}.{level}.walkability", "family": "terrain", "product_id": f"walkability-{level}",
                     "source_url": "https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif", "retrieved_at": now_utc(),
                     "resolution_m": float(grid.cell), "license": "derived (public-domain inputs)",
                     "credit": elev_meta.get("credit", ""), "level": level, "simulated": bool(grid.simulated),
                     "notes": "Derived index F54 from the elevation DEM (slope, roughness, obstacle density, data certainty); see docs/MATH.md."})
    return {"level": level, "path": path, "cells": int(out.size), "shares": shares, "mean_W": float(np.nanmean(res.W)),
            "blocked_share": float(res.blocked.sum()) / n, "elapsed_s": elapsed, "size_mb": path.stat().st_size / 1e6}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="gale")
    ap.add_argument("--levels", nargs="+", default=["L2", "L3"])
    args = ap.parse_args()
    for level in args.levels:
        r = build(args.site, level)
        sh = r["shares"]
        print(f"{r['level']}: {r['path'].name} {r['size_mb']:.2f} MB, {r['cells']} cells, W computed in {r['elapsed_s']:.1f} s; "
              f"mean W {r['mean_W']:.1f}; green {sh['green']:.1%} yellow {sh['yellow']:.1%} red {sh['red']:.1%}; "
              f"hard-blocked {r['blocked_share']:.1%}", flush=True)


if __name__ == "__main__":
    main()
