"""Precompute everything the static (no-server) web build used to ask the Python API for.

The web app (apps/web) must run from a plain folder of files. What the browser can compute (mission clock, sun, light time,
orbiter positions, place search, RFC 7946 route export, EVA planner) is done in TypeScript. What needs the Python core is
computed here, once, by calling the real API application in-process (FastAPI TestClient, so the numbers are exactly what the
server would answer) and written as JSON under apps/web/public/data/static/:

    sources.json      GET /sources              (data/manifest.yaml)
    sites.json        GET /sites, /sites/gale   (site record) and layers (all levels)
    places_gale.json  GET /sites/gale/places
    orbiters.json     GET /orbiters             (elements; positions are propagated in the browser)
    space_weather.json  snapshot of NASA DONKI (WSA-ENLIL, Mars) with its timestamp; the browser tries the live feed first
    routes_gale.json  POST /route (SAFEST, FASTEST), /route/alternatives, /route/rover (walkback), /route/back-to-base,
                      from the base station to every place and back, GET viewshed per place, GET isochrones from the base
    manifest.json     what was generated, when, from which code

Run (from the repo root, with the project venv):
    .venv/Scripts/python.exe data/pipeline/make_static_routes.py [--skip-routes] [--skip-weather] [--only-fpv]

Needs data/processed (built by the other pipeline scripts). Routes take a few minutes; nothing is downloaded except the DONKI
forecast (public api.nasa.gov with the published DEMO_KEY, unless NASA_API_KEY is set). No file is written outside public/data/static.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import warnings
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web" / "public" / "data" / "static"
sys.path[:0] = [str(ROOT / "apps" / "api"), str(ROOT / "packages" / "marsnav" / "src")]
warnings.filterwarnings("ignore")

API = "/api/v1"
START_UTC = "2026-11-14T08:30:00Z"  # the same instant the first-person view uses; routes depend on the sun, so it is stamped


def _round(o, nd=6):
    """Round floats (smaller files; 1e-6 degree is 6 mm on Mars)."""
    if isinstance(o, float):
        return round(o, nd)
    if isinstance(o, list):
        return [_round(v, nd) for v in o]
    if isinstance(o, dict):
        return {k: _round(v, nd) for k, v in o.items()}
    return o


def write_json(name: str, data) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    raw = json.dumps(_round(data), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    path.write_bytes(raw)  # bytes: no CRLF conversion on Windows
    print(f"  {name}: {len(raw) / 1024:.1f} KiB")
    return len(raw)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-routes", action="store_true")
    ap.add_argument("--skip-weather", action="store_true")
    ap.add_argument("--only-fpv", action="store_true", help="routes: only the base -> Boxwork SAFEST route the first-person view needs")
    args = ap.parse_args()

    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    t_all = time.perf_counter()
    manifest: dict = {"generated_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "start_utc": START_UTC, "files": {}}

    def get(path: str):
        r = c.get(API + path)
        r.raise_for_status()
        return r.json()

    print("static metadata")
    manifest["files"]["sources.json"] = write_json("sources.json", get("/sources"))
    site = get("/sites/gale")
    layers = {lv: get(f"/sites/gale/layers?level={lv}") for lv in ("L0", "L1", "L2", "L3")}
    manifest["files"]["sites.json"] = write_json("sites.json", {"sites": [site], "layers": layers})
    places = get("/sites/gale/places")
    manifest["files"]["places_gale.json"] = write_json("places_gale.json", places)
    manifest["files"]["orbiters.json"] = write_json("orbiters.json", get("/orbiters"))

    if not args.skip_weather:
        print("space weather snapshot (NASA DONKI, WSA-ENLIL)")
        from app import spaceweather

        now = datetime.now(UTC)
        alerts = spaceweather.alerts("live", now=now)
        if any(a["id"] == "donki-unavailable" for a in alerts):
            print("  DONKI not reachable: snapshot NOT written (the old one stays)")
        else:
            snap = {"snapshot_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "NASA DONKI WSA-ENLIL (api.nasa.gov/DONKI/WSAEnlilSimulations)",
                    "window_days": 30, "alerts": alerts}
            manifest["files"]["space_weather.json"] = write_json("space_weather.json", snap)

    if args.skip_routes:
        _finish(manifest, t_all)
        return

    print("routes (the Python core, a few minutes)")
    by_id = {p["id"]: p for p in places}
    base = next(p for p in places if p["kind"] == "base")
    targets = [p for p in places if p["id"] != base["id"]]
    if args.only_fpv:
        targets = [p for p in targets if p["id"] == "gale.boxwork_region"]

    def wp(a: dict, b: dict) -> list[dict]:
        return [{"place_id": a["id"], "role": "start"}, {"place_id": b["id"], "role": "goal"}]

    items: dict[str, object] = {}
    failed: dict[str, str] = {}

    def post(key: str, path: str, body: dict) -> None:
        t = time.perf_counter()
        r = c.post(API + path, json=body)
        dt = time.perf_counter() - t
        if r.status_code == 200:
            items[key] = r.json()
            print(f"  {key}  {dt:.1f}s  {len(r.content) / 1024:.0f} KiB")
        else:
            failed[key] = f"{r.status_code} {r.json().get('code', '')}: {r.json().get('message', '')[:120]}"
            print(f"  {key}  FAILED {failed[key]}")

    for p in targets:
        common = {"site_id": "gale", "start_utc": START_UTC, "waypoints": wp(base, p)}
        post(f"route|SAFEST|{base['id']}|{p['id']}", "/route", {**common, "profile": "SAFEST"})
        if args.only_fpv:
            continue
        post(f"route|FASTEST|{base['id']}|{p['id']}", "/route", {**common, "profile": "FASTEST"})
        post(f"alternatives|{base['id']}|{p['id']}", "/route/alternatives", {**common, "profiles": ["FASTEST", "BALANCED", "SAFEST"]})
        post(f"rover|SAFEST|{base['id']}|{p['id']}", "/route/rover", {**common, "profile": "SAFEST"})
        post(f"back_to_base|{p['id']}", "/route/back-to-base",
             {"site_id": "gale", "start_utc": START_UTC, "profile": "SAFEST", "position": {"lat": p["lat"], "lon": p["lon"]},
              "base": {"lat": base["lat"], "lon": base["lon"]}})

    extras: dict[str, object] = {}
    if not args.only_fpv:
        print("viewshed (observer height 2 m, radius 3 km) and isochrones")
        for p in [base, *targets]:
            r = c.get(API + "/sites/gale/viewshed", params={"lat": p["lat"], "lon": p["lon"], "radius_m": 3000, "height_m": 2})
            if r.status_code == 200:
                extras[f"viewshed|{p['id']}"] = r.json()
            else:
                failed[f"viewshed|{p['id']}"] = f"{r.status_code}"
        r = c.get(API + "/sites/gale/isochrones", params={"minutes": "15,30,60,90,120"})
        if r.status_code == 200:
            extras["isochrones|gale"] = r.json()
        else:
            failed["isochrones|gale"] = f"{r.status_code}"
        r = c.get(API + "/sites/gale/walkability/summary")
        if r.status_code == 200:
            extras["walkability_summary|gale"] = r.json()

    out = {"start_utc": START_UTC, "generated_utc": manifest["generated_utc"], "base_id": base["id"], "items": items, "extras": extras,
           "failed": failed, "note": "Precomputed by the Python core; start_utc is fixed, so sun-dependent costs are for that instant."}
    # keep an existing richer file when only the FPV route was asked for
    existing = OUT / "routes_gale.json"
    if args.only_fpv and existing.is_file():
        prev = json.loads(existing.read_text(encoding="utf-8"))
        prev["items"].update(items)
        out = prev
    manifest["files"]["routes_gale.json"] = write_json("routes_gale.json", out)
    _finish(manifest, t_all)


def _finish(manifest: dict, t0: float) -> None:
    write_json("manifest.json", {**manifest, "elapsed_s": round(time.perf_counter() - t0, 1)})
    print(f"done in {time.perf_counter() - t0:.0f} s -> {OUT}")


if __name__ == "__main__":
    main()
