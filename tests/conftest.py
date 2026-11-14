"""Root test configuration and fixtures for marsnav.

Provides session-scoped fixtures for repository root, OpenAPI contracts,
and common test utilities.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]

# Ensure repo packages and apps are available on sys.path
_MARSNAV_SRC = REPO_ROOT / "packages" / "marsnav" / "src"
_API_DIR = REPO_ROOT / "apps" / "api"

for p in (_MARSNAV_SRC, _API_DIR):
    p_str = str(p)
    if p.exists() and p_str not in sys.path:
        sys.path.insert(0, p_str)


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """Return the absolute path to the repository root."""
    return REPO_ROOT


@pytest.fixture(scope="session")
def openapi_contract_path(repo_root: Path) -> Path:
    """Return path to contracts/openapi.yaml."""
    path = repo_root / "contracts" / "openapi.yaml"
    assert path.exists(), f"Contract file not found at {path}"
    return path


@pytest.fixture(scope="session")
def openapi_spec(openapi_contract_path: Path) -> dict[str, Any]:
    """Parse and return contracts/openapi.yaml as a dictionary."""
    with open(openapi_contract_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    assert isinstance(data, dict), "openapi.yaml must parse to a dict"
    return data
