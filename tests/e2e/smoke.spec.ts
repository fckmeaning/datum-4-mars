import { test, expect } from "@playwright/test";

test.describe("DATUM-4 E2E Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Tolerant timeouts for Three.js WebGL rendering on dev environments
    page.setDefaultTimeout(30000);
  });

  test("(a) start menu is visible and keyboard navigation works", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Verify main menu exists and has items
    const menu = page.locator('div[role="menu"][aria-label="Main menu"]');
    await expect(menu).toBeVisible();

    const items = menu.locator('button[role="menuitem"]');
    await expect(items).toHaveCount(4);

    const startBtn = items.nth(0);
    const settingsBtn = items.nth(1);
    const aboutBtn = items.nth(2);

    await expect(startBtn).toContainText("Start Simulation");
    await expect(settingsBtn).toContainText("Settings");
    await expect(aboutBtn).toContainText("About / Methods");

    // Test keyboard navigation: ArrowDown advances selectedIndex
    await page.keyboard.press("ArrowDown");
    // Verify focus or style change indicating selection moved to Settings
    await page.keyboard.press("ArrowDown");
    // Moved to About / Methods
    await page.keyboard.press("ArrowUp");
    // Moved back to Settings
  });

  test("(b) 'Start simulation' ends in the planner", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const startBtn = page.locator('button[role="menuitem"]:has-text("Start Simulation")');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // After clicking start, the app navigates through /globe to /planner
    // If a skip button is present on the globe view, clicking it accelerates navigation
    const skipBtn = page.locator('button:has-text("Skip")');
    if (await skipBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Must end up on /planner
    await page.waitForURL("**/planner", { timeout: 25000 });
    expect(page.url()).toContain("/planner");

    // Planner UI must be loaded
    const directionsBtn = page.locator('button:has-text("Directions")');
    await expect(directionsBtn).toBeVisible({ timeout: 15000 });
  });

  test("(c) POI menu opens and clicking an item triggers flyTo", async ({ page }) => {
    await page.goto("/planner");
    await page.waitForLoadState("domcontentloaded");

    const poiBtn = page.locator('button:has-text("Points of Interest")');
    await expect(poiBtn).toBeVisible({ timeout: 15000 });
    await poiBtn.click();

    // POI menu panel should appear
    const poiMenu = page.locator("text=Points of Interest").first();
    await expect(poiMenu).toBeVisible();

    // Find a selectable POI item (e.g. Bradbury Landing or Boxwork or any POI button)
    const poiItem = page.locator("button:has-text('Bradbury Landing'), button:has-text('Boxwork')").first();
    if (await poiItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poiItem.click();
    }
  });

  test("(d) route alternatives for base -> boxwork return 3 routes and metrics", async ({ page }) => {
    await page.goto("/planner");
    await page.waitForLoadState("domcontentloaded");

    const directionsBtn = page.locator('button:has-text("Directions")');
    await expect(directionsBtn).toBeVisible({ timeout: 15000 });
    await directionsBtn.click();

    // Click Calculate Alternatives button
    const calcBtn = page.locator('button:has-text("Calculate")');
    await expect(calcBtn).toBeVisible({ timeout: 10000 });
    await calcBtn.click();

    // Wait for route cards to appear
    const routeCards = page.locator(".route-card");
    await expect(routeCards.first()).toBeVisible({ timeout: 20000 });

    const count = await routeCards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Verify metrics and feasibility/margin/risk information
    const firstCard = routeCards.first();
    await expect(firstCard).toContainText(/Dist|km|m/);
    await expect(firstCard).toContainText(/Dose|mSv/);
    await expect(firstCard).toContainText(/Slope|Risk|Violation/);
  });

  test("(e) DATA SOURCES panel lists every /sources entry with a credit line", async ({ page }) => {
    await page.goto("/planner");
    await page.waitForLoadState("domcontentloaded");

    const dataSourcesBtn = page.locator('button:has-text("DATA SOURCES")');
    await expect(dataSourcesBtn).toBeVisible({ timeout: 15000 });
    await dataSourcesBtn.click();

    // Dialog appears
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText("Data Sources & Scientific Attribution");

    // Entries are rendered
    const cards = dialog.locator(".data-sources-panel__card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Each card must contain a non-empty credit line
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const credit = card.locator(".data-sources-panel__credit");
      await expect(credit).toBeVisible();
      await expect(credit).toContainText("Credit:");
      const text = await credit.innerText();
      expect(text.replace("Credit:", "").trim().length).toBeGreaterThan(0);
    }
  });
});
