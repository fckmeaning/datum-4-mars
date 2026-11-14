import "./static/basePath"; // sub-path hosting (VITE_BASE): must run before anything fetches /data
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import "./styles/horizon.css";
import { initAccent } from "./app/accent";
import { App } from "./app/App";
import { initPrefetch } from "./app/prefetch";

initAccent();
initPrefetch();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
