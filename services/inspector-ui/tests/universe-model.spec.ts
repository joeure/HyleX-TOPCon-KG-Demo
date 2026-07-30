import { test, expect } from "@playwright/test";
import type { UniverseView } from "../src/domain/universe";
import { createBundle, createOverviewScene, stableNodeKey } from "../src/features/universe/universe-scene-model";
import { UniverseWorkingSet } from "../src/features/universe/universe-working-set";
import { UniverseForceRuntime } from "../src/features/universe/universe-force-runtime";

const view: UniverseView = {
  snapshotId: "snap-1", ontologyVersion: "onto-1", updatedAt: "", proposalCount: 0,
  nodes: [{ id: "process", label: "Process", labelEn: "Process", layer: "upper", x: 0, y: 0, size: 20, count: "1", description: "", color: "#fff" }],
  edges: [], instances: {}, evidence: {},
};

test("stable keys and seeds are deterministic", () => {
  const first = createOverviewScene(view);
  const second = createOverviewScene(view);
  expect(first.seed).toBe(second.seed);
  expect(first.nodes[0].stableKey).toBe(stableNodeKey("snap-1", "concept", "process"));
  expect(first.nodes[0].seed).toBe(second.nodes[0].seed);
});

test("bundle admission is atomic and idempotent", () => {
  const model = createOverviewScene(view);
  const set = new UniverseWorkingSet("desktop", model);
  const bundle = createBundle("snap-1", 0, "process-instances", [
    { ...view.nodes[0], id: "entity-1", layer: "instance" },
  ], []);
  expect(set.admit(bundle)).toBe(true);
  expect(set.admit(bundle)).toBe(true);
  expect(set.nodes.filter((node) => node.id === "entity-1")).toHaveLength(1);
});

test("snapshot epoch rejects stale bundles and reset clears old scene", () => {
  const set = new UniverseWorkingSet("desktop", createOverviewScene(view));
  const stale = createBundle("old-snapshot", 0, "old", [], []);
  expect(set.rejectStale(stale)).toBe(true);
  set.reset(createOverviewScene({ ...view, snapshotId: "snap-2" }, 1));
  expect(set.snapshotId).toBe("snap-2");
  expect(set.nodes.every((node) => node.snapshotId === "snap-2")).toBe(true);
});

test("working set keeps the full graph on desktop and mobile", () => {
  const many = Array.from({ length: 260 }, (_, index) => ({ ...view.nodes[0], id: `e-${index}`, layer: "instance" as const }));
  const bundle = createBundle("snap-1", 0, "many", many, []);
  const desktop = new UniverseWorkingSet("desktop", createOverviewScene(view));
  const mobile = new UniverseWorkingSet("mobile", createOverviewScene(view));
  desktop.admit(bundle); mobile.admit(bundle);
  expect(desktop.nodes.length).toBe(261);
  expect(mobile.nodes.length).toBe(261);
});

test("force runtime separates nodes and keeps edge springs active", () => {
  const model = createOverviewScene({
    ...view,
    nodes: [
      { ...view.nodes[0], id: "a", x: 0, y: 0 },
      { ...view.nodes[0], id: "b", x: 0, y: 0 },
    ],
    edges: [{ from: "a", to: "b", kind: "relation" }],
  });
  const runtime = new UniverseForceRuntime(model, { dimensions: 3 });
  runtime.tick(120);
  const [first, second] = runtime.nodes;
  expect(Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z)).toBeGreaterThan(0);
  expect(typeof runtime.edges[0].source === "string" ? runtime.edges[0].source : runtime.edges[0].source.id).toBe("a");
  expect(typeof runtime.edges[0].target === "string" ? runtime.edges[0].target : runtime.edges[0].target.id).toBe("b");
});

