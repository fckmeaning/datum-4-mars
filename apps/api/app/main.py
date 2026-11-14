"""FastAPI application. Run:  .venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir apps/api --port 8000"""

from __future__ import annotations

import difflib
import re
from datetime import UTC, datetime
from typing import Any, Literal

import marsnav
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from marsnav.config import param
from marsnav.env import (
    SIMULATED_FIELDS,
    atmosphere,
    dose_rate,
    pressure,
    surface_temperature,
)
from marsnav.geodesy import geo_to_aoi
from marsnav.routing.astar import NoPathError
from marsnav.routing.planner import (
    alternatives,
    back_to_base,
    order_waypoints,
    plan_route,
)
from marsnav.sun import incidence, irradiance, mars24, sun_position
from marsnav.terrain import horizon_profile, sky_fraction
from pydantic import BaseModel, Field, model_validator

from . import sites

API = "/api/v1"
app = FastAPI(title="marsnav API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
                   allow_methods=["*"], allow_headers=["*"])
app.mount("/data", StaticFiles(directory=str(sites.data_root()), check_dir=False), name="data")


def err(status: int, code: str, message: str, **details: Any) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, "details": details})


@app.exception_handler(HTTPException)
async def http_error(_, exc: HTTPException):
    body = exc.detail if isinstance(exc.detail, dict) else {"code": "ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=body)


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


# ---------------------------------------------------------------- models (request side; responses follow the contract)
class Waypoint(BaseModel):
    place_id: str | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    x: float | None = None
    y: float | None = None
    role: Literal["start", "via", "science", "goal"] = "via"
    dwell_min: float = Field(0, ge=0, le=240)

    @model_validator(mode="after")
    def one_location(self):
        if not (self.place_id or (self.lat is not None and self.lon is not None) or (self.x is not None and self.y is not None)):
            raise ValueError("a waypoint needs place_id, lat+lon, or x+y")
        return self


Profile = Literal["FASTEST", "SAFEST", "BALANCED", "SCIENCE"]


class RouteRequest(BaseModel):
    site_id: str
    waypoints: list[Waypoint] = Field(min_length=2, max_length=20)
    profile: Profile = "BALANCED"
    weights: dict[str, float] | None = None
    constraints: dict[str, Any] | None = None
    start_utc: str | None = None
    astronaut: dict[str, float] | None = None
    optimize_order: bool = False
    return_to_start: bool = False
    algorithm: Literal["astar", "theta"] = "astar"
    level: Literal["L0", "L1", "L2", "L3"] | None = None


class AlternativesRequest(RouteRequest):
    profiles: list[Profile] = ["FASTEST", "SAFEST", "BALANCED", "SCIENCE"]


class OrderRequest(BaseModel):
    site_id: str
    waypoints: list[Waypoint] = Field(min_length=3, max_length=20)
    profile: Profile = "BALANCED"
    start_utc: str | None = None
    return_to_start: bool = True


class GeoPoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class BackToBaseRequest(BaseModel):
    site_id: str
    position: GeoPoint
    base: GeoPoint | None = None
    start_utc: str | None = None
    profile: Profile = "SAFEST"
    astronaut: dict[str, float] | None = None


# ---------------------------------------------------------------- helpers
def _site_or_404(site_id: str) -> dict:
    try:
        return sites.site_record(site_id)
    except KeyError:
        raise err(404, "UNKNOWN_SITE", f"Site '{site_id}' does not exist. Use GET /sites.") from None


def _resolve_rc(site_id: str, grid, wp: Waypoint) -> tuple[int, int]:
    if wp.place_id:
        match = next((p for p in sites.places(site_id) if p["id"] == wp.place_id), None)
        if not match:
            raise err(400, "UNKNOWN_PLACE", f"Place '{wp.place_id}' is not known for site '{site_id}'.")
        rc = grid.latlon_to_rc(match["lat"], match["lon"])
    elif wp.lat is not None and wp.lon is not None:
        rc = grid.latlon_to_rc(wp.lat, wp.lon)
    else:
        rc = grid.xy_to_rc(float(wp.x), float(wp.y))  # type: ignore[arg-type]
    if not grid.inside(*rc):
        raise err(400, "OUT_OF_AOI", "A waypoint lies outside the site area. Pick a point inside the map bounds.")
    return rc


def _grid(site_id: str, level: str | None):
    _site_or_404(site_id)
    try:
        return sites.get_grid(site_id, level)
    except KeyError as e:
        raise err(400, "LEVEL_UNAVAILABLE", str(e)) from None


def _no_route(e: Exception) -> HTTPException:
    return err(422, "NO_ROUTE", f"No feasible route: {e}. Try other points or relax the slope limit.")


# ---------------------------------------------------------------- system & sites
@app.get(API + "/health")
def health() -> dict:
    return {"status": "ok", "api_version": app.version, "contract_version": marsnav.CONTRACT_VERSION,
            "data_levels": sites.available_levels("gale") or ["L0"]}


@app.get(API + "/sources")
def list_sources() -> list[dict]:
    import yaml
    from marsnav.config import repo_root

    f = repo_root() / "data" / "manifest.yaml"
    if not f.is_file():
        return []
    items = (yaml.safe_load(f.read_text(encoding="utf-8")) or {}).get("products", [])
    return [{"product_id": None, "retrieved_at": None, "resolution_m": None, "license": None, "level": None, "notes": None,
             "simulated": False, **p} for p in items if {"id", "family", "source_url", "credit"} <= set(p)]


@app.get(API + "/sites")
def list_sites() -> list[dict]:
    return [sites.site_record("gale")]


@app.get(API + "/sites/{site_id}")
def get_site(site_id: str) -> dict:
    return _site_or_404(site_id)


@app.get(API + "/sites/{site_id}/layers")
def list_layers(site_id: str, level: str | None = None) -> list[dict]:
    _site_or_404(site_id)
    return sites.layer_metas(site_id, level)


@app.get(API + "/sites/{site_id}/clock")
def site_clock(site_id: str, utc: str | None = None) -> dict:
    from marsnav.config import projection
    from marsnav.orbits import earth_mars_light_time
    from marsnav.sun import mission_sol, solar_time

    _site_or_404(site_id)
    mission = projection()["aoi"]["mission"]
    t = utc or now_iso()
    try:
        mt = mars24(t)
        lmst, ltst = solar_time(mission["landing_lon_east"], mt)
        sol = mission_sol(t, mission["landing_lon_east"], mission["landing_utc"])
        lt = earth_mars_light_time(t)
    except ValueError:
        raise err(400, "INVALID_TIME", "utc must be an ISO 8601 timestamp, e.g. 2026-11-14T15:30:00Z") from None
    return {"utc": t, "mission_name": mission["name"], "mission_sol": sol, "lmst_h": lmst, "ltst_h": ltst, "ls_deg": mt.ls_deg,
            "earth_link_one_way_s": lt["one_way_s"], "earth_link_accuracy": "approximate"}


@app.get(API + "/sites/{site_id}/places")
def list_site_places(site_id: str, kind: list[str] | None = Query(None)) -> list[dict]:
    _site_or_404(site_id)
    items = sites.places(site_id)
    return [p for p in items if not kind or p["kind"] in kind]


@app.get(API + "/layers/{layer_id}/meta")
def layer_meta(layer_id: str) -> dict:
    site_id = layer_id.split(".")[0]
    for m in sites.layer_metas(site_id):
        if m["id"] == layer_id:
            return m
    raise err(404, "UNKNOWN_LAYER", f"Layer '{layer_id}' does not exist.")


def _sample_grid(grid, rc) -> float | None:
    v = float(grid.z[rc])
    return v if np.isfinite(v) else None


@app.get(API + "/layers/{layer_id}/sample")
def sample_layer(layer_id: str, lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180), utc: str | None = None) -> dict:
    meta = layer_meta(layer_id)
    import rasterio

    path = sites.data_root() / meta["cog_url"].removeprefix("/data/")
    x, y = geo_to_aoi(lat, lon)
    with rasterio.open(path) as src:
        r, c = src.index(float(x), float(y))
        if not (0 <= r < src.height and 0 <= c < src.width):
            raise err(400, "OUT_OF_AOI", "The point is outside this layer.")
        v = float(src.read(1, window=((r, r + 1), (c, c + 1)))[0, 0])
        if src.nodata is not None and v == src.nodata:
            v = None  # type: ignore[assignment]
    return {"layer_id": layer_id, "lat": lat, "lon": lon, "x": float(x), "y": float(y), "value": v, "unit": meta["unit"],
            "utc": utc, "simulated": bool(meta.get("simulated", False))}


