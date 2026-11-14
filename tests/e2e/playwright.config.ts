import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: ".",
  timeout: 45000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  webServer: {
    command: "npm run dev",
    cwd: path.resolve(__dirname, "../../apps/web"),
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
