"""Generate data/processed/landing_sites.json for the global Mars display.

Lists historical and active landing sites on Mars with verified USGS gazetteer
and mission telemetry coordinates. Only Gale Crater (Curiosity) is marked "open";
all other landing sites are marked "locked" (label "Phase 2").

Usage:
    .venv\\Scripts\\python.exe data\\pipeline\\make_landing_sites.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED, now_utc, upsert_manifest  # noqa: E402

LANDING_SITES: list[dict[str, Any]] = [
    {
        "id": "curiosity",
        "name": "Bradbury Landing (Gale Crater)",
        "mission": "Mars Science Laboratory",
        "year": 2012,
        "lat": -4.5895,
        "lon": 137.4416,
        "status": "open",
        "label": "Active",
        "source_url": "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json",
        "evidence": "MSL_waypoints.json sol 3 waypoint (-4.58947 N, 137.44163 E)",
    },
    {
        "id": "perseverance",
        "name": "Octavia E. Butler Landing (Jezero Crater)",
        "mission": "Mars 2020",
        "year": 2021,
        "lat": 18.4447,
        "lon": 77.4508,
        "status": "locked",
        "label": "Phase 2",
        "source_url": "https://planetarynames.wr.usgs.gov/Feature/15949",
        "evidence": "USGS Gazetteer Feature 15949 (18.4447 N, 77.4508 E)",
    },
    {
        "id": "opportunity",
        "name": "Challenger Memorial Station (Meridiani Planum)",
        "mission": "Mars Exploration Rover B",
        "year": 2004,
        "lat": -1.9462,
        "lon": -5.5266,
        "status": "locked",
        "label": "Phase 2",
        "source_url": "https://planetarynames.wr.usgs.gov/Feature/13998",
        "evidence": "USGS Gazetteer Feature 13998 (-1.9462 S, 354.4734 E = -5.5266 E)",
    },
    {
        "id": "spirit",
        "name": "Columbia Memorial Station (Gusev Crater)",
        "mission": "Mars Exploration Rover A",
        "year": 2004,
        "lat": -14.5684,
        "lon": 175.4726,
        "status": "locked",
        "label": "Phase 2",
        "source_url": "https://planetarynames.wr.usgs.gov/Feature/13997",
        "evidence": "USGS Gazetteer Feature 13997 (-14.5684 S, 175.4726 E)",
    },
    {
        "id": "insight",
        "name": "InSight Landing Site (Elysium Planitia)",
        "mission": "InSight",
        "year": 2018,
        "lat": 4.5024,
        "lon": 135.6234,
        "status": "locked",
        "label": "Phase 2",
        "source_url": "https://science.nasa.gov/mission/insight/",
        "evidence": "NASA InSight mission landing coordinates (4.5024 N, 135.6234 E)",
    },
    {
        "id": "zhurong",
        "name": "Zhurong Landing Site (Utopia Planitia)",
        "mission": "Tianwen-1",
        "year": 2021,
        "lat": 25.0660,
        "lon": 109.9250,
        "status": "locked",
        "label": "Phase 2",
        "source_url": "https://planetarynames.wr.usgs.gov/Feature/16027",
        "evidence": "USGS Gazetteer Feature 16027 (25.066 N, 109.925 E)",
    },
    {
        "id": "viking1",
        "name": "Thomas Mutch Memorial Station (Chryse Planitia)",
        "mission": "Viking 1 Lander",
        "year": 1976,
        "lat": 22.2700,
        "lon": -47.9500,
        "status": "locked",
        "label": "Phase 2",
        "source_url": "https://planetarynames.wr.usgs.gov/Feature/5973",
        "evidence": "USGS Gazetteer Feature 5973 (22.27 N, 312.05 E = -47.95 E)",
    },
    {
        "id": "pathfinder",
        "name": "Carl Sagan Memorial Station (Ares Vallis)",
        "mission": "Mars Pathfinder",
        "year": 1997,
        "lat": 19.3300,
        "lon": -34.3400,
        "status": "locked",
        "label": "Phase 2",
        "source_url": "https://planetarynames.wr.usgs.gov/Feature/1012",
        "evidence": "USGS Gazetteer Feature 1012 (19.33 N, 325.66 E = -34.34 E)",
    },
    {
        "id": "phoenix",
        "name": "Phoenix Landing Site (Green Valley, Vastitas Borealis)",
        "mission": "Phoenix Mars Lander",
        "year": 2008,
        "lat": 68.2188,
        "lon": -125.7492,
        "status": "locked",
        "label": "Phase 2",
        "source_url": "https://science.nasa.gov/mission/phoenix/",
        "evidence": "NASA Phoenix landing coordinates (68.2188 N, 234.2508 E = -125.7492 E)",
    },
]


def main() -> None:
    out_file = PROCESSED / "landing_sites.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)

    data = {
        "generated_utc": now_utc(),
        "credit": "USGS Gazetteer of Planetary Nomenclature / NASA / CNSA",
        "sites": LANDING_SITES,
    }

    out_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    upsert_manifest(
        {
            "id": "mars.landing_sites",
            "family": "geography",
            "product_id": "Mars_Landing_Sites_Gazetteer",
            "source_url": "https://planetarynames.wr.usgs.gov/",
            "retrieved_at": now_utc(),
            "resolution_m": 0.0,
            "license": "public domain (USGS / NASA)",
            "credit": data["credit"],
            "level": "L0",
            "simulated": False,
            "notes": "Verified Mars landing site coordinates in planetocentric east-positive coordinate system.",
        }
    )

    print(f"Wrote {len(LANDING_SITES)} landing sites to {out_file}:")
    print(f"{'ID':14s} {'Name':44s} {'Year':4s} {'Lat':>8s} {'Lon':>9s} {'Status':8s} {'Label':8s}")
    print("-" * 100)
    for s in LANDING_SITES:
        print(f"{s['id']:14s} {s['name']:44s} {s['year']:4d} {s['lat']:8.4f} {s['lon']:9.4f} {s['status']:8s} {s['label']:8s}")


if __name__ == "__main__":
    main()
