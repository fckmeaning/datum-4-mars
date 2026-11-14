import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, useNavigate } from "react-router-dom";
import { StartMenu } from "../pages/StartMenu";
import { MarsGlobe } from "@/globe/MarsGlobe";
import { UiKitPage } from "@/ui/UiKitPage";

const MissionPlanner = lazy(() =>
  import("../pages/MissionPlanner").then((m) => ({ default: m.MissionPlanner })),
);
const AboutPage = lazy(() =>
  import("../pages/AboutPage").then((m) => ({ default: m.AboutPage })),
);
const MethodsPage = lazy(() =>
  import("../pages/MethodsPage").then((m) => ({ default: m.MethodsPage })),
);

// Globe route container
function GlobeContainer() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "#080C10",
        color: "#FFFFFF",
      }}
    >
      <MarsGlobe
        flyIn
        onFlyInComplete={() => navigate("/planner")}
        interactive
      />

      {/* Overlay skip button */}
      <div
        style={{
          position: "absolute",
          top: "24px",
          right: "24px",
          zIndex: 50,
          display: "flex",
          gap: "12px",
        }}
      >
        <button
          onClick={() => navigate("/planner")}
          style={{
            background: "var(--color-accent, #56B4E9)",
            color: "#080C10",
            border: "none",
            borderRadius: "8px",
            padding: "10px 18px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          Skip to Planner →
        </button>
      </div>
    </div>
  );
}

// HUD placeholder (W8)
function HudPlaceholder() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05080C",
        color: "#00FF66",
        fontFamily: "monospace",
        padding: "48px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ border: "1px solid #00FF66", padding: "32px", borderRadius: "12px", maxWidth: "480px", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 16px 0" }}>HELMET HUD MODE</h2>
        <p style={{ color: "#88CC99", fontSize: "14px", lineHeight: "1.6" }}>
          Astronaut Visor & High-Contrast Navigation HUD. Integration lane: W8.
        </p>
        <button
          onClick={() => navigate("/planner")}
          style={{
            marginTop: "16px",
            background: "#00FF66",
            color: "#05080C",
            border: "none",
            padding: "8px 16px",
            fontWeight: 700,
            cursor: "pointer",
            borderRadius: "6px",
          }}
        >
          Return to Planner
        </button>
      </div>
    </div>
  );
}

// UI-Kit route container (W8)
function UiKitContainer() {
  return <UiKitPage />;
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
    <span>Loading AreoNav...</span>
  </div>
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <StartMenu />,
  },
  {
    path: "/planner",
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <MissionPlanner />
      </Suspense>
    ),
  },
  {
    path: "/globe",
    element: <GlobeContainer />,
  },
  {
    path: "/hud",
    element: <HudPlaceholder />,
  },
  {
    path: "/methods",
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <MethodsPage />
      </Suspense>
    ),
  },
  {
    path: "/about",
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <AboutPage />
      </Suspense>
    ),
  },
  {
    path: "/ui-kit",
    element: <UiKitContainer />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
