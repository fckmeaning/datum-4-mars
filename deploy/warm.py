"""Pre-compile the numba kernels and touch every cached layer so the first real request is fast.

Run at image build or container start:  python deploy/warm.py
Exit code is always 0 unless MARSNAV_WARM_STRICT=1, so a warm-up problem never blocks the server from starting.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))


def main() -> int:
    from app.main import app
    from fastapi.testclient import TestClient

    client = TestClient(app)
    base = "/api/v1"
    wp = lambda lat, lon, role: {"lat": lat, "lon": lon, "role": role}  # noqa: E731
    body = {"site_id": "gale", "start_utc": "2026-11-14T15:30:00Z", "waypoints": [wp(-4.72, 137.40, "start"), wp(-4.705, 137.41, "goal")]}
    steps = [
        ("health", lambda: client.get(f"{base}/health")),
        ("sites", lambda: client.get(f"{base}/sites")),
        ("route SAFEST", lambda: client.post(f"{base}/route", json={**body, "profile": "SAFEST"})),
        ("alternatives", lambda: client.post(f"{base}/route/alternatives", json=body)),
    ]
    ok = True
    for name, call in steps:
        t0 = time.perf_counter()
        r = call()
        print(f"warm {name:14s} {r.status_code} in {time.perf_counter() - t0:6.2f} s", flush=True)
        ok &= r.status_code == 200
    return 0 if ok or os.environ.get("MARSNAV_WARM_STRICT") != "1" else 1


if __name__ == "__main__":
    raise SystemExit(main())
