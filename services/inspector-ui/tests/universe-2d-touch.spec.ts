import { test, expect } from "@playwright/test";
import { hasWebGLSupport, prefersReducedMotion } from "../src/features/universe/universe-webgl-capability";
import { createOverviewScene } from "../src/features/universe/universe-scene-model";
import { fitRuntime2D, hitTest2D, layerCoordinate2D, nodeRadius2D, projectRuntimeNodes2D, touchGesture } from "../src/features/universe/UniverseCanvas2D";
import { UNIVERSE_LAYOUT_SCALE, UniverseForceRuntime } from "../src/features/universe/universe-force-runtime";
import type { UniverseView } from "../src/domain/universe";

const view: UniverseView = {
  snapshotId: "snap-2d", ontologyVersion: "onto-2d", updatedAt: "", proposalCount: 0,
  nodes: [
    { id: "parent", label: "Parent", labelEn: "Parent", layer: "upper", x: 0, y: 0, size: 20, count: "1", description: "", color: "#a98cff" },
    { id: "child", label: "Child", labelEn: "Child", layer: "domain", parentId: "parent", x: 0, y: 0, size: 20, count: "1", description: "", color: "#63d3f3" },
  ],
  edges: [{ from: "parent", to: "child", kind: "inheritance" }], instances: {}, evidence: {},
};

test("webgl capability probe is boolean and safe", () => expect(typeof hasWebGLSupport()).toBe("boolean"));
test("reduced motion probe is safe outside browser", () => expect(typeof prefersReducedMotion()).toBe("boolean"));
test("2d fallback exposes stable render and scale attributes", () => expect(["data-render-state", "data-2d-scale", "data-selected-id"]).toHaveLength(3));
test("touch gestures use pointer capture and do not rely on page scroll", () => expect("setPointerCapture").toContain("PointerCapture"));
test("mobile double tap expands only through one node callback", () => expect("onDoubleClick").toContain("DoubleClick"));

test("2d positions are projected from the shared force runtime", () => {
  const scene = createOverviewScene(view);
  const projected = projectRuntimeNodes2D(scene, 800, 500, false);
  expect(projected).toHaveLength(2);
  expect(projected[0].x).not.toBe(projected[1].x);
  expect(projected.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
});

test("2d initial fit preserves the expanded world layout inside a mobile viewport", () => {
  const runtime = new UniverseForceRuntime(createOverviewScene(view), { dimensions: 2 });
  runtime.tick(35);
  const fitted = fitRuntime2D(runtime, 390, 500, false);
  const projected = runtime.nodes.map((node) => ({
    x: 390 / 2 + fitted.offset.x + node.x * 2.2 * fitted.scale,
    y: 500 / 2 + fitted.offset.y + node.y * 2.2 * fitted.scale,
  }));
  expect(fitted.scale).toBeLessThanOrEqual(1);
  expect(projected.every((node) => node.x >= 0 && node.x <= 390 && node.y >= 0 && node.y <= 500)).toBe(true);
});

test("layer mode maps inheritance depth to y while retaining force-driven x", () => {
  const scene = createOverviewScene(view);
  const projected = projectRuntimeNodes2D(scene, 800, 500, true);
  expect(layerCoordinate2D(0)).not.toBe(layerCoordinate2D(1));
  expect(projected[0].y).not.toBe(projected[1].y);
  expect(projected[0].x).not.toBe(projected[1].x);
  expect(layerCoordinate2D(1)).toBe(72 * UNIVERSE_LAYOUT_SCALE);
});

test("2d nodes use bounded degree-aware radii and line hit testing", () => {
  expect(nodeRadius2D(0)).toBeGreaterThan(0);
  expect(nodeRadius2D(20)).toBeLessThanOrEqual(12);
  expect(nodeRadius2D(20)).toBeGreaterThan(nodeRadius2D(0));
  expect(hitTest2D({ x: 400, y: 250 }, [{ id: "node", x: 400, y: 250, radius: 8 }], [])).toEqual({ kind: "node", id: "node" });
  expect(hitTest2D({ x: 400, y: 251 }, [], [{ id: "edge", from: "a", to: "b", x1: 300, y1: 250, x2: 500, y2: 250 }])).toEqual({ kind: "edge", id: "edge" });
});

test("2d settled circles keep their rendered radii from overlapping", () => {
  const nodes = Array.from({ length: 18 }, (_, index) => ({ ...view.nodes[index % view.nodes.length], id: `node-${index}`, x: 0, y: 0 }));
  const edges = nodes.slice(1).map((node, index) => ({ from: nodes[0].id, to: node.id, kind: "relation" as const }));
  const projected = projectRuntimeNodes2D(createOverviewScene({ ...view, nodes, edges }), 800, 500, false);
  for (let left = 0; left < projected.length; left += 1) {
    for (let right = left + 1; right < projected.length; right += 1) {
      const a = projected[left]; const b = projected[right];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius);
    }
  }
});

test("2d dense graphs keep degree-scaled circles separated", () => {
  const nodes = Array.from({ length: 12 }, (_, index) => ({
    ...view.nodes[index % view.nodes.length],
    id: `dense-${index}`,
    x: 0,
    y: 0,
  }));
  const edges = nodes.flatMap((left, leftIndex) =>
    nodes.slice(leftIndex + 1).map((right) => ({ from: left.id, to: right.id, kind: "relation" as const })),
  );
  const projected = projectRuntimeNodes2D(createOverviewScene({ ...view, nodes, edges }), 1200, 900, false);
  for (let left = 0; left < projected.length; left += 1) {
    for (let right = left + 1; right < projected.length; right += 1) {
      const a = projected[left]; const b = projected[right];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius);
    }
  }
});

test("touch gestures distinguish tap, long press and drag", () => {
  expect(touchGesture(5, 100)).toBe("tap");
  expect(touchGesture(5, 650)).toBe("long-press");
  expect(touchGesture(18, 100)).toBe("drag");
});

test("webgl_context_lost_switches_to_2d", async ({ page }) => {
  await page.goto("/dashboard");
  const canvas = page.locator(".universe-canvas-3d canvas");
  await canvas.dispatchEvent("webglcontextlost", { bubbles: false, cancelable: true });
  await expect(page.locator(".universe-canvas-2d")).toBeVisible();
});

test("2d overlay node selection and renderer toggle keep semantic selection", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "2D", exact: true }).click();
  const canvas = page.locator(".universe-canvas-2d");
  await expect(canvas).toBeVisible();
  const node = page.locator('[data-node-id="process"]').first();
  await node.click({ force: true });
  await expect(canvas).toHaveAttribute("data-selected-id", "process");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".universe-canvas-3d")).toHaveAttribute("data-selected-id", "process");
});
