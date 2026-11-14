"""Space-weather advisories for Mars from NASA DONKI (WSA-ENLIL model, NASA Goddard CCMC).

Live mode asks DONKI which coronal mass ejections the WSA-ENLIL solar-wind model forecasts to reach Mars. This is a forecast for the
planet as a whole; it does NOT include solar energetic particle events measured at Mars. Results are cached; the key comes from the
NASA_API_KEY environment variable (the public DEMO_KEY has a tiny rate limit and is only a fallback).
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from cachetools import TTLCache

DONKI_URL = "https://api.nasa.gov/DONKI/WSAEnlilSimulations"
_cache: TTLCache = TTLCache(maxsize=8, ttl=1800)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_simulations(start: datetime, end: datetime) -> list[dict[str, Any]]:
    """WSA-ENLIL simulations between two dates (cached 30 min). Raises httpx.HTTPError on transport/HTTP errors."""
    key = os.environ.get("NASA_API_KEY") or "DEMO_KEY"
    ck = (start.date(), end.date())
    if ck in _cache:
        return _cache[ck]
    r = httpx.get(DONKI_URL, params={"startDate": start.date().isoformat(), "endDate": end.date().isoformat(), "api_key": key},
                  timeout=20.0, headers={"User-Agent": "marsnav-hackathon/0.1"})
    r.raise_for_status()
    data = r.json()
    _cache[ck] = data if isinstance(data, list) else []
    return _cache[ck]


def _arrival(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)


def mars_cme_alerts(now: datetime, start: datetime, end: datetime, mode: str = "live") -> list[dict[str, Any]]:
    """Alerts for CMEs forecast to reach Mars. Severity 'warning' when the arrival lies within [-1 day, +3 days] of ``now``."""
    out: list[dict[str, Any]] = []
    for sim in fetch_simulations(start, end):
        for imp in sim.get("impactList") or []:
            if imp.get("location") != "Mars" or not imp.get("arrivalTime"):
                continue
            arr = _arrival(imp["arrivalTime"])
            inputs = (sim.get("cmeInputs") or [{}])[0]
            speed = inputs.get("speed")
            near = timedelta(days=-1) <= (arr - now) <= timedelta(days=3)
            facts = [f"CME forecast to reach Mars on {arr:%Y-%m-%d %H:%M} UTC"]
            if speed:
                facts.append(f"launch speed about {speed:.0f} km/s")
            if imp.get("isGlancingBlow"):
                facts.append("glancing blow")
            if imp.get("isMinorImpact"):
                facts.append("minor impact")
            out.append({
                "id": f"donki-{sim.get('simulationID', arr.isoformat())}", "kind": "CME", "severity": "warning" if near else "info",
                "start": _iso(arr), "end": None, "source": "NASA DONKI, WSA-ENLIL model (NASA Goddard CCMC)",
                "message": "; ".join(facts) + ". Advisory only: the model does not predict solar energetic particle events at Mars. "
                           "Keep the walk inside the storm-shelter time.",
                "mode": mode, "link": sim.get("link")})
    return sorted(out, key=lambda a: a["start"])


def alerts(mode: str, start: datetime | None = None, end: datetime | None = None, now: datetime | None = None) -> list[dict[str, Any]]:
    now = now or datetime.now(UTC)
    end = end or now
    start = start or end - timedelta(days=30)
    if mode == "simulated":
        return [{"id": "sim-sep-drill", "kind": "SEP", "severity": "critical", "start": _iso(now), "end": None,
                 "source": "marsnav planning drill (SIMULATED)", "mode": "simulated", "link": None,
                 "message": "SIMULATED solar particle event for a shelter drill: return to the nearest shelter now. Not a real measurement."}]
    try:
        found = mars_cme_alerts(now, start, end, "replay" if mode == "replay" else "live")
    except (httpx.HTTPError, ValueError) as e:
        return [{"id": "donki-unavailable", "kind": "DATA_QUALITY", "severity": "info", "start": _iso(now), "end": None,
                 "source": "NASA DONKI", "mode": "live", "link": None,
                 "message": f"Space weather not checked ({type(e).__name__}); showing no forecast. The advisory never changes the route verdict."}]
    if mode == "replay":
        return found[-1:]  # the most recent real forecast, labelled REPLAY
    return found
