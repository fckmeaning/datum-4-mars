<!-- Generated from prompts/MASTER_PROMPT_CEO.md sections: architecture, data_pipeline, params_seed. Execution model overrides: docs/DECISIONS.md (D-05, D-11). Do not edit by hand. -->

## Архитектура и стек (меняется только решением D0 с обоснованием; версии закрепляются в D0-3 после проверки дирижёром)
```
nasa space app/
  contracts/            # ТОЛЬКО CEO: openapi.yaml, schemas/*.json, signatures.md, projection.json (с версиями)
  config/params.yaml    # ТОЛЬКО CEO: все параметры → генерируется apps/web/public/params.json
  packages/
    marsnav/            # Python-ядро: src/marsnav/{geodesy,terrain,sun,env,routing,uncertainty,localize,orbits}/, tests/<модуль>/
    marsnav-ts/         # TS-порт для офлайна: geodesy, sun, resection, малый A*
  data/
    pipeline/           # скрипты (запускает дирижёр)
    raw/                # не в git
    processed/          # COG + JSON; demo/ — офлайн-пакет
    manifest.yaml
  apps/
    api/                # FastAPI
    web/                # React + TS + Vite, PWA
  tests/                # e2e/ (Playwright), contract/, integration/
  docs/                 # MATH, DECISIONS, STATE, STATUS — CEO; ARCHITECTURE, DATA_SOURCES, METHODS, RUNBOOK, RISKS — W9
  ops/                  # CI, конфиги деплоя
  submission/           # питч-пакет, сценарий видео, тексты сдачи
  prompts/              # этот пакет промптов
```

- **Backend:** Python 3.11+, FastAPI, pydantic v2, uvicorn, NumPy, SciPy, numba, rasterio (GDAL входит в колёса), pyproj, httpx, cachetools. Тесты: pytest, hypothesis.
  - Статические COG отдаются с поддержкой HTTP Range (проверить версию Starlette `[verify]`; иначе — статический хостинг).
- **Frontend:**
  - основа: React + TypeScript (strict) + Vite, Zustand, react-router;
  - API: типы генерируются openapi-typescript, моки — MSW;
  - тесты: vitest + Testing Library.
- **2D:** OpenLayers с собственной проекцией Марса через proj4: WebGL-тайловые слои из GeoTIFF-источника, окраска на GPU. Слой по умолчанию — орбитальная мозаика («Satellite»). Глобальный контекст — WMTS Mars Trek `[verify]`.
- **3D:**
  - three.js + @react-three/fiber + @react-three/drei;
  - рельеф строится смещением вершин в шейдере по текстуре высот из того же COG, с LOD;
  - слои подключаются как текстуры с LUT-шкалами;
  - маршрут рисуется трубкой на 1 м выше поверхности;
  - солнце — направленный свет по F13, есть тени;
  - режим «Глобус»: сфера с глобальной мозаикой, линии орбит, аппараты-спрайты с подписями, пролёт камеры «глобус → AOI» с переходом в режим «Спутник».

  CesiumJS с эллипсоидом Марса — альтернатива только при подтверждённой поддержке `[verify]`.
- **Графики:** лёгкая библиотека (uPlot, visx или Recharts — выбор в D0-3).
- **Офлайн:**
  - Web Worker с marsnav-ts для маршрутов на грубой сетке;
  - service worker кеширует демо-пакет;
  - статическая сборка содержит предрассчитанные демо-маршруты.
- **Предрасчёт на площадку:** уклон, шероховатость, F09, профили горизонта и доля неба, c_min. Слои, зависящие от времени, считаются по корзинам времени (например, каждые 30 минут LTST) и кешируются.
- **Windows** (машина оператора):
  - пути с пробелами всегда в кавычках, в коде только pathlib;
  - rasterio и pyproj ставятся колёсами pip; если не выходит — miniforge (только с согласия оператора);
  - Docker для локальной разработки не обязателен.
- **Зависимости.** Манифесты (`pyproject.toml`, `package.json`, lock-файлы) меняет только дирижёр через менеджер пакетов и только после одобрения CEO по полю DEPENDENCIES из отчёта.
- **Контрактные тесты (W9):**
  - пути и схемы FastAPI `/openapi.json` сравниваются с `contracts/openapi.yaml`;
  - моки MSW проверяются по тем же схемам.
- **Git:**
  - коммит после каждого принятого тикета `T-###: …`;
  - теги вех m1…m4;
  - при регрессии — откат к последнему зелёному коммиту.

