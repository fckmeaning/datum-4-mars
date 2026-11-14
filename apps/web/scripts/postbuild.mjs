// Post-build step of `npm run build`: turns dist/ into a folder any static host can serve.
//   1. copies data/processed (rasters, globe textures, site tiles; they are not in git) into dist/data, next to dist/data/static
//   2. dist/404.html = dist/index.html  (GitHub Pages and some hosts serve it for unknown paths, so deep links open the SPA)
//   3. dist/.nojekyll                   (GitHub Pages must not run Jekyll over the files)
//   4. prints the size of dist/ and the biggest files
// Flags: --no-data  do not copy data/processed (when the host serves /data from elsewhere)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distArg = process.argv.indexOf("--dist"); // e.g. `vite build --outDir dist-static && node scripts/postbuild.mjs --dist dist-static`
const dist = path.resolve(here, "..", distArg > 0 ? process.argv[distArg + 1] : "dist");
const processed = path.resolve(here, "../../../data/processed");
const SKIP_DIRS = new Set(["demo"]);

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("postbuild: dist/index.html is missing, run `vite build` first");
  process.exit(1);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) && src === processed) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (!fs.existsSync(d)) fs.copyFileSync(s, d); // never overwrite build-time JSON from public/data
  }
}

if (!process.argv.includes("--no-data")) {
  if (fs.existsSync(processed)) {
    copyDir(processed, path.join(dist, "data"));
    console.log("postbuild: data/processed copied to dist/data");
  } else {
    console.warn("postbuild: data/processed not found; the site will lack rasters and globe textures (run the data pipeline)");
  }
}

fs.copyFileSync(path.join(dist, "index.html"), path.join(dist, "404.html"));
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push([path.relative(dist, p).replaceAll("\\", "/"), fs.statSync(p).size]);
  }
})(dist);
const total = files.reduce((a, [, n]) => a + n, 0);
const mb = (n) => (n / 1048576).toFixed(2) + " MB";
console.log(`postbuild: dist = ${mb(total)} in ${files.length} files`);
const sourcemaps = files.filter(([f]) => f.endsWith(".map")).reduce((a, [, n]) => a + n, 0);
console.log(`postbuild: of which source maps ${mb(sourcemaps)} (not needed by visitors)`);
for (const [f, n] of files.sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${mb(n).padStart(9)}  ${f}`);
