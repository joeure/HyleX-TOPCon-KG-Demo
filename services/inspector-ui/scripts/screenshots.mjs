import { spawn } from "node:child_process";
import { existsSync, mkdirSync, watch, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "@playwright/test";

const inspectorUi = resolve(dirname(new URL(import.meta.url).pathname), "..");
const repoRoot = resolve(inspectorUi, "../..");
const outputDir = resolve(repoRoot, "screenshots");
const port = Number(process.env.INSPECTOR_UI_PORT ?? 4173);
const url = `http://127.0.0.1:${port}/dashboard`;
const viewports = { desktop: { width: 1440, height: 900 }, tablet: { width: 1024, height: 768 }, mobile: { width: 390, height: 844 } };
const realMode = process.argv.includes("--real");
const manualLogin = process.argv.includes("--manual-login");
const outputPrefix = realMode ? "dashboard-real" : "dashboard";
const realGatewayUrl = (process.env.INSPECTOR_REAL_GATEWAY_URL ?? "").replace(/\/$/, "");
const realPassword = process.env.INSPECTOR_UI_PASSWORD ?? "";
const realMinimumNodes = Number(process.env.INSPECTOR_REAL_MIN_NODES ?? 100);
const fixtureSnapshotId = "snapshot-2026-07-17-01";

async function waitForServer() { for (let attempt = 0; attempt < 50; attempt += 1) { try { const response = await fetch(url); if (response.ok) return; } catch { /* server is still booting */ } await wait(200); } throw new Error(`Inspector UI did not start at ${url}`); }
async function waitForStableUniverse(page) {
  await page.locator(".universe-explorer").waitFor({ state: "attached", timeout: 15_000 });
  await page.locator('[data-render-state="stable"]').first().waitFor({ state: "attached", timeout: 15_000 });
}
async function semanticZoomIn(page, ticks = 3) {
  // Keep the captures representative of deliberate wheel ticks rather than a
  // single browser-coalesced fling; 2D re-projects hit targets between ticks.
  for (let tick = 0; tick < ticks; tick += 1) {
    await page.mouse.wheel(0, -120);
    await wait(120);
  }
}
async function returnToOntology(page) {
  const back = page.getByRole("button", { name: "Back to Ontology" });
  if (await back.isVisible()) await back.click();
  await page.locator('.universe-explorer[data-navigation-stage="ontology"]').waitFor({ state: "attached", timeout: 15_000 });
  await waitForStableUniverse(page);
}
async function findConceptWithKg(page) {
  const ids = await page.locator("[data-node-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-node-id")).filter(Boolean));
  const ordered = [...ids].sort((left, right) => {
    const preferred = (value) => /(^|[:/_-])(process|material)([:/_-]|$)/i.test(value) ? 0 : 1;
    return preferred(left) - preferred(right);
  });
  for (const id of ordered.slice(0, 12)) {
    const node = page.locator(`[data-node-id=${JSON.stringify(id)}]`).first();
    if (!await node.isVisible()) continue;
    const box = await node.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height) continue;
    await node.dblclick({ force: true });
    await page.locator('.universe-explorer[data-navigation-stage="concept-kg"]').waitFor({ state: "attached", timeout: 15_000 });
    await waitForStableUniverse(page);
    const entityCount = Number(await page.locator(".universe-explorer").getAttribute("data-entity-node-count") ?? 0);
    if (entityCount > 0) return id;
    await returnToOntology(page);
  }
  throw new Error("no concept with a non-empty KG was found for staged screenshots");
}
async function captureInteractionStages(page, viewportName, prefix) {
  const screenshot = async (stage) => {
    await waitForStableUniverse(page);
    await wait(300);
    await page.screenshot({ path: resolve(outputDir, `${prefix}-${stage}-${viewportName}.png`), animations: "disabled" });
  };
  const layerSwitch = page.getByRole("switch", { name: "Layer layout" });
  if ((await layerSwitch.getAttribute("aria-checked")) !== "true") await layerSwitch.click();
  await page.locator('.universe-canvas-3d[data-layer-mode="true"]').waitFor({ state: "attached", timeout: 15_000 });
  await screenshot("layer-3d");
  await layerSwitch.click();
  await page.locator('.universe-canvas-3d[data-layer-mode="false"]').waitFor({ state: "attached", timeout: 15_000 });

  const conceptId = await findConceptWithKg(page);
  await returnToOntology(page);
  const concept3d = page.locator(`[data-node-id=${JSON.stringify(conceptId)}]`).first();
  await concept3d.hover();
  await semanticZoomIn(page);
  await page.locator('.universe-explorer[data-navigation-stage="concept-kg"]').waitFor({ state: "attached", timeout: 15_000 });
  await screenshot("zoom-3d");
  await returnToOntology(page);
  await page.locator(`[data-node-id=${JSON.stringify(conceptId)}]`).first().dblclick({ force: true });
  await page.locator('.universe-explorer[data-navigation-stage="concept-kg"]').waitFor({ state: "attached", timeout: 15_000 });
  await screenshot("double-click-3d");
  await returnToOntology(page);

  // Start the 2D capture from a fresh overview, matching a user revisiting
  // the Universe mode rather than inheriting transient 3D pointer state.
  await page.reload({ waitUntil: "networkidle" });
  await waitForStableUniverse(page);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  if ((await layerSwitch.getAttribute("aria-checked")) !== "true") await layerSwitch.click();
  await page.locator('.universe-canvas-2d[data-layer-mode="true"]').waitFor({ state: "attached", timeout: 15_000 });
  await screenshot("layer-2d");
  // Capture semantic 2D navigation from a pristine overview; Layer mode is
  // intentionally a presentation switch and must not leak pointer state into
  // a later drill gesture.
  await page.reload({ waitUntil: "networkidle" });
  await waitForStableUniverse(page);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.locator('.universe-canvas-2d[data-layer-mode="false"]').waitFor({ state: "attached", timeout: 15_000 });
  const concept2dId = realMode ? conceptId : "process";
  const concept2d = page.locator(`[data-node-id=${JSON.stringify(concept2dId)}]`).first();
  await concept2d.hover();
  await semanticZoomIn(page);
  console.log("2D staged wheel", viewportName, await page.locator(".universe-explorer").evaluate((element) => ({ stage: element.dataset.navigationStage, progress: element.dataset.zoomProgress })));
  await page.locator('.universe-explorer[data-navigation-stage="concept-kg"]').waitFor({ state: "attached", timeout: 15_000 });
  await screenshot("zoom-2d");
  await page.reload({ waitUntil: "networkidle" });
  await waitForStableUniverse(page);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  const doubleClick2dId = realMode ? concept2dId : "material";
  await page.locator(`[data-node-id=${JSON.stringify(doubleClick2dId)}]`).first().dblclick({ force: true });
  await page.locator('.universe-explorer[data-navigation-stage="concept-kg"]').waitFor({ state: "attached", timeout: 15_000 });
  await screenshot("double-click-2d");
  return conceptId;
}
async function captureOntologyAudit(page, viewportName, prefix) {
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /文档导入|Document Import/i }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "audit-fixture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("fixture pdf"),
  });
  await page.getByRole("button", { name: /开始处理|Start/i }).click();
  await page.locator('[data-testid="ingestion-ontology"]').waitFor({ state: "attached", timeout: 15_000 });
  await page.locator('[data-testid="review-graph-workbench"]').waitFor({ state: "attached", timeout: 15_000 });
  await wait(300);
  await page.screenshot({ path: resolve(outputDir, `${prefix}-audit-ontology-${viewportName}.png`), animations: "disabled" });
  const layerSwitch = page.getByRole("switch", { name: "Layer layout" });
  await layerSwitch.click();
  await page.locator('[data-testid="review-graph-workbench"][data-layer-mode="true"]').waitFor({ state: "attached", timeout: 15_000 });
  await wait(300);
  await page.screenshot({ path: resolve(outputDir, `${prefix}-audit-ontology-layer-${viewportName}.png`), animations: "disabled" });
}
let captureInFlight = Promise.resolve();
async function capture() {
  mkdirSync(outputDir, { recursive: true });
  let browser;
  let realStorageState;
  const realResults = [];
  try {
    browser = await chromium.launch({ headless: !manualLogin });
    for (const [name, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({ viewport, ...(realStorageState ? { storageState: realStorageState } : {}) });
      const page = await context.newPage();
      try {
        const externalRequests = [];
        const browserErrors = [];
        page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:") && !request.url().startsWith("http://localhost:")) externalRequests.push(request.url()); });
        page.on("pageerror", (error) => browserErrors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
        await page.goto(url, { waitUntil: "networkidle" });
        if (realMode) {
          const passwordInput = page.locator('input[type="password"]').first();
          if (await passwordInput.isVisible()) {
            if (realPassword) {
              await passwordInput.fill(realPassword);
              await page.locator(".login-submit").click();
            } else if (manualLogin) {
              console.log("Complete Inspector login in the opened Chromium window...");
            } else {
              throw new Error("INSPECTOR_UI_PASSWORD is required unless --manual-login is used");
            }
          }
          await page.locator('[data-testid="inspector-dashboard"]').waitFor({
            state: "attached",
            timeout: manualLogin ? 240_000 : 15_000,
          });
          realStorageState = await context.storageState();
          const universeMode = page.locator(".mode-button").first();
          if (!await universeMode.evaluate((element) => element.classList.contains("active"))) {
            await universeMode.click();
            await page.waitForLoadState("networkidle");
          }
          // The unauthenticated bootstrap intentionally emits 401 responses,
          // and browsers may request a missing favicon. Only errors after the
          // authenticated Universe has stabilized are screenshot failures.
          browserErrors.length = 0;
          externalRequests.length = 0;
        }
        await page.addStyleTag({ content: "html { scroll-behavior: auto !important; } *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }" });
        await page.evaluate(async () => { document.documentElement.dataset.capture = "true"; document.documentElement.dataset.seed = "inspector-screenshot-v1"; await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        await page.locator(".universe-explorer__stage").waitFor({ state: "attached", timeout: 5_000 });
        await waitForStableUniverse(page);
        if (externalRequests.length) throw new Error(`unexpected external requests: ${externalRequests.join(", ")}`);
        if (browserErrors.length) throw new Error(`browser errors: ${browserErrors.join(" | ")}`);
        if (realMode) {
          const snapshotText = (await page.locator(".universe-explorer__header p").textContent()) ?? "";
          const nodeCount = await page.locator("[data-node-id]").count();
          if (snapshotText.includes(fixtureSnapshotId)) throw new Error(`real-data capture loaded fixture snapshot ${fixtureSnapshotId}`);
          await page.screenshot({ path: resolve(outputDir, `${outputPrefix}-${name}.png`), animations: "disabled" });
          if (nodeCount < realMinimumNodes) {
            throw new Error(`real-data Universe rendered ${nodeCount} nodes; expected at least ${realMinimumNodes}`);
          }
        } else {
          await page.screenshot({ path: resolve(outputDir, `${outputPrefix}-${name}.png`), animations: "disabled" });
        }
        const interactionConceptId = await captureInteractionStages(page, name, outputPrefix);
        if (!realMode) await captureOntologyAudit(page, name, outputPrefix);
        if (realMode) realResults.push({ viewport: name, snapshot: snapshotText, node_count: nodeCount, interaction_concept_id: interactionConceptId });
        if (browserErrors.length) throw new Error(`browser errors: ${browserErrors.join(" | ")}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
  }
  if (realMode) {
    writeFileSync(
      resolve(outputDir, "dashboard-real-manifest.json"),
      `${JSON.stringify({ source: realGatewayUrl, fixture: false, minimum_nodes: realMinimumNodes, captures: realResults }, null, 2)}\n`,
      "utf8",
    );
  }
  console.log(`Inspector UI screenshots written to ${outputDir}`);
}
function queueCapture() {
  captureInFlight = captureInFlight.then(() => capture());
  return captureInFlight;
}
async function run() {
  if (realMode && !realGatewayUrl) throw new Error("INSPECTOR_REAL_GATEWAY_URL is required for real-data screenshots");
  const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: inspectorUi,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_USE_FIXTURES: realMode ? "false" : "true",
      VITE_UI_GATEWAY_URL: "",
      VITE_DEV_GATEWAY_PROXY: realMode ? realGatewayUrl : "",
      INSPECTOR_SCREENSHOT_SEED: "inspector-screenshot-v1",
    },
  });
  const watchers = [];
  try {
    await waitForServer();
    await queueCapture();
    if (process.argv.includes("--watch")) {
      let timer;
      const watchTargets = [resolve(inspectorUi, "src"), resolve(inspectorUi, "public"), resolve(inspectorUi, "index.html"), resolve(inspectorUi, "vite.config.ts")].filter((target) => existsSync(target));
      const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void queueCapture().catch((error) => { console.error(error); process.exitCode = 1; }); }, 350); };
      watchTargets.forEach((target) => watchers.push(watch(target, { recursive: true }, schedule)));
      console.log(`Watching ${resolve(inspectorUi, "src")} with one dev server...`);
      await new Promise(() => {});
    }
  } finally { watchers.forEach((watcher) => watcher.close()); server.kill("SIGTERM"); }
}
await run();
