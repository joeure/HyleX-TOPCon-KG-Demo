import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/screenshots.mjs"), "utf8");

test("screenshot workflow fixes output directory, viewports and dashboard route", () => {
  expect(script).toContain('resolve(repoRoot, "screenshots")');
  expect(script).toContain("`${outputPrefix}-${name}.png`");
  expect(script).toContain("desktop: { width: 1440, height: 900 }");
  expect(script).toContain("tablet: { width: 1024, height: 768 }");
  expect(script).toContain("mobile: { width: 390, height: 844 }");
  expect(script).toContain("/dashboard");
});

test("watcher covers source, public, index and Vite config with debounce", () => {
  expect(script).toContain('resolve(inspectorUi, "src")');
  expect(script).toContain('resolve(inspectorUi, "public")');
  expect(script).toContain('resolve(inspectorUi, "index.html")');
  expect(script).toContain('resolve(inspectorUi, "vite.config.ts")');
  expect(script).toContain("clearTimeout(timer)");
});

test("capture waits for stable renderer and fonts, blocks external requests and closes resources", () => {
  expect(script).toContain("document.fonts.ready");
  expect(script).toContain('[data-render-state="stable"]');
  expect(script).toContain("unexpected external requests");
  expect(script).toContain("browser?.close()");
  expect(script).toContain("server.kill");
});

test("capture failures are propagated as a non-zero workflow result", () => {
  expect(script).toContain("process.exitCode = 1");
  expect(script).toContain("catch((error)");
});

test("workflow captures Layer, wheel drill and double-click drill in both 3D and 2D", () => {
  for (const stage of [
    "layer-3d",
    "zoom-3d",
    "double-click-3d",
    "layer-2d",
    "zoom-2d",
    "double-click-2d",
  ]) {
    expect(script).toContain(`"${stage}"`);
  }
  expect(script).toContain("findConceptWithKg");
  expect(script).toContain('data-navigation-stage="concept-kg"');
  expect(script).toContain("page.mouse.wheel");
  expect(script).toContain("dblclick");
});

test("workflow captures the ontology audit in free and Layer layouts", () => {
  expect(script).toContain("captureOntologyAudit");
  expect(script).toContain("audit-ontology-${viewportName}.png");
  expect(script).toContain("audit-ontology-layer-${viewportName}.png");
  expect(script).toContain('data-testid="review-graph-workbench"');
});

test("real-data capture rejects fixtures, counts nodes and writes a separate manifest", () => {
  expect(script).toContain('process.argv.includes("--real")');
  expect(script).toContain('VITE_USE_FIXTURES: realMode ? "false" : "true"');
  expect(script).toContain("INSPECTOR_REAL_GATEWAY_URL");
  expect(script).toContain("INSPECTOR_UI_PASSWORD");
  expect(script).toContain('VITE_UI_GATEWAY_URL: ""');
  expect(script).toContain("VITE_DEV_GATEWAY_PROXY");
  expect(script).toContain('process.argv.includes("--manual-login")');
  expect(script).toContain("Complete Inspector login in the opened Chromium window");
  expect(script).toContain("realStorageState = await context.storageState()");
  expect(script).toContain("fixtureSnapshotId");
  expect(script).toContain('page.locator("[data-node-id]").count()');
  expect(script).toContain("dashboard-real-manifest.json");
  expect(script).toContain("real-data Universe rendered");
});
