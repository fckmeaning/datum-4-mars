/**
 * Static-build configuration: where data and (optionally) the API live.
 *
 *  - The site runs with NO backend. Nothing under `/api` is requested unless `VITE_API_BASE` is set at build time.
 *  - `VITE_API_BASE` (for example `http://127.0.0.1:8000`) opts in to the Python API: it is tried first and the static
 *    layer answers when the API is not reachable.
 *  - `VITE_BASE` (vite.config.ts `base`) is the sub-path the site is served from (`/` by default, `/repo/` on GitHub Pages).
 */

const rawApi = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

/** API origin with no trailing slash, "" when the API is not used. */
export const API_ORIGIN: string = rawApi.replace(/\/+$/, "");
export const API_OPT_IN: boolean = API_ORIGIN !== "";

/** Sub-path prefix without the trailing slash ("" at the site root, "/repo" under a sub-path). */
export const BASE_PREFIX: string = (() => {
  const b = (import.meta.env.BASE_URL as string | undefined) ?? "/";
  if (b === "/" || b === "./" || b === "") return "";
  return "/" + b.replace(/^\/+|\/+$/g, "");
})();

/** Prefixes an absolute site path (`/data/...`) with the sub-path the site is served from. */
export function withBase(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && BASE_PREFIX && !path.startsWith(BASE_PREFIX + "/") ? BASE_PREFIX + path : path;
}

/** Folder of build-time JSON made by `data/pipeline/make_static_routes.py`. */
export const STATIC_DATA = "/data/static";