### Эндпоинты (`contracts/openapi.yaml v1` фиксируется в первые 60 минут)
| Группа | Эндпоинты |
|---|---|
| Служебное | `GET /api/v1/health` |
| Площадки | `GET /sites` · `GET /sites/{id}` · `GET /sites/{id}/layers` |
| Слои | `GET /layers/{id}/meta` · `GET /layers/{id}/sample?lat&lon&utc` (COG отдаются статикой) |
| Места | `GET /places/search?q=&site=` |
| Маршруты | `POST /route` · `POST /route/pareto` · `POST /route/order` · `POST /route/uncertainty` · `POST /route/back-to-base` |
| Среда | `GET /sun?lat&lon&utc` · `GET /environment?lat&lon&utc` |
| Ориентация | `POST /localize/sun-compass` · `POST /localize/resection` · `POST /localize/skyline` |
| Алерты | `GET /alerts/space-weather?from&to&mode=live\|replay` |
| Глобус и связь | `GET /orbiters` · `GET /orbiters/states?utc` · `GET /comms/windows?site&from&to&mask_deg` · `GET /earth/light-time?utc` |

### Минимальный состав схем (CEO расширяет, но не сокращает)
- **LayerMeta:** id, family, name, unit, value_range, nodata, colormap, resolution_m, level, time_dependent, valid_time, source_ids[], credit, simulated, uncertainty_note, cog_url.
- **Place:** id, name, aliases[], kind (`gazetteer` | `mission_informal` | `user`), lat, lon, x, y, source.
- **Waypoint:** одно из {place_id, lat/lon, x/y}; role (`start` | `via` | `science` | `goal`); dwell_min.
- **AstronautProfile:** mass_astronaut, mass_suit, mass_payload, v_flat, theta_max, step_max, T_min, T_max, eva_max_s, o2_capacity_l, reserve_fraction.
- **RouteRequest:** site_id, waypoints[], profile, weights?, constraints?, start_utc, astronaut?, optimize_order, return_to_start, algorithm (`astar` | `theta`), level.
- **RouteResult:**
  - идентификация: route_id, profile;
  - геометрия: geometry (GeoJSON LineString, lon/lat) и xy[];
  - totals: time_s, length_m, ascent_m, descent_m, max_slope_deg, dose_mSv, energy_kJ, o2_l, min_temp_K, shadow_fraction, science_score, return_margin;
  - segments[];
  - feasibility: ok, violations[];
  - uncertainty?;
  - прозрачность: assumptions[], data_levels[], simulated_inputs[].
- **Segment:** i, length_m, duration_s, slope_deg, components {time, energy, dose, hazard, science}, limiting_factor, t_start_utc, sun {e, A, shadowed}, temp_K, dose_rate.
- **LocalizeResult:** x, y, lat, lon, heading_deg?, cov, ellipse {a, b, angle_deg, p}, gdop, residuals[], quality_flags[].
- **SunState:** msd, ls, lmst, ltst, elevation_deg, azimuth_deg, irradiance_wm2.
- **Alert:** id, kind (`SEP` | `CME` | `EVA_LIMIT` | `DATA_QUALITY` | `DUST`), severity, start, end?, source, message, mode (`live` | `replay` | `simulated`).
- **Error:** code, message, details.
- **Orbiter:** id, name, agency, status, elements {a, e, i, raan, argp, M0, epoch}, accuracy (`approximate` | `spice`), source, credit.
- **OrbiterState:** id, utc, lat, lon, alt_m, xyz_bodyfixed, accuracy.
- **ContactWindow:** orbiter_id, aos_utc, los_utc, duration_s, max_elevation_deg, terrain_masked, accuracy.

### Цели производительности
- маршрут на сетке 2000×2000 — ≤ 2 с (numba);
- 3D — ≥ 45 FPS на ноутбуке оператора;
- первый экран — ≤ 3 с;
- объём офлайн-пакета фиксируется в D0.

### Стандарты кода
- **Python:** аннотации типов, docstring с ID функции, единицами и ссылкой на MATH.md; ruff; векторизация; без глобального состояния; фиксированные seed.
- **TypeScript:** strict, без `any`; маленькие компоненты; карта не перерисовывается из-за изменений UI-состояния.
- **Сообщения об ошибках** пишутся для человека: что случилось и что делать.

---

## Данные
- **Формат выдачи.** COG GeoTIFF в проекции AOI: Float32 или Int16/UInt16 со scale/offset, с обзорными уровнями (overviews). Рядом лежит JSON-метаданные (LayerMeta). Браузер читает COG напрямую через geotiff.js и HTTP Range-запросы: это работает и на статическом хостинге, и офлайн.
- **Сетки.**
  - Аналитическая сетка уровня — общая для всех слоёв.
  - Маршрутная сетка грубее (зафиксировать в D0: например, 5 м для L3, 20 м для L2, 200 м для L1). Опасности на неё переносятся функцией F09.
- **Манифест** (`data/manifest.yaml`), запись на каждый продукт: id, family, product_id, source_url, retrieved_at, resolution_m, license, credit, level (L0–L3), simulated, notes.
- **Строки благодарности** (сверить с каждым продуктом `[verify]`): HiRISE — NASA/JPL/University of Arizona; CTX — NASA/JPL/MSSS; THEMIS — NASA/JPL/ASU; CRISM — NASA/JPL/JHUAPL; MOLA — NASA/GSFC; HRSC — ESA/DLR/FU Berlin; снимки Curiosity — NASA/JPL-Caltech.
- **Места.**
  - Официальные названия в AOI и рядом — из газетира USGS.
  - Неофициальные названия миссии — из материалов JPL, с флагом `informal`.
  - Всё сохраняется в `data/processed/places.json` с источником для каждого места.
