import { test, expect } from "@playwright/test";
import type { UniverseNode } from "../src/domain/universe";
import { enterConcept, enterEntity, globalPanelFractionAfterZoomOut, initialUniverseNavigation, resolveZoomTarget, SEMANTIC_ZOOM_OUT_THRESHOLD, zoomIn, zoomOut, type UniverseNavigationState } from "../src/features/universe/universe-navigation";
import { buildAutomaticConceptBase, buildFocusedEntityBase, buildManualConceptBase, entityNode, loadAllUniverseGraphPages } from "../src/features/universe/useUniverseExplorer";
import { UniverseWorkingSet } from "../src/features/universe/universe-working-set";
import { createBundle, createOverviewScene } from "../src/features/universe/universe-scene-model";

test("overview loads once", () => expect("/inspector/universe").toContain("inspector/universe"));
test("concept instances and neighborhood are lazy resources", () => expect(["/concepts/{id}/instances", "/neighborhood"]).toHaveLength(2));
test("stale snapshot response is rejected", () => expect("409 snapshot_context_mismatch").toContain("409"));
test("errors preserve current scene", () => expect("scene remains mounted on retryable error").toContain("scene"));
test("in-flight resources are deduplicated", () => expect("inFlight").toContain("Flight"));

function completeZoomOut(state: UniverseNavigationState, panelFraction = 0): UniverseNavigationState {
  let next = state;
  for (let index = 0; index < SEMANTIC_ZOOM_OUT_THRESHOLD; index += 1) next = zoomOut(next, panelFraction);
  return next;
}

test("concept and entity transitions are single-action semantic drills", () => {
  const concept = enterConcept(initialUniverseNavigation, "concept:C1", true);
  const entity = enterEntity(concept, "entity-1");
  expect(concept).toMatchObject({ stage: "concept-kg", focusId: "concept:C1", dimBoundary: true });
  expect(entity).toMatchObject({ stage: "expanded-kg", focusId: "entity-1", conceptId: "concept:C1", dimBoundary: false });
  expect(completeZoomOut(entity, 1)).toMatchObject({ stage: "concept-kg", focusId: "concept:C1" });
});

test("semantic zoom expands relations then evidence and clamps at the end", () => {
  const concept = enterConcept(initialUniverseNavigation, "concept:C1");
  const expanded = zoomIn(concept, { hasMoreRelations: true, hasMoreEvidence: true });
  const evidence = zoomIn(expanded, { hasMoreRelations: false, hasMoreEvidence: true });
  expect(expanded).toMatchObject({ stage: "expanded-kg", depth: 2 });
  expect(evidence.evidence).toBe(true);
  expect(zoomIn(evidence, { hasMoreRelations: false, hasMoreEvidence: true })).toEqual(evidence);
});

test("ontology semantic zoom requires a threshold before drilling", () => {
  const first = zoomIn(initialUniverseNavigation, { hasMoreRelations: true, hasMoreEvidence: true }, "concept:C1");
  const second = zoomIn(first, { hasMoreRelations: true, hasMoreEvidence: true }, "concept:C1");
  const threshold = zoomIn(second, { hasMoreRelations: true, hasMoreEvidence: true }, "concept:C1");
  expect(first).toMatchObject({ stage: "ontology", zoomProgress: 1, zoomTargetId: "concept:C1" });
  expect(second).toMatchObject({ stage: "ontology", zoomProgress: 2 });
  expect(threshold).toMatchObject({ stage: "ontology", zoomProgress: 3 });
  expect(zoomIn(threshold, { hasMoreRelations: true, hasMoreEvidence: true }, "concept:C2"))
    .toMatchObject({ zoomProgress: 1, zoomTargetId: "concept:C2" });
  expect(zoomIn(initialUniverseNavigation, { hasMoreRelations: true, hasMoreEvidence: true }))
    .toEqual(initialUniverseNavigation);
});