@app.get(API + "/sites/{site_id}/whats-here")
def whats_here(site_id: str, lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180), utc: str | None = None) -> dict:
    grid = _grid(site_id, None)
    rc = grid.latlon_to_rc(lat, lon)
    if not grid.inside(*rc):
        raise err(400, "OUT_OF_AOI", "The point is outside the site area.")
    t = utc or now_iso()
    sun = sun_position(lat, lon, t)
    h = horizon_profile(grid.z, grid.cell, rc[0], rc[1], n_az=72, r_max=20000.0)
    sky = float(sky_fraction(h))
    k = round(sun.azimuth_deg / 5.0) % 72
    shadowed = bool(sun.elevation_deg <= 0 or np.radians(sun.elevation_deg) < h[k])
    slope, aspect = grid.slope_aspect
    cos_i = 0.0 if shadowed else float(incidence(slope[rc], aspect[rc], sun.elevation_deg, sun.azimuth_deg))
    z = _sample_grid(grid, rc)
    P = float(pressure(z if z is not None else grid.z_ref, grid.z_ref))
    x, y = grid.rc_to_xy(*rc)
    samples = []
    for m in sites.layer_metas(site_id):
        try:
            samples.append(sample_layer(m["id"], lat, lon, t))
        except HTTPException:
            continue
    return {"site_id": site_id, "point": {"lat": lat, "lon": lon}, "xy": {"x": float(x), "y": float(y)}, "utc": t,
            "elevation_m": z, "slope_deg": float(np.degrees(slope[rc])), "aspect_deg": float(np.degrees(aspect[rc])),
            "roughness_m": float(grid.roughness_m[rc]), "sky_fraction": sky, "shadowed": shadowed,
            "surface_temp_K": float(surface_temperature(cos_i)), "dose_rate_mSv_h": float(dose_rate(sky, P)),
            "thermal_inertia": None, "science_value": None, "samples": samples,
            "simulated_fields": ["surface_temp_K"] + (["elevation_m", "slope_deg"] if grid.simulated else [])}


