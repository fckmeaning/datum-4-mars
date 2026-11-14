"""Extend data/processed/gale/places.json with measured mission places.

Every coordinate is derived directly from NASA/JPL MMGIS rover waypoint records
(data/raw/msl/MSL_waypoints.json) by documented mission sol range.

Usage:
    .venv\\Scripts\\python.exe data\\pipeline\\make_places_gale.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED, REPO, now_utc, upsert_manifest  # noqa: E402

BASE_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json"
RAW = REPO / "data" / "raw" / "msl"
CREDIT = "NASA/JPL-Caltech (Mars Science Laboratory, MMGIS traverse waypoints)"

# Documented sol ranges from NASA mission blogs and science publications
DOCUMENTED_PLACES: list[dict[str, Any]] = [
    {
        "id": "gale.yellowknife_bay",
        "name": "Yellowknife Bay",
        "aliases": ["Yellowknife", "John Klein", "Cumberland"],
        "kind": "mission_informal",
        "sols": [125, 299],
        "science_target": True,
        "description": "Ancient lacustrine mudstone outcrop and first drill site on Mars demonstrating ancient habitable conditions.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/science-goals/ (Sols 125-299)",
    },
    {
        "id": "gale.dingo_gap",
        "name": "Dingo Gap",
        "aliases": ["Dingo Gap Dune"],
        "kind": "mission_informal",
        "sols": [530, 545],
        "science_target": False,
        "description": "Narrow gateway across a 1-meter-high active sand dune into Moonlight Valley.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 530-545)",
    },
    {
        "id": "gale.kimberley",
        "name": "Kimberley",
        "aliases": ["The Kimberley", "Windjana"],
        "kind": "mission_informal",
        "sols": [600, 640],
        "science_target": True,
        "description": "Cross-bedded sandstone formation at the junction of three geological units; Windjana drill site.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 600-640)",
    },
    {
        "id": "gale.pahrump_hills",
        "name": "Pahrump Hills",
        "aliases": ["Pahrump", "Confidence Hills"],
        "kind": "mission_informal",
        "sols": [750, 950],
        "science_target": True,
        "description": "Basal exposure of the Mount Sharp Murray formation; fine-grained laminated mudstones.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 750-950)",
    },
    {
        "id": "gale.bagnold_dunes",
        "name": "Bagnold Dunes",
        "aliases": ["Bagnold", "Namib Dune"],
        "kind": "mission_informal",
        "sols": [1160, 1200],
        "science_target": True,
        "description": "Active basaltic sand dune field examined for active ripple migration and eolian sediment transport.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 1160-1200)",
    },
    {
        "id": "gale.murray_buttes",
        "name": "Murray Buttes / Naukluft",
        "aliases": ["Murray Buttes", "Naukluft Plateau"],
        "kind": "mission_informal",
        "sols": [1250, 1450],
        "science_target": True,
        "description": "Spectacular isolated sandstone buttes and mesas capped with resistant eolian layers.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 1250-1450)",
    },
    {
        "id": "gale.vera_rubin_ridge",
        "name": "Vera Rubin Ridge",
        "aliases": ["Hematite Ridge", "VRR"],
        "kind": "mission_informal",
        "sols": [1800, 2300],
        "science_target": True,
        "description": "Prominent, erosion-resistant topographic ridge strongly enriched in crystalline gray hematite.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 1800-2300)",
    },
    {
        "id": "gale.glen_torridon",
        "name": "Glen Torridon",
        "aliases": ["Clay Unit", "Glen Torridon Trough"],
        "kind": "mission_informal",
        "sols": [2300, 3000],
        "science_target": True,
        "description": "Topographic trough south of Vera Rubin Ridge containing rich phyllosilicate (clay mineral) deposits.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 2300-3000)",
    },
    {
        "id": "gale.mont_mercou",
        "name": "Mont Mercou",
        "aliases": ["Mercou Cliff"],
        "kind": "mission_informal",
        "sols": [3050, 3100],
        "science_target": True,
        "description": "Striking 6-meter-high cliff outcrop exhibiting transition into the sulfate-bearing unit.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 3050-3100)",
    },
    {
        "id": "gale.gediz_vallis",
        "name": "Gediz Vallis Ridge",
        "aliases": ["Gediz Vallis Channel"],
        "kind": "mission_informal",
        "sols": [4100, 4450],
        "science_target": True,
        "description": "Ridge of boulder-rich debris flow deposits carving down the northwest slope of Mount Sharp.",
        "source": "https://science.nasa.gov/mission/msl-curiosity/ (Sols 4100-4450)",
    },
]


def main() -> None:
    wp_path = RAW / "MSL_waypoints.json"
    cur_path = RAW / "MSL_waypoints_current.json"

    if not wp_path.is_file() or not cur_path.is_file():
        print(f"Missing required MMGIS raw files in {RAW}")
        sys.exit(1)

    wp = json.loads(wp_path.read_text(encoding="utf-8"))["features"]
    cur = json.loads(cur_path.read_text(encoding="utf-8"))["features"][0]["properties"]

    rows = sorted((f["properties"]["sol"], f["properties"]["lat"], f["properties"]["lon"], f["properties"]["elev_geoid"]) for f in wp)
    sol = np.array([r[0] for r in rows])
    lat = np.array([r[1] for r in rows])
    lon = np.array([r[2] for r in rows])
    elev = np.array([r[3] for r in rows])

    places: list[dict[str, Any]] = []

    # Load POV images if available to attach to places
    pov_file = PROCESSED / "gale" / "pov.json"
    pov_by_place: dict[str, Any] = {}
    if pov_file.is_file():
        try:
            pov_data = json.loads(pov_file.read_text(encoding="utf-8"))
            for img in pov_data.get("images", []):
                pid = img.get("place_id")
                if pid and pid not in pov_by_place:
                    pov_by_place[pid] = {
                        "url": img["url"],
                        "thumbnail_url": img.get("thumbnail_url"),
                        "credit": img.get("credit", CREDIT),
                        "camera": img.get("camera"),
                        "sol": img.get("sol"),
                        "position_quality": img.get("position_quality", "exact"),
                    }
        except Exception:
            pass

    # 1. gale.base (Bradbury Landing) - UNCHANGED ID
    landing_idx = int(np.argmin(sol))
    places.append({
        "id": "gale.base",
        "name": "Bradbury Landing (habitat)",
        "aliases": ["base", "habitat", "Bradbury Landing", "landing site"],
        "kind": "base",
        "lat": float(lat[landing_idx]),
        "lon": float(lon[landing_idx]),
        "elevation_m": float(elev[landing_idx]),
        "sols": [int(sol[landing_idx]), int(sol[landing_idx])],
        "source": f"{BASE_URL}/MSL_waypoints.json (first waypoint, sol {int(sol[landing_idx])})",
        "evidence": f"derived from MMGIS waypoints, sol {int(sol[landing_idx])}",
        "description": "Curiosity landing site; default habitat base for surface navigation.",
        "science_target": False,
        "pov_image": pov_by_place.get("gale.base"),
    })

    # 2. Documented intermediate mission places
    for pdef in DOCUMENTED_PLACES:
        a, b = pdef["sols"]
        m = (sol >= a) & (sol <= b)
        if not m.any():
            continue
        count = int(m.sum())
        places.append({
            "id": pdef["id"],
            "name": pdef["name"],
            "aliases": pdef["aliases"],
            "kind": pdef["kind"],
            "lat": float(lat[m].mean()),
            "lon": float(lon[m].mean()),
            "elevation_m": float(elev[m].mean()),
            "extent": {
                "lat": [float(lat[m].min()), float(lat[m].max())],
                "lon": [float(lon[m].min()), float(lon[m].max())],
            },
            "sols": [a, b],
            "source": pdef["source"],
            "evidence": f"derived from MMGIS waypoints, sols {a}–{b} (mean of {count} points)",
            "description": pdef["description"],
            "science_target": pdef["science_target"],
            "pov_image": pov_by_place.get(pdef["id"]),
        })

    # 3. gale.boxwork_region - UNCHANGED ID
    m_box = (sol >= 4600) & (sol <= 4700)
    places.append({
        "id": "gale.boxwork_region",
        "name": "Boxwork region",
        "aliases": ["Boxwork", "Altadena Member"],
        "kind": "mission_informal",
        "lat": float(lat[m_box].mean()),
        "lon": float(lon[m_box].mean()),
        "elevation_m": float(elev[m_box].mean()),
        "extent": {
            "lat": [float(lat[m_box].min()), float(lat[m_box].max())],
            "lon": [float(lon[m_box].min()), float(lon[m_box].max())],
        },
        "sols": [4600, 4700],
        "source": "https://science.nasa.gov/blog/curiosity-blog-sols-4675-4681-deciding-where-to-dig-into-the-boxworks/",
        "evidence": f"derived from MMGIS waypoints, sols 4600–4700 (mean of {int(m_box.sum())} points)",
        "description": "Network of resistant mineral ridges and hollows on Mount Sharp explored by Curiosity from sol 4600.",
        "science_target": True,
    })

    # 4. gale.rover_now - UNCHANGED ID
    places.append({
        "id": "gale.rover_now",
        "name": f"Curiosity (sol {cur['sol']})",
        "aliases": ["rover", "Curiosity", "rover_now"],
        "kind": "mission_informal",
        "lat": float(cur["lat"]),
        "lon": float(cur["lon"]),
        "elevation_m": float(cur["elev_geoid"]),
        "sols": [int(cur["sol"]), int(cur["sol"])],
        "source": f"{BASE_URL}/MSL_waypoints_current.json",
        "evidence": f"derived from MMGIS waypoints current, sol {cur['sol']}",
        "description": f"Latest rover position; {cur['dist_km']} km driven since landing.",
        "science_target": False,
    })

    out_file = PROCESSED / "gale" / "places.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_utc": now_utc(),
        "credit": CREDIT,
        "places": places,
    }
    out_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    upsert_manifest({
        "id": "gale.places",
        "family": "places",
        "product_id": "Gale_Measured_Places_v2",
        "source_url": f"{BASE_URL}/MSL_waypoints.json",
        "retrieved_at": now_utc(),
        "resolution_m": 0.0,
        "license": "NASA public domain",
        "credit": CREDIT,
        "level": "L0",
        "simulated": False,
        "notes": f"Catalog of {len(places)} Gale crater landmarks derived strictly from NASA MMGIS waypoints.",
    })

    print(f"Wrote {len(places)} places to {out_file}:")
    print(f"{'ID':24s} {'Name':28s} {'Sols':11s} {'Lat':>8s} {'Lon':>9s} {'Elev':>7s} {'Kind':16s}")
    print("-" * 115)
    for p in places:
        sols_str = f"{p['sols'][0]}..{p['sols'][1]}"
        print(f"{p['id']:24s} {p['name']:28s} {sols_str:11s} {p['lat']:8.4f} {p['lon']:9.4f} {p['elevation_m']:6.0f}m {p['kind']:16s}")


if __name__ == "__main__":
    main()