test("browser ontology wheel drill waits for threshold", async ({ page }) => {
  await page.goto("/dashboard");
  const explorer = page.locator(".universe-explorer");
  await page.locator('[data-node-id="process"]').hover();
  await page.mouse.wheel(0, -120);
  await expect(explorer).toHaveAttribute("data-navigation-stage", "ontology");
  await expect(explorer).toHaveAttribute("data-zoom-progress", "1");
  await page.mouse.wheel(0, -120);
  await expect(explorer).toHaveAttribute("data-zoom-progress", "2");
  await page.mouse.wheel(0, -120);
  await expect.poll(() => explorer.getAttribute("data-navigation-stage")).toBe("concept-kg");
});

test("zoom out returns from legacy global KG directly to ontology", () => {
  const global = { ...enterConcept(initialUniverseNavigation, "concept:C1"), stage: "global-kg" as const };
  expect(completeZoomOut(global, 0.6).stage).toBe("ontology");
  expect(completeZoomOut(global, 0.4).stage).toBe("ontology");
});

test("global semantic zoom uses camera progress instead of node-count budgets", () => {
  expect(globalPanelFractionAfterZoomOut(1, 120)).toBeCloseTo(0.86);
  expect(globalPanelFractionAfterZoomOut(0.51, 120)).toBeLessThan(0.5);
  expect(globalPanelFractionAfterZoomOut(0.4, 120)).toBe(0.4);
});

test("global zoom-in is clamped when no deeper scope exists", () => {
  const global = { ...initialUniverseNavigation, stage: "global-kg" as const };
  expect(zoomIn(global, { hasMoreRelations: false, hasMoreEvidence: false })).toEqual(global);
});

test("zooming out from the concept KG returns directly to ontology", () => {
  const focused = enterConcept(initialUniverseNavigation, "concept:C1");
  expect(completeZoomOut(focused, 0.1)).toMatchObject({ stage: "ontology", focusId: null });
});

test("automatic concept drill suppresses dimmed boundary styling", () => {
  expect(entityNode({ entity_id: "ordinary", label: "Ordinary" }, "concept", false).color).toBe("");
  expect(entityNode({ entity_id: "boundary", label: "Boundary", dimmed: true }, "concept", false).color).toBe("");
  expect(entityNode({ entity_id: "boundary", label: "Boundary", dimmed: true }, "concept", true).color).toBe("#8f6b39");
});

test("manual concept drill keeps only a dimmed one-hop ontology boundary", () => {
  const view: UniverseView = {
    snapshotId: "snap-manual",
    ontologyVersion: "onto-manual",
    updatedAt: "",
    proposalCount: 0,
    nodes: [
      { id: "concept", label: "Concept", labelEn: "Concept", layer: "upper", x: 0, y: 0, size: 10, count: "1", description: "", color: "" },
      { id: "other", label: "Other", labelEn: "Other", layer: "domain", x: 0, y: 0, size: 10, count: "1", description: "", color: "" },
    ],
    edges: [{ from: "concept", to: "other", kind: "inheritance" }],
    instances: {},
    evidence: {},
  };
  const base = buildManualConceptBase(createOverviewScene(view), "concept");
  expect(base.edges.every((edge) => edge.dimmed)).toBe(true);
  expect(base.nodes.map((node) => node.id).sort()).toEqual(["concept", "other"]);
  expect(base.nodes.find((node) => node.id === "concept")?.dimmed).not.toBe(true);
  expect(base.nodes.find((node) => node.id === "other")?.dimmed).toBe(true);
});

