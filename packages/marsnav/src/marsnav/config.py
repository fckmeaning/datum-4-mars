"""Access to config/params.yaml and contracts/projection.json (single source of every parameter).

Usage::

    from marsnav.config import param, params
    R = param("constants.R_sphere")          # value only
    entry = params()["astronaut"]["v_flat"]  # full entry with unit/source/range

The repository root is found from the MARSNAV_ROOT environment variable, or by walking up from this file
until a directory containing ``config/params.yaml`` is found.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml


@lru_cache(maxsize=1)
def repo_root() -> Path:
    env = os.environ.get("MARSNAV_ROOT")
    if env:
        root = Path(env).resolve()
        if (root / "config" / "params.yaml").is_file():
            return root
        raise FileNotFoundError(f"MARSNAV_ROOT={env} does not contain config/params.yaml")
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "config" / "params.yaml").is_file():
            return parent
    raise FileNotFoundError("Could not locate the repository root (config/params.yaml) above " + str(here))


@lru_cache(maxsize=1)
def params() -> dict[str, Any]:
    with open(repo_root() / "config" / "params.yaml", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=1)
def projection() -> dict[str, Any]:
    with open(repo_root() / "contracts" / "projection.json", encoding="utf-8") as fh:
        return json.load(fh)


def entry(path: str) -> dict[str, Any]:
    """Full parameter entry (value, unit, source, ...) for a dotted path like ``astronaut.v_flat``."""
    node: Any = params()
    for key in path.split("."):
        if not isinstance(node, dict) or key not in node:
            raise KeyError(f"Unknown parameter: {path}")
        node = node[key]
    if not isinstance(node, dict) or "value" not in node:
        raise KeyError(f"{path} is a group, not a parameter")
    return node


def param(path: str) -> Any:
    """Value of a parameter, e.g. ``param("constants.R_sphere") -> 3396190.0``."""
    return entry(path)["value"]


def profile_weights(profile: str) -> dict[str, float]:
    """Weights of a routing profile (FASTEST / SAFEST / BALANCED / SCIENCE)."""
    profiles = params()["routing"]["profiles"]
    if profile not in profiles:
        raise KeyError(f"Unknown profile {profile!r}; expected one of {sorted(profiles)}")
    return {k: float(v) for k, v in profiles[profile].items()}
