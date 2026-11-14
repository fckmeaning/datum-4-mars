"""Tests for orbiters.json schema, Keplerian element bounds, and orbit propagation."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from marsnav.orbits import orbit_positions, to_unix

REPO = Path(__file__).resolve().parents[3]
ORBITERS_FILE = REPO / "data" / "processed" / "orbiters.json"


def test_orbiters_file_exists_and_valid():
    assert ORBITERS_FILE.is_file(), f"Missing {ORBITERS_FILE}"
    data = json.loads(ORBITERS_FILE.read_text(encoding="utf-8"))
    assert "frame" in data
    assert "orbiters" in data
    assert isinstance(data["orbiters"], list)
    assert len(data["orbiters"]) >= 3


def test_orbiter_ids_unique():
    data = json.loads(ORBITERS_FILE.read_text(encoding="utf-8"))
    ids = [o["id"] for o in data["orbiters"]]
    assert len(ids) == len(set(ids)), f"Duplicate orbiter IDs found: {ids}"


def test_orbiter_fields_and_bounds():
    data = json.loads(ORBITERS_FILE.read_text(encoding="utf-8"))
    required_orbiter_fields = {
        "id",
        "name",
        "agency",
        "status",
        "relay_capable",
        "accuracy",
        "source",
        "credit",
        "elements",
    }
    required_element_fields = {"a_m", "e", "i_deg", "raan_deg", "argp_deg", "M0_deg", "epoch_utc"}

    for o in data["orbiters"]:
        oid = o.get("id", "unknown")
        assert required_orbiter_fields <= set(o.keys()), f"Missing fields in orbiter {oid}"

        el = o["elements"]
        assert required_element_fields <= set(el.keys()), f"Missing element fields in orbiter {oid}"

        # Semi-major axis between 3.5e6 and 5e7 m
        assert 3.5e6 <= el["a_m"] <= 5.0e7, f"a_m out of range for {oid}: {el['a_m']}"

        # Eccentricity 0 <= e < 1
        assert 0.0 <= el["e"] < 1.0, f"e out of range for {oid}: {el['e']}"

        # Angles in range
        assert 0.0 <= el["i_deg"] <= 180.0, f"i_deg out of range for {oid}: {el['i_deg']}"
        assert 0.0 <= el["raan_deg"] <= 360.0, f"raan_deg out of range for {oid}: {el['raan_deg']}"
        assert 0.0 <= el["argp_deg"] <= 360.0, f"argp_deg out of range for {oid}: {el['argp_deg']}"
        assert 0.0 <= el["M0_deg"] <= 360.0, f"M0_deg out of range for {oid}: {el['M0_deg']}"

        # Epoch parses
        epoch = el["epoch_utc"]
        dt = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
        assert dt.tzinfo is not None


def test_orbiter_propagation_plausibility():
    data = json.loads(ORBITERS_FILE.read_text(encoding="utf-8"))
    t = to_unix("2026-11-14T12:00:00Z")

    for o in data["orbiters"]:
        pos = orbit_positions(o["elements"], np.array([t]))
        alt_m = float(pos["alt_m"][0])
        lat = float(pos["lat_deg"][0])
        lon = float(pos["lon_deg"][0])

        assert -90.0 <= lat <= 90.0
        assert -180.0 <= lon <= 180.0
        # Orbiters should stay in space above the surface
        assert alt_m > 100_000.0, f"Orbiter {o['id']} altitude too low: {alt_m} m"
        assert alt_m < 20_000_000.0, f"Orbiter {o['id']} altitude too high: {alt_m} m"
