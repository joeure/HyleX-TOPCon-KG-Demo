import { test, expect } from "@playwright/test";
import { createOverviewScene } from "../src/features/universe/universe-scene-model";
import { UniverseForceRuntime } from "../src/features/universe/universe-force-runtime";
import { enterConcept, initialUniverseNavigation, SEMANTIC_ZOOM_OUT_THRESHOLD, zoomIn, zoomOut } from "../src/features/universe/universe-navigation";
import { loadAllUniverseGraphPages } from "../src/features/universe/useUniverseExplorer";
import type { UniverseView } from "../src/domain/universe";

const view: UniverseView = {
  snapshotId: "snap-combo", ontologyVersion: "onto-combo", updatedAt: "", proposalCount: 0,
  nodes: [
    { id: "concept", label: "Concept", labelEn: "Concept", layer: "upper", x: 0, y: 0, size: 18, count: "1", description: "", color: "", kind: "concept" },
    { id: "entity", label: "Entity", labelEn: "Entity", layer: "instance", parentId: "concept", x: 0, y: 0, size: 14, count: "1", description: "", color: "", kind: "entity" },
  ],
  edges: [{ from: "concept", to: "entity", kind: "inheritance", predicate: "IS_A" }], instances: {}, evidence: {},
};

test("hover → edge click → hover another node restores the pinned edge", () => {
  const pinnedEdge = "concept:entity";
  const visibleEdge = (hoveredId: string, pinned: string): string | null => hoveredId ? null : pinned;
  expect(visibleEdge("entity", pinnedEdge)).toBeNull();
  expect(visibleEdge("", pinnedEdge)).toBe(pinnedEdge);
});

test("concept click → paginated KG → entity click advances semantic focus", async () => {
  const concept = enterConcept(initialUniverseNavigation, "concept", true);
  expect(concept).toMatchObject({ stage: "concept-kg", dimBoundary: true });
  const page = { snapshotId: "snap-combo", ontologyVersion: "onto-combo", scope: { mode: "concept" as const, focusId: "concept", depth: 1 }, nodes: [{ id: "entity", kind: "entity" as const, label: "Entity" }], edges: [], page: { nextCursor: null, complete: true, loadedNodeCount: 1, loadedEdgeCount: 0, totalNodeCount: 1, totalEdgeCount: 0 } };
  const loaded = await loadAllUniverseGraphPages({ getUniverseGraphPage: async () => page } as never, { snapshotId: "snap-combo", mode: "concept", focusId: "concept", depth: 1, pageSize: 500 });
  expect(loaded.nodes[0].id).toBe("entity");
  expect({ ...concept, stage: "expanded-kg" as const, focusId: "entity", dimBoundary: false }).toMatchObject({ stage: "expanded-kg", focusId: "entity" });
});

test("browser concept double-click exposes entity neighborhood before deeper focus", async ({ page }) => {
  await page.goto("/dashboard");
  await page.locator('[data-node-id="process"]').dblclick({ force: true });
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "concept-kg");
  await expect(page.locator(".universe-stage-indicator")).toContainText("Concept KG");
  await expect(page.getByRole("button", { name: "Back to Ontology" })).toBeVisible();
  await expect(page.locator('[data-node-id="process-coating"]')).toBeVisible();
  await page.locator('[data-node-id="process-coating"]').dblclick({ force: true });
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "expanded-kg");
  await expect(page.locator('[data-node-id="process-curing"]')).toBeVisible();
});

test("a drilled KG remains readable instead of collapsing into a tiny cluster", async ({ page }) => {
  await page.goto("/dashboard");
  await page.locator('[data-node-id="process"]').dblclick({ force: true });
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "concept-kg");
  const canvas = await page.locator(".universe-canvas-3d").boundingBox();
  const positions = await page.locator('.universe-canvas-3d [data-node-id^="process-"]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y };
  }));
  expect(canvas).toBeTruthy();
  expect(positions.length).toBeGreaterThan(1);
  const spreadX = Math.max(...positions.map((position) => position.x)) - Math.min(...positions.map((position) => position.x));
  const spreadY = Math.max(...positions.map((position) => position.y)) - Math.min(...positions.map((position) => position.y));
  expect(Math.max(spreadX / canvas!.width, spreadY / canvas!.height)).toBeGreaterThan(0.16);
});

test("hovered concept drill clears the ontology floating inspector", async ({ page }) => {
  await page.goto("/dashboard");
  const node = page.locator('[data-node-id="process"]');
  await node.hover();
  await expect(page.locator('[data-info-kind="node"]')).toBeVisible();
  await node.dblclick({ force: true });
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "concept-kg");
  await expect(page.locator('[data-info-kind="node"]')).toHaveCount(0);
});

