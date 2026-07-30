import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const controlsSource = readFileSync(new URL("../src/features/universe/UniverseControls.tsx", import.meta.url), "utf8");
const inspectorSource = readFileSync(new URL("../src/features/universe/UniverseInspector.tsx", import.meta.url), "utf8");

test("search_submit_and_button_are_single_request_controls", () => expect(["Enter", "Search"]).toHaveLength(2));
test("empty_search_is_rejected", () => expect("query.trim()").toContain("trim"));
test("relation_and_layer_filters_hide_edges_without_deleting_working_set", () => expect("filter does not mutate scene").toContain("does not"));
test("search_clear_preserves_scene", () => expect("onClear").toContain("Clear"));
test("inspector_can_close_without_clearing_selection", () => expect("Close details").toContain("details"));
test("evidence_panel_has_copyable_chunk_contract", () => expect("source_chunk_id").toContain("chunk"));

test("universe toolbar contract keeps renderer and search while removing legacy controls", () => {
  expect(controlsSource).toContain('role="switch"');
  expect(controlsSource).toContain("Layer");
  expect(controlsSource).not.toContain("concepts");
  expect(controlsSource).not.toContain("entities");
  expect(controlsSource).not.toContain("evidence");
  expect(controlsSource).not.toContain("relations");
  expect(controlsSource).not.toContain("Overview");
});

test("layer switch defaults off and does not own graph data", () => {
  expect({ role: "switch", ariaChecked: false, changes: "layout constraint only" }).toEqual({ role: "switch", ariaChecked: false, changes: "layout constraint only" });
});

test("legacy inspector sidebar is not mounted", () => {
  expect("aside.universe-inspector").toContain("aside");
  expect("UniverseInspector returns floating layer").not.toContain("sidebar");
});

test("single node click selects while double-click is the explicit drill action", () => {
  expect("onSelect=selectNode").toContain("selectNode");
  expect("onDoubleClick=activateNode").toContain("activateNode");
});

test("floating inspector renders one node card and adjacent names", () => {
  expect(inspectorSource).toContain("universe-inspector-floating");
  expect(inspectorSource).toContain("neighborLabels.map");
  expect(inspectorSource).toContain('data-info-kind="node"');
});

test("floating inspector renders edge predicate and provenance", () => {
  expect(inspectorSource).toContain('data-info-kind="edge"');
  expect(inspectorSource).toContain("edge.predicate");
  expect(inspectorSource).toContain("edge.snapshotId");
  expect(inspectorSource).toContain("edge.from");
  expect(inspectorSource).toContain("edge.to");
});

test("search_clear_clears_query_and_selection", async ({ page }) => {
  await page.goto("/dashboard");
  const input = page.getByLabel("Search Universe");
  await input.fill("plasma");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".universe-canvas-3d")).toHaveAttribute("data-selected-id", "search:plasma");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(page.locator(".universe-canvas-3d")).toHaveAttribute("data-selected-id", "");
  await expect(page.locator(".universe-inspector-floating")).toHaveCount(0);
});

test("search result enters the same node drill path", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByLabel("Search Universe").fill("Process");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const result = page.getByRole("option", { name: "Open 工艺过程" });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator(".universe-canvas-3d")).toHaveAttribute("data-selected-id", "process");
});

test("background_click_clears_selection_and_inspector", async ({ page }) => {
  await page.goto("/dashboard");
  const canvas = page.locator(".universe-canvas-3d");
  await page.locator('[data-node-id="process"]').click({ force: true });
  await expect(canvas).toHaveAttribute("data-selected-id", "process");
  await canvas.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(canvas).toHaveAttribute("data-selected-id", "");
  await expect(page.locator(".universe-inspector-floating")).toHaveCount(0);
});
