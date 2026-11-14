import numpy as np
import pytest

from marsnav.terrain import (
    aggregate_hazard,
    hillshade,
    horizon_grid,
    horizon_profile,
    roughness,
    sky_fraction,
    sky_fraction_grid,
    slope_aspect_horn,
)

CELL = 10.0


def grid_xy(h=40, w=50):
    rows, cols = np.mgrid[0:h, 0:w]
    x = cols * CELL
    y = (h - 1 - rows) * CELL  # north is up (row 0)
    return x, y


def test_f05_plane_rising_east():
    x, _ = grid_xy()
    slope, aspect = slope_aspect_horn(0.1 * x, CELL)
    inner = (slice(2, -2), slice(2, -2))
    assert np.allclose(np.degrees(slope[inner]), np.degrees(np.arctan(0.1)), atol=1e-9)
    assert np.allclose(np.degrees(aspect[inner]), 270.0, atol=1e-9)  # downhill faces west


def test_f05_plane_rising_north():
    _, y = grid_xy()
    slope, aspect = slope_aspect_horn(0.2 * y, CELL)
    inner = (slice(2, -2), slice(2, -2))
    assert np.allclose(np.tan(slope[inner]), 0.2, atol=1e-12)
    assert np.allclose(np.degrees(aspect[inner]), 180.0, atol=1e-9)  # downhill faces south


def test_f06_roughness_plane_zero_noise_positive():
    x, y = grid_xy()
    plane = 0.3 * x - 0.1 * y + 5
    assert np.max(roughness(plane, CELL, 5)[3:-3, 3:-3]) < 1e-6
    rng = np.random.default_rng(1)
    noisy = plane + rng.normal(0, 0.5, plane.shape)
    assert np.median(roughness(noisy, CELL, 5)) == pytest.approx(0.5, rel=0.25)


def test_f07_flat_horizon_is_zero():
    dem = np.zeros((60, 60))
    h = horizon_profile(dem, CELL, 30, 30, n_az=36, r_max=500)
    assert np.allclose(h, 0.0)


def test_f07_wall_to_the_east():
    dem = np.zeros((80, 200))
    dem[:, 130:] = 100.0  # wall starting 1000 m east of column 30
    h = horizon_profile(dem, CELL, 40, 30, n_az=4, r_max=1700, observer_height=1.7)
    east = np.degrees(h[1])
    # nearest wall cell is ~1000 m away; sampling may hit 990–1000 m
    assert 5.0 < east < 6.0
    assert np.degrees(h[0]) == pytest.approx(0.0, abs=1e-9) and np.degrees(h[3]) == pytest.approx(0.0, abs=1e-9)


def test_f07_grid_matches_point_profile_order_of_magnitude():
    dem = np.zeros((60, 120))
    dem[:, 90:] = 50.0
    hg = horizon_grid(dem, CELL, 90.0, r_max=1000)
    assert np.degrees(hg[30, 30]) == pytest.approx(np.degrees(np.arctan((50 - 1.7) / 600)), abs=0.6)


def test_f08_sky_fraction_closed_forms():
    h = np.full(72, np.radians(20.0))
    assert sky_fraction(np.zeros(72)) == pytest.approx(1.0)
    assert sky_fraction(h, n=0) == pytest.approx(1 - np.sin(np.radians(20.0)))
    assert sky_fraction(h, n=1) == pytest.approx(1 - np.sin(np.radians(20.0)) ** 2)


def test_f08_grid_flat_is_open_sky():
    f = sky_fraction_grid(np.zeros((30, 30)), CELL, n_az=8, r_max=300)
    assert np.allclose(f, 1.0)


def test_f09_aggregate_step():
    dem = np.zeros((20, 20))
    dem[:, 10:] = 2.0
    agg = aggregate_hazard(dem, 1.0, 5)
    assert agg["step_max_m"].shape == (4, 4)
    assert agg["step_max_m"][0, 1] == pytest.approx(2.0)
    assert agg["step_max_m"][0, 0] == pytest.approx(0.0)


def test_f48_hillshade_flat_equals_sin_e():
    hs = hillshade(np.zeros((10, 10)), CELL, 123.0, 30.0)
    assert np.allclose(hs, np.sin(np.radians(30.0)))