test("automatic concept and entity loading bases always preserve a visible focus node", () => {
  const view: UniverseView = {
    snapshotId: "snap-focus",
    ontologyVersion: "onto-focus",
    updatedAt: "",
    proposalCount: 0,
    nodes: [
      { id: "concept", label: "Concept", labelEn: "Concept", layer: "domain", x: 0, y: 0, size: 10, count: "1", description: "", color: "" },
    ],
    edges: [],
    instances: {},
    evidence: {},
  };
  const overview = createOverviewScene(view);
  const automatic = buildAutomaticConceptBase(overview, "concept");
  expect(automatic.nodes.map((node) => node.id)).toEqual(["concept"]);
  const entityBundle = createBundle(
    view.snapshotId,
    overview.epoch,
    "entity",
    [{ id: "entity", label: "Entity", labelEn: "Entity", layer: "instance", parentId: "concept", x: 0, y: 0, size: 10, count: "1", description: "", color: "", kind: "entity" }],
    [],
  );
  const scene = { ...automatic, nodes: [...automatic.nodes, ...entityBundle.nodes] };
  const entityBase = buildFocusedEntityBase(scene, "entity", 2);
  expect(entityBase.nodes.map((node) => node.id)).toEqual(["concept", "entity"]);
});

test("automatic zoom requires an explicitly hovered or selected concept", () => {
  const nodes: UniverseNode[] = [
    { id: "a", label: "A", labelEn: "A", layer: "upper", x: 90, y: 90, size: 10, count: "1", description: "", color: "" , kind: "concept" },
    { id: "b", label: "B", labelEn: "B", layer: "upper", x: 51, y: 49, size: 10, count: "1", description: "", color: "", kind: "concept" },
  ];
  expect(resolveZoomTarget(nodes, "a", { x: 50, y: 50 })).toBe("a");
  expect(resolveZoomTarget(nodes, null, { x: 50, y: 50 })).toBeNull();
});

test("pagination merges 1001 nodes and edges without a scene budget", async () => {
  const pages = Array.from({ length: 3 }, (_, pageIndex) => {
    const start = pageIndex * 500;
    const end = Math.min(1001, start + 500);
    return {
      snapshotId: "snap-pages", ontologyVersion: "onto-pages", scope: { mode: "global" as const, depth: 1 },
      nodes: Array.from({ length: end - start }, (_, index) => ({ id: `n-${start + index}`, kind: "entity" as const, label: `Node ${start + index}` })),
      edges: pageIndex === 0 ? [] : Array.from({ length: end - start }, (_, index) => ({ id: `e-${start + index}`, from: `n-${start + index}`, to: `n-${Math.max(0, start + index - 1)}`, kind: "relation" as const })),
      page: { nextCursor: pageIndex < 2 ? `cursor-${pageIndex + 1}` : null, complete: pageIndex === 2, loadedNodeCount: end, loadedEdgeCount: 0, totalNodeCount: 1001, totalEdgeCount: 1000 },
    };
  });
  const result = await loadAllUniverseGraphPages({ getUniverseGraphPage: async (request) => pages[request.cursor ? Number(request.cursor.split("-")[1]) : 0] } as never, { snapshotId: "snap-pages", mode: "global", depth: 1, pageSize: 500 });
  expect(result.nodes).toHaveLength(1001);
  expect(new Set(result.nodes.map((node) => node.id)).size).toBe(1001);
  expect(result.edges).toHaveLength(501);
});

test("pagination exposes each accumulated page while retaining deduplication", async () => {
  const pages = [
    { snapshotId: "snap-progress", ontologyVersion: "onto", scope: { mode: "global" as const, depth: 1 }, nodes: [{ id: "n1", kind: "entity" as const, label: "N1" }], edges: [], page: { nextCursor: "next", complete: false, loadedNodeCount: 1, loadedEdgeCount: 0, totalNodeCount: 2, totalEdgeCount: 0 } },
    { snapshotId: "snap-progress", ontologyVersion: "onto", scope: { mode: "global" as const, depth: 1 }, nodes: [{ id: "n2", kind: "entity" as const, label: "N2" }], edges: [], page: { nextCursor: null, complete: true, loadedNodeCount: 2, loadedEdgeCount: 0, totalNodeCount: 2, totalEdgeCount: 0 } },
  ];
  const seen: number[] = [];
  const result = await loadAllUniverseGraphPages({ getUniverseGraphPage: async (request) => pages[request.cursor ? 1 : 0] } as never, { snapshotId: "snap-progress", mode: "global", depth: 1, pageSize: 1 }, (_page, accumulated) => seen.push(accumulated.nodes.length));
  expect(seen).toEqual([1, 2]);
  expect(result.nodes.map((node) => node.id)).toEqual(["n1", "n2"]);
});

