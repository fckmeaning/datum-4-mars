import numpy as np
import pytest

from marsnav.config import param
from marsnav.env import atmosphere, dose_rate, pressure, surface_temperature


def test_f17_limits():
    assert surface_temperature(1.0) == pytest.approx(param("env.T_surf_day_default_K"))
    assert surface_temperature(0.0) == pytest.approx(param("env.T_surf_night_default_K"))
    assert surface_temperature(-0.5) == pytest.approx(param("env.T_surf_night_default_K"))
    t = surface_temperature(np.array([0.1, 0.5, 0.9]))
    assert np.all(np.diff(t) > 0)


def test_f18_pressure():
    P_ref, H = param("atmosphere.P_ref"), param("atmosphere.scale_height_H")
    assert pressure(-4000.0, -4000.0) == pytest.approx(P_ref)
    assert pressure(-4000.0 + H, -4000.0) == pytest.approx(P_ref / np.e)


def test_f19_dose_reference_and_monotonic():
    ref = param("radiation.dose_eq_ref") / 24.0
    P_ref = param("atmosphere.P_ref")
    assert dose_rate(1.0, P_ref) == pytest.approx(ref)
    assert dose_rate(0.5, P_ref) == pytest.approx(ref / 2)
    assert dose_rate(1.0, P_ref * 1.1) < ref  # more atmosphere above → less dose


def test_f20_atmosphere_defaults():
    a = atmosphere(14.0)
    assert set(a) == {"air_temp_K", "wind_ms", "tau"}
    assert a["air_temp_K"] == pytest.approx(param("env.T_air_default_K") + param("env.T_air_diurnal_amp_K"))
