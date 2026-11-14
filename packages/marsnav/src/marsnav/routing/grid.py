"""Site grids: elevation on the AOI grid plus cached derived terrain layers.

Grid convention (same as marsnav.terrain): row 0 = north edge, column 0 = west edge, square cells. (x0, y0) is the
top-left CORNER in AOI metres; cell centres are x = x0 + (c + 0.5)·cell, y = y0 − (r + 0.5)·cell.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from marsnav.config import param
from marsnav.geodesy import aoi_to_geo, geo_to_aoi
from marsnav.terrain import roughness, sky_fraction_grid, slope_aspect_horn


@dataclass
class SiteGrid:
    site_id: str
    level: str
    z: NDArray
    cell: float
    x0: float
    y0: float
    simulated: bool
    source: str
    credit: str = ""
    extras: dict[str, NDArray] = field(default_factory=dict)

    @property
    def shape(self) -> tuple[int, int]:
        return self.z.shape  # type: ignore[return-value]

    def rc_to_xy(self, r: NDArray | float, c: NDArray | float) -> tuple[NDArray, NDArray]:
        return self.x0 + (np.asarray(c) + 0.5) * self.cell, self.y0 - (np.asarray(r) + 0.5) * self.cell

    def xy_to_rc(self, x: float, y: float) -> tuple[int, int]:
        c = int(round((x - self.x0) / self.cell - 0.5))
        r = int(round((self.y0 - y) / self.cell - 0.5))
        return r, c

    def latlon_to_rc(self, lat: float, lon: float) -> tuple[int, int]:
        x, y = geo_to_aoi(lat, lon)
        return self.xy_to_rc(float(x), float(y))

    def rc_to_latlon(self, r: NDArray | float, c: NDArray | float) -> tuple[NDArray, NDArray]:
        x, y = self.rc_to_xy(r, c)
        return aoi_to_geo(x, y)

    def inside(self, r: int, c: int) -> bool:
        return 0 <= r < self.z.shape[0] and 0 <= c < self.z.shape[1]

    def center_latlon(self) -> tuple[float, float]:
        lat, lon = self.rc_to_latlon((self.z.shape[0] - 1) / 2, (self.z.shape[1] - 1) / 2)
        return float(lat), float(lon)

    @cached_property
    def slope_aspect(self) -> tuple[NDArray, NDArray]:
        return slope_aspect_horn(self.z, self.cell)

    @cached_property
    def slope_deg(self) -> NDArray:
        if "slope_p95_deg" in self.extras:
            return self.extras["slope_p95_deg"]
        return np.degrees(self.slope_aspect[0])

    @cached_property
    def roughness_m(self) -> NDArray:
        k = int(param("terrain.roughness_window"))
        return roughness(self.z, self.cell, k)

    @cached_property
    def sky_fraction(self) -> NDArray:
        n_az = int(param("terrain.sky_grid_azimuths"))
        r_max = float(param("terrain.r_far_m"))
        n = float(param("radiation.sky_weight_n"))
        z = np.where(np.isfinite(self.z), self.z, np.nanmin(self.z))
        return sky_fraction_grid(z, self.cell, n_az=n_az, n=n, r_max=r_max)

    @cached_property
    def z_ref(self) -> float:
        return float(np.nanmean(self.z))

    @classmethod
    def from_cog(cls, path: str | Path, site_id: str, level: str) -> SiteGrid:
        import json

        import rasterio

        path = Path(path)
        with rasterio.open(path) as src:
            z = src.read(1, masked=True).astype(float).filled(np.nan)
            t = src.transform
            if abs(abs(t.a) - abs(t.e)) > 1e-6 or t.b != 0 or t.d != 0:
                raise ValueError(f"{path}: expected square, north-up cells, got transform {t}")
            cell, x0, y0 = float(t.a), float(t.c), float(t.f)
        meta_path = path.with_suffix(".json")
        simulated, credit, source = level == "L0", "", str(path)
        if meta_path.is_file():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            simulated = bool(meta.get("simulated", simulated))
            credit = str(meta.get("credit", ""))
            source = ",".join(meta.get("source_ids", [])) or source
        return cls(site_id, level, z, cell, x0, y0, simulated, source, credit)

    @classmethod
    def synthetic(cls, site_id: str = "gale", h: int = 120, w: int = 120, cell: float = 50.0, seed: int = 42) -> SiteGrid:
        """Deterministic SIMULATED terrain centred on the AOI origin: plain + mound to the south + ridges + noise."""
        rng = np.random.default_rng(seed)
        rows, cols = np.mgrid[0:h, 0:w]
        x = (cols - w / 2) * cell
        y = (h / 2 - rows) * cell
        mound = np.exp(-((x / (w * cell * 0.25)) ** 2 + ((y + h * cell * 0.45) / (h * cell * 0.3)) ** 2))
        z = -4500.0 + 0.004 * (-y) + 600.0 * mound
        z += 60.0 * np.exp(-((x - 0.15 * w * cell) / (0.04 * w * cell)) ** 2)  # N–S ridge east of centre
        z += 40.0 * np.exp(-((y - 0.2 * h * cell) / (0.03 * h * cell)) ** 2) * (x < 0)  # E–W ridge in the NW
        z += rng.normal(0.0, 1.5, z.shape)
        x0, y0 = -w / 2 * cell, h / 2 * cell
        return cls(site_id, "L0", z, cell, x0, y0, True, "synthetic", "SIMULATED (marsnav team)")


def find_cog(data_root: Path, site_id: str, level: str, layer: str = "elevation") -> Path | None:
    p = data_root / site_id / level / f"{layer}.tif"
    return p if p.is_file() else None