# ---------------------------------------------------------------- places
_COORD = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$")


@app.get(API + "/places/search")
def search_places(q: str = Query(min_length=1, max_length=100), site_id: str | None = None, limit: int = Query(10, ge=1, le=50)) -> list[dict]:
    sid = site_id or "gale"
    m = _COORD.match(q)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            x, y = geo_to_aoi(lat, lon)
            return [{"id": f"coord:{lat:.5f},{lon:.5f}", "name": f"{lat:.4f}, {lon:.4f}", "aliases": [], "kind": "coordinate",
                     "lat": lat, "lon": lon, "x": float(x), "y": float(y), "source": "user input", "description": None,
                     "science_target": False, "pov_image": None}]
    ql = q.lower().strip()
    scored = []
    for p in sites.places(sid):
        names = [p["name"], *p.get("aliases", [])]
        best = max(difflib.SequenceMatcher(None, ql, n.lower()).ratio() + (0.5 if ql in n.lower() else 0) for n in names)
        scored.append((best, p))
    return [p for s, p in sorted(scored, key=lambda t: -t[0]) if s >= 0.35][:limit]


# ---------------------------------------------------------------- routes
def _base_rc(grid, site_id: str) -> tuple[int, int] | None:  # noqa: ANN001
    """Base cell for the return-reserve check, or None when the base lies outside the loaded grid."""
    b = sites.base_place(site_id)
    rc = grid.latlon_to_rc(b["lat"], b["lon"])
    return rc if grid.inside(*rc) else None