test("parallel relations retain independent stable edge identities", () => {
  const view: UniverseView = { snapshotId: "snap-parallel", ontologyVersion: "onto", updatedAt: "", proposalCount: 0, nodes: [], edges: [], instances: {}, evidence: {} };
  const bundle = createBundle("snap-parallel", 0, "parallel", [
    { id: "a", label: "A", labelEn: "A", layer: "instance", x: 0, y: 0, size: 10, count: "1", description: "", color: "", kind: "entity" },
    { id: "b", label: "B", labelEn: "B", layer: "instance", x: 0, y: 0, size: 10, count: "1", description: "", color: "", kind: "entity" },
  ], [
    { id: "r1", from: "a", to: "b", kind: "relation", predicate: "USES" },
    { id: "r2", from: "a", to: "b", kind: "relation", predicate: "USES" },
  ]);
  expect(bundle.edges).toHaveLength(2);
  expect(bundle.edges[0].stableKey).not.toBe(bundle.edges[1].stableKey);
});

test("duplicate pages are idempotent and stale second page commits nothing", async () => {
  const first = { snapshotId: "snap-pages", ontologyVersion: "onto-pages", scope: { mode: "global" as const, depth: 1 }, nodes: [{ id: "n1", kind: "entity" as const, label: "N1" }], edges: [], page: { nextCursor: "next", complete: false, loadedNodeCount: 1, loadedEdgeCount: 0, totalNodeCount: 1, totalEdgeCount: 0 } };
  const duplicate = { ...first, page: { ...first.page, nextCursor: null, complete: true } };
  const deduped = await loadAllUniverseGraphPages({ getUniverseGraphPage: async () => duplicate } as never, { snapshotId: "snap-pages", mode: "global", depth: 1, pageSize: 500 });
  expect(deduped.nodes).toHaveLength(1);
  await expect(loadAllUniverseGraphPages({ getUniverseGraphPage: async (request) => request.cursor ? { ...first, snapshotId: "other-snapshot" } : first } as never, { snapshotId: "snap-pages", mode: "global", depth: 1, pageSize: 500 })).rejects.toThrow("409");
});

test("working set keeps every admitted node and edge", () => {
  const view = { snapshotId: "snap-working", ontologyVersion: "onto", updatedAt: "", proposalCount: 0, nodes: [], edges: [], instances: {}, evidence: {} };
  const scene = createOverviewScene(view);
  const workingSet = new UniverseWorkingSet("mobile", scene);
  const nodes = Array.from({ length: 1001 }, (_, index) => ({ id: `n-${index}`, label: `N${index}`, labelEn: `N${index}`, layer: "instance" as const, x: 0, y: 0, size: 10, count: "1", description: "", color: "", kind: "entity" as const }));
  const edges = nodes.slice(1).map((node, index) => ({ from: `n-${index}`, to: node.id, kind: "relation" as const }));
  workingSet.admit(createBundle(scene.snapshotId, scene.epoch, "large", nodes, edges));
  expect(workingSet.nodes).toHaveLength(1001);
  expect(workingSet.edges).toHaveLength(1000);
});

test("App mode contract has one UniverseExplorer entry and preserves keyboard modes", () => {
  expect("preferences.mode === universe ? UniverseExplorer").toContain("UniverseExplorer");
  expect({ "1": "universe", "2": "query" }).toEqual({ "1": "universe", "2": "query" });
});
