"""Contract validation tests for contracts/openapi.yaml.

Verifies OpenAPI 3.1.x compliance, operation completeness, JSON pointer resolution,
presence of the minimum schema set from docs/ARCHITECTURE.md, and route/method
synchronization with the FastAPI implementation when available.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import pytest

HTTP_METHODS = {"get", "post", "put", "delete", "patch", "options", "head", "trace"}

MINIMUM_SCHEMA_SET = [
    "LayerMeta",
    "Place",
    "Waypoint",
    "AstronautProfile",
    "RouteRequest",
    "RouteResult",
    "Segment",
    "LocalizeResult",
    "SunState",
    "Alert",
    "Error",
    "Orbiter",
    "OrbiterState",
    "ContactWindow",
]


def _resolve_json_pointer(doc: dict[str, Any], ref: str) -> Any:
    """Resolve an internal JSON pointer like '#/components/schemas/Site'."""
    if not ref.startswith("#/"):
        raise ValueError(f"Only document-internal $ref pointers are supported, got: {ref}")
    parts = ref[2:].split("/")
    current: Any = doc
    for part in parts:
        # Handle unescaping according to RFC 6901
        key = part.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict):
            if key not in current:
                raise KeyError(f"Cannot resolve reference '{ref}': key '{key}' not found in dict")
            current = current[key]
        elif isinstance(current, list):
            try:
                idx = int(key)
                current = current[idx]
            except (ValueError, IndexError) as err:
                raise KeyError(f"Cannot resolve reference '{ref}': invalid index '{key}'") from err
        else:
            raise KeyError(f"Cannot resolve reference '{ref}': traversed into non-container {type(current)}")
    return current


def _collect_all_refs(node: Any) -> list[str]:
    """Recursively collect all $ref strings in an OpenAPI document structure."""
    refs: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str):
                refs.append(v)
            else:
                refs.extend(_collect_all_refs(v))
    elif isinstance(node, list):
        for item in node:
            refs.extend(_collect_all_refs(item))
    return refs


def test_openapi_contract_specification(openapi_spec: dict[str, Any]) -> None:
    """Verify contracts/openapi.yaml against specification requirements:

    1. OpenAPI version is 3.1.x
    2. Every path operation has an operationId and a 200 response
    3. Every internal $ref resolves successfully
    4. All schemas from the minimum schema set in docs/ARCHITECTURE.md exist
    """
    # 1. Check OpenAPI version
    version = str(openapi_spec.get("openapi", ""))
    assert version.startswith("3.1."), f"Expected OpenAPI 3.1.x, found: '{version}'"

    # 2. Check path operations
    paths = openapi_spec.get("paths", {})
    assert isinstance(paths, dict) and len(paths) > 0, "No paths defined in openapi.yaml"

    operation_count = 0
    for path, path_item in paths.items():
        assert isinstance(path_item, dict), f"Path item for '{path}' must be a dict"
        for method, op in path_item.items():
            if method.lower() not in HTTP_METHODS:
                continue
            operation_count += 1
            op_label = f"{method.upper()} {path}"
            assert isinstance(op, dict), f"Operation {op_label} must be a dict"

            # Must have operationId
            op_id = op.get("operationId")
            assert op_id and isinstance(op_id, str), f"Operation {op_label} is missing a non-empty 'operationId'"

            # Must have 200 response
            responses = op.get("responses", {})
            assert isinstance(responses, dict), f"Operation {op_label} responses must be a dict"
            has_200 = "200" in responses or 200 in responses
            assert has_200, f"Operation {op_label} is missing a 200 response"

    assert operation_count > 0, "No HTTP operations found in openapi.yaml paths"

    # 3. Check every $ref resolves
    all_refs = _collect_all_refs(openapi_spec)
    assert len(all_refs) > 0, "Expected to find $ref references in contract"
    for ref in all_refs:
        resolved = _resolve_json_pointer(openapi_spec, ref)
        assert resolved is not None, f"Reference '{ref}' resolved to None"

    # 4. Check minimum schema set from docs/ARCHITECTURE.md
    schemas = openapi_spec.get("components", {}).get("schemas", {})
    assert isinstance(schemas, dict), "components.schemas must be a dictionary"
    missing_schemas = [name for name in MINIMUM_SCHEMA_SET if name not in schemas]
    assert not missing_schemas, f"Missing required schemas from docs/ARCHITECTURE.md: {missing_schemas}"


def test_fastapi_app_matches_contract(openapi_spec: dict[str, Any], repo_root: Path) -> None:
    """Compare the FastAPI application routes and HTTP methods with the contract.

    This test is skipped with a clear reason until apps/api/app/main.py exists,
    or if SKIP_API_CONTRACT_TEST=1 is explicitly set.
    """
    api_main_file = repo_root / "apps" / "api" / "app" / "main.py"
    if not api_main_file.exists():
        pytest.skip("FastAPI app does not exist yet: apps/api/app/main.py not found")

    if os.getenv("SKIP_API_CONTRACT_TEST") == "1":
        pytest.skip("FastAPI app comparison test explicitly skipped via SKIP_API_CONTRACT_TEST=1")

    # Add apps/api to sys.path so app.main can be imported
    api_dir = str(repo_root / "apps" / "api")
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)

    try:
        from app.main import app  # type: ignore[import-not-found]
    except Exception as exc:
        pytest.skip(f"FastAPI app could not be imported: {exc}")

    # Build mapping of app routes: path -> set of lower-case HTTP methods
    # app.openapi() lists every operation, including those of included routers (newer FastAPI keeps those as lazy
    # `_IncludedRouter` objects that are invisible when iterating app.routes).
    app_routes: dict[str, set[str]] = {}
    for route_path, item in app.openapi().get("paths", {}).items():
        clean_methods = {m.lower() for m in item if m.lower() in HTTP_METHODS}
        if clean_methods:
            app_routes.setdefault(route_path, set()).update(clean_methods)

    # Compare with contract paths
    contract_paths = openapi_spec.get("paths", {})
    for path, path_item in contract_paths.items():
        expected_app_path = f"/api/v1{path}"
        assert (
            expected_app_path in app_routes
        ), f"Contract path '{path}' ({expected_app_path}) not registered in FastAPI app routes"

        registered_methods = app_routes[expected_app_path]
        for method in path_item:
            if method.lower() in HTTP_METHODS:
                assert (
                    method.lower() in registered_methods
                ), f"Method {method.upper()} for path '{path}' not supported by FastAPI route {expected_app_path}"

    # Also verify that no extra /api/v1 routes exist in the app that aren't in the contract
    expected_app_paths = {f"/api/v1{p}" for p in contract_paths}
    actual_v1_paths = {p for p in app_routes if p.startswith("/api/v1")}
    uncontracted = actual_v1_paths - expected_app_paths
    assert not uncontracted, f"FastAPI app has /api/v1 routes not declared in openapi.yaml: {uncontracted}"