def _plan_kwargs(req: RouteRequest, grid=None) -> dict:  # noqa: ANN001
    kw = {"start_utc": req.start_utc or now_iso(), "astronaut": req.astronaut, "return_to_start": req.return_to_start,
          "optimize_order": req.optimize_order}
    if grid is not None:
        kw["base_rc"] = _base_rc(grid, req.site_id)
    return kw


@app.post(API + "/route")
def route(req: RouteRequest) -> dict:
    grid = _grid(req.site_id, req.level)
    rcs = [_resolve_rc(req.site_id, grid, w) for w in req.waypoints]
    try:
        return plan_route(grid, rcs, profile=req.profile, weights=req.weights, **_plan_kwargs(req, grid))
    except NoPathError as e:
        raise _no_route(e) from None


@app.post(API + "/route/alternatives")
def route_alternatives(req: AlternativesRequest) -> dict:
    grid = _grid(req.site_id, req.level)
    rcs = [_resolve_rc(req.site_id, grid, w) for w in req.waypoints]
    try:
        return alternatives(grid, rcs, list(req.profiles), **_plan_kwargs(req, grid))
    except NoPathError as e:
        raise _no_route(e) from None


@app.post(API + "/route/order")
def route_order(req: OrderRequest) -> dict:
    grid = _grid(req.site_id, None)
    rcs = [_resolve_rc(req.site_id, grid, w) for w in req.waypoints]
    try:
        return order_waypoints(grid, rcs, req.profile, req.start_utc or now_iso(), None, req.return_to_start)
    except NoPathError as e:
        raise _no_route(e) from None


@app.post(API + "/route/back-to-base")
def route_back_to_base(req: BackToBaseRequest) -> dict:
    grid = _grid(req.site_id, None)
    pos = grid.latlon_to_rc(req.position.lat, req.position.lon)
    b = req.base or GeoPoint(**{k: sites.base_place(req.site_id)[k] for k in ("lat", "lon")})
    base = grid.latlon_to_rc(b.lat, b.lon)
    for rc in (pos, base):
        if not grid.inside(*rc):
            raise err(400, "OUT_OF_AOI", "Position or base is outside the site area.")
    try:
        return back_to_base(grid, pos, base, req.start_utc or now_iso(), req.profile, req.astronaut)
    except NoPathError as e:
        raise _no_route(e) from None


def _not_yet(name: str) -> HTTPException:
    return err(501, "NOT_IMPLEMENTED", f"{name} is a P1 feature that is not implemented yet.")


class ParetoRequest(RouteRequest):
    n_points: int = Field(7, ge=3, le=9)


@app.post(API + "/route/pareto")
def route_pareto(req: ParetoRequest) -> dict:
    from marsnav.routing.planner import pareto_routes

    grid = _grid(req.site_id, req.level)
    rcs = [_resolve_rc(req.site_id, grid, w) for w in req.waypoints]
    kw = _plan_kwargs(req, grid)
    kw.pop("optimize_order", None)
    try:
        return pareto_routes(grid, rcs, n_points=req.n_points, **kw)
    except NoPathError as e:
        raise _no_route(e) from None


class UncertaintyRequest(BaseModel):
    route: RouteRequest
    runs: int = Field(100, ge=20, le=200)
    seed: int = 42


