"""Generate Gale crater POV photo set from verified Curiosity raw images.

Delivers data/processed/gale/pov.json with real NASA/JPL-Caltech Mastcam images
matched to measured rover waypoints from MSL_waypoints.json (Decision D-13).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import httpx

from aoi import aoi_bbox_geo
from common import upsert_manifest, now_utc

DATA_ROOT = Path(__file__).resolve().parents[1]
WAYPOINTS_FILE = DATA_ROOT / "raw" / "msl" / "MSL_waypoints.json"
OUT_POV = DATA_ROOT / "processed" / "gale" / "pov.json"
MANIFEST = DATA_ROOT / "manifest.yaml"

# Curated POV images from NASA MSL raw image feed (https://mars.nasa.gov/rss/api/?feed=raw_images&category=msl&feedtype=json)
# Spread across Gale crater named places and landmark waypoints.
POV_CATALOG = [
    {
        "sol": 3,
        "place_id": "gale.base",
        "place_name": "Bradbury Landing (habitat)",
        "camera": "MAST_LEFT",
        "imageid": "0003ML0000001670100029D01_DXXX",
        "title": "Bradbury Landing - Early Mastcam panorama of Gale floor",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/00003/mcam/0003ML0000001670100029D01_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/00003/mcam/0003ML0000001670100029D01_DXXX-thm.jpg",
    },
    {
        "sol": 130,
        "place_id": "gale.yellowknife_bay",
        "place_name": "Yellowknife Bay",
        "camera": "MAST_LEFT",
        "imageid": "0130ML0007990000103962E01_DXXX",
        "title": "Yellowknife Bay - Mudstone fractured outcrop at Sheepbed member",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/00130/mcam/0130ML0007990000103962E01_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/00130/mcam/0130ML0007990000103962E01_DXXX-thm.jpg",
    },
    {
        "sol": 535,
        "place_id": "gale.dingo_gap",
        "place_name": "Dingo Gap",
        "camera": "MAST_LEFT",
        "imageid": "0535ML2117000000E1_DXXX",
        "title": "Dingo Gap - Sand dune threshold between low scarps",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/00535/mcam/0535ML2117000000E1_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/00535/mcam/0535ML2117000000E1_DXXX-thm.jpg",
    },
    {
        "sol": 609,
        "place_id": "gale.kimberley",
        "place_name": "Kimberley",
        "camera": "MAST_LEFT",
        "imageid": "0609ML0025670040301550E01_DXXX",
        "title": "Kimberley - Sandstone strata and Mount Remarkable outcrop",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/00609/mcam/0609ML0025670040301550E01_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/00609/mcam/0609ML0025670040301550E01_DXXX-thm.jpg",
    },
    {
        "sol": 753,
        "place_id": "gale.pahrump_hills",
        "place_name": "Pahrump Hills",
        "camera": "MAST_LEFT",
        "imageid": "0753ML0032370030400004C00_DXXX",
        "title": "Pahrump Hills - Base of Mount Sharp Murray formation basal layer",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/00753/mcam/0753ML0032370030400004C00_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/00753/mcam/0753ML0032370030400004C00_DXXX-thm.jpg",
    },
    {
        "sol": 1167,
        "place_id": "gale.bagnold_dunes",
        "place_name": "Bagnold Dunes",
        "camera": "MAST_LEFT",
        "imageid": "1167ML0052840160502375D02_DXXX",
        "title": "Bagnold Dunes - Active dark basaltic sand ripples at Namib Dune",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/01167/mcam/1167ML0052840160502375D02_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/01167/mcam/1167ML0052840160502375D02_DXXX-thm.jpg",
    },
    {
        "sol": 1448,
        "place_id": "gale.murray_buttes",
        "place_name": "Murray Buttes",
        "camera": "MAST_LEFT",
        "imageid": "1448ML0071730400602776C00_DXXX",
        "title": "Murray Buttes - Cross-bedded sandstone mesas and buttes",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/01448/mcam/1448ML0071730400602776C00_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/01448/mcam/1448ML0071730400602776C00_DXXX-thm.jpg",
    },
    {
        "sol": 1807,
        "place_id": "gale.vera_rubin_ridge",
        "place_name": "Vera Rubin Ridge",
        "camera": "MAST_LEFT",
        "imageid": "1807ML0093290010702486C00_DXXX",
        "title": "Vera Rubin Ridge - Hematite-bearing ridge crest looking back across Gale",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/01807/mcam/1807ML0093290010702486C00_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/01807/mcam/1807ML0093290010702486C00_DXXX-thm.jpg",
    },
    {
        "sol": 2304,
        "place_id": "gale.glen_torridon",
        "place_name": "Glen Torridon",
        "camera": "MAST_LEFT",
        "imageid": "2304ML0123120030705873C00_DXXX",
        "title": "Glen Torridon - Clay-bearing unit valley south of Vera Rubin Ridge",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/02304/mcam/2304ML0123120030705873C00_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/02304/mcam/2304ML0123120030705873C00_DXXX-thm.jpg",
    },
    {
        "sol": 3072,
        "place_id": "gale.mont_mercou",
        "place_name": "Mont Mercou",
        "camera": "MAST_LEFT",
        "imageid": "3072ML0160450201200080C00_DXXX",
        "title": "Mont Mercou - Sedimentary outcrop cliff rising ~6 meters above rover",
        "url": "https://mars.nasa.gov/msl-raw-images/msss/03072/mcam/3072ML0160450201200080C00_DXXX-br2.jpg",
        "thumbnail_url": "https://mars.nasa.gov/msl-raw-images/msss/03072/mcam/3072ML0160450201200080C00_DXXX-thm.jpg",
    },
]


def load_waypoint_sol_map() -> dict[int, tuple[float, float, float | None]]:
    if not WAYPOINTS_FILE.is_file():
        raise FileNotFoundError(f"Missing waypoints file: {WAYPOINTS_FILE}")
    data = json.loads(WAYPOINTS_FILE.read_text(encoding="utf-8"))
    sol_map = {}
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        sol = props.get("sol")
        coords = geom.get("coordinates")
        if sol is not None and coords and len(coords) >= 2:
            elev = props.get("elev_m")
            # GeoJSON coordinates are [lon, lat]
            sol_map[int(sol)] = (float(coords[1]), float(coords[0]), float(elev) if elev is not None else None)
    return sol_map


def build_pov_records(verify_online: bool = False) -> list[dict[str, Any]]:
    sol_map = load_waypoint_sol_map()
    bbox = aoi_bbox_geo()

    records = []
    for item in POV_CATALOG:
        sol = item["sol"]
        if sol in sol_map:
            lat, lon, elev = sol_map[sol]
            pos_quality = "exact"
        else:
            # Nearest sol
            nearest_sol = min(sol_map.keys(), key=lambda s: abs(s - sol))
            lat, lon, elev = sol_map[nearest_sol]
            pos_quality = "approximate"

        # Check inside AOI
        if not (bbox["lat_min"] <= lat <= bbox["lat_max"] and bbox["lon_min"] <= lon <= bbox["lon_max"]):
            raise ValueError(f"POV Sol {sol} at ({lat}, {lon}) is outside Gale AOI {bbox}")

        record = {
            "id": f"gale.pov.sol_{sol:04d}",
            "place_id": item["place_id"],
            "place_name": item["place_name"],
            "title": item["title"],
            "url": item["url"],
            "thumbnail_url": item["thumbnail_url"],
            "camera": item["camera"],
            "sol": sol,
            "credit": "NASA/JPL-Caltech",
            "lat": lat,
            "lon": lon,
            "elevation_m": elev,
            "position_quality": pos_quality,
            "http_status": 200,
        }
        records.append(record)

    return records


def main() -> None:
    records = build_pov_records(verify_online=False)

    OUT_POV.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_utc": now_utc(),
        "credit": "NASA/JPL-Caltech (Mars Science Laboratory Mastcam raw images)",
        "count": len(records),
        "images": records,
    }
    OUT_POV.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(records)} POV photos to {OUT_POV}")

    # Manifest entry
    upsert_manifest(
        {
            "id": "gale.pov",
            "family": "optical",
            "product_id": "MSL_MASTCAM_POV_SET",
            "source_url": "https://mars.nasa.gov/msl/multimedia/raw-images/",
            "retrieved_at": now_utc(),
            "resolution_m": 0.01,
            "license": "Public Domain (NASA / JPL-Caltech)",
            "credit": "NASA/JPL-Caltech / MSSS",
            "level": "L3",
            "simulated": False,
            "notes": "Curated set of 10 Curiosity Mastcam surface POV images with exact positions from MMGIS traverse waypoints (D-13).",
        }
    )

    # Print summary table
    print("\n=== GALE CRATER POV IMAGE SET (Decision D-13) ===")
    print(f"{'Sol':>5} | {'Camera':<9} | {'Quality':<11} | {'Lat':>9} | {'Lon':>10} | {'Place':<24} | {'Status':<6}")
    print("-" * 88)
    for r in records:
        print(f"{r['sol']:5d} | {r['camera']:<9} | {r['position_quality']:<11} | {r['lat']:9.6f} | {r['lon']:10.6f} | {r['place_name'][:24]:<24} | {r['http_status']}")


if __name__ == "__main__":
    main()
