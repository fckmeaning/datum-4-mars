# syntax=docker/dockerfile:1
# One image = API + built web app on one origin (the web client uses relative /api/v1 and /data URLs).
# Build:  docker build -t marsnav .      Run:  docker run -p 8080:8080 marsnav      (see docs/DEPLOY.md)

FROM node:24-slim AS web
WORKDIR /src/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
# src/map2d/projection.ts imports ../../../../contracts/projection.json, i.e. /src/contracts from here
COPY contracts /src/contracts
# vite only: type checking is a separate gate; source maps (about 11 MB) are not shipped
RUN npx vite build && rm -f dist/assets/*.map

FROM python:3.12-slim AS app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MARSNAV_ROOT=/app \
    MARSNAV_WEB_DIST=/app/web \
    NUMBA_CACHE_DIR=/app/.numba_cache
WORKDIR /app

COPY deploy/requirements-deploy.txt deploy/requirements-deploy.txt
RUN pip install --no-cache-dir -r deploy/requirements-deploy.txt
COPY packages/marsnav packages/marsnav
RUN pip install --no-cache-dir --no-deps ./packages/marsnav

COPY config config
COPY contracts contracts
COPY apps/api apps/api
COPY deploy deploy
COPY data/manifest.yaml data/manifest.yaml
COPY data/processed data/processed
COPY --from=web /src/apps/web/dist /app/web

RUN useradd --create-home --uid 10001 app && mkdir -p /app/.numba_cache && chown -R app /app
USER app
# compile the numba kernels into the image cache; never fails the build
RUN python deploy/warm.py || true

EXPOSE 8080
# PORT is set by Cloud Run / Render / Fly; Hugging Face Spaces sets it via app_port (7860). Warm-up first so request 1 is fast.
CMD ["sh", "-c", "python deploy/warm.py || true; exec python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
