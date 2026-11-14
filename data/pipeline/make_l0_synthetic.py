"""Deterministic synthetic DEM (L0, 20 m) on the Gale AOI grid.

Creates a crater-floor base plane, a broad mound rising to the south (Mount Sharp),
2-3 ridges, and mild smoothed Gaussian noise seeded from config/params.yaml.

Usage:
    .venv\\Scripts\\python.exe data\\pipeline\\make_l0_synthetic.py
Output:
    data/processed/gale/L0/elevation.tif (+ .json LayerMeta), manifest entry.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import yaml
from scipy.ndimage import gaussian_filter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aoi import aoi_crs, grid_for  # noqa: E402
from cog import write_cog  # noqa: E402
from common import PROCESSED, REPO, now_utc, upsert_manifest  # noqa: E402

RES = 20.0
NODATA = -32768.0


def load_seed() -> int:
    params_file = REPO / "config" / "params.yaml"
    if params_file.is_file():
        data = yaml.safe_load(params_file.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return int(data.get("uncertainty", {}).get("seed", {}).get("value", 42))
    return 42


def generate_synthetic_dem(width: int, height: int, transform: object, seed: int) -> np.ndarray:
    cols = np.arange(width, dtype=np.float64)
    rows = np.arange(height, dtype=np.float64)

    # Coordinates in AOI projection (metres from AOI center)
    x = transform.c + (cols + 0.5) * transform.a
    y = transform.f + (rows + 0.5) * transform.e
    X, Y = np.meshgrid(x, y)

    # 1. Crater floor base plane: ~ -4500 m with mild slope
    elev = -4500.0 + 0.003 * Y

    # 2. Broad mound rising to the south (lower Mount Sharp analogue)
    y_m = -12000.0
    mound = 2600.0 * np.exp(-0.5 * ((X / 10000.0) ** 2 + ((Y - y_m) / 9000.0) ** 2))
    elev += mound

    # 3. Distinct ridges (Vera Rubin Ridge / boxwork structures)
    # Ridge 1: WSW-ENE ridge across mound apron
    dist1 = (Y - (-2500.0 + 0.15 * X)) / 150.0
    ridge1 = 45.0 * np.exp(-0.5 * (dist1**2))

    # Ridge 2: Lower boxwork pediment ridge
    dist2 = (Y - (-5500.0 - 0.1 * X)) / 180.0
    ridge2 = 35.0 * np.exp(-0.5 * (dist2**2))

    # Ridge 3: North-South ridge / channel flank
    dist3 = ((X - 1500.0) / 160.0) ** 2 + ((Y - (-4000.0)) / 2500.0) ** 2
    ridge3 = 40.0 * np.exp(-0.5 * dist3)

    elev += ridge1 + ridge2 + ridge3

    # 4. Mild noise seeded deterministically
    rng = np.random.default_rng(seed)
    raw_noise = rng.standard_normal((height, width))
    smooth_noise = gaussian_filter(raw_noise, sigma=4.0)
    std = float(np.std(smooth_noise))
    if std > 1e-8:
        smooth_noise = smooth_noise * (6.0 / std)  # ~6 m RMS roughness
    elev += smooth_noise

    return elev.astype(np.float32)


def main() -> None:
    seed = load_seed()
    transform, width, height = grid_for(RES)
    proj = aoi_crs()

    elev = generate_synthetic_dem(width, height, transform, seed)

    path = PROCESSED / "gale" / "L0" / "elevation.tif"
    meta = {
        "id": "gale.L0.elevation",
        "site_id": "gale",
        "family": "topography",
        "name": "Elevation (Synthetic DEM, 20 m)",
        "unit": "m",
        "colormap": "cividis",
        "resolution_m": RES,
        "level": "L0",
        "time_dependent": False,
        "valid_time": None,
        "source_ids": ["marsnav.synthetic_dem_20m"],
        "credit": "SIMULATED (marsnav team)",
        "simulated": True,
        "display_tint": False,
        "uncertainty_note": "Deterministic synthetic DEM for simulation, testing, and offline fallback.",
        "cog_url": "/data/gale/L0/elevation.tif",
    }

    write_cog(path, elev, transform, proj, NODATA, meta)

    upsert_manifest(
        {
            "id": "marsnav.synthetic_dem_20m",
            "family": "topography",
            "product_id": "Gale_Synthetic_DEM_20m_v1",
            "source_url": "local://data/pipeline/make_l0_synthetic.py",
            "retrieved_at": now_utc(),
            "resolution_m": RES,
            "license": "CC0-1.0 (SIMULATED)",
            "credit": "SIMULATED (marsnav team)",
            "level": "L0",
            "simulated": True,
            "notes": "Deterministic synthetic DEM at 20 m on the Gale AOI transverse-Mercator grid.",
        }
    )

    finite = elev[np.isfinite(elev) & (elev != NODATA)]
    print(f"output: {path} shape={elev.shape} min={finite.min():.1f} max={finite.max():.1f} m")


if __name__ == "__main__":
    main()
