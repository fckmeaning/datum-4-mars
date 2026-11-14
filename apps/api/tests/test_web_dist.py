"""Single-origin hosting: the built web app is served by the API with an index.html fallback for client-side routes."""

from __future__ import annotations

from pathlib import Path

import pytest
from app.main import SPAStaticFiles
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def web(tmp_path: Path) -> TestClient:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (tmp_path / "assets" / "a.js").write_text("console.log(1)", encoding="utf-8")
    app = FastAPI()

    @app.get("/api/v1/ping")
    def ping() -> dict:
        return {"ok": True}

    app.mount("/", SPAStaticFiles(directory=str(tmp_path), html=True), name="web")
    return TestClient(app)


def test_root_and_asset(web: TestClient) -> None:
    assert web.get("/").text == "<html>app</html>"
    assert web.get("/assets/a.js").text == "console.log(1)"


def test_client_routes_fall_back_to_index(web: TestClient) -> None:
    for path in ("/planner", "/globe", "/a/b/c"):
        r = web.get(path)
        assert r.status_code == 200 and r.text == "<html>app</html>", path


def test_api_and_data_misses_stay_404(web: TestClient) -> None:
    assert web.get("/api/v1/ping").json() == {"ok": True}
    for path in ("/api/v1/nope", "/data/gale/missing.tif"):
        assert web.get(path).status_code == 404, path
