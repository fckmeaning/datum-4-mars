# AreoNav Data Sources and Attribution

This document lists all datasets incorporated into or verified for AreoNav (marsnav),
combining active pipeline artifacts (`data/manifest.yaml`) and verified research references (`data/pipeline/SOURCES.md`).

## Master Data Sources Table

| Product | Family | Resolution | Level | Licence | Credit | URL | Retrieved Date | SIMULATED | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| **Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2** | topography | 200.0 m | L1 | public domain (USGS/NASA); HRSC ESA/DLR/FU Berlin [verify] | NASA/JPL/GSFC (MOLA), ESA/DLR/FU Berlin (HRSC); USGS Astrogeology | [https://planetarymaps.usgs.gov/mosa...](https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif) | 2026-11-14 | No | AOI window read via HTTP range requests and reprojected (bilinear) to the AOI transverse Mercator grid. |
| **Gale_Synthetic_DEM_20m_v1** | topography | 20.0 m | L0 | CC0-1.0 (SIMULATED) | SIMULATED (marsnav team) | local://data/pipeline/make_l0_synthetic.py | 2026-11-14 | SIMULATED | Deterministic synthetic DEM at 20 m on the Gale AOI transverse-Mercator grid. |
| **MSL_waypoints.json + MSL_waypoints_current.json** | geology | vector | - | NASA public data [verify] | NASA/JPL-Caltech (Mars Science Laboratory, MMGIS traverse waypoints) | [https://mars.nasa.gov/mmgis-maps/MS...](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json) | 2026-11-14 | No | 1389 measured rover positions, sol 3-5073; source of places.json and traverse.geojson. |
| **Mars_Active_Orbiters_Ephemerides** | orbits | vector | L0 | public domain (NASA/JPL, ESA) | NASA/JPL Horizons, ESA Space Operations, MAVEN Science Team | [https://ssd.jpl.nasa.gov/api/horizo...](https://ssd.jpl.nasa.gov/api/horizons.api) | 2026-11-14 | No | Keplerian orbital elements for active Mars relay and science orbiters in Mars equator-of-date frame. |
| **1. Curiosity Traverse & Boxwork** | radiation | - | L0/Ref | NASA/JPL-Caltech | NASA/JPL-Caltech | [https://mars.nasa.gov/mmgis-maps/MS...](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json) | 2026-11-14 | No | `data/raw/msl/MSL_waypoints.json` & `MSL_waypoints_current.json` |
| **2. Recommended Final AOI Bounding Box** | geodesy | - | L0/Ref | NASA/JPL-Caltech | NASA/JPL-Caltech; contracts/projection.json v1.1 | [https://mars.nasa.gov/mmgis-maps/MS...](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json) | 2026-11-14 | No | Query over `data/raw/msl/MSL_waypoints.json` + `contracts/projection.json` |
| **3. L2/L3 Topography & Imagery** | topography | 6 m/px | L3 | Public Domain (NASA/JPL/USGS/Univ. of Arizona / Caltech) | Public Domain (NASA/JPL/USGS/Univ. of Arizona / Caltech) | [https://planetarymaps.usgs.gov/mosa...](https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif) | 2026-11-14 | No | File headers & planetarymaps.usgs.gov / uahirise.org product pages |
| **4. Thermal Data** | thermal | 100 m/px | L0/Ref | NASA/JPL/ASU/USGS Astrogeology | NASA/JPL/ASU/USGS Astrogeology | [https://planetarymaps.usgs.gov/mosa...](https://planetarymaps.usgs.gov/mosaic/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12.tif) | 2026-11-14 | No | USGS Astropedia product metadata & file header |
| **5. Spectral (CRISM)** | spectral | - | L0/Ref | NASA/JPL/JHU-APL/PDS Geosciences Node | NASA/JPL/JHU-APL/PDS Geosciences Node | [https://pds-geosciences.wustl.edu/m...](https://pds-geosciences.wustl.edu/missions/mro/crism.htm) | 2026-11-14 | No | PDS Geosciences Node MRO CRISM collection |
| **6. Atmosphere & Radiation** | radiation | - | L0/Ref | NASA/REMS Team | NASA/REMS Team; Hassler et al. 2014 (Science); CCMC | [https://ccmc.gsfc.nasa.gov/tools/DO...](https://ccmc.gsfc.nasa.gov/tools/DONKI/) | 2026-11-14 | No | Peer-reviewed in-situ measurements (Hassler 2014, Haberle 2014) & CCMC DONKI portal |
| **7. Active Orbiters** | orbits | - | L0/Ref | NASA/JPL, ESA, NASA/GSFC | NASA/JPL, ESA, NASA/GSFC | [https://science.nasa.gov/mission/ma...](https://science.nasa.gov/mission/mars-reconnaissance-orbiter/) | 2026-11-14 | No | NASA Science & ESA mission portals |
| **8. Mars Global Colour Texture** | optical | 232 m/px | L0/Ref | Public Domain (USGS Astrogeology / NASA) | Public Domain (USGS Astrogeology / NASA) | [https://planetarymaps.usgs.gov/mosa...](https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif) | 2026-11-14 | No | File download record on planetarymaps.usgs.gov |
| **9. Places & Gazetteers** | radiation | - | L0/Ref | IAU / USGS Gazetteer / NASA MSL Science Team | IAU / USGS Gazetteer / NASA MSL Science Team | [https://planetarynames.wr.usgs.gov/...](https://planetarynames.wr.usgs.gov/) | 2026-11-14 | No | USGS Gazetteer records + `data/raw/msl/MSL_waypoints.json` |
| **10. Mars24 Worked Example** | sun | - | L0/Ref | NASA Goddard Institute for Space Studies (GISS) / Allison & McEwen (2000) | NASA Goddard Institute for Space Studies (GISS) / Allison & McEwen (2000) | [https://www.giss.nasa.gov/tools/mar...](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) | 2026-11-14 | No | NASA GISS Mars24 Algorithm help documentation |

---

## Attribution and Open Science Compliance
- All datasets derive from public domain planetary missions (NASA, USGS, ESA, DLR, Univ. Arizona, ASU, JHU APL, SwRI, CAB).
- Synthetic baselines are clearly flagged with **SIMULATED**.
- In accordance with NASA Space Apps Challenge regulations, no NASA logos or endorsement claims are made.
- High-resolution datasets adhere to D-14 using USGS MSL Gale DEM Mosaic products.