@app.post(API + "/route/uncertainty")
def route_uncertainty_ep(req: UncertaintyRequest) -> dict:
    from marsnav.routing.cost import Astronaut, build_layers
    from marsnav.uncertainty import route_uncertainty

    r = req.route
    grid = _grid(r.site_id, r.level)
    rcs = [_resolve_rc(r.site_id, grid, w) for w in r.waypoints]
    kw = _plan_kwargs(r, grid)
    try:
        layers = build_layers(grid, kw["start_utc"], Astronaut.from_api(r.astronaut))
        planned = plan_route(grid, rcs, profile=r.profile, weights=r.weights, layers=layers, return_cells=True, **kw)
    except NoPathError as e:
        raise _no_route(e) from None
    mc = route_uncertainty(grid, layers, [tuple(c) for c in planned["cells"]], r.profile, r.astronaut, req.runs, req.seed)
    return {"route_id": planned["route_id"], "quantiles": mc["quantiles"], "runs": mc["runs"], "seed": mc["seed"],
            "varied_parameters": mc["varied_parameters"]}


class OffRouteRequest(BaseModel):
    route_xy: list[list[float]] = Field(min_length=2)
    position: GeoPoint
    recent_distances_m: list[float] = []


@app.post(API + "/route/off-route")
def off_route_ep(req: OffRouteRequest) -> dict:
    from marsnav.geodesy import aoi_to_geo
    from marsnav.routing.offroute import off_route

    x, y = geo_to_aoi(req.position.lat, req.position.lon)
    try:
        r = off_route(req.route_xy, [float(x), float(y)], req.recent_distances_m)
    except ValueError as e:
        raise err(400, "INVALID_ROUTE", str(e)) from None
    nx, ny = r["nearest_xy"]
    lat, lon = aoi_to_geo(nx, ny)
    return {"distance_m": r["distance_m"], "progress_m": r["progress_m"], "progress_fraction": r["progress_fraction"],
            "nearest": {"lat": float(lat), "lon": float(lon)}, "reroute": r["reroute"]}


# ---------------------------------------------------------------- environment
def _sun_dict(lat: float, lon: float, utc: str) -> dict:
    s = sun_position(lat, lon, utc)
    mt = mars24(utc)
    irr = float(irradiance(1.0, s.elevation_deg, float(atmosphere(s.ltst_h)["tau"]), mt.sun_distance_au))
    return {"utc": s.utc, "msd": s.msd, "ls_deg": s.ls_deg, "lmst_h": s.lmst_h, "ltst_h": s.ltst_h,
            "elevation_deg": s.elevation_deg, "azimuth_deg": s.azimuth_deg, "declination_deg": s.declination_deg,
            "sun_distance_au": s.sun_distance_au, "irradiance_wm2": irr}


@app.get(API + "/sun")
def sun(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180), utc: str = Query(...)) -> dict:
    try:
        return _sun_dict(lat, lon, utc)
    except ValueError:
        raise err(400, "INVALID_TIME", "utc must be an ISO 8601 timestamp, e.g. 2026-11-14T15:30:00Z") from None


@app.get(API + "/environment")
def environment(site_id: str, lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180), utc: str = Query(...)) -> dict:
    wh = whats_here(site_id, lat, lon, utc)
    s = _sun_dict(lat, lon, utc)
    atm = atmosphere(s["ltst_h"])
    z = wh["elevation_m"]
    grid = sites.get_grid(site_id)
    return {"site_id": site_id, "point": {"lat": lat, "lon": lon}, "utc": s["utc"], "sun": s,
            "surface_temp_K": wh["surface_temp_K"], "air_temp_K": atm["air_temp_K"],
            "pressure_pa": float(pressure(z if z is not None else grid.z_ref, grid.z_ref)), "tau": atm["tau"],
            "wind_ms": atm["wind_ms"], "dose_rate_mSv_h": wh["dose_rate_mSv_h"], "sky_fraction": wh["sky_fraction"],
            "shadowed": wh["shadowed"], "simulated_fields": list(SIMULATED_FIELDS)}


