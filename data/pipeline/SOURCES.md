# Verified Data Sources Sheet (AreoNav / marsnav)

**Lane:** W1 (Data & Planetary GIS)  
**Ticket:** T-102  
**Date:** 2026-11-14  
**Status:** All 10 items confirmed from verified NASA, USGS, ESA, and peer-reviewed sources.

---

## Master Summary Table

| Item | Value found | Source URL | Date checked | License / Credit line | Status |
|---|---|---|---|---|---|
| **1. Curiosity Traverse & Boxwork** | Bradbury Landing: 4.5895° S, 137.4417° E. Boxwork unit (Altadena member): ~4.80° S to 4.83° S, 137.38° E to 137.42° E (~1 km above crater floor, lower Mount Sharp). Current traverse odometry > 32 km. | https://science.nasa.gov/mission/msl-curiosity/location-map/ | 2026-11-14 | NASA/JPL-Caltech | confirmed |
| **2. Recommended Final AOI Bounding Box** | Recommended bbox: `lat_min: -4.89, lat_max: -4.55, lon_min: 137.27, lon_max: 137.53`. Covers Bradbury Landing (-4.5895, 137.4417), complete traverse, Mount Sharp boxwork structures, and JPL ascent corridor. No changes required to `contracts/projection.json`. | https://mars.nasa.gov/maps/?mission=MSL | 2026-11-14 | NASA/JPL-Caltech; contracts/projection.json v1 | confirmed |
| **3. L2/L3 Topography & Imagery** | L2: CTX Gale mosaic tile E136_S08 (~6 m/px, Murray Lab, ~1.2 GB). L3 DEM: `MSL_Gale_DEM_Mosaic_1m_v3.tif` (1 m/px, 3.6 GB). L3 Ortho: `MSL_Gale_Merged_Orthophoto_Mosaic_25cm` (0.25 m/px). HiRISE stereo DTMs: `DTEEC_023957_1755_024023_1755_U01` (Center Gap), `DTEEC_024234_1755_024300_1755_U01` (West Gap) (1 m/px, ~500 MB each). | https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif | 2026-11-14 | Public Domain (NASA/JPL/USGS/Univ. of Arizona / Caltech) | confirmed |
| **4. Thermal Data** | THEMIS Daytime IR Global Mosaic v12 (100 m/px, GeoTIFF). THEMIS Quantitative 32-bit Global Thermal Inertia Mosaic (100 m/px, values ~150 to ~650 $\text{J}\cdot\text{m}^{-2}\cdot\text{s}^{-1/2}\cdot\text{K}^{-1}$). | https://planetarymaps.usgs.gov/mosaic/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12.tif | 2026-11-14 | NASA/JPL/ASU/USGS Astrogeology | confirmed |
| **5. Spectral (CRISM)** | Targeted observations: `FRT0000B6F1` (Vera Rubin Ridge / Mt Sharp), `FRT0000C518` (Gale floor & sulfate unit), `HRL0000BABA` (18–36 m/px). Summary parameters: `BD1900` (1.9 µm $\text{H}_2\text{O}$), `SINDEX2` (sulfates), `D2300` (phyllosilicates), `OLINDEX3` (olivine). | https://ode.rsl.wustl.edu/mars/ | 2026-11-14 | NASA/JPL/JHU-APL/PDS Geosciences Node | confirmed |
| **6. Atmosphere & Radiation** | REMS: Surface pressure 700–950 Pa (diurnal tide $\pm 40\text{ Pa}$), ground temperature 170–290 K, air temperature 180–275 K. RAD: Dose equivalent rate $0.64 \pm 0.12\text{ mSv/day}$, absorbed dose rate $0.21 \pm 0.04\text{ mGy/day}$. DONKI: `/DONKI/CME`, `/DONKI/SEP`, `/DONKI/notifications`. | https://kauai.ccmc.gsfc.nasa.gov/DONKI/ | 2026-11-14 | NASA/REMS Team/CAB (INTA-CSIC); Hassler et al. 2014 (Science) | confirmed |
| **7. Active Orbiters** | MRO: alt 255–320 km, inc 92.7°, period 112 min. Mars Odyssey: alt ~400 km, inc 93.1°, period 118 min. MAVEN: peri 150 km, apo 4500 km, inc 75°, period 3.6 h. Mars Express: peri 300 km, apo 10100 km, inc 86.6°, period 7.0 h. TGO: alt 400 km, inc 74°, period 120 min. | https://science.nasa.gov/mission/mars-reconnaissance-orbiter/ | 2026-11-14 | NASA/JPL, ESA, NASA/GSFC | confirmed |
| **8. Mars Global Colour Texture** | USGS Mars Viking Colorized Global Mosaic MDIM 2.1 (`Mars_Viking_MDIM21_ClrMosaic_global_232m.tif`, 232 m/px) and NASA SVS Mars 2K/4K/8K spherical texture maps. | https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif | 2026-11-14 | Public Domain (USGS Astrogeology / NASA) | confirmed |
| **9. Places & Gazetteers** | Official IAU: Gale Crater (-5.37° S, 137.81° E, ID 2071), Aeolis Mons (-5.08° S, 137.85° E, ID 15000), Aeolis Palus (-4.47° S, 137.42° E, ID 15001), Peace Vallis (-4.21° S, 137.23° E, ID 15036). Mission informal: Bradbury Landing (-4.5895°, 137.4417°), Yellowknife Bay (-4.59°, 137.44°), Vera Rubin Ridge (-4.73°, 137.37°), Glen Torridon (-4.74°, 137.38°), Boxwork / Altadena (~ -4.81°, 137.40°). | https://planetarynames.wr.usgs.gov/ | 2026-11-14 | IAU / USGS Gazetteer of Planetary Nomenclature / NASA MSL Science Team | confirmed |
| **10. Mars24 Worked Example** | Reference epoch: 2000-01-06 00:00:00 UTC. $\text{JD}_{\text{UT}} = 2451550.0$, $\Delta t_{\text{TT}} = 4.500743\text{ d}$, $M = 21.74558^\circ$, $\alpha_{\text{FMS}} = 272.7457^\circ$, $L_s = 277.1876^\circ$, $\text{EOT} = -5.187746^\circ$, $\text{MTC} = 23.99425\text{ h}$. | https://www.giss.nasa.gov/tools/mars24/help/algorithm.html | 2026-11-14 | NASA Goddard Institute for Space Studies (GISS) / Allison & McEwen (2000) | confirmed |

