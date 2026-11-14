import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

export async function startWorkerIfEnabled(): Promise<void> {
  const useMocks = import.meta.env.VITE_USE_MOCKS === "true";

  // Check if real API is available
  let apiHealthy = false;
  try {
    const res = await fetch("/api/v1/health", { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "ok") {
        apiHealthy = true;
      }
    }
  } catch {
    apiHealthy = false;
  }

  if (useMocks || !apiHealthy) {
    try {
      await worker.start({
        onUnhandledFrame: "bypass",
        serviceWorker: {
          url: "/mockServiceWorker.js",
        },
      });
      console.info("[MSW] Mock Service Worker active (SIMULATED data)");
    } catch (err) {
      console.warn("[MSW] Worker registration skipped or failed, using client fallback:", err);
    }
  }
}
