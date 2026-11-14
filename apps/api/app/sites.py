"""Site registry: discovers processed layers under data/processed/<site>/<level>/ and caches SiteGrids."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from marsnav.config import projection, repo_root
from marsnav.geodesy import geo_to_aoi
from marsnav.routing.grid import SiteGrid

LEVELS = ("L3", "L2", "L1", "L0")


def data_root() -> Path:
    return repo_root() / "data" / "processed"


def available_levels(site_id: str) -> list[str]:
    root = data_root() / site_id
    return [lv for lv in LEVELS if (root / lv / "elevation.tif").is_file()]


@lru_cache(maxsize=8)
def get_grid(site_id: str, level: str | None = None) -> SiteGrid:
    levels = available_levels(site_id)
    if level and level not in levels and level != "L0":
        raise KeyError(f"level {level} is not available for site {site_id}; available: {levels or ['L0 synthetic']}")
    lv = level or (levels[0] if levels else "L0")
    path = data_root() / site_id / lv / "elevation.tif"
    if path.is_file():
        return SiteGrid.from_cog(path, site_id, lv)
    return SiteGrid.synthetic(site_id)


def layer_metas(site_id: str, level: str | None = None) -> list[dict]:
    out = []
    root = data_root() / site_id
    for lv in LEVELS:
        if level and lv != level:
            continue
        d = root / lv
        if not d.is_dir():
            continue
        for meta in sorted(d.glob("*.json")):
            try:
                m = json.loads(meta.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if "id" in m and "cog_url" in m:
                out.append(m)
    return out


def base_place(site_id: str) -> dict:
    p = projection()
    b = p["base_default"]
    x, y = geo_to_aoi(b["lat"], b["lon"])
    return {"id": f"{site_id}.base", "name": b["name"], "aliases": ["base", "habitat", "Bradbury Landing"], "kind": "base",
            "lat": b["lat"], "lon": b["lon"], "x": float(x), "y": float(y), "source": b["source"], "description": None,
            "science_target": False, "pov_image": None}


def places(site_id: str) -> list[dict]:
    """Base + places.json from the data pipeline (W1). No coordinates are invented here."""
    out = [base_place(site_id)]
    f = data_root() / site_id / "places.json"
    if f.is_file():
        items = json.loads(f.read_text(encoding="utf-8"))
        items = items.get("places", items) if isinstance(items, dict) else items
        for it in items:
            if "lat" in it and "lon" in it and "name" in it:
                x, y = geo_to_aoi(it["lat"], it["lon"])
                out.append({"aliases": [], "description": None, "science_target": False, "pov_image": None,
                            "source": "data/processed places.json", "kind": "gazetteer", **it, "x": float(x), "y": float(y)})
    return out


def site_record(site_id: str) -> dict:
    p = projection()
    if site_id != p["aoi"]["site_id"]:
        raise KeyError(site_id)
    g = get_grid(site_id)
    levels = available_levels(site_id) or ["L0"]
    return {"id": site_id, "name": p["aoi"]["name"], "center": p["aoi"]["center"], "bbox": p["aoi"]["bbox_geo"],
            "proj_aoi": p["proj_aoi"], "base": base_place(site_id), "data_levels": levels, "default_level": g.level,
            "hazard_resolution_m": g.cell, "globe_texture_url": None, "simulated": g.simulated}
