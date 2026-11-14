import { spawn } from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "../../..");
const WEB_DIR = path.resolve(ROOT_DIR, "apps/web");
const require = createRequire(path.join(WEB_DIR, "package.json"));
const { chromium } = require("playwright");
const PYTHON_PATH = path.join(ROOT_DIR, ".venv", "Scripts", "python.exe");

function checkUrl(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      })
      .on("error", () => resolve(false));
  });
}

async function waitForUrl(url, name, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkUrl(url)) {
      console.log(`[OK] ${name} is ready at ${url}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Timeout waiting for ${name} at ${url}`);
}

async function main() {
  let apiProc = null;
  let viteProc = null;

  // Check if API is already running
  if (!(await checkUrl("http://127.0.0.1:8000/api/v1/health"))) {
    console.log("Starting API server...");
    apiProc = spawn(
      PYTHON_PATH,
      ["-m", "uvicorn", "app.main:app", "--app-dir", "apps/api", "--port", "8000"],
      { cwd: ROOT_DIR, stdio: "pipe" }
    );
    apiProc.stdout.on("data", (d) => process.stdout.write(`[API] ${d}`));
    apiProc.stderr.on("data", (d) => process.stderr.write(`[API-ERR] ${d}`));
  }

  // Check if Vite is already running
  if (!(await checkUrl("http://localhost:5173"))) {
    console.log("Starting Vite dev server...");
    viteProc = spawn("cmd.exe", ["/c", "npx", "vite", "--port", "5173"], {
      cwd: WEB_DIR,
      stdio: "pipe",
    });
    viteProc.stdout.on("data", (d) => process.stdout.write(`[Vite] ${d}`));
    viteProc.stderr.on("data", (d) => process.stderr.write(`[Vite-ERR] ${d}`));
  }

  let browser;
  try {
    await waitForUrl("http://127.0.0.1:8000/api/v1/health", "API Server");
    await waitForUrl("http://localhost:5173", "Vite Dev Server");

    console.log("Launching Chromium browser with viewport 1440x900...");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // 1. Capture Globe Screen (/globe)
    console.log("Navigating to /globe...");
    await page.goto("http://localhost:5173/globe", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const globeScreenShotPath = path.resolve(__dirname, "globe_screen_1440x900.png");
    console.log(`Saving globe screenshot to ${globeScreenShotPath}...`);
    await page.screenshot({ path: globeScreenShotPath, fullPage: false });

    // 2. Start Autopilot Tour and capture mid-tour frame
    console.log("Triggering autopilot tour...");
    const autopilotBtn = page.locator("button", { hasText: /AUTOPILOT/i });
    if (await autopilotBtn.isVisible()) {
      await autopilotBtn.click();
    } else {
      console.log("Clicking toggle via DOM...");
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("AUTOPILOT")
        );
        btn?.click();
      });
    }

    // Wait for tour transition (e.g. 5 seconds into descent / planner)
    await page.waitForTimeout(5000);

    const tourScreenShotPath = path.resolve(__dirname, "autopilot_tour_1440x900.png");
    console.log(`Saving autopilot mid-tour screenshot to ${tourScreenShotPath}...`);
    await page.screenshot({ path: tourScreenShotPath, fullPage: false });

    console.log("All screenshots captured successfully!");
  } catch (err) {
    console.error("Capture failed:", err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (viteProc) {
      console.log("Stopping Vite process...");
      viteProc.kill();
    }
    if (apiProc) {
      console.log("Stopping API process...");
      apiProc.kill();
    }
  }
}

main();
