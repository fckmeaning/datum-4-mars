/**
 * Dev-server plugin: serves `/data/*` from the repo's own folders, so the site needs no API (the Python server used to host
 * `data/processed` under /data). Order of lookup: `apps/web/public/data` (build-time JSON such as /data/static), then
 * `data/processed` (rasters, globe textures, site tiles). Supports HTTP Range, which the GeoTIFF reader needs.
 * Production does the same with files: `scripts/postbuild.mjs` copies data/processed into dist/data.
 */
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const MIME: Record<string, string> = {
  ".json": "application/json",
  ".geojson": "application/geo+json",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bin": "application/octet-stream",
};

export function serveLocalData(roots: string[]): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? "").split("?")[0] ?? "";
    if (!url.startsWith("/data/") || (req.method !== "GET" && req.method !== "HEAD")) return next();
    let rel: string;
    try {
      rel = decodeURIComponent(url.slice("/data/".length));
    } catch {
      return next();
    }
    for (const root of roots) {
      const file = path.resolve(root, rel);
      if (!file.startsWith(path.resolve(root) + path.sep)) continue; // no path traversal
      let st: fs.Stats;
      try {
        st = fs.statSync(file);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      res.setHeader("Content-Type", type);
      res.setHeader("Accept-Ranges", "bytes");
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
      let start = 0;
      let end = st.size - 1;
      if (range && (range[1] || range[2])) {
        if (range[1]) {
          start = Number(range[1]);
          if (range[2]) end = Math.min(Number(range[2]), st.size - 1);
        } else {
          start = Math.max(0, st.size - Number(range[2])); // suffix range
        }
        if (start > end || start >= st.size) {
          res.statusCode = 416;
          res.setHeader("Content-Range", `bytes */${st.size}`);
          return void res.end();
        }
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
      }
      res.setHeader("Content-Length", String(end - start + 1));
      if (req.method === "HEAD") return void res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    next();
  };
  return {
    name: "datum-serve-local-data",
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}
