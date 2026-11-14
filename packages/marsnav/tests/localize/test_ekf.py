"""F44 EKF: motion model, Joseph update, angle wrapping, gating, fix adapters, NEES consistency, positive definiteness."""

import numpy as np
import pytest
from scipy.stats import chi2

from marsnav.localize import (
    ResectionResult,
    SkylineResult,
    ekf_init,
    ekf_predict,
    ekf_update,
    heading_deg,
    resection,
    update_from_resection,
    update_from_skyline,
    update_from_sun_compass,
    update_heading,
    update_pose,
    update_position,
)
from marsnav.localize.ekf import SIGMA_HEADING_PER_SQRT_M_DEG, SIGMA_STEP_ABS_M, SIGMA_STEP_REL


def is_pd(P, tol=1e-12):
    return np.allclose(P, P.T, atol=1e-9 * max(1.0, np.abs(P).max())) and np.linalg.eigvalsh(0.5 * (P + P.T)).min() > tol


def test_f44_predict_moves_along_heading():
    mean, cov = ekf_init(100.0, 200.0, 90.0, 5.0, 3.0)  # facing east
    m2, _ = ekf_predict(mean, cov, 10.0)
    assert m2[0] == pytest.approx(110.0) and m2[1] == pytest.approx(200.0, abs=1e-9)
    m3, _ = ekf_predict(*ekf_init(0.0, 0.0, 0.0, 5.0, 3.0), 25.0)  # facing north
    assert m3[0] == pytest.approx(0.0, abs=1e-9) and m3[1] == pytest.approx(25.0)
    m4, c4 = ekf_predict(mean, cov, 0.0)  # zero step: nothing changes
    assert np.allclose(m4, mean) and np.allclose(c4, cov)


def test_f44_predict_covariance_matches_analytic_propagation():
    """Facing north, step s: Var(x) = Var(x0) + s²·Var(ψ0) + s·σ_h²·s (heading noise does not move the point within the step)."""
    s, sx, sh = 100.0, 4.0, 2.0
    mean, cov = ekf_init(0.0, 0.0, 0.0, sx, sh)
    _, c = ekf_predict(mean, cov, s)
    var_x = sx**2 + s**2 * np.radians(sh) ** 2
    var_y = sx**2 + (SIGMA_STEP_ABS_M + SIGMA_STEP_REL * s) ** 2
    var_psi = np.radians(sh) ** 2 + np.radians(SIGMA_HEADING_PER_SQRT_M_DEG) ** 2 * s
    assert c[0, 0] == pytest.approx(var_x) and c[1, 1] == pytest.approx(var_y) and c[2, 2] == pytest.approx(var_psi)
    assert c[0, 2] == pytest.approx(s * np.radians(sh) ** 2)  # position-heading correlation appears
    assert is_pd(c)


def test_f44_predict_rejects_negative_step():
    with pytest.raises(ValueError):
        ekf_predict(*ekf_init(0, 0, 0, 1, 1), -1.0)


def test_f44_heading_update_shrinks_variance_and_wraps_angle():
    mean, cov = ekf_init(0.0, 0.0, 359.0, 5.0, 10.0)
    r = update_heading(mean, cov, 1.0, 3.0)  # 2° apart across north, not 358°
    assert r.accepted and abs(r.innovation[0]) == pytest.approx(np.radians(2.0), abs=1e-9)
    assert 359.0 < heading_deg(r.mean) or heading_deg(r.mean) < 1.5  # between the two headings, through north
    assert r.cov[2, 2] < cov[2, 2] and r.cov[2, 2] < np.radians(3.0) ** 2
    assert is_pd(r.cov)


def test_f44_position_update_pulls_towards_fix():
    mean, cov = ekf_init(0.0, 0.0, 0.0, 20.0, 5.0)
    r = update_position(mean, cov, 30.0, -10.0, np.diag([5.0**2, 5.0**2]))
    assert 0.0 < r.mean[0] <= 30.0 and -10.0 <= r.mean[1] < 0.0
    assert r.mean[0] == pytest.approx(30.0 * 400.0 / 425.0)  # Kalman gain 400/(400+25)
    assert r.cov[0, 0] == pytest.approx(400.0 * 25.0 / 425.0)