test("force runtime degree sizing is bounded and layer mode constrains both dimensions", () => {
  const model = createOverviewScene({
    ...view,
    nodes: [
      { ...view.nodes[0], id: "root", x: 0, y: 0 },
      { ...view.nodes[0], id: "child", parentId: "root", x: 0, y: 0 },
      { ...view.nodes[0], id: "leaf", parentId: "child", x: 0, y: 0 },
    ],
    edges: [
      { from: "root", to: "child", kind: "inheritance" },
      { from: "child", to: "leaf", kind: "inheritance" },
    ],
  });
  const runtime = new UniverseForceRuntime(model, { dimensions: 3, layerMode: true });
  runtime.tick(80);
  expect(runtime.nodes[0].radius).toBeLessThanOrEqual(14);
  expect(runtime.nodes[0].y).toBeGreaterThan(runtime.nodes[1].y);
  expect(runtime.nodes[1].y).toBeGreaterThan(runtime.nodes[2].y);
  runtime.setDimensions(2);
  runtime.tick(20);
  expect(runtime.nodes.every((node) => node.z === 0)).toBe(true);
  expect(runtime.nodes[0].y).toBeGreaterThan(runtime.nodes[1].y);
});

test("layer depth is derived from inheritance edges when parentId is absent", () => {
  const model = createOverviewScene({
    ...view,
    nodes: [
      { ...view.nodes[0], id: "root", parentId: undefined, x: 0, y: 0 },
      { ...view.nodes[0], id: "child", parentId: undefined, x: 0, y: 0 },
      { ...view.nodes[0], id: "leaf", parentId: undefined, x: 0, y: 0 },
    ],
    edges: [
      { from: "root", to: "child", kind: "inheritance" },
      { from: "child", to: "leaf", kind: "inheritance" },
    ],
  });
  const runtime = new UniverseForceRuntime(model, { dimensions: 3, layerMode: true });
  runtime.tick(120);
  const depths = new Map(runtime.nodes.map((node) => [node.id, node.layerDepth]));
  expect(depths.get("root")).toBe(0);
  expect(depths.get("child")).toBe(1);
  expect(depths.get("leaf")).toBe(2);
  expect(runtime.nodes.find((node) => node.id === "root")!.y)
    .toBeGreaterThan(runtime.nodes.find((node) => node.id === "child")!.y);
  expect(runtime.nodes.find((node) => node.id === "child")!.y)
    .toBeGreaterThan(runtime.nodes.find((node) => node.id === "leaf")!.y);
});

test("drag fixes a node temporarily and releases it back to the simulation", () => {
  const runtime = new UniverseForceRuntime(createOverviewScene(view), { dimensions: 3 });
  const node = runtime.beginDrag("process");
  expect(node?.fx).toBe(node?.x);
  runtime.dragTo("process", 120, 80, 40);
  expect(runtime.nodes[0].x).toBe(120);
  expect(runtime.nodes[0].y).toBe(80);
  expect(runtime.nodes[0].z).toBe(40);
  runtime.endDrag("process");
  expect(runtime.nodes[0].fx).toBeNull();
  expect(runtime.nodes[0].fy).toBeNull();
  expect(runtime.nodes[0].fz).toBeNull();
});

test("shared runtime preserves x-y coordinates when switching 3D and 2D", () => {
  const runtime = new UniverseForceRuntime(createOverviewScene({
    ...view,
    nodes: [
      { ...view.nodes[0], id: "a", x: -4, y: 3 },
      { ...view.nodes[0], id: "b", x: 5, y: -2 },
    ],
    edges: [{ from: "a", to: "b", kind: "relation" }],
  }), { dimensions: 3 });
  runtime.settle();
  const before = new Map(runtime.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  runtime.setDimensions(2, false);
  expect(runtime.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }))).toEqual(
    [...before.entries()].map(([id, position]) => ({ id, ...position })),
  );
  runtime.setDimensions(3, false);
  expect(runtime.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }))).toEqual(
    [...before.entries()].map(([id, position]) => ({ id, ...position })),
  );
});