- **POV-снимки.** Отобранный набор из ≤ 10 снимков Curiosity. Позиции берутся из опубликованных карт траверса или данных локализации. Если позиция неточна, снимок помечается «approximate».
- **Орбитальные аппараты.** Файл `data/processed/orbiters.json` содержит:
  - список аппаратов, активных на дату хакатона (кандидаты: MRO, Mars Odyssey, MAVEN, Mars Express, TGO и др.; статус каждого `[verify]`);
  - элементы орбит с эпохой, источник, точность (`approximate` | `spice`).

  P2: ядра NAIF SPICE для точных орбит.
- **Глобус.** Текстура глобуса — глобальная цветная мозаика Марса (например, Viking MDIM или колоризованный MOLA `[verify]`) в равнопромежуточной проекции, 2–8K пикселей по ширине. Строка благодарности — в манифесте.
- **Правила загрузки:**
  - повторы с отступом, докачка, контрольные суммы;
  - ограничение частоты запросов, кеш;
  - нейтральный User-Agent без личных данных;
  - прогресс и размер в выводе.

  Загрузка больше 2 ГБ — только после согласия оператора.
- **Git.** `data/raw/` в `.gitignore`. Демо-пакет `data/processed/demo/` ≤ ~100 МБ, ни одного файла > 100 МБ (лимит GitHub). Остальное воспроизводится скриптами.

---

## Стартовые параметры `config/params.yaml` (уточняются в D0; ASSUMPTION = допущение команды, видно в Methods)
| Ключ | Значение | Ед. | Источник |
|---|---|---|---|
| R_sphere | 3 396 190 | м | сфера продуктов MOLA |
| g_mars | 3,721 | м/с² | справочник NASA по Марсу `[verify]` |
| g_earth | 9,80665 | м/с² | стандарт |
| sol_s | 88 775,244 | с | Mars24 |
| S0_1au | 1361 | Вт/м² | TSI `[verify]` |
| scale_height_H | 11 100 | м | `[verify]` |
| P_ref | 750 | Па | REMS, Гейл, типичное `[verify]` (ASSUMPTION) |
| z_ref | средняя высота AOI | м | вычисляется |
| dose_eq_ref | 0,64 | мЗв/сут | Hassler et al., 2014 `[verify]` |
| beta_pressure_dose | 0,5 | — | ASSUMPTION, калибровать |
| sky_weight_n | 1 | — | ASSUMPTION |
| sep_multiplier | параметр сценария | — | ASSUMPTION, только REPLAY/SIMULATED |
| tau_default | 0,5 | — | ASSUMPTION `[verify]` по сезону |
| mass_astronaut | 80 | кг | ASSUMPTION |
| mass_suit | 90 | кг | ASSUMPTION `[verify]` (ориентир: скафандр Apollo с ранцем СЖО) |
| mass_payload | 15 | кг | ASSUMPTION |
| s_suit | 1,3 | — | ASSUMPTION (неэффективность ходьбы в скафандре) |
| v_flat | 1,0 | м/с | ASSUMPTION `[verify]` (ориентир: EVA Apollo) |
| theta_max_walk | 25 | ° | ASSUMPTION |
| theta0_hazard / s_hazard | 15 / 3 | ° | ASSUMPTION |
| step_max | 0,5 | м | ASSUMPTION (имеет смысл только на L3) |
| eva_max | 7 | ч | ASSUMPTION |
| reserve_fraction | 0,25 | — | ASSUMPTION |
| o2_energy_equiv | 20,1 | кДж/л | стандартная физиология |
| met_o2 | 3,5 | мл/(кг·мин) | определение MET |
| T_suit_min / T_suit_max | задать в D0 | К | ASSUMPTION |
| horizon_azimuths / r_near / r_far | 72 / 2000 / 20 000 | — / м / м | ASSUMPTION (производительность) |
| mc_runs / seed | 100 / 42 | — | — |
| weights.FASTEST | w_τ = 1, остальные 0 | — | ASSUMPTION |
| weights.SAFEST | w_τ = 0,1; w_E = 0,1; w_D = 0,4; w_H = 0,4 | — | ASSUMPTION |
| weights.BALANCED | точка колена (P1), до этого 0,4 / 0,2 / 0,2 / 0,2 | — | ASSUMPTION |
| alpha_science | 0 (FASTEST/SAFEST), 0,5 (SCIENCE) | — | ASSUMPTION |
| GM_mars | 4,2828·10¹³ | м³/с² | `[verify]` |
| J2_mars | 1,96·10⁻³ | — | `[verify]` (P1) |
| W0 / W_dot | 176,630 / 350,89198226 | ° / ° в сутки | IAU `[verify]` |
| comm_mask_deg | 10 | ° | ASSUMPTION |
| d_off / k_off | 25 / 3 | м / фиксов | ASSUMPTION |
| c_light | 299 792 458 | м/с | определение |
