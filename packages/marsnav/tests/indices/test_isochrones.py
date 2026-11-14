"""Return-time isochrones: marching squares on analytic fields and nested levels on a synthetic site."""

import numpy as np
import pytest

from marsnav.indices import contour_lines, return_isochrones
from marsnav.routing.grid import SiteGrid


def cone(n=121, cell=1.0):
    r, c = np.mgrid[0:n, 0:n]
    centre = (n - 1) / 2
    return np.hypot(r - centre, c - centre) * cell, centre


def test_circle_radius_error_is_below_one_cell():
    f, centre = cone()
    for level in (10.0, 25.0, 40.0):
        lines = contour_lines(f, level)
        assert len(lines) == 1 and np.allclose(lines[0][0], lines[0][-1])  # one closed loop
        radii = np.hypot(lines[0][:, 0] - centre, lines[0][:, 1] - centre)
        assert np.abs(radii - level).max() < 1.0 and np.abs(radii.mean() - level) < 0.05


def test_levels_are_nested():
    f, centre = cone()
    boxes = []
    for level in (10.0, 20.0, 30.0, 40.0):
        ln = contour_lines(f, level)[0]
        boxes.append((ln[:, 0].min(), ln[:, 0].max(), ln[:, 1].min(), ln[:, 1].max()))
    for inner, outer in zip(boxes, boxes[1:], strict=False):
        assert outer[0] < inner[0] and outer[1] > inner[1] and outer[2] < inner[2] and outer[3] > inner[3]


def test_a_level_above_or_below_the_field_has_no_lines():
    f, _ = cone(31)
    assert contour_lines(f, 1000.0) == [] and contour_lines(f, -1.0) == []


def test_linear_ramp_gives_one_straight_open_line_at_the_right_place():
    f = np.tile(np.arange(20, dtype=float), (10, 1))  # increases with the column
    (line,) = contour_lines(f, 7.5)
    assert np.allclose(line[:, 1], 7.5) and len(line) == 10  # a vertical line at column 7.5 crossing all rows


def test_saddle_is_resolved_into_two_lines():
    f = np.array([[1.0, 0.0], [0.0, 1.0]])  # checkerboard: centre = 0.5
    lines_hi = contour_lines(f, 0.4)  # centre inside: the two high corners are joined
    lines_lo = contour_lines(f, 0.6)  # centre outside: the two high corners are separated
    assert len(lines_hi) == 2 and len(lines_lo) == 2


def test_non_finite_and_bad_shape_are_rejected():
    with pytest.raises(ValueError):
        contour_lines(np.array([[0.0, np.nan], [1.0, 2.0]]), 0.5)
    with pytest.raises(ValueError):
        contour_lines(np.zeros(5), 0.5)


def test_return_isochrones_on_a_synthetic_site():
    grid = SiteGrid.synthetic("gale", h=80, w=80, cell=50.0)
    base = (40, 40)
    fc = return_isochrones(grid, base, minutes=(5, 10, 20), utc="2026-11-14T10:00:00Z")
    assert fc["type"] == "FeatureCollection" and [f["properties"]["minutes"] for f in fc["features"]] == [5.0, 10.0, 20.0]
    areas = [f["properties"]["reachable_km2"] for f in fc["features"]]
    assert areas[0] < areas[1] < areas[2]  # reachable area grows with the allowed time
    assert [f["properties"]["label"] for f in fc["features"]] == ["5 min", "10 min", "20 min"]
    lat0, lon0 = grid.rc_to_latlon(40, 40)
    spans = []
    for f in fc["features"]:
        assert f["geometry"]["type"] == "MultiLineString" and f["properties"]["lines"] >= 1
        pts = np.array([p for line in f["geometry"]["coordinates"] for p in line])
        assert np.abs(pts[:, 0] - float(lon0)).max() < 0.5 and np.abs(pts[:, 1] - float(lat0)).max() < 0.5
        spans.append(np.ptp(pts[:, 0]))
    assert spans[0] < spans[1] < spans[2]  # nested: wider with more time
    assert "WGS 84" in fc["properties"]["coordinate_note"]


def test_bad_minutes_are_rejected():
    grid = SiteGrid.synthetic("gale", h=40, w=40, cell=50.0)
    with pytest.raises(ValueError):
        return_isochrones(grid, (20, 20), minutes=[0, 10], utc="2026-11-14T10:00:00Z")