def test_f44_uninformative_measurement_changes_nothing():
    mean, cov = ekf_init(10.0, 20.0, 45.0, 5.0, 3.0)
    r = ekf_update(mean, cov, [0.0, 0.0, 0.0], np.eye(3) * 1e18, np.eye(3), angle_rows=(2,))
    assert np.allclose(r.mean, mean, atol=1e-6) and np.allclose(r.cov, cov, rtol=1e-6)


def test_f44_gate_rejects_outlier_and_accepts_consistent_fix():
    mean, cov = ekf_init(0.0, 0.0, 10.0, 5.0, 3.0)
    bad = update_heading(mean, cov, 100.0, 3.0, gate_p=0.99)  # 90° off with σ ≈ 4°
    assert not bad.accepted and np.array_equal(bad.mean, mean) and np.array_equal(bad.cov, cov) and bad.nis > chi2.ppf(0.99, 1)
    good = update_heading(mean, cov, 12.0, 3.0, gate_p=0.99)
    assert good.accepted


def test_f44_update_from_sun_compass_uses_heading_and_sigma():
    class Fix:  # duck-typed F39 result
        heading_deg, sigma_heading_deg = 80.0, 4.0

    mean, cov = ekf_init(0.0, 0.0, 70.0, 5.0, 10.0)
    r = update_from_sun_compass(mean, cov, Fix())
    assert 70.0 < heading_deg(r.mean) < 80.0 and r.cov[2, 2] < np.radians(4.0) ** 2


L = np.array([[2000.0, 3000.0], [-2500.0, 1500.0], [500.0, -3500.0], [3000.0, -1000.0]])


def test_f44_update_from_resection_converts_heading_units():
    """The F40 covariance carries ψ in degrees; with a vague prior the filter must adopt the fix and its covariance in radians."""
    truth = np.array([120.0, -340.0])
    rng = np.random.default_rng(5)
    b = np.degrees(np.arctan2(L[:, 0] - truth[0], L[:, 1] - truth[1])) - 73.0 + rng.normal(0, 1.0, len(L))
    fix = resection(L, (b + 180.0) % 360.0 - 180.0, 1.0, heading_known=False)
    assert isinstance(fix, ResectionResult) and fix.heading_deg is not None
    mean, cov = ekf_init(0.0, 0.0, 0.0, 1e5, 180.0)
    r = update_from_resection(mean, cov, fix)
    assert np.hypot(r.mean[0] - fix.x, r.mean[1] - fix.y) < 1.0
    assert np.sqrt(r.cov[2, 2]) == pytest.approx(np.radians(np.sqrt(fix.cov[2, 2])), rel=0.05)
    # known heading: position only, heading untouched
    fix_k = resection(L, np.degrees(np.arctan2(L[:, 0] - truth[0], L[:, 1] - truth[1])), 1.0, heading_known=True)
    mean2, cov2 = ekf_init(0.0, 0.0, 33.0, 1e4, 5.0)
    r2 = update_from_resection(mean2, cov2, fix_k)
    assert np.hypot(r2.mean[0] - truth[0], r2.mean[1] - truth[1]) < 1.0 and r2.mean[2] == pytest.approx(mean2[2])


def test_f44_update_from_skyline_and_flat_horizon_skip():
    cov_xy = np.diag([15.0**2, 15.0**2])
    fix = SkylineResult(x=50.0, y=60.0, heading_deg=100.0, score=0.99, confidence=0.9, peak_ratio=1.1, misfit_ratio=10.0, cov_xy=cov_xy,
                        sigma_heading_deg=2.0, candidates_xy=np.zeros((1, 2)), scores=np.zeros(1), headings_deg=np.zeros(1),
                        likelihood=np.ones(1), grid_shape=None, flags=[])
    mean, cov = ekf_init(0.0, 0.0, 90.0, 1e3, 30.0)
    r = update_from_skyline(mean, cov, fix)
    assert r.accepted and np.hypot(r.mean[0] - 50.0, r.mean[1] - 60.0) < 1.0 and abs(heading_deg(r.mean) - 100.0) < 0.5
    fix.flags = ["FLAT_HORIZON", "LOW_CONFIDENCE"]
    skipped = update_from_skyline(mean, cov, fix)
    assert not skipped.accepted and np.array_equal(skipped.mean, mean)


