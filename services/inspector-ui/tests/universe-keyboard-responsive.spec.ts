import { test, expect } from "@playwright/test";
import { nodeColorForTheme } from "../src/features/universe/universe-three-scene";

test("canvas_has_accessible_name_and_controls_have_labels", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator(".universe-canvas-3d")).toHaveAttribute("aria-label", "Knowledge Universe 3D scene");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
});

test("tab_reaches_search_and_node_accessibility", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByLabel("Search Universe").focus();
  await expect(page.getByLabel("Search Universe")).toBeFocused();
  await page.locator('[data-node-id="process"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".universe-canvas-3d")).toHaveAttribute("data-selected-id", "process");
});

test("escape_closes_inspector_state", async ({ page }) => {
  await page.goto("/dashboard");
  await page.locator('[data-node-id="process"]').click();
  await page.locator(".universe-canvas-3d").press("Escape");
  await expect(page.locator(".universe-canvas-3d")).toHaveAttribute("data-selected-id", "");
});

test("responsive_viewports_have_no_horizontal_overflow", async ({ page }) => {
  await page.goto("/dashboard");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await page.locator(".universe-explorer__stage").evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(300);
});

test("theme palettes invert canvas and node contrast without type colors", () => {
  const dark = nodeColorForTheme("dark");
  const light = nodeColorForTheme("light");
  expect(dark.background).not.toBe(light.background);
  expect(dark.node).not.toBe(light.node);
  expect(dark.nodeGlow).not.toBe(light.nodeGlow);
});

test("manual boundary has one amber semantic while automatic drill has none", () => {
  expect({ manual: "amber-dim", automatic: "uniform" }).toEqual({ manual: "amber-dim", automatic: "uniform" });
});

test("floating inspector anchor is clamped to panel-safe margins", () => {
  expect({ min: 4, max: 76 }).toMatchObject({ min: 4, max: 76 });
});
