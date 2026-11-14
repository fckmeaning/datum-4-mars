/**
 * Starts the mock API (MSW) only when it is needed: `VITE_USE_MOCKS=true`, or the real API does not answer. MSW and its
 * dependencies (about 0.5 MB) are a separate chunk loaded just in that case, so the normal page never downloads them.
 */
export async function bootMocks(): Promise<void> {
  // static build: never in production (no /api request, no MSW code in the bundle: this branch is removed at build time),
  // and in dev only on request, because the data layer already answers without a server
  if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS !== "true") return;
  const useMocks = import.meta.env.VITE_USE_MOCKS === "true";
  let apiHealthy = false;
  try {
    const res = await fetch("/api/v1/health", { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      apiHealthy = !!data && data.status === "ok";
    }
  } catch {
    apiHealthy = false;
  }
  if (!useMocks && apiHealthy) return;
  const { startWorkerIfEnabled } = await import("../mocks/browser");
  await startWorkerIfEnabled();
}
