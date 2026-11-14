# Статическая сборка Datum-4 (без сервера)

Решение оператора (D-27): сайт публикуется как папка файлов. `npm run build` в `apps/web` даёт `dist/`, его отдаёт любой статический хостинг. Python API (`apps/api`) остаётся в репозитории как необязательное дополнение, ничего в сайте от него не зависит.

## 1. Сборка и проверка

```bash
cd "C:/Users/777/Desktop/nasa space app/apps/web"
npm run build        # tsc -b && vite build && node scripts/postbuild.mjs  ->  dist/
npm run preview      # раздаёт dist/ как статический хостинг, порт 4173, прокси /api нет
```

`scripts/postbuild.mjs` делает три вещи: копирует `data/processed` (растры, текстуры глобуса, тайлы площадок; в git их нет) в `dist/data`, кладёт `dist/404.html` (копия `index.html`) и `dist/.nojekyll`, печатает размер и 15 самых больших файлов. Флаг `--no-data` пропускает копирование данных. Если `data/processed` нет, пересобрать данные по `docs/HANDOFF.md` §2 и `data/pipeline/*`.

Пересборка данных, которые раньше считал Python (маршруты Gale, видимость, изохроны, источники, орбитеры, снимок погоды), один скрипт, около 4 минут:

```bash
cd "C:/Users/777/Desktop/nasa space app"
.venv/Scripts/python.exe data/pipeline/make_static_routes.py            # всё
.venv/Scripts/python.exe data/pipeline/make_static_routes.py --skip-routes   # только мета-данные и снимок погоды
```

Результат лежит в `apps/web/public/data/static/*.json` (в git, 4,4 МБ, в основном `routes_gale.json`). Скрипт вызывает настоящий FastAPI внутри процесса (TestClient), поэтому цифры те же, что отдал бы сервер.

## 2. Что куда переехало (аудит `/api/v1/*`)

Колонка «кто» это то, что реально смонтировано в сайте; «не смонтировано» значит код есть и покрыт тестами, но маршруты `/`, `/globe`, `/site/:id`, `/methods`, `/about`, `/ui-kit`, `/hud` его не открывают (`map2d/*`, `routebuilder/*`, `MissionBar`).

| Эндпоинт контракта | Что возвращал | Кто вызывает | Теперь |
|---|---|---|---|
| `GET /sun` | высота и азимут Солнца, Ls, LMST, LTST, MSD | `sites/missionClock`, `map3d/sun` (FPV, 3D) | **браузер**: `static/marsTime.ts` (порт Mars24 из `marsnav.sun`) |
| `GET /earth/light-time` | задержка Земля–Марс | `sites/missionClock` | **браузер**: `marsTime.earthMarsLightTime` (порт F52) |
| `GET /sites/{id}/clock` | сол миссии, LMST, Ls, задержка | `MissionBar` (не смонтирован), `apiClient.getSiteClock` | **браузер** (`staticApi`), шапка страницы считает сама (`computeMissionClock`) |
| `GET /orbiters/states` | положения орбитеров на момент | `MarsGlobe` (раз в 10 с) | **браузер**: `marsTime.orbitPosition` (порт F49, J2) + `static/orbiters.json` |
| `GET /orbiters` | элементы орбит | не вызывается напрямую | файл `static/orbiters.json` |
| `GET /alerts/space-weather` | CME для Марса (DONKI) | `sites/useSpaceWeather` → карточка «SPACE WEATHER AT MARS» | **живой запрос в браузере** к NASA DONKI, при отказе **снимок** `static/space_weather.json` с датой (см. §3) |
| `GET /sources` | манифест данных | `LoadingScreen`, `GlobeScreen` (панель источников) | файл `static/sources.json` из `data/manifest.yaml` |
| `GET /health` | статус API | `mockBoot` (убран), `apiClient.getHealth` | ответ из статики (`api_version: static`) |
| `GET /sites`, `/sites/{id}`, `/sites/{id}/layers`, `/sites/{id}/places` | запись площадки, слои, места Gale | `apiClient` (map2d, не смонтирован), `GaleFpv` | файлы `static/sites.json`, `static/places_gale.json` |
| `GET /places/search` | поиск мест | `map2d/SearchBox` (не смонтирован) | **браузер**: поиск по `places_gale.json`, координаты «lat, lon» понимает |
| `POST /route` (SAFEST, FASTEST) | маршрут по Python-ядру | `sites/GaleFpv` (первое лицо), `routebuilder` | **заранее**: `routes_gale.json`, база → каждое именованное место |
| `POST /route/alternatives` | три профиля маршрута | `map2d/DirectionsPanel` (не смонтирован) | заранее, база → место |
| `POST /route/rover` | ровер + walkback | `routebuilder` (не смонтирован) | заранее, база → место |
| `POST /route/back-to-base` | путь домой | `apiClient` | заранее, из каждого именованного места (до 150 м) |
| `POST /route/export` | RFC 7946 GeoJSON | никем в UI | **браузер**: `static/exportGeoJson.ts` (порт `marsnav.export`), `downloadGeoJson()` |
| `GET /sites/{id}/viewshed` | видимость F10 | `map2d/Map2D` (не смонтирован) | заранее, база и места (3 км, 2 м) |
| `GET /sites/{id}/isochrones` | изохроны возврата | `map2d/Map2D` (не смонтирован) | заранее, 15/30/60/90/120 мин |
| `GET /sites/{id}/walkability/summary` | сводка проходимости F54 | не вызывается | заранее |
| `GET /sites/{id}/whats-here` | значения слоёв в точке | `map2d/PlaceCard` (не смонтирован) | **недоступно**: нужен растр на сервере; клиент берёт свой запасной ответ SIMULATED (код не смонтирован) |
| `/layers/{id}/meta`, `/layers/{id}/sample`, `/environment` | метаданные и значения слоя, среда | никто | недоступно |
| `/route/order`, `/route/pareto`, `/route/uncertainty`, `/route/off-route`, `/localize/*`, `/comms/windows` | новые запуски Python | никто в смонтированном UI | **недоступно**: ответ HTTP 501 `STATIC_UNAVAILABLE` с понятным текстом |

