import { useRouteError, Link } from "react-router-dom";

/** Shown instead of React Router's default error page; offers a reload and a way home. */
export function RouteError() {
  const err = useRouteError();
  const msg = err instanceof Error ? err.message : String(err);
  return (
    <div
      role="alert"
      translate="no"
      style={{
        minHeight: "100vh",
        background: "#080C10",
        color: "#E6EDF3",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22 }}>Something went wrong</h1>
      <p style={{ margin: 0, maxWidth: 560, color: "#8B949E" }}>
        If your browser is auto-translating this page, turn translation off for localhost and reload.
      </p>
      <code style={{ maxWidth: 560, fontSize: 12, color: "#FFB000", wordBreak: "break-word" }}>{msg}</code>
      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: "8px 16px" }}>
          Reload
        </button>
        <Link to="/" style={{ padding: "8px 16px", color: "var(--hz-accent, #2dd4bf)" }}>
          Home
        </Link>
      </div>
    </div>
  );
}
