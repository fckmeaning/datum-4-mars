"""FastAPI application. Run:  .venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir apps/api --port 8000"""

from __future__ import annotations

import difflib
import re
from datetime import UTC, datetime
from typing import Any, Literal

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

import marsnav
from marsnav.env import SIMULATED_FIELDS, atmosphere, dose_rate, pressure, surface_temperature
from marsnav.geodesy import geo_to_aoi
from marsnav.routing.astar import NoPathError
from marsnav.routing.planner import alternatives, back_to_base, order_waypoints, plan_route
from marsnav.sun import incidence, irradiance, mars24, sun_position
from marsnav.terrain import horizon_profile, sky_fraction

from . import sites

API = "/api/v1"
app = FastAPI(title="marsnav API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
                   allow_methods=["*"], allow_headers=["*"])
app.mount("/data", StaticFiles(directory=str(sites.data_root()), check_dir=False), name="data")


def err(status: int, code: str, message: str, **details: Any) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, "details": details})


@app.exception_handler(HTTPException)
async def http_error(_, exc: HTTPException):  # noqa: ANN001
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
    def one_location(self):  # noqa: ANN201
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


def _resolve_rc(site_id: str, grid, wp: Waypoint) -> tuple[int, int]:  # noqa: ANN001
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


def _grid(site_id: str, level: str | None):  # noqa: ANN202
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


def _sample_grid(grid, rc) -> float | None:  # noqa: ANN001
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
    k = int(round(sun.azimuth_deg / 5.0)) % 72
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
def _plan_kwargs(req: RouteRequest) -> dict:
    return {"start_utc": req.start_utc or now_iso(), "astronaut": req.astronaut, "return_to_start": req.return_to_start,
            "optimize_order": req.optimize_order}


@app.post(API + "/route")
def route(req: RouteRequest) -> dict:
    grid = _grid(req.site_id, req.level)
    rcs = [_resolve_rc(req.site_id, grid, w) for w in req.waypoints]
    try:
        return plan_route(grid, rcs, profile=req.profile, weights=req.weights, **_plan_kwargs(req))
    except NoPathError as e:
        raise _no_route(e) from None


@app.post(API + "/route/alternatives")
def route_alternatives(req: AlternativesRequest) -> dict:
    grid = _grid(req.site_id, req.level)
    rcs = [_resolve_rc(req.site_id, grid, w) for w in req.waypoints]
    try:
        return alternatives(grid, rcs, list(req.profiles), **_plan_kwargs(req))
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


@app.post(API + "/route/pareto")
def route_pareto(_: dict) -> dict:
    raise _not_yet("Pareto routes")


@app.post(API + "/route/uncertainty")
def route_uncertainty(_: dict) -> dict:
    raise _not_yet("Route uncertainty")


@app.post(API + "/route/off-route")
def off_route(_: dict) -> dict:
    raise _not_yet("Off-route detection")


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
def space_weather(mode: Literal["live", "replay", "simulated"] | None = None) -> list[dict]:
    return []


@app.get(API + "/orbiters")
def orbiters() -> list[dict]:
    return []


@app.get(API + "/orbiters/states")
def orbiter_states(utc: str = Query(...)) -> list[dict]:
    return []


@app.get(API + "/comms/windows")
def comms_windows() -> list[dict]:
    raise _not_yet("Comms windows")


@app.get(API + "/earth/light-time")
def light_time(utc: str = Query(...)) -> dict:
    raise _not_yet("Earth light time")


@app.post(API + "/localize/sun-compass")
def sun_compass(_: dict) -> dict:
    raise _not_yet("Sun compass endpoint (math lands in the next CEO ticket)")


@app.post(API + "/localize/resection")
def resection(_: dict) -> dict:
    raise _not_yet("Resection endpoint (math lands in the next CEO ticket)")


@app.post(API + "/localize/skyline")
def skyline(_: dict) -> dict:
    raise _not_yet("Skyline matching")
