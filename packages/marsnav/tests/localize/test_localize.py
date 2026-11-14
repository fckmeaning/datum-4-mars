import numpy as np
import pytest

from marsnav.localize import error_ellipse, gdop, resection, sun_compass, wrap180
from marsnav.sun import sun_position

UTC = "2026-11-14T15:30:00Z"
L = np.array([[2000.0, 3000.0], [-2500.0, 1500.0], [500.0, -3500.0], [3000.0, -1000.0]])
TRUE = np.array([120.0, -340.0])


def bearings(pos, heading=0.0):
    return np.degrees(np.arctan2(L[:, 0] - pos[0], L[:, 1] - pos[1])) - heading


def test_f39_sun_compass_inverts_measurement():
    s = sun_position(-4.7, 137.4, UTC)
    true_heading = 37.0
    beta = (s.azimuth_deg - true_heading) % 360
    r = sun_compass(UTC, -4.7, 137.4, beta)
    assert wrap180(r.heading_deg - true_heading) == pytest.approx(0.0, abs=1e-9)
    assert r.sigma_heading_deg >= 3.0
    r2 = sun_compass(UTC, -4.7, 137.4, (s.azimuth_deg + 180 - true_heading) % 360, uses_shadow=True)
    assert wrap180(r2.heading_deg - true_heading) == pytest.approx(0.0, abs=1e-9)
    assert any("Magnetic" in w for w in r.warnings)


def test_f40_noise_free_known_heading():
    r = resection(L, bearings(TRUE), heading_known=True)
    assert r.converged
    assert np.hypot(r.x - TRUE[0], r.y - TRUE[1]) < 1e-6


def test_f40_noise_free_unknown_heading():
    r = resection(L, wrap180(bearings(TRUE, heading=73.0)), heading_known=False)
    assert np.hypot(r.x - TRUE[0], r.y - TRUE[1]) < 1e-5
    assert wrap180(r.heading_deg - 73.0) == pytest.approx(0.0, abs=1e-6)


def test_f40_two_landmarks_minimum():
    r = resection(L[:2], bearings(TRUE)[:2], heading_known=True)
    assert np.hypot(r.x - TRUE[0], r.y - TRUE[1]) < 1e-4
    with pytest.raises(ValueError):
        resection(L[:2], bearings(TRUE)[:2], heading_known=False)


def test_f41_ellipse_coverage_95():
    rng = np.random.default_rng(42)
    sigma = 1.0
    inside = 0
    trials = 1000
    for _ in range(trials):
        b = bearings(TRUE) + rng.normal(0, sigma, len(L))
        r = resection(L, b, sigmas_deg=sigma, heading_known=True)
        e = error_ellipse(r.cov, 0.95)
        d = np.array([r.x - TRUE[0], r.y - TRUE[1]])
        md2 = d @ np.linalg.inv(r.cov[:2, :2]) @ d
        inside += md2 <= 5.991464547107979  # chi2(2) 95 %
        assert e.semi_major_m >= e.semi_minor_m >= 0
    assert inside / trials == pytest.approx(0.95, abs=0.03)


def test_f41_axes_and_angle():
    e = error_ellipse(np.array([[4.0, 0.0], [0.0, 1.0]]), 0.95)
    assert e.semi_major_m == pytest.approx(2.4477 * 2, rel=1e-3)
    assert e.semi_minor_m == pytest.approx(2.4477, rel=1e-3)
    assert e.angle_deg == pytest.approx(90.0)  # major axis along x (east)


def test_f42_gdop_collinear_is_bad():
    good = gdop(L, TRUE)
    bad = gdop(np.array([[0.0, 1000.0], [0.0, 2000.0], [0.0, 3000.0]]), np.array([0.0, 0.0]))
    assert np.isfinite(good)
    assert bad == float("inf") or bad > 100 * good