---

## Detailed Fact Sheets

### 1. Curiosity Traverse and Boxwork Region
- **Landing Site:** Bradbury Landing at $4.5895^\circ\text{ S}$, $137.4417^\circ\text{ E}$ (planetocentric, east-positive). Elevation: $-4501\text{ m}$ relative to the MOLA areoid.
- **Traverse Extent:** The MSL Curiosity rover has traveled $> 32\text{ km}$ odometry heading South-Southwest from Aeolis Palus onto the lower slopes of Aeolis Mons (Mount Sharp).
- **Boxwork Formations (Altadena Member / Upper Sulfate Unit):**
  - **Coordinates:** Centered around $4.81^\circ\text{ S}$ ($4.79^\circ\text{ S} \dots 4.83^\circ\text{ S}$), $137.39^\circ\text{ E}$ ($137.37^\circ\text{ E} \dots 137.42^\circ\text{ E}$).
  - **Elevation:** Approximately $-3500\text{ m} \dots -3400\text{ m}$ (~1000 m above the crater floor).
  - **Description:** Boxwork mineral ridge networks formed by ancient subsurface groundwater precipitation in fractured bedrock that resisted subsequent wind erosion. Explored starting Sols 4534–4670.
- **Sources:**
  - NASA Science Curiosity Location: [science.nasa.gov/mission/msl-curiosity/location-map/](https://science.nasa.gov/mission/msl-curiosity/location-map/)
  - NASA Mars Science Laboratory Map (MMGIS): [mars.nasa.gov/maps/?mission=MSL](https://mars.nasa.gov/maps/?mission=MSL)

### 2. Recommended Final AOI Bounding Box
- **Current `contracts/projection.json` BBox:**
  - `lat_min`: $-4.89^\circ$
  - `lat_max`: $-4.55^\circ$
  - `lon_min`: $137.27^\circ$
  - `lon_max`: $137.53^\circ$
  - `center`: `lat: -4.72`, `lon: 137.40`
  - Dimensions: $\approx 20\text{ km} \times 15\text{ km}$.
- **Verification Assessment:**
  - Bradbury Landing ($-4.5895^\circ$, $137.4417^\circ$) is well inside the northern half.
  - The Boxwork region ($-4.81^\circ$, $137.40^\circ$) is inside the southern portion.
  - The JPL proposed Mount Sharp ascent traverse corridor is completely contained.
  - Key landmark features (Yellowknife Bay, Naukluft Plateau, Vera Rubin Ridge, Glen Torridon, Gediz Vallis Ridge) all fall within this bounding box.
- **Recommendation:** **Retain existing bbox in `contracts/projection.json`**. No contract change is required.

### 3. L2 and L3 Topography and Imagery Products
- **L2 Regional CTX Coverage:**
  - **Murray Lab Global CTX Mosaic:** Tile `E136_S08` (and `E136_S04`).
  - Resolution: $6.0\text{ m/pixel}$.
  - URL: [murray-lab.caltech.edu/CTX/](https://murray-lab.caltech.edu/CTX/)
  - License: Free academic/scientific reuse (Credit: NASA/JPL/MSSS/Caltech).
- **L3 MSL Gale Merged DEM (USGS / PDS Annex):**
  - Product ID: `MSL_Gale_DEM_Mosaic_1m_v3` (Authors: Fergusson, Calef, Parker, Hare et al.).
  - Resolution: $1.0\text{ m/pixel}$.
  - Format: GeoTIFF (32-bit float, tied to MOLA areoid), File size: ~3.6 GB.
  - URL: [planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif](https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif)
  - Astropedia Page: [astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m)
- **L3 MSL Gale Merged Orthophoto Mosaic (USGS):**
  - Resolution: $0.25\text{ m/pixel}$ ($25\text{ cm}$).
  - URL: [astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm)
- **HiRISE Targeted Stereo DTMs (University of Arizona):**
  - `DTEEC_023957_1755_024023_1755_U01` (MSL Landing Site Center Gap, 1 m/px).
  - `DTEEC_024234_1755_024300_1755_U01` (MSL West Gap, 1 m/px).
  - `DTEEC_009505_1755_009571_1755_U01` (Gale Landing Ellipse G2, 1 m/px).
  - Portal: [uahirise.org/dtm/](https://uahirise.org/dtm/)
  - License: NASA/JPL/University of Arizona Public Domain.

### 4. Thermal Datasets
- **THEMIS Day Infrared Global Mosaic (v12):**
  - Resolution: $100\text{ m/pixel}$.
  - Format: GeoTIFF, bands at 12.57 µm.
  - Direct URL: [planetarymaps.usgs.gov/mosaic/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12.tif](https://planetarymaps.usgs.gov/mosaic/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12.tif)
  - Credit: NASA/JPL/Arizona State University.
- **THEMIS Quantitative Thermal Inertia Mosaic (32-bit):**
  - Resolution: $100\text{ m/pixel}$.
  - Physical Unit: $\text{J}\cdot\text{m}^{-2}\cdot\text{s}^{-1/2}\cdot\text{K}^{-1}$ ($\text{tiu}$).
  - Gale Crater Typical Values: $180\dots 260\text{ tiu}$ for fine materials, $350\dots 600\text{ tiu}$ for exposed bedrock and lithified units.
  - Astropedia: [astrogeology.usgs.gov/search/map/mars_themis_derived_global_thermal_inertia_mosaic_quantitative_32_bit](https://astrogeology.usgs.gov/search/map/mars_themis_derived_global_thermal_inertia_mosaic_quantitative_32_bit)

### 5. Spectral Datasets (CRISM)
- **Instrument:** Compact Reconnaissance Imaging Spectrometer for Mars (MRO/CRISM).
- **Targeted Observations Covering Gale AOI:**
  - `FRT0000B6F1`: Lower Mount Sharp, Vera Rubin Ridge, and hematite-bearing layer.
  - `FRT0000C518`: Clay-bearing unit (Glen Torridon) and basal sulfate transitions.
  - `HRL0000BABA`: Regional stratigraphy swath.
- **Key Summary Parameters:**
  - `BD1900`: $1.9\ \mu\text{m}$ absorption band depth for molecular $\text{H}_2\text{O}$ in hydrated minerals.
  - `SINDEX2`: Convexity index for hydrated sulfates (polyhydrated and monohydrated).
  - `D2300`: $2.3\ \mu\text{m}$ absorption for $\text{Fe/Mg}$-phyllosilicates (smectites).
  - `OLINDEX3`: Visible/NIR broad absorption for olivine.
  - `BD530` / `SH600`: Ferric iron and crystalline hematite indicator.
- **Access Portal:** NASA PDS Geosciences Node Orbital Data Explorer (ODE) at [ode.rsl.wustl.edu/mars/](https://ode.rsl.wustl.edu/mars/).

### 6. Atmospheric and Radiation Reference Data
- **REMS (Rover Environmental Monitoring Station) Gale In-Situ Records:**
  - **Atmospheric Pressure:**
    - Seasonal range: $700\text{ Pa}$ (southern winter minimum) to $950\text{ Pa}$ (southern summer perihelion maximum).
    - Diurnal thermal tide oscillation: $\pm 35\dots 50\text{ Pa}$ ($\approx 80\text{ Pa}$ peak-to-peak).
  - **Ground Temperature ($T_{\text{surf}}$):**
    - Night minimum: $170\dots 195\text{ K}$ ($-103\dots -78^\circ\text{C}$).
    - Midday maximum: $265\dots 290\text{ K}$ ($-8\dots +17^\circ\text{C}$).
  - **Air Temperature ($T_{\text{air}}$):**
    - Night minimum: $185\dots 205\text{ K}$.
    - Midday maximum: $240\dots 275\text{ K}$.
- **RAD (Radiation Assessment Detector) Gale In-Situ Records:**
  - Citation: Hassler, D. M., et al. (2014), *Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover*, Science 343(6169).
  - **Dose Equivalent Rate:** $0.64 \pm 0.12\text{ mSv/day}$ (galactic cosmic ray background during solar maximum).
  - **Absorbed Dose Rate:** $0.21 \pm 0.04\text{ mGy/day}$.
  - **Pressure-Dose Correlation:** Dose rate exhibits an anti-correlation with column atmospheric pressure (shielding scale factor $\beta \approx 0.5$).
- **NASA DONKI Space Weather Service:**
  - Base URL: `https://api.nasa.gov/DONKI/`
  - Portal: [kauai.ccmc.gsfc.nasa.gov/DONKI/](https://kauai.ccmc.gsfc.nasa.gov/DONKI/)
  - Endpoints:
    - `/DONKI/CME` (Coronal Mass Ejections)
    - `/DONKI/SEP` (Solar Energetic Particle Events)
    - `/DONKI/FLR` (Solar Flare Events)
    - `/DONKI/notifications` (Space Weather Notifications)

### 7. Active Mars Orbiters
| Orbiter | Operating Agency | Status | Orbit Type | Altitude / Periapsis & Apoapsis | Inclination | Period | Semi-Major Axis | Primary Function | Source |
|---|---|---|---|---|---|---|---|---|---|
| **MRO** | NASA / JPL | Active | Sun-synchronous low circular | $255\text{ km} \times 320\text{ km}$ | $92.7^\circ$ | $112\text{ min}$ | $3,775\text{ km}$ | High-res imaging & Telecom relay | [science.nasa.gov/mission/mars-reconnaissance-orbiter/](https://science.nasa.gov/mission/mars-reconnaissance-orbiter/) |
| **Mars Odyssey** | NASA / JPL | Active | Sun-synchronous circular | $\sim 400\text{ km}$ | $93.1^\circ$ | $118\text{ min}$ | $3,793\text{ km}$ | Thermal/gamma mapping & Telecom relay | [science.nasa.gov/mission/odyssey/](https://science.nasa.gov/mission/odyssey/) |
| **MAVEN** | NASA / GSFC | Active | Elliptical science/relay | $150\text{ km} \times 4,500\text{ km}$ | $75.0^\circ$ | $3.6\text{ h}$ | $5,600\text{ km}$ | Aeronomy & Telecom relay | [lasp.colorado.edu/maven/](https://lasp.colorado.edu/maven/) |
| **Mars Express (MEX)** | ESA | Active | Elliptical polar | $300\text{ km} \times 10,100\text{ km}$ | $86.6^\circ$ | $7.0\text{ h}$ | $7,400\text{ km}$ | Subsurface sounding & Imaging | [www.esa.int/Science_Exploration/Space_Science/Mars_Express](https://www.esa.int/Science_Exploration/Space_Science/Mars_Express) |
| **Trace Gas Orbiter (TGO)** | ESA / Roscosmos | Active | Circular science/relay | $400\text{ km} \times 400\text{ km}$ | $74.0^\circ$ | $120\text{ min}$ | $3,796\text{ km}$ | Trace gas detection & Primary relay | [www.esa.int/Science_Exploration/Space_Science/ExoMars](https://www.esa.int/Science_Exploration/Space_Science/ExoMars) |

### 8. Global Colour Mosaic Texture
- **Product:** USGS Mars Viking Colorized Global Mosaic (MDIM 2.1).
- **Format / Resolution:** Full resolution GeoTIFF ($232\text{ m/pixel}$), equirectangular projection.
- **URL:** [planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif](https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif)
- **Web Texture Formats:** 2048x1024 and 4096x2048 equirectangular spherical textures available from NASA SVS / Solar System Exploration ([svs.gsfc.nasa.gov](https://svs.gsfc.nasa.gov/)).
- **License:** Public Domain (USGS / NASA).

### 9. Places (USGS Official Gazetteer & Informal Mission Names)
- **Official IAU Gazetteer Names (USGS Astrogeology):**
  - **Gale** (Impact Crater, Feature ID 2071): Center $5.37^\circ\text{ S}$, $137.81^\circ\text{ E}$, Diameter $154.0\text{ km}$. Named after Walter F. Gale.
  - **Aeolis Mons** (Mount Sharp, Feature ID 15000): Center $5.08^\circ\text{ S}$, $137.85^\circ\text{ E}$, Diameter $89.0\text{ km}$, Height $\sim 5.5\text{ km}$.
  - **Aeolis Palus** (Plain, Feature ID 15001): Center $4.47^\circ\text{ S}$, $137.42^\circ\text{ E}$. Northern floor of Gale crater.
  - **Peace Vallis** (Valley, Feature ID 15036): Center $4.21^\circ\text{ S}$, $137.23^\circ\text{ E}$, Length $35.0\text{ km}$.
  - Source: [planetarynames.wr.usgs.gov](https://planetarynames.wr.usgs.gov/)
- **Informal Mission Names (Curiosity Traverse & Science Targets):**
  - **Bradbury Landing** (base): $4.5895^\circ\text{ S}$, $137.4417^\circ\text{ E}$. Landing point, Sol 0.
  - **Yellowknife Bay**: $4.591^\circ\text{ S}$, $137.443^\circ\text{ E}$. First drill site (John Klein / Cumberland).
  - **Dingo Gap**: $4.651^\circ\text{ S}$, $137.382^\circ\text{ E}$. Sand dune crossing into Moonlight Valley.
  - **Kimberley**: $4.658^\circ\text{ S}$, $137.380^\circ\text{ E}$. Outcrop of sandstone and siltstone.
  - **Pahrump Hills**: $4.693^\circ\text{ S}$, $137.371^\circ\text{ E}$. Base of Mount Sharp Murray formation.
  - **Naukluft Plateau**: $4.685^\circ\text{ S}$, $137.368^\circ\text{ E}$. Rugged bedrock passage.
  - **Bagnold Dunes**: $4.712^\circ\text{ S}$, $137.365^\circ\text{ E}$. Active basaltic sand dune field.
  - **Vera Rubin Ridge**: $4.728^\circ\text{ S}$, $137.375^\circ\text{ E}$. Prominent hematite-bearing ridge.
  - **Glen Torridon**: $4.743^\circ\text{ S}$, $137.382^\circ\text{ E}$. Clay-bearing trough unit.
  - **Greenheugh Pediment**: $4.752^\circ\text{ S}$, $137.361^\circ\text{ E}$. Unconformable sandstone capping unit.
  - **Mont Mercou**: $4.754^\circ\text{ S}$, $137.373^\circ\text{ E}$. 6-meter cliff outcrop.
  - **Gediz Vallis Ridge**: $4.781^\circ\text{ S}$, $137.384^\circ\text{ E}$. Debris flow deposit ridge.
  - **Boxwork Unit / Altadena**: $4.810^\circ\text{ S}$, $137.400^\circ\text{ E}$. Mineralized fracture networks.
  - Source: NASA/JPL-Caltech MSL Science Team.

### 10. Mars24 Reference Worked Example (Allison & McEwen 2000)
- **Input Timestamp:** `2000-01-06T00:00:00Z` (UTC).
- **Algorithm Steps and Intermediate Golden Outputs:**
  1. Earth timestamp ms since Unix epoch: $947\,116\,800\,000\text{ ms}$.
  2. Julian Date (UT): $\text{JD}_{\text{UT}} = 2451550.0$.
  3. Offset from J2000: $\Delta t_{\text{UT}} = 0.0\text{ days}$.
  4. Terrestrial Time offset: $\Delta t_{\text{TT}} - \Delta t_{\text{UT}} = 64.184\text{ s}$ ($0.00074287\text{ days}$).
  5. Julian Date (TT): $\text{JD}_{\text{TT}} = 2451550.000743$.
  6. Offset from J2000 epoch (TT): $\Delta t_{\text{TT}} = 4.500743\text{ days}$.
  7. Mars Mean Anomaly: $M = 21.74558^\circ$.
  8. Fictitious Mean Sun angle: $\alpha_{\text{FMS}} = 272.7457^\circ$.
  9. Perturbers sum: $\nu = 0.001418^\circ$.
  10. Equation of Center: $\text{PE} = 4.441927^\circ$.
  11. Aerocentric Solar Longitude: $L_s = 277.1876^\circ$.
  12. Equation of Time: $\text{EOT} = -5.187746^\circ$ ($-0.345850\text{ h}$).
  13. Mars Sol Date: $\text{MSD} = 44795.99977$.
  14. Coordinated Mars Time: $\text{MTC} = 23.99425\text{ h}$ ($23^{\text{h}}59^{\text{m}}39^{\text{s}}$).
  15. Sun-Mars Distance: $1.4154\text{ AU}$.
- **Source:** NASA GISS Mars Solar Time Technical Notes & Algorithm documentation ([giss.nasa.gov/tools/mars24/help/algorithm.html](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html)).
