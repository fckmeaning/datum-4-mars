/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { serveLocalData } from "./vite.localData";

// Static site: nothing needs the API at run time. /data is served from files (dev: the plugin below, production: dist/data copied
// by scripts/postbuild.mjs). /api is proxied only for the opt-in `VITE_API_BASE` mode (http://127.0.0.1:8000, apps/api).
// VITE_BASE is the sub-path to serve from (GitHub Pages project site: /repo/); default is the site root.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [
    react(),
    serveLocalData([fileURLToPath(new URL("./public/data", import.meta.url)), fileURLToPath(new URL("../../data/processed", import.meta.url))]),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  // `vite preview` serves dist/ like a static host does: no /api proxy (by default it would inherit server.proxy and hide a missing backend)
  preview: { port: 4173, proxy: {} },
  build: {
    target: "es2022",
    sourcemap: true,
    rolldownOptions: {
      output: {
        // heavy libraries get their own long-cacheable chunks: the shell (react + router) is small and paints first,
        // three/r3f arrive with the globe or a 3D tab, OpenLayers with a map tab, none of them blocks the other
        codeSplitting: {
          groups: [
            { name: "vendor-react", test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|zustand)[\\/]/, priority: 30 },
            { name: "vendor-three", test: /node_modules[\\/](three|@react-three|three-stdlib|three-mesh-bvh|troika-[^\\/]+|meshline|camera-controls|maath)[\\/]/, priority: 20 },
            { name: "vendor-ol", test: /node_modules[\\/](ol|rbush|quickselect|pbf)[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