# ---------------------------------------------------------------- alerts & orbits (minimal until later tickets)
@app.get(API + "/alerts/space-weather")
def space_weather(mode: Literal["live", "replay", "simulated"] | None = None, from_: str | None = Query(None, alias="from"),
                  to: str | None = None) -> list[dict]:
    from marsnav.sun import parse_utc

    from . import spaceweather

    try:
        start = parse_utc(from_) if from_ else None
        end = parse_utc(to) if to else None
    except ValueError:
        raise err(400, "INVALID_TIME", "from/to must be ISO 8601 timestamps.") from None
    return spaceweather.alerts(mode or "live", start, end)


def _orbiter_list() -> list[dict]:
    out = []
    for o in sites.load_orbiters():
        out.append({"status": "unknown", "agency": "", "accuracy": "approximate", "source": "", "credit": "", "relay_capable": False, **o})
    return out


@app.get(API + "/orbiters")
def orbiters() -> list[dict]:
    return _orbiter_list()


@app.get(API + "/orbiters/states")
def orbiter_states(utc: str = Query(...)) -> list[dict]:
    from marsnav.orbits import orbit_positions, to_unix

    try:
        t = to_unix(utc)
    except ValueError:
        raise err(400, "INVALID_TIME", "utc must be an ISO 8601 timestamp, e.g. 2026-11-14T15:30:00Z") from None
    out = []
    for o in _orbiter_list():
        p = orbit_positions(o["elements"], np.array([t]))
        out.append({"id": o["id"], "utc": utc, "lat": float(p["lat_deg"][0]), "lon": float(p["lon_deg"][0]), "alt_m": float(p["alt_m"][0]),
                    "xyz_bodyfixed_m": [float(v) for v in p["xyz_fixed"][0]], "accuracy": o["accuracy"]})
    return out