# ---------------------------------------------------------------- consistency (NEES) and positive definiteness
SIG_ABS, SIG_REL, SIG_H = 0.2, 0.05, 0.5  # truth uses the filter's own noise model (consistency test)


def simulate(n_runs=1000, n_steps=40, step=15.0, seed=11):
    """Monte Carlo of the full filter loop. Returns per-step NEES (n_runs, n_steps) and the smallest covariance eigenvalue."""
    rng = np.random.default_rng(seed)
    p0_xy, p0_h = 10.0, 5.0
    nees = np.zeros((n_runs, n_steps))
    min_eig = np.inf
    for run in range(n_runs):
        truth = np.array([0.0, 0.0, np.radians(40.0)])
        mean, cov = ekf_init(*(truth[:2] + rng.normal(0, p0_xy, 2)), np.degrees(truth[2]) + rng.normal(0, p0_h), p0_xy, p0_h)
        for k in range(n_steps):
            # truth: p += (s + w_s)[sin ψ, cos ψ] with the heading before the step, then ψ += w_ψ
            w_s = rng.normal(0, SIG_ABS + SIG_REL * step)
            w_h = rng.normal(0, np.radians(SIG_H) * np.sqrt(step))
            truth[0] += (step + w_s) * np.sin(truth[2])
            truth[1] += (step + w_s) * np.cos(truth[2])
            truth[2] += w_h
            mean, cov = ekf_predict(mean, cov, step, SIG_ABS, SIG_REL, SIG_H)
            if k % 5 == 4:  # sun-compass heading, σ = 3°
                z = np.degrees(truth[2]) + rng.normal(0, 3.0)
                mean, cov = (lambda u: (u.mean, u.cov))(update_heading(mean, cov, z, 3.0))
            if k % 10 == 9:  # resection-like position fix, σ = 8 m
                zxy = truth[:2] + rng.normal(0, 8.0, 2)
                mean, cov = (lambda u: (u.mean, u.cov))(update_position(mean, cov, zxy[0], zxy[1], np.diag([64.0, 64.0])))
            if k == 19:  # skyline-like full pose fix
                R = np.diag([6.0**2, 6.0**2, np.radians(2.0) ** 2])
                zp = truth + rng.normal(0, np.sqrt(np.diag(R)))
                mean, cov = (lambda u: (u.mean, u.cov))(update_pose(mean, cov, zp[0], zp[1], np.degrees(zp[2]), R))
            e = mean - truth
            e[2] = (e[2] + np.pi) % (2 * np.pi) - np.pi
            nees[run, k] = e @ np.linalg.solve(cov, e)
            min_eig = min(min_eig, float(np.linalg.eigvalsh(0.5 * (cov + cov.T)).min()))
    return nees, min_eig


@pytest.fixture(scope="module")
def mc():
    return simulate()


def test_f44_nees_consistent_with_chi_square_3dof(mc):
    """Mean NEES over 1000 runs must sit in the two-sided 95 % χ² band for 3 dof at (almost) every step; the grand mean is 3."""
    nees, _ = mc
    n = nees.shape[0]
    lo, hi = chi2.ppf(0.025, 3 * n) / n, chi2.ppf(0.975, 3 * n) / n
    per_step = nees.mean(axis=0)
    outside = np.mean((per_step < lo) | (per_step > hi))
    assert outside <= 0.15, f"{outside:.0%} of steps outside the 95% band [{lo:.2f}, {hi:.2f}]; per-step means {per_step.round(2)}"
    # a filter that is neither over- nor under-confident: grand mean close to 3 (not just inside a wide band)
    assert abs(per_step.mean() - 3.0) < 0.15, per_step.mean()


def test_f44_covariance_stays_symmetric_positive_definite(mc):
    _, min_eig = mc
    assert min_eig > 0.0


def test_f44_covariance_pd_under_long_dead_reckoning_and_repeated_updates():
    mean, cov = ekf_init(0.0, 0.0, 10.0, 1.0, 1.0)
    for k in range(2000):
        mean, cov = ekf_predict(mean, cov, 3.0)
        if k % 3 == 0:
            u = update_heading(mean, cov, heading_deg(mean) + 0.1, 0.5)  # extremely tight fixes
            mean, cov = u.mean, u.cov
        assert is_pd(cov, tol=0.0)
