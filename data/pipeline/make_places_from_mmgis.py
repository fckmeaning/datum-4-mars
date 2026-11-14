"""Places and the real Curiosity traverse for the Gale site, derived ONLY from NASA/JPL MMGIS waypoint files.

Every coordinate comes from a measured rover position (RMC/sol record), never from memory. Output:
  data/processed/gale/places.json     base, boxwork region, current rover position (more places are added from sol ranges
                                      that a mission source documents, see PLACE_SOLS)
  data/processed/gale/traverse.geojson  LineString of the whole traverse (lon, lat, elevation) with sol range

Usage: .venv\\Scripts\\python.exe data\\pipeline\\make_places_from_mmgis.py
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROCESSED, REPO, now_utc, upsert_manifest  # noqa: E402

BASE_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json"
RAW = REPO / "data" / "raw" / "msl"
CREDIT = "NASA/JPL-Caltech (Mars Science Laboratory, MMGIS traverse waypoints)"

# name -> (sol_from, sol_to, source, description, science_target). Sol ranges must be documented by a mission source.
PLACE_SOLS = {
    "Boxwork region": (4600, 4700, "NASA Curiosity blog, Sols 4655-4660 and 4675-4681 ('Since Sol 4600, we have been exploring the heart of "
                       "... the boxwork structures'): https://science.nasa.gov/blog/curiosity-blog-sols-4675-4681-deciding-where-to-dig-into-the-boxworks/",
                       "Network of resistant mineral ridges and sand-filled hollows on Mount Sharp, explored by Curiosity from sol 4600.", True),
}


def fetch(name: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / name
    if not path.is_file():
        req = urllib.request.Request(f"{BASE_URL}/{name}", headers={"User-Agent": "marsnav-hackathon/0.1"})
        with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310 - fixed NASA https URL
            path.write_bytes(r.read())
    return path


def main() -> None:
    wp = json.loads(fetch("MSL_waypoints.json").read_text(encoding="utf-8"))["features"]
    cur = json.loads(fetch("MSL_waypoints_current.json").read_text(encoding="utf-8"))["features"][0]["properties"]
    rows = sorted((f["properties"]["sol"], f["properties"]["lat"], f["properties"]["lon"], f["properties"]["elev_geoid"]) for f in wp)
    sol = np.array([r[0] for r in rows])
    lat = np.array([r[1] for r in rows])
    lon = np.array([r[2] for r in rows])
    elev = np.array([r[3] for r in rows])

    out_dir = PROCESSED / "gale"
    out_dir.mkdir(parents=True, exist_ok=True)

    landing = int(np.argmin(sol))
    places = [{
        "id": "gale.base", "name": "Bradbury Landing (habitat)", "aliases": ["base", "habitat", "Bradbury Landing", "landing site"],
        "kind": "base", "lat": float(lat[landing]), "lon": float(lon[landing]), "elevation_m": float(elev[landing]),
        "source": f"{BASE_URL}/MSL_waypoints.json (first waypoint, sol {int(sol[landing])})", "description": "Curiosity landing site; default base.",
        "science_target": False,
    }]
    for name, (a, b, source, desc, sci) in PLACE_SOLS.items():
        m = (sol >= a) & (sol <= b)
        if not m.any():
            continue
        places.append({
            "id": "gale." + name.lower().replace(" ", "_"), "name": name, "aliases": [], "kind": "mission_informal",
            "lat": float(lat[m].mean()), "lon": float(lon[m].mean()), "elevation_m": float(elev[m].mean()),
            "extent": {"lat": [float(lat[m].min()), float(lat[m].max())], "lon": [float(lon[m].min()), float(lon[m].max())]},
            "sols": [a, b], "source": source + f" | position = mean of {int(m.sum())} MMGIS waypoints, sols {a}-{b}",
            "description": desc, "science_target": sci,
        })
    places.append({
        "id": "gale.rover_now", "name": f"Curiosity (sol {cur['sol']})", "aliases": ["rover", "Curiosity"], "kind": "mission_informal",
        "lat": float(cur["lat"]), "lon": float(cur["lon"]), "elevation_m": float(cur["elev_geoid"]), "sols": [int(cur["sol"]), int(cur["sol"])],
        "source": f"{BASE_URL}/MSL_waypoints_current.json", "description": f"Latest rover position, {cur['dist_km']} km driven since landing.",
        "science_target": False,
    })
    (out_dir / "places.json").write_text(json.dumps({"generated_utc": now_utc(), "credit": CREDIT, "places": places}, indent=2), encoding="utf-8")

    coords = [[round(float(lo), 6), round(float(la), 6), round(float(el), 1)] for la, lo, el in zip(lat, lon, elev, strict=True)]
    trav = {"type": "FeatureCollection", "credit": CREDIT, "features": [{
        "type": "Feature", "properties": {"name": "Curiosity traverse", "sol_first": int(sol[0]), "sol_last": int(sol[-1]), "points": len(coords),
                                          "sols": [int(s) for s in sol]},
        "geometry": {"type": "LineString", "coordinates": coords}}]}
    (out_dir / "traverse.geojson").write_text(json.dumps(trav, separators=(",", ":")), encoding="utf-8")

    upsert_manifest({"id": "nasa.msl_mmgis_waypoints", "family": "geology", "product_id": "MSL_waypoints.json + MSL_waypoints_current.json",
                     "source_url": f"{BASE_URL}/MSL_waypoints.json", "retrieved_at": now_utc(), "resolution_m": None, "license": "NASA public data [verify]",
                     "credit": CREDIT, "level": "-", "simulated": False,
                     "notes": f"{len(rows)} measured rover positions, sol {int(sol[0])}-{int(sol[-1])}; source of places.json and traverse.geojson."})
    for p in places:
        print(f"{p['id']:22s} lat {p['lat']:.4f} lon {p['lon']:.4f} elev {p['elevation_m']:.0f} m")
    print(f"traverse.geojson: {len(coords)} points, sols {int(sol[0])}-{int(sol[-1])}")


if __name__ == "__main__":
    main()
