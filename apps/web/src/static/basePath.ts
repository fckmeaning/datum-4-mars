/**
 * Sub-path hosting (`VITE_BASE=/repo/`, e.g. a GitHub Pages project site): the code asks for absolute paths such as `/data/...`
 * and `/models/...`; under a sub-path they must become `/repo/data/...`. This shim does that for `fetch` (data, GeoTIFF range reads,
 * JSON) and for image/media `src`, which covers three.js texture loaders. It does nothing at the site root (the default).
 * Limit: only the page's own window; URLs built inside Web Workers are not rewritten (the workers here only fetch external tiles).
 */
import { BASE_PREFIX, withBase } from "./config";

const SITE_PATHS = /^\/(data|models)\//;

function rewrite(url: string): string {
  return SITE_PATHS.test(url) ? withBase(url) : url;
}

export function installBasePathShim(): void {
  if (!BASE_PREFIX || typeof window === "undefined") return;
  const g = window as unknown as { __datumBaseShim?: boolean };
  if (g.__datumBaseShim) return;
  g.__datumBaseShim = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") return nativeFetch(rewrite(input), init);
    return nativeFetch(input, init);
  }) as typeof window.fetch;

  const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  if (srcDesc?.set && srcDesc.get) {
    const set = srcDesc.set;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...srcDesc,
      set(this: HTMLImageElement, v: string) {
        set.call(this, rewrite(String(v)));
      },
    });
  }

  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
    if ((name === "src" || name === "href" || name === "poster") && typeof value === "string") value = rewrite(value);
    return nativeSetAttribute.call(this, name, value);
  };
}

installBasePathShim();