@app.get(API + "/comms/windows")
def comms_windows(site_id: str, from_: str = Query(alias="from"), to: str = Query(...), mask_deg: float | None = Query(None, ge=0, le=45),
                  lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180)) -> list[dict]:
    from marsnav.orbits import contact_windows
    from marsnav.sun import parse_utc

    grid = _grid(site_id, None)
    base = sites.base_place(site_id)
    la, lo = (lat if lat is not None else base["lat"]), (lon if lon is not None else base["lon"])
    rc = grid.latlon_to_rc(la, lo)
    if not grid.inside(*rc):
        raise err(400, "OUT_OF_AOI", "The point is outside the site area.")
    try:
        t0, t1 = parse_utc(from_).timestamp(), parse_utc(to).timestamp()
    except ValueError:
        raise err(400, "INVALID_TIME", "from/to must be ISO 8601 timestamps.") from None
    if not 0 < t1 - t0 <= 3 * 86400:
        raise err(400, "INVALID_RANGE", "The time range must be positive and at most 3 days.")
    h = horizon_profile(grid.z, grid.cell, rc[0], rc[1], n_az=72, r_max=20000.0)
    site_r = float(param("constants.R_sphere")) + float(grid.z[rc])
    out = []
    for o in _orbiter_list():
        if not o.get("relay_capable"):
            continue
        for w in contact_windows(o["elements"], la, lo, t0, t1, mask_deg=mask_deg, horizon_rad=h, site_radius_m=site_r):
            out.append({"orbiter_id": o["id"], "aos_utc": datetime.fromtimestamp(w["aos"], UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
                        "los_utc": datetime.fromtimestamp(w["los"], UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
                        "duration_s": w["duration_s"], "max_elevation_deg": w["max_elevation_deg"], "terrain_masked": w["terrain_masked"],
                        "accuracy": o["accuracy"]})
    return sorted(out, key=lambda w: w["aos_utc"])


@app.get(API + "/earth/light-time")
def light_time(utc: str = Query(...)) -> dict:
    from marsnav.orbits import earth_mars_light_time

    try:
        r = earth_mars_light_time(utc)
    except ValueError:
        raise err(400, "INVALID_TIME", "utc must be an ISO 8601 timestamp, e.g. 2026-11-14T15:30:00Z") from None
    return {"utc": utc, "distance_m": r["distance_m"], "one_way_s": r["one_way_s"], "accuracy": "approximate"}


class SunCompassRequest(BaseModel):
    utc: str
    approx_position: GeoPoint
    beta_deg: float
    sigma_beta_deg: float = Field(3.0, ge=0)
    uses_shadow: bool = False
    sigma_pos_m: float = Field(500.0, ge=0)


@app.post(API + "/localize/sun-compass")
def sun_compass_ep(req: SunCompassRequest) -> dict:
    from marsnav.localize import sun_compass

    p = req.approx_position
    r = sun_compass(req.utc, p.lat, p.lon, req.beta_deg, req.sigma_beta_deg, req.uses_shadow, req.sigma_pos_m)
    return {"heading_deg": r.heading_deg, "sigma_heading_deg": r.sigma_heading_deg, "sun": _sun_dict(p.lat, p.lon, req.utc),
            "warnings": r.warnings}


class BearingObservation(BaseModel):
    landmark: Waypoint
    bearing_deg: float
    sigma_deg: float = Field(2.0, ge=0.1)


class ResectionRequest(BaseModel):
    site_id: str
    observations: list[BearingObservation] = Field(min_length=2, max_length=10)
    heading_known: bool
    prior: GeoPoint | None = None
    prior_sigma_m: float | None = None


@app.post(API + "/localize/resection")
def resection_ep(req: ResectionRequest) -> dict:
    from marsnav.geodesy import aoi_to_geo
    from marsnav.localize import error_ellipse, resection

    _site_or_404(req.site_id)
    pts = []
    for ob in req.observations:
        lm = ob.landmark
        if lm.place_id:
            pl = next((p for p in sites.places(req.site_id) if p["id"] == lm.place_id), None)
            if pl is None:
                raise err(400, "UNKNOWN_PLACE", f"Landmark '{lm.place_id}' is not a known place.")
            x, y = geo_to_aoi(pl["lat"], pl["lon"])
        elif lm.lat is not None and lm.lon is not None:
            x, y = geo_to_aoi(lm.lat, lm.lon)
        else:
            x, y = lm.x, lm.y
        pts.append((float(x), float(y)))
    L = np.array(pts)
    prior = None
    if req.prior:
        px, py = geo_to_aoi(req.prior.lat, req.prior.lon)
        prior = np.array([float(px), float(py)])
    try:
        r = resection(L, np.array([o.bearing_deg for o in req.observations]), np.array([o.sigma_deg for o in req.observations]),
                      req.heading_known, prior)
    except ValueError as e:
        raise err(422, "UNSOLVABLE", f"{e}. Add landmarks or provide the heading from the sun compass.") from None
    lat, lon = aoi_to_geo(r.x, r.y)
    e = error_ellipse(r.cov)
    return {"position": {"lat": float(lat), "lon": float(lon)}, "xy": {"x": r.x, "y": r.y}, "heading_deg": r.heading_deg,
            "cov": np.asarray(r.cov).tolist(), "ellipse": {"semi_major_m": e.semi_major_m, "semi_minor_m": e.semi_minor_m,
                                                           "angle_deg": e.angle_deg, "p": e.p},
            "gdop": r.gdop if np.isfinite(r.gdop) else 1e9, "residuals_deg": np.asarray(r.residuals_deg).tolist(),
            "iterations": r.iterations, "converged": r.converged, "quality_flags": r.flags}


@app.post(API + "/localize/skyline")
def skyline(_: dict) -> dict:
    raise _not_yet("Skyline matching")
