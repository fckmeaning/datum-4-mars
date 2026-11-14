"""Global (whole-planet) data layers for the orbital globe.

Input : a global MOLA-derived elevation raster, 1024 x 512, RGB16 (value = R*256 + G - 32768 metres).
Output: data/processed/globe/
  mars_layers.json            metadata: per layer min/max/unit/ramp, honesty flag (modeled or measured)
  mars_<id>_color.jpg         2048 x 1024 colour-mapped texture drawn on the globe
  mars_<id>_value.png         1024 x 512 8-bit raster, value = min + v/255 * (max - min), used for the cursor readout
  mars_elev.png               copy of the input (cursor readout of elevation)

Layers derived here (all MODELED from elevation, constants from config/params.yaml):
  pressure   P(h) = P_ref * exp(-(h - h_ref) / H)                        (isothermal atmosphere)
  radiation  D(h) = D_ref * (P_ref / P(h)) ** beta                       (GCR dose-equivalent vs atmospheric shielding)
  slope      mean slope at the 39 km grid scale, degrees (coarse: it is a regional tilt, not a rover-scale hazard)
  hazard     0.5 * slope_norm + 0.5 * radiation_norm (an index, 0..1)

Run:  .venv\\Scripts\\python.exe data\\pipeline\\make_globe_layers.py --elev <path to g_elev.png>
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "processed" / "globe"
R_MARS_M = 3_396_190.0
H_REF_M = -4400.0  # Gale floor, the elevation at which P_ref and dose_eq_ref were measured

# colour ramps (stop colours, low to high)
RAMPS = {
    "viridis": ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    "inferno": ["#000004", "#57106e", "#bc3754", "#f98e09", "#fcffa4"],
    "plasma": ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
    "risk": ["#1a9850", "#a6d96a", "#fee08b", "#f46d43", "#a50026"],
}


def hex_rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float64)


def apply_ramp(t: np.ndarray, stops: list[str]) -> np.ndarray:
    cols = np.stack([hex_rgb(s) for s in stops])
    x = np.clip(t, 0, 1) * (len(stops) - 1)
    i = np.minimum(x.astype(int), len(stops) - 2)
    f = (x - i)[..., None]
    return (cols[i] * (1 - f) + cols[i + 1] * f).astype(np.uint8)


def load_params() -> dict:
    raw = yaml.safe_load((ROOT / "config" / "params.yaml").read_text(encoding="utf-8"))
    g = lambda sec, key: float(raw[sec][key]["value"])  # noqa: E731
    return {
        "H": g("atmosphere", "scale_height_H"),
        "P_ref": g("atmosphere", "P_ref"),
        "D_ref": g("radiation", "dose_eq_ref"),
        "beta": g("radiation", "beta_pressure_dose"),
    }


def slope_deg(elev: np.ndarray) -> np.ndarray:
    h, w = elev.shape
    lat = np.deg2rad(90 - (np.arange(h) + 0.5) / h * 180)
    dy = np.pi * R_MARS_M / h
    dx = (2 * np.pi * R_MARS_M / w) * np.maximum(np.cos(lat), 0.05)[:, None]
    gy, gx = np.gradient(elev)
    return np.rad2deg(np.arctan(np.hypot(gx / dx, gy / dy)))


def write_layer(layer_id: str, name: str, values: np.ndarray, vmin: float, vmax: float, unit: str,
                ramp: str, modeled: bool, source: str, digits: int, meta: dict) -> None:
    t = (values - vmin) / (vmax - vmin)
    u8 = (np.clip(t, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(u8, "L").save(OUT / f"mars_{layer_id}_value.png", optimize=True)
    big = np.array(Image.fromarray(u8, "L").resize((2048, 1024), Image.BICUBIC)).astype(np.float64) / 255
    Image.fromarray(apply_ramp(big, RAMPS[ramp]), "RGB").save(OUT / f"mars_{layer_id}_color.jpg", quality=88)
    meta[layer_id] = {
        "name": name, "unit": unit, "min": vmin, "max": vmax, "digits": digits, "modeled": modeled,
        "source": source, "ramp": RAMPS[ramp], "color": f"mars_{layer_id}_color.jpg", "value": f"mars_{layer_id}_value.png",
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--elev", required=True, type=Path)
    ap.add_argument("--thermal", type=Path, help="global THEMIS night IR colour mosaic (optional, copied as is)")
    ap.add_argument("--topo", type=Path, help="global colour-shaded MOLA topography (optional, copied as is)")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    p = load_params()
    a = np.array(Image.open(args.elev).convert("RGB")).astype(np.int64)
    elev = (a[..., 0] * 256 + a[..., 1] - 32768).astype(np.float64)  # metres
    shutil.copyfile(args.elev, OUT / "mars_elev.png")

    pressure = p["P_ref"] * np.exp(-(elev - H_REF_M) / p["H"])
    dose = p["D_ref"] * (p["P_ref"] / pressure) ** p["beta"]
    slope = slope_deg(elev)

    meta: dict = {}
    write_layer("pressure", "Surface pressure", pressure, 50, 1100, "Pa", "inferno", True,
                "MODELED: isothermal atmosphere from MOLA elevation, P_ref and H from config/params.yaml", 0, meta)
    write_layer("radiation", "Radiation dose rate", dose, 0.5, 1.5, "mSv/day", "plasma", True,
                "MODELED: dose-equivalent scaled from the Gale RAD value by atmospheric shielding (beta from params.yaml)", 2, meta)
    write_layer("slope", "Regional slope", slope, 0, 5, "deg", "viridis", True,
                "MODELED: gradient of MOLA elevation at 39 km grid scale (regional tilt, not rover-scale hazard)", 1, meta)
    s_n = np.clip(slope / 5, 0, 1)
    r_n = np.clip((dose - 0.5) / (1.5 - 0.5), 0, 1)
    write_layer("hazard", "Hazard index", 0.5 * s_n + 0.5 * r_n, 0, 1, "index", "risk", True,
                "MODELED: 0.5 x slope + 0.5 x radiation, both normalised (planning aid, not a measurement)", 2, meta)
    meta["elevation"] = {"name": "Elevation", "unit": "m", "min": float(elev.min()), "max": float(elev.max()), "digits": 0,
                         "modeled": False, "source": "MOLA (MGS) global elevation", "file": "mars_elev.png", "offset": 32768}

    for lid, name, src, source in (
        ("thermal", "THEMIS night infrared", args.thermal, "THEMIS night IR global mosaic (colour-mapped by the source)"),
        ("topo", "Topography (colour)", args.topo, "MOLA colour-shaded relief"),
    ):
        if src:
            shutil.copyfile(src, OUT / f"mars_{lid}_4k.jpg")
            meta[lid] = {"name": name, "unit": "", "modeled": False, "source": source, "color": f"mars_{lid}_4k.jpg"}

    (OUT / "mars_layers.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    for k, v in meta.items():
        print(k, v.get("min"), v.get("max"), v.get("unit"))


if __name__ == "__main__":
    main()
