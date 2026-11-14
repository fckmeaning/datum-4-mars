import { lazy, Suspense } from "react";
import { RouteError } from "./RouteError";
import { AutopilotHost } from "./AutopilotHost";
import { loaders } from "./prefetch";
import { BASE_PREFIX } from "../static/config";
import { createBrowserRouter, Navigate, useNavigate } from "react-router-dom";

// every screen is its own chunk (three/r3f and OpenLayers are split again in vite.config.ts); `loaders` is shared with the
// prefetcher, so a screen warmed on idle or on hover is the very module the navigation then needs
const StartMenu = lazy(loaders.start);
const GlobeScreen = lazy(loaders.globe);
const SiteDetail = lazy(loaders.site);
const AboutPage = lazy(loaders.about);
const MethodsPage = lazy(loaders.methods);
const UiKitPage = lazy(loaders.uiKit);
// data views: the comparison page and the Ctrl+K palette (own chunks, not part of the prefetcher)
const ComparePage = lazy(() => import("../compare/ComparePage").then((m) => ({ default: m.ComparePage })));
const PaletteHost = lazy(() => import("../palette/PaletteHost").then((m) => ({ default: m.PaletteHost })));

// HUD placeholder (W8)
function HudPlaceholder() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070b10",
        color: "var(--hz-accent, #2dd4bf)",
        fontFamily: "monospace",
        padding: "48px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ border: "1px solid var(--hz-accent, #2dd4bf)", padding: "32px", borderRadius: 0, maxWidth: "480px", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 16px 0" }}>HELMET HUD MODE</h2>
        <p style={{ color: "var(--hz-dim, #8ea3b8)", fontSize: "14px", lineHeight: "1.6" }}>
          Astronaut Visor & High-Contrast Navigation HUD. Integration lane: W8.
        </p>
        <button
          onClick={() => navigate("/site/gale")}
          style={{
            marginTop: "16px",
            background: "var(--hz-accent, #2dd4bf)",
            color: "#04141b",
            border: "none",
            padding: "8px 16px",
            fontWeight: 700,
            cursor: "pointer",
            borderRadius: "6px",
          }}
        >
          Return to expedition
        </button>
      </div>
    </div>
  );
}

// UI-Kit route container (W8)
function UiKitContainer() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <UiKitPage />
    </Suspense>
  );
}

const LoadingFallback = () => (
  <div
    style={{
      minHeight: "100vh",
      background: "#080C10",
      color: "#8B949E",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
    }}
  >
    <span>Loading DATUM-4...</span>
  </div>
);

export const router = createBrowserRouter([
  {
    element: (
      <>
        <AutopilotHost />
        <Suspense fallback={null}>
          <PaletteHost />
        </Suspense>
      </>
    ),
    children: [
  {
    path: "/",
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <StartMenu />
      </Suspense>
    ),
  },
  // the old stand-alone planner is gone: its job lives on the expedition page
  { path: "/planner", element: <Navigate to="/site/gale" replace /> },
  {
    path: "/site/:id",
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <SiteDetail />
      </Suspense>
    ),
  },
  {
    path: "/globe",
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <GlobeScreen />
      </Suspense>
    ),
  },
  {
    path: "/compare",
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <ComparePage />
      </Suspense>
    ),
  },
  {
    path: "/hud",
    errorElement: <RouteError />,
    element: <HudPlaceholder />,
  },
  {
    path: "/methods",
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <MethodsPage />
      </Suspense>
    ),
  },
  {
    path: "/about",
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <AboutPage />
      </Suspense>
    ),
  },
  {
    path: "/ui-kit",
    errorElement: <RouteError />,
    element: <UiKitContainer />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
    ],
  },
], { basename: BASE_PREFIX || undefined }); // BASE_PREFIX is "" at the site root, "/repo" under a sub-path (VITE_BASE)