Живая математика, которая и раньше работала в браузере без API: планировщик вылазок `sites/eva` (A* по DEM, кислород, вердикт, кольцо дальности, ровер + walkback), слои, 2D, 3D, первое лицо (рельеф из COG). Для новой произвольной точки используется он, а не Python.

Остальные запросы (не `/api`): статика `/data/**` (теперь файлы в `dist/data`), тайлы NASA Trek и Esri CTX, шрифты Google, лента снимков Mars NASA (`mars.nasa.gov/api/v1/raw_image_items`, внешний сервис), DONKI.

## 3. Космическая погода: живое или снимок

1. Браузер запрашивает `https://api.nasa.gov/DONKI/WSAEnlilSimulations` (CORS открыт, `Access-Control-Allow-Origin: *`) за 30 дней. Используется опубликованный публичный ключ NASA `DEMO_KEY` (лимит около 30 запросов в час с одного IP, ключа проекта в сборке нет).
2. Любая ошибка (нет сети, 429, блок) → `public/data/static/space_weather.json` (снимок на дату сборки). Каждое сообщение получает префикс `[snapshot of ГГГГ-ММ-ДД, not live]`; если в снимке нет CME на ближайшие 3 дня, карточка так и пишет, а не «прогноза нет».
3. Снимок обновляет `make_static_routes.py` (без `--skip-weather`); перед публикацией имеет смысл запустить.

## 4. Базовый путь и запасная страница

- Корень домена (Netlify, Cloudflare Pages, Vercel, GitHub Pages `user.github.io`, свой домен): ничего настраивать не надо.
- Подпуть (GitHub Pages проекта, `https://user.github.io/repo/`): собрать так:

  ```bash
  VITE_BASE=/repo/ npm run build        # PowerShell: $env:VITE_BASE="/repo/"; npm run build
  ```

  Роутер получает `basename`, а `static/basePath.ts` дописывает префикс к `fetch("/data/...")` и `src` картинок и текстур. **Не проверено на подпути**: автопилот-тур сверяет `location.pathname` с `/site/gale` (файл `app/autopilot.ts`), под подпутём он зависнет на ожидании страницы; Web Workers не получают префикс. Нужно для проекта на GitHub Pages: проверить руками, при необходимости поправить `autopilot.ts`.
- Глубокие ссылки (`/site/gale`): SPA должна отдавать `index.html` для неизвестных путей. Netlify: `/* /index.html 200` в `_redirects`; Cloudflare Pages: SPA-режим включён по умолчанию; GitHub Pages: сработает `dist/404.html` (копия `index.html`, статус страницы 404, браузер её показывает). `vite preview` делает это сам.
- Диапазонные запросы (`Range`) нужны для GeoTIFF (`/data/**/*.tif`): GitHub Pages, Netlify, Cloudflare Pages их поддерживают. Простой `python -m http.server` не поддерживает, на нём 2D/3D не загрузят рельеф.

## 5. Необязательный API

Переменная сборки `VITE_API_BASE=http://127.0.0.1:8000` включает режим «сначала API»: запросы идут на этот адрес, при сетевой ошибке или HTTP 5xx сайт отвечает из статики и минуту не стучится на API. Без неё сайт не делает ни одного запроса на `/api`. Часы миссии считаются в браузере всегда.

```bash
VITE_API_BASE=http://127.0.0.1:8000 npm run dev
```

В dev `/data` теперь отдаёт плагин `vite.localData.ts` из `public/data` и `data/processed` (с `Range`), прокси `/data` на API убран; прокси `/api` оставлен только для этого режима. `mockBoot` не запускает MSW в продакшене (код удаляется при сборке), в dev только при `VITE_USE_MOCKS=true`.

## 6. Размер

Измерено `npm run build` (см. вывод `postbuild`): `dist/` 73,8 МБ в 194 файлах, из них source maps 10,9 МБ (посетителям не нужны; отключить: `build.sourcemap: false` в `vite.config.ts`). Самые большие файлы:

| Файл | МБ |
|---|---|
| `models/curiosity.glb` | 11,3 |
| `data/gale/L3/elevation.tif` | 7,6 |
| `data/globe/mars_color_8k.jpg` | 6,5 |
| `data/sites/jezero/crater/imagery.jpg` | 4,3 |
| `data/static/routes_gale.json` | 4,2 |
| `data/sites/jezero/site/imagery.jpg` | 4,0 |
| `data/sites/gale/aoi/dem.png` | 3,2 |
| `data/globe/mars_color_4k.jpg` | 2,1 |
| `data/gale/L2/elevation.tif` | 2,0 |
| `data/gale/L0/elevation.tif` | 1,95 |

Новых наборов данных не качалось. `routes_gale.json` грузится только когда нужен маршрут (первое лицо Gale); если потребуется легче, разрезать на файлы по маршрутам.
