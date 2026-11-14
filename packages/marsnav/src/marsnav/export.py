"""Route export: an API ``RouteResult`` (contracts/openapi.yaml) as an RFC 7946 GeoJSON FeatureCollection.

RFC 7946 has no ``crs`` member (it was removed from GeoJSON) and names WGS 84, Earth's datum, as the only reference system.
Mars coordinates therefore travel in the ordinary position order [longitude, latitude, elevation] and the body, radius and
latitude type are stated in ``properties.coordinate_note``; GIS software will draw them on a plain lon/lat canvas.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from marsnav import CONTRACT_VERSION, __version__
from marsnav.config import param
from marsnav.geodesy import haversine

GENERATOR = f"marsnav {__version__} (API contract v{CONTRACT_VERSION})"

# ASSUMPTION (matching tolerances, not physical constants)
SNAP_TOLERANCE_M = 300.0  # a requested waypoint is matched to the nearest route node (segment boundary) within this distance
ELEVATION_MATCH_M = 50.0  # a point takes the elevation of the nearest route-geometry vertex within this distance
COORD_DECIMALS = 7  # 1e-7 degree is about 0.6 mm on Mars
ELEVATION_DECIMALS = 2

ElevationFn = Callable[[float, float], "float | None"]


def _lon180(lon: float) -> float:
    """East longitude wrapped to [-180, 180)."""
    return ((float(lon) + 180.0) % 360.0) - 180.0


def _num(v: Any) -> Any:
    """JSON-safe number: NaN / inf become None."""
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


def _clean(obj: Any) -> Any:
    """Recursively make a value JSON-safe (numpy scalars to Python, NaN to None)."""
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if hasattr(obj, "item") and not isinstance(obj, (str, bytes)):
        try:
            return _num(obj.item())
        except (ValueError, TypeError):
            return str(obj)
    return _num(obj)


def _position(lon: float, lat: float, z: float | None) -> list[float]:
    if not -90.0 <= lat <= 90.0:
        raise ValueError(f"latitude {lat} is outside [-90, 90]")
    pos = [round(_lon180(lon), COORD_DECIMALS), round(float(lat), COORD_DECIMALS)]
    if z is not None:
        pos.append(round(float(z), ELEVATION_DECIMALS))
    return pos


def _nearest(lat: float, lon: float, pts: list[tuple[float, float]]) -> tuple[int, float]:
    best_i, best_d = 0, math.inf
    for i, (la, lo) in enumerate(pts):
        d = float(haversine(lat, lon, la, lo))
        if d < best_d:
            best_i, best_d = i, d
    return best_i, best_d


def _iso_plus(t_utc: str | None, seconds: float) -> str | None:
    if not t_utc:
        return None
    try:
        t = datetime.fromisoformat(t_utc.replace("Z", "+00:00")) + timedelta(seconds=seconds)
    except ValueError:
        return None
    return t.isoformat().replace("+00:00", "Z")


def route_to_geojson(route: dict, waypoints: list[dict] | None = None, elevation_at: ElevationFn | None = None,
                     include_segments: bool = True, name: str | None = None) -> dict:
    """Route export — API route object to an RFC 7946 FeatureCollection (dict, JSON-serialisable).

    ``route``      a ``RouteResult``: ``geometry`` (LineString [lon, lat, elevation?]), ``segments``, ``totals``, ``verdict``,
                   ``feasibility``, ``data_levels``, ``simulated_inputs``, ``assumptions`` (only ``geometry`` is required).
    ``waypoints``  the request waypoints (each with ``lat`` and ``lon``; ``role``, ``dwell_min`` and ``name`` are used when
                   present). Emitted as one Point each, in visiting order when ``route['waypoint_order']`` is a permutation.
                   Without it the first and last geometry vertices are exported as start and goal.
    ``elevation_at``  optional ``(lat, lon) -> metres | None`` to give elevations where the route geometry has none.

    Features: the route LineString (3-D when every vertex has an elevation, otherwise 2-D), one Point per waypoint with
    cumulative distance/time and the conditions of the segment that leaves it, and, if ``include_segments``, one
    LineString per route segment. No ``crs`` member is written (see the module docstring).
    """
    geom = route.get("geometry") or {}
    coords = geom.get("coordinates") or []
    if geom.get("type") != "LineString" or len(coords) < 2:
        raise ValueError("route has no LineString geometry with at least two vertices")
    gpts = [(float(c[1]), float(c[0])) for c in coords]  # (lat, lon)
    gz = [float(c[2]) if len(c) > 2 and c[2] is not None and math.isfinite(float(c[2])) else None for c in coords]

    def elev_for(lat: float, lon: float) -> float | None:
        if elevation_at is not None:
            z = elevation_at(lat, lon)
            if z is not None and math.isfinite(z):
                return float(z)
        i, d = _nearest(lat, lon, gpts)
        return gz[i] if d <= ELEVATION_MATCH_M else None

    line_z = [gz[i] if gz[i] is not None else (elev_for(*gpts[i]) if elevation_at is not None else None) for i in range(len(gpts))]
    use_z = all(z is not None for z in line_z)
    line = [_position(lon, lat, line_z[i] if use_z else None) for i, (lat, lon) in enumerate(gpts)]

    segs: list[dict] = list(route.get("segments") or [])
    nodes: list[tuple[float, float]] = []
    cum_d, cum_t = [0.0], [0.0]
    if segs:
        nodes.append((segs[0]["start"]["lat"], segs[0]["start"]["lon"]))
        for s in segs:
            nodes.append((s["end"]["lat"], s["end"]["lon"]))
            cum_d.append(cum_d[-1] + float(s.get("length_m", 0.0)))
            cum_t.append(cum_t[-1] + float(s.get("duration_s", 0.0)))

    totals = _clean(route.get("totals") or {})
    data_levels = list(route.get("data_levels") or [])
    sim_inputs = list(route.get("simulated_inputs") or [])
    simulated = bool(sim_inputs) or "L0" in data_levels  # D-02: L0 is the synthetic DEM
    approximate = route.get("accuracy") == "approximate" or bool(route.get("approximate"))

    features: list[dict] = [{
        "type": "Feature",
        "id": route.get("route_id"),
        "properties": _clean({
            "featureType": "MarsRoute", "route_id": route.get("route_id"), "site_id": route.get("site_id"), "profile": route.get("profile"),
            "verdict": route.get("verdict"), "feasible": (route.get("feasibility") or {}).get("ok"),
            "violations": (route.get("feasibility") or {}).get("violations", []), "totals": totals, "waypoint_order": route.get("waypoint_order"),
            "uncertainty": route.get("uncertainty"), "data_levels": data_levels, "simulated_inputs": sim_inputs,
            "assumptions": route.get("assumptions", []), "simulated": simulated, "approximate": approximate,
        }),
        "geometry": {"type": "LineString", "coordinates": line},
    }]

    # ---- waypoints
    wps: list[tuple[dict, int]] = []
    if waypoints:
        order = route.get("waypoint_order")
        idx = list(order) if order is not None and sorted(order) == list(range(len(waypoints))) else list(range(len(waypoints)))
        for src in idx:
            w = waypoints[src]
            if w.get("lat") is None or w.get("lon") is None:
                raise ValueError(f"waypoint {src} has no lat/lon; resolve places to coordinates before exporting")
            wps.append((w, src))
    else:
        first, last = gpts[0], gpts[-1]
        wps = [({"lat": first[0], "lon": first[1], "role": "start"}, 0), ({"lat": last[0], "lon": last[1], "role": "goal"}, 1)]

    for stop, (w, src) in enumerate(wps):
        lat, lon = float(w["lat"]), float(w["lon"])
        props: dict[str, Any] = {"featureType": "MarsWaypoint", "stop_index": stop, "request_index": src,
                                 "name": w.get("name") or w.get("place_id") or f"stop {stop}",
                                 "role": w.get("role") or ("start" if stop == 0 else "goal" if stop == len(wps) - 1 else "via"),
                                 "dwell_min": w.get("dwell_min", 0)}
        if nodes:
            k, snap = _nearest(lat, lon, nodes)
            props["snap_distance_m"] = round(snap, 1)
            if snap <= SNAP_TOLERANCE_M:
                seg = segs[min(k, len(segs) - 1)]
                props.update(cumulative_distance_m=round(cum_d[k], 1), cumulative_time_s=round(cum_t[k], 1),
                             t_utc=seg.get("t_start_utc") if k < len(segs) else _iso_plus(seg.get("t_start_utc"), float(seg.get("duration_s", 0.0))),
                             sun=seg.get("sun"), temp_K=seg.get("temp_K"), dose_rate_mSv_h=seg.get("dose_rate_mSv_h"),
                             slope_deg=seg.get("slope_deg"), limiting_factor=seg.get("limiting_factor"))
        z = elev_for(lat, lon)
        features.append({"type": "Feature", "properties": _clean(props), "geometry": {"type": "Point", "coordinates": _position(lon, lat, z)}})

    # ---- segments
    if include_segments:
        for s in segs:
            a, b = s["start"], s["end"]
            za = elev_for(a["lat"], a["lon"]) if use_z else None
            zb = elev_for(b["lat"], b["lon"]) if use_z else None
            two_d = za is None or zb is None
            seg_props = {k: s.get(k) for k in ("i", "length_m", "duration_s", "slope_deg", "ascent_m", "limiting_factor", "cost", "components",
                                               "t_start_utc", "sun", "temp_K", "dose_rate_mSv_h", "energy_kJ", "o2_l")}
            features.append({"type": "Feature", "properties": _clean({"featureType": "MarsRouteSegment", **seg_props}),
                             "geometry": {"type": "LineString", "coordinates": [_position(a["lon"], a["lat"], None if two_d else za),
                                                                                 _position(b["lon"], b["lat"], None if two_d else zb)]}})

    lons, lats = [p[0] for p in line], [p[1] for p in line]
    radius = float(param("constants.R_sphere"))
    return {
        "type": "FeatureCollection",
        "name": name or f"marsnav_route_{route.get('route_id') or 'unnamed'}",
        "bbox": [min(lons), min(lats), max(lons), max(lats)],
        "features": features,
        "properties": _clean({
            "generator": GENERATOR,
            "coordinate_note": (f"Positions are [longitude, latitude, elevation]: longitude in degrees EAST in [-180, 180), planetocentric "
                                f"latitude in degrees, elevation in metres from the source DEM (see data_levels) on Mars, "
                                f"a sphere of radius {radius:.0f} m. "
                                f"RFC 7946 names WGS 84 (Earth); these are Mars coordinates, not Earth coordinates. There is no crs member."),
            "body": "Mars", "sphere_radius_m": radius, "latitude_type": "planetocentric", "longitude_convention": "east positive, [-180, 180)",
            "site_id": route.get("site_id"), "data_levels": data_levels, "simulated": simulated, "approximate": approximate,
            "simulated_inputs": sim_inputs, "contract_version": CONTRACT_VERSION,
        }),
    }
