"""Audit of numeric claims in the external Sol Atlas specification (see docs/SOLATLAS_ANALYSIS.md). Reads nothing external;
run:  .venv\\Scripts\\python.exe ops\verify_solatlas_spec.py   (prints the numbers quoted in the analysis)."""

import math
from datetime import UTC, datetime, timedelta

import numpy as np
from marsnav.orbits import _EM_BARY, _MARS, J2000_JD, _heliocentric_ecliptic, earth_mars_light_time, jd_tt_from_unix, to_unix
from marsnav.routing.mobility import metabolic_cost
from marsnav.sun import mars24, mission_sol

R = 3_396_190.0
print("== 1. constants")
print("cos(18.38 deg) =", round(math.cos(math.radians(18.38)), 6), "(spec 0.948984)")
print("m per deg lat, R=3396190 :", round(R * math.pi / 180, 2), "(spec viewshed constant 59274.7)")
print("rel. error of x-scale, equirect with fixed phi0=18.38, at +-1 deg lat:", f"{math.tan(math.radians(18.38)) * math.radians(1.0) * 100:.2f} %")

print("\n== 2. mission sol / MSD0")
landing = datetime(2021, 2, 18, 20, 55, 0, tzinfo=UTC)
msd_land = mars24(landing).msd
print("MSD at Perseverance touchdown 2021-02-18 20:55Z (our Mars24):", round(msd_land, 3), "(spec MSD0 52304.19)")
now = datetime(2026, 11, 14, 9, 0, 0, tzinfo=UTC)
for lon in (77.4508, 77.58):
    ours = mission_sol(now, lon, landing)
    elapsed = math.floor(mars24(now).msd - 52304.19)
    print(f"lon {lon}: our local-midnight sol = {ours}; spec floor(MSD-MSD0) = {elapsed}")
# how often do the two definitions disagree over one sol?
diff = 0
N = 288
for k in range(N):
    t = now + timedelta(seconds=k * 88775.244 / N)
    if mission_sol(t, 77.4508, landing) != math.floor(mars24(t).msd - 52304.19):
        diff += 1
print(f"share of a sol on which the two sol numbers disagree: {diff / N:.0%}")

print("\n== 3. light time: spec planar formula vs 3-D")


def vecs(utc):
    T = (float(jd_tt_from_unix(to_unix(utc))) - J2000_JD) / 36525.0
    return _heliocentric_ecliptic(_EM_BARY, T), _heliocentric_ecliptic(_MARS, T)


def planar(utc):
    e, m = vecs(utc)
    rE, rM = np.linalg.norm(e), np.linalg.norm(m)
    dl = math.atan2(m[1], m[0]) - math.atan2(e[1], e[0])
    return math.sqrt(rE**2 + rM**2 - 2 * rE * rM * math.cos(dl)) * 499.00478


errs, d3s = [], []
t = datetime(2026, 1, 1, tzinfo=UTC)
while t < datetime(2041, 1, 1, tzinfo=UTC):
    e3 = earth_mars_light_time(t)["one_way_s"]
    errs.append(planar(t) - e3)
    d3s.append(e3)
    t += timedelta(days=5)
errs = np.array(errs)
print(f"our 3-D light time range {min(d3s) / 60:.1f}..{max(d3s) / 60:.1f} min")
print(f"planar - 3D error: mean {errs.mean():+.2f} s, max |err| {np.abs(errs).max():.2f} s, p95 {np.percentile(np.abs(errs), 95):.2f} s")
print("2026-11-14 3-D one-way:", round(earth_mars_light_time(now)["one_way_s"], 1), "s;  planar:", round(planar(now), 1), "s")

print("\n== 4. EVA model: Pandolf (spec 3.3) vs Minetti (ours)")
W, L, eta = 75.0, 65.0, 1.4


def pandolf(V, G):
    return 1.5 * W + 2.0 * (W + L) * (L / W) ** 2 + eta * (W + L) * (1.5 * V**2 + 0.35 * V * G)


def tobler(S, vmax=0.95):
    return vmax * math.exp(-3.5 * abs(S + 0.05))


gr = 3.721 / 9.80665
print("Tobler(spec, Vmax=0.95): v(0) =", round(tobler(0), 3), "m/s; v(-0.05) =", round(tobler(-0.05), 3), "(this is the peak, not 'flat speed')")
for S in (-0.3, -0.15, -0.05, 0.0, 0.1, 0.2, 0.3):
    V = tobler(S)
    Mw = pandolf(V, max(0.0, S * 100)) * gr
    # our Minetti-based power on Mars for same speed, mass 75+65 (+ no payload)
    c0 = float(metabolic_cost(0.0))
    cm = c0 + (float(metabolic_cost(S)) - c0) * gr
    Pm = (W + L) * cm * V
    print(f"S={S:+.2f}  v={V:.2f} m/s  Pandolf*gM/gE = {Mw:6.1f} W   Minetti-grade on Mars = {Pm:6.1f} W")
print(
    "share of Pandolf power that does not depend on slope or speed (1.5W + load term):", f"{(1.5 * W + 2 * (W + L) * (L / W) ** 2) / pandolf(tobler(0), 0):.0%}"
)

print("\n== 5. Float32 gScore in the spec A*")
for g in (1e3, 1e5, 1e6, 1e8):
    print(f"g={g:>12,.0f}  float32 ulp = {np.spacing(np.float32(g)):.4g}")
# repeated re-push: tentative (double) < stored float32 rounding?
rng = np.random.default_rng(1)
x = rng.uniform(1e4, 5e4, 100000)
f = x.astype(np.float32).astype(np.float64)
print("share of equal re-relaxations that would pass 'tentative < gScore' after float32 rounding:", f"{np.mean(x < f):.0%}")