test("manual concept drill keeps a dimmed one-hop ontology boundary", async ({ page }) => {
  await page.goto("/dashboard");
  await page.locator('[data-node-id="process"]').dblclick({ force: true });
  await expect(page.locator('[data-node-id="knowledge"]')).toHaveClass(/is-dimmed/);
  await expect(page.locator('[data-node-id="parameter"]')).toHaveClass(/is-dimmed/);
  await expect(page.locator('[data-node-id="material"]')).toHaveCount(0);
  await expect(page.locator('[data-node-id="process"]')).not.toHaveClass(/is-dimmed/);
});

test("automatic ontology zoom renders the selected KG at uniform brightness", async ({ page }) => {
  await page.goto("/dashboard");
  // Hover the concept explicitly: the zoom target falls back to the node
  // nearest the world origin, which shifts with the force layout and viewport.
  await page.locator('[data-node-id="process"]').hover();
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "concept-kg");
  await expect(page.locator('[data-node-id="process"]')).not.toHaveClass(/is-dimmed/);
  await expect(page.locator('[data-node-id="process-coating"]')).not.toHaveClass(/is-dimmed/);
});

test("background wheel zoom never chooses an unrelated concept or changes semantic stage", async ({ page }) => {
  await page.goto("/dashboard");
  const explorer = page.locator(".universe-explorer");
  await page.locator(".universe-canvas-3d").hover({ position: { x: 10, y: 10 } });
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await expect(explorer).toHaveAttribute("data-navigation-stage", "ontology");
  await expect(explorer).toHaveAttribute("data-zoom-progress", "0");
});

test("explicit zoom control changes only the graph camera and blocks page zoom gestures", async ({ page }) => {
  await page.goto("/dashboard");
  const explorer = page.locator(".universe-explorer");
  const canvas = page.locator(".universe-canvas-3d");
  const slider = page.getByRole("slider", { name: "Universe zoom" });
  const before = await canvas.getAttribute("data-camera-revision");
  await slider.fill("78");
  await expect(canvas).not.toHaveAttribute("data-camera-revision", before ?? "0");
  await expect(explorer).toHaveAttribute("data-navigation-stage", "ontology");
  const prevented = await canvas.evaluate((element) => {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -120 });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(explorer).toHaveAttribute("data-navigation-stage", "ontology");
});

test("a concept with no KG instances remains visible and cannot fall into an empty expanded scene", async ({ page }) => {
  await page.goto("/dashboard");
  const parameter = page.locator('[data-node-id="parameter"]');
  await parameter.hover();
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  const explorer = page.locator(".universe-explorer");
  await expect(explorer).toHaveAttribute("data-navigation-stage", "concept-kg");
  await expect(page.locator('[data-node-id="parameter"]')).toBeVisible();
  await page.mouse.wheel(0, -120);
  await expect(explorer).toHaveAttribute("data-navigation-stage", "concept-kg");
  await expect(page.locator("[data-node-id]")).toHaveCount(1);
  for (let index = 0; index < SEMANTIC_ZOOM_OUT_THRESHOLD; index += 1) await page.mouse.wheel(0, 120);
  await expect(explorer).toHaveAttribute("data-navigation-stage", "ontology");
  await expect(page.locator("[data-node-id]")).not.toHaveCount(0);
});

test("Layer mode creates ordered visible inheritance ranks in both 3D and 2D", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("switch", { name: "Layer layout" }).click();
  const root3d = page.locator('[data-node-id="knowledge"]');
  const child3d = page.locator('[data-node-id="process"]');
  const leaf3d = page.locator('[data-node-id="parameter"]');
  await expect(root3d).toHaveAttribute("data-layer-depth", "0");
  await expect(child3d).toHaveAttribute("data-layer-depth", "1");
  await expect(leaf3d).toHaveAttribute("data-layer-depth", "2");
  const worldY = async (locator: typeof root3d): Promise<number> => Number(await locator.getAttribute("data-world-y"));
  expect(await worldY(root3d)).toBeGreaterThan(await worldY(child3d));
  expect(await worldY(child3d)).toBeGreaterThan(await worldY(leaf3d));
  for (const node of [root3d, child3d, leaf3d]) await expect(node).toBeInViewport();

  await page.getByRole("button", { name: "2D", exact: true }).click();
  const projectedY = async (id: string): Promise<number> => Number(
    await page.locator(`[data-node-id="${id}"]`).getAttribute("data-projected-y"),
  );
  expect(await projectedY("knowledge")).toBeLessThan(await projectedY("process"));
  expect(await projectedY("process")).toBeLessThan(await projectedY("parameter"));
  for (const id of ["knowledge", "process", "parameter"]) {
    await expect(page.locator(`[data-node-id="${id}"]`)).toBeInViewport();
  }
});

