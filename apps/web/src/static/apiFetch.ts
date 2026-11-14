/**
 * `apiFetch`: the one door every API read goes through.
 *
 *  - Production / default: answers from the static layer. Nothing under `/api` is requested.
 *  - `VITE_API_BASE` set at build time: the real API is tried first; when it is unreachable (network error or HTTP 5xx) the static
 *    layer answers instead, and the API is not retried for a minute so a dead server does not slow every call.
 *  - Unit tests (vitest) keep the old behaviour, a real `fetch("/api/v1/...")` that the MSW test server answers.
 */
import { API_ORIGIN, API_OPT_IN } from "./config";
import { staticApiResponse } from "./staticApi";

const API_PREFIX = "/api/v1";
const RETRY_AFTER_MS = 60_000;
const USE_NETWORK = API_OPT_IN;

let apiDownUntil = 0;

/** `/api/v1/sun?x=1` to `/sun?x=1`; also accepts a path that already lacks the prefix. */
export function stripApiPrefix(input: string): string {
  const i = input.indexOf(API_PREFIX);
  return i >= 0 ? input.slice(i + API_PREFIX.length) || "/" : input;
}

function inputToString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname + input.search;
  return input.url;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (import.meta.env.MODE === "test" && !API_OPT_IN) return fetch(input, init); // the MSW test server answers
  const path = stripApiPrefix(inputToString(input));
  if (!USE_NETWORK) return staticApiResponse(path, init);
  if (Date.now() >= apiDownUntil) {
    try {
      const res = await fetch(`${API_ORIGIN}${API_PREFIX}${path}`, init);
      if (res.status < 500) return res;
      apiDownUntil = Date.now() + RETRY_AFTER_MS;
    } catch {
      apiDownUntil = Date.now() + RETRY_AFTER_MS;
    }
  }
  return staticApiResponse(path, init);
}

/** For tests and diagnostics. */
export function resetApiDown(): void {
  apiDownUntil = 0;
}
