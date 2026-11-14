"""Index endpoints (F54 walkability summary, return-time isochrones). Include with ``app.include_router(indices.router)`` in main.py.

The router imports helpers from ``app.main`` lazily (inside the handlers) so that main can include it without a circular import.
Routing-class grid choice follows main: the ``level`` query parameter, else MARSNAV_ROUTE_LEVEL (default L2), else the best level.
"""

from __future__ import annotations

import time
from functools import lru_cache
from typing import Literal

import numpy as np
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from . import sites

router = APIRouter(prefix="/api/v1", tags=["indices"])

Level = Literal["L0", "L1", "L2", "L3"]
MAX_LEVELS = 8


def _parse_minutes(raw: str) -> list[float]:
    from .main import err

    try:
        vals = sorted({float(x) for x in raw.split(",") if x.strip()})
    except ValueError:
        raise err(422, "BAD_MINUTES", "minutes must be comma-separated numbers, e.g. 15,30,60.", got=raw) from None
    if not vals or vals[0] <= 0 or vals[-1] > 600 or len(vals) > MAX_LEVELS:
        raise err(422, "BAD_MINUTES", f"Give 1 to {MAX_LEVELS} levels between 1 and 600 minutes.", got=raw)
    return vals


@lru_cache(maxsize=4)
def _return_time(site_id: str, level: str) -> tuple[np.ndarray, tuple[int, int]]:
    """Fastest-return time field [s] for the default astronaut (it does not depend on the departure time) and the base cell."""
    from marsnav.routing.cost import Astronaut, build_layers, pack_params, resolve_weights
    from marsnav.routing.returnfield import return_field

    from .main import now_iso

    grid = sites.get_grid(site_id, level)
    b = sites.base_place(site_id)
    rc = grid.latlon_to_rc(b["lat"], b["lon"])
    astro = Astronaut.from_api(None)
    layers = build_layers(grid, now_iso(), astro)
    T = return_field(layers.arrays, grid.cell, pack_params(resolve_weights("FASTEST"), astro), rc)["time_s"]
    return T, (int(rc[0]), int(rc[1]))


@router.get("/sites/{site_id}/isochrones")
def isochrones(site_id: str, minutes: str = Query("15,30,60,90,120", description="Comma-separated return times in minutes"),
               level: Level | None = None) -> JSONResponse:
    """Lines of equal fastest walking time back to the base (reachability), as a GeoJSON FeatureCollection in lon/lat on Mars."""
    from marsnav.indices import return_isochrones

    from .main import _route_grid, err

    levels = _parse_minutes(minutes)
    grid = _route_grid(site_id, level)
    b = sites.base_place(site_id)
    if not grid.inside(*grid.latlon_to_rc(b["lat"], b["lon"])):
        raise err(400, "BASE_OUTSIDE_GRID", "The base lies outside the loaded terrain, so return times cannot be computed.")
    t0 = time.perf_counter()
    T, rc = _return_time(site_id, grid.level)
    fc = return_isochrones(grid, rc, minutes=levels, time_s=T)
    fc["properties"]["elapsed_s"] = round(time.perf_counter() - t0, 3)
    return JSONResponse(content=fc, media_type="application/geo+json")


@lru_cache(maxsize=4)
def _walkability_summary(site_id: str, level: str) -> dict:
    from marsnav.indices import walkability_index
    from marsnav.indices.walkability import LIMITATION

    grid = sites.get_grid(site_id, level)
    res = walkability_index(grid.z, grid.cell, step_max_m=grid.extras.get("step_max_m"), simulated=grid.simulated)
    valid = res.classes >= 0
    n = int(valid.sum())
    counts = {"green": int((res.classes == 2).sum()), "yellow": int((res.classes == 1).sum()), "red": int((res.classes == 0).sum()),
              "no_data": int((~valid).sum())}
    return {"site_id": site_id, "level": grid.level, "resolution_m": grid.cell, "simulated": bool(grid.simulated), "cells": int(res.W.size),
            "counts": counts, "shares": {k: (round(v / n, 4) if n and k != "no_data" else None) for k, v in counts.items()},
            "mean_W": round(float(np.nanmean(res.W)), 2), "median_W": round(float(np.nanmedian(res.W)), 2),
            "blocked_share": round(float(res.blocked.sum()) / max(n, 1), 4),
            "mean_scores": {"slope": round(float(np.nanmean(res.S[valid])), 3), "roughness": round(float(np.nanmean(res.R[valid])), 3),
                            "obstacle_density": round(float(np.nanmean(res.D[valid])), 3),
                            "data_uncertainty": round(float(np.nanmean(res.U[valid])), 3)},
            "inputs_used": res.inputs_used, "weights": {k: round(v, 4) for k, v in res.weights.items()},
            "thresholds": {"green_min": res.green_min, "yellow_min": res.yellow_min},
            "layer_id": f"{site_id}.{grid.level}.walkability", "limitation": LIMITATION}


@router.get("/sites/{site_id}/walkability/summary")
def walkability_summary(site_id: str, level: Level | None = None) -> dict:
    """Class shares and averages of the walkability index W (F54) with the inputs, weights and the resolution limit stated."""
    from .main import _route_grid

    grid = _route_grid(site_id, level)
    return _walkability_summary(site_id, grid.level)
