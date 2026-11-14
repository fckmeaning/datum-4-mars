import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { startWorkerIfEnabled } from "../mocks/browser";

export function App() {
  useEffect(() => {
    startWorkerIfEnabled().catch((err) => {
      console.warn("Failed to initialize MSW:", err);
    });
  }, []);

  return <RouterProvider router={router} />;
}