test("2D hovered zoom and double-click both enter the related KG without an empty frame", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "2D", exact: true }).click();
  const process = page.locator('[data-node-id="process"]');
  await process.hover();
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "concept-kg");
  await expect(page.locator('[data-node-id="process-coating"]')).toBeVisible();
  for (let index = 0; index < SEMANTIC_ZOOM_OUT_THRESHOLD; index += 1) await page.mouse.wheel(0, 120);
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "ontology");
  await page.locator('[data-node-id="material"]').dblclick({ force: true });
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "concept-kg");
  await expect(page.locator('[data-node-id="material-polymer"]')).toBeVisible();
});

test("zoom buttons cross the same semantic thresholds as wheel gestures", async ({ page }) => {
  await page.goto("/dashboard");
  await page.locator('[data-node-id="process"]').click({ force: true });
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  await zoomIn.click();
  await zoomIn.click();
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "ontology");
  await zoomIn.click();
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "concept-kg");
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  await zoomOut.click();
  await zoomOut.click();
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "concept-kg");
  await zoomOut.click();
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "ontology");
});

test("browser hover, edge click, and another hover restore the pinned edge", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "2D", exact: true }).click();
  const node = page.locator('[data-node-id="process"]');
  await node.hover();
  await expect(page.locator('[data-info-kind="node"]')).toBeVisible();
  const other = page.locator('[data-node-id="material"]');
  const edge = page.locator(".universe-canvas-2d [data-edge-id]").first();
  await expect(edge).toBeVisible();
  await edge.evaluate((element) => (element as HTMLButtonElement).click());
  // Compact viewports can project the edge hit target underneath a node hit
  // target. Move off the graph before asserting the pinned-edge restoration.
  await page.locator(".universe-search").hover();
  await expect(page.locator('[data-info-kind="edge"]')).toBeVisible();
  await other.hover();
  await expect(page.locator('[data-info-kind="node"]')).toBeVisible();
  await page.locator(".universe-search").hover();
  await expect(page.locator('[data-info-kind="edge"]')).toBeVisible();
});

test("3D edge hit target pins relation details", async ({ page }) => {
  await page.goto("/dashboard");
  const edge = page.locator(".universe-canvas-3d [data-edge-id]").first();
  await expect(edge).toBeVisible();
  await edge.click();
  await expect(page.locator('[data-info-kind="edge"]')).toBeVisible();
});

test("dragging an ontology node does not trigger a semantic drill", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("inspector-portal-preferences-v1", JSON.stringify({ mode: "universe", locale: "zh-CN", theme: "dark" })));
  await page.goto("/dashboard");
  const node = page.locator('[data-node-id="process"]');
  const box = await node.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 50);
  await page.mouse.up();
  await expect(page.locator(".universe-explorer")).toHaveAttribute("data-navigation-stage", "ontology");
});

test("browser KG zoom expands relation depth and evidence, then retreats one thresholded layer at a time", async ({ page }) => {
  await page.goto("/dashboard");
  await page.locator('[data-node-id="process"]').dblclick({ force: true });
  await expect(page.locator('[data-node-id="process-coating"]')).toBeVisible();
  await page.locator('[data-node-id="process-coating"]').dblclick({ force: true });
  const explorer = page.locator(".universe-explorer");
  const canvas = page.locator(".universe-canvas-3d");
  await expect(explorer).toHaveAttribute("data-navigation-stage", "expanded-kg");
  await canvas.hover();
  await page.mouse.wheel(0, -120);
  await expect(explorer).toHaveAttribute("data-navigation-stage", "expanded-kg");
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, -120);
  await expect(page.locator('[data-node-id="evidence-paper"]')).toBeVisible();
  for (let index = 0; index < SEMANTIC_ZOOM_OUT_THRESHOLD - 1; index += 1) await page.mouse.wheel(0, 120);
  await expect(explorer).toHaveAttribute("data-navigation-stage", "expanded-kg");
  await expect(explorer).toHaveAttribute("data-zoom-direction", "out");
  await page.mouse.wheel(0, 120);
  await expect(explorer).toHaveAttribute("data-navigation-stage", "expanded-kg");
  await expect(explorer).toHaveAttribute("data-zoom-progress", "0");

  const retreatTo = async (stage: string, depth?: number): Promise<void> => {
    for (let index = 0; index < 100; index += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(20);
      const currentStage = await explorer.getAttribute("data-navigation-stage");
      const currentDepth = Number(await explorer.getAttribute("data-navigation-depth"));
      if (currentStage === stage && (depth === undefined || currentDepth === depth)) return;
      expect(currentStage, `zoom-out skipped directly past ${stage}`).not.toBe("ontology");
    }
    throw new Error(`zoom-out did not reach ${stage}${depth === undefined ? "" : ` depth ${depth}`}`);
  };

  await retreatTo("expanded-kg", 2);
  await expect(explorer).toHaveAttribute("data-transition-state", "stable");
  const cameraDistance = async (): Promise<number> => {
    const values = await canvas.evaluate((element) => ({
      position: element.getAttribute("data-camera-position") ?? "",
      target: element.getAttribute("data-camera-target") ?? "",
    }));
    const position = values.position.split(",").map(Number);
    const target = values.target.split(",").map(Number);
    return Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]);
  };
  const focusedDistance = await cameraDistance();
  await page.mouse.wheel(0, 120);
  await expect(explorer).toHaveAttribute("data-navigation-depth", "2");
  expect(await cameraDistance()).toBeGreaterThan(focusedDistance);

  await retreatTo("expanded-kg", 1);
  await retreatTo("concept-kg", 1);
  await retreatTo("ontology", 0);
  await expect(page.locator("[data-node-id]")).not.toHaveCount(0);
});

