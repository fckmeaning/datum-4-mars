# AreoNav (marsnav) Data Pipeline

Planetary GIS data processing and raster preparation for the Gale crater / lower Mount Sharp Area of Interest (AOI).

## Architecture

- **Projection**: Transverse Mercator centered on Gale crater (`-4.72° lat`, `137.40° lon`, sphere $R = 3\,396\,190\text{ m}$) as defined in `contracts/projection.json`.
- **Output Format**: Cloud-Optimized GeoTIFF (float32, DEFLATE compression, blocksize 256, overview pyramids) accompanied by a `LayerMeta` JSON sidecar matching `contracts/openapi.yaml`.
- **Manifest**: All dataset products are catalogued in `data/manifest.yaml`.

## Modules

- `aoi.py`: Helper functions for loading projection configurations, bounding boxes, and computing pixel grids snapped to given resolutions.
- `cog.py`: Helper for writing Cloud-Optimized GeoTIFFs and sidecar metadata JSONs adhering to the API contracts.
- `common.py`: Common pipeline utilities, including polite GDAL remote read configurations (`gdal_env`), `upsert_manifest`, and timestamp helpers.
- `make_l0_synthetic.py`: Deterministic generation of the 20 m synthetic DEM (`L0`), representing crater floor, Mount Sharp rise, ridge structures, and Gaussian noise seeded from `config/params.yaml`.
- `fetch_l1_dem.py`: Windowed remote extraction and reprojection of the USGS HRSC/MOLA blended 200 m global DEM via `/vsicurl/`.

## Running the Pipeline

All commands are executed from the repository root:

### 1. Generate L0 Synthetic DEM (20 m)
```powershell
& ".venv\Scripts\python.exe" "data\pipeline\make_l0_synthetic.py"
```
Produces:
- `data/processed/gale/L0/elevation.tif`
- `data/processed/gale/L0/elevation.json`
- Updates `data/manifest.yaml`

### 2. Fetch L1 HRSC/MOLA DEM (200 m)
```powershell
& ".venv\Scripts\python.exe" "data\pipeline\fetch_l1_dem.py"
```
Produces:
- `data/processed/gale/L1/elevation.tif`
- `data/processed/gale/L1/elevation.json`
- Updates `data/manifest.yaml`

### 3. Run Pipeline Tests
```powershell
& ".venv\Scripts\python.exe" -m pytest "data/pipeline/tests" -q
```