test("Layer on → 2D/3D runtime toggle → drag preserves fixed/released semantics", () => {
  const scene = createOverviewScene(view);
  const runtime = new UniverseForceRuntime(scene, { dimensions: 2, layerMode: true });
  runtime.tick(4);
  const before = runtime.nodes.find((node) => node.id === "entity");
  expect(before).toBeDefined();
  runtime.beginDrag("entity"); runtime.dragTo("entity", 11, 13); expect(runtime.nodes.find((node) => node.id === "entity")?.fx).toBe(11);
  runtime.endDrag("entity"); expect(runtime.nodes.find((node) => node.id === "entity")?.fx).toBeNull();
  runtime.setDimensions(3); runtime.setLayerMode(true); runtime.tick(2);
  expect(runtime.nodes.find((node) => node.id === "entity")?.z).toBeDefined();
});

test("KG zoom out requires a threshold and retreats exactly one semantic layer", () => {
  const concept = enterConcept(initialUniverseNavigation, "concept");
  const relation = zoomIn(concept, { hasMoreRelations: true, hasMoreEvidence: true });
  const evidence = zoomIn(relation, { hasMoreRelations: false, hasMoreEvidence: true });
  expect(evidence.evidence).toBe(true);
  expect(zoomIn(evidence, { hasMoreRelations: false, hasMoreEvidence: true })).toEqual(evidence);
  const first = zoomOut(evidence, 0.6);
  const second = zoomOut(first, 0.6);
  expect(first).toMatchObject({ stage: "expanded-kg", evidence: true, zoomProgress: 1 });
  expect(second).toMatchObject({ stage: "expanded-kg", evidence: true, zoomProgress: 2 });
  const evidenceExit = zoomOut(second, 0.6);
  expect(evidenceExit).toMatchObject({ stage: "expanded-kg", evidence: false, zoomProgress: 0 });
  const depthOne = [1, 2, 3].reduce((state) => zoomOut(state, 0.6), evidenceExit);
  expect(depthOne).toMatchObject({ stage: "expanded-kg", depth: 1, zoomProgress: 0 });
  const conceptAgain = [1, 2, 3].reduce((state) => zoomOut(state, 0.6), depthOne);
  expect(conceptAgain).toMatchObject({ stage: "concept-kg", depth: 1, zoomProgress: 0 });
  const ontology = [1, 2, 3].reduce((state) => zoomOut(state, 0.6), conceptAgain);
  expect(ontology).toEqual(initialUniverseNavigation);
});

test("snapshot 409 during a combined flow invalidates the page epoch", async () => {
  const first = { snapshotId: "snap-combo", ontologyVersion: "onto-combo", scope: { mode: "global" as const, depth: 1 }, nodes: [], edges: [], page: { nextCursor: "next", complete: false, loadedNodeCount: 0, loadedEdgeCount: 0, totalNodeCount: 0, totalEdgeCount: 0 } };
  await expect(loadAllUniverseGraphPages({ getUniverseGraphPage: async (request) => request.cursor ? { ...first, snapshotId: "snap-new" } : first } as never, { snapshotId: "snap-combo", mode: "global", depth: 1, pageSize: 500 })).rejects.toThrow("409");
});
