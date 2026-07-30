import { test, expect } from "@playwright/test";
import * as THREE from "three";
import type { UniverseView } from "../src/domain/universe";
import { createOverviewScene } from "../src/features/universe/universe-scene-model";
import { shouldActivateNode } from "../src/features/universe/UniverseCanvas3D";
import { UNIVERSE_LAYER_GAP, UNIVERSE_LAYOUT_SCALE, UNIVERSE_NODE_RADIUS_SCALE, UniverseForceRuntime } from "../src/features/universe/universe-force-runtime";
import {
  buildRenderDescriptors,
  cameraPoseForLayout,
  cameraPoseForNodes,
  edgeIdsForHighlight,
  nodeColorForTheme,
  positionForSeed,
  roundPointTexture,
  UNIVERSE_CAMERA_FIT_QUANTILE,
  updateEdgeLine,
  type UniverseTheme,
} from "../src/features/universe/universe-three-scene";

const view: UniverseView = {
  snapshotId: "snap-render", ontologyVersion: "onto-render", updatedAt: "", proposalCount: 0,
  nodes: [
    { id: "process", label: "Process", labelEn: "Process", layer: "upper", x: 0, y: 0, size: 20, count: "2", description: "", color: "#a98cff" },
    { id: "material", label: "Material", labelEn: "Material", layer: "domain", parentId: "process", x: 0, y: 0, size: 20, count: "1", description: "", color: "#63d3f3" },
  ],
  edges: [{ from: "process", to: "material", kind: "inheritance" }], instances: {}, evidence: {},
};

test("deterministic scene positions are finite", () => {
  const scene = createOverviewScene(view);
  const first = positionForSeed(scene.nodes[0].seed);
  const second = positionForSeed(scene.nodes[0].seed);
  expect(first.toArray()).toEqual(second.toArray());
  expect(first.toArray().every(Number.isFinite)).toBe(true);
  expect(first.length()).toBeCloseTo(8 * UNIVERSE_LAYOUT_SCALE);
});

test("overview contains constellation concepts and inheritance edge", () => {
  const scene = createOverviewScene(view);
  expect(scene.nodes.filter((node) => node.kind === "concept")).toHaveLength(2);
  expect(scene.edges.filter((edge) => edge.kind === "inheritance")).toHaveLength(1);
});

test("dark and light themes use semantic monochrome node and edge palettes", () => {
  const dark = nodeColorForTheme("dark");
  const light = nodeColorForTheme("light");
  expect(dark.node).not.toBe(dark.edge);
  expect(light.node).not.toBe(light.edge);
  expect(dark.node).not.toBe(light.node);
  expect(dark.background).not.toBe(light.background);
});

test("overview scene strips ontology type colors while preserving node identity", () => {
  const scene = createOverviewScene(view);
  expect(scene.nodes.map((node) => node.color)).toEqual(["", ""]);
  expect(scene.nodes.map((node) => node.id)).toEqual(["process", "material"]);
});

test("render descriptors carry stable node and edge hit-test ids without labels", () => {
  const scene = createOverviewScene(view);
  const descriptors = buildRenderDescriptors(scene, "dark");
  expect(descriptors.nodes.map((item) => item.userData.nodeId)).toEqual(["process", "material"]);
  expect(descriptors.edges[0].userData.edgeId).toContain("process:material");
  expect(descriptors.nodes.every((item) => item.label === "")).toBe(true);
});

test("background point texture is circular rather than a square", () => {
  const texture = roundPointTexture(8);
  const data = texture.image.data as Uint8Array;
  const alphaAt = (x: number, y: number) => data[(y * 8 + x) * 4 + 3];
  expect(alphaAt(0, 0)).toBe(0);
  expect(alphaAt(4, 4)).toBeGreaterThan(0);
  texture.dispose();
});

test("layer camera keeps depth offsets visible in screen space", () => {
  const pose = cameraPoseForLayout(true);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  const parent = new THREE.Vector3(0, 0, 0).project(camera);
  const child = new THREE.Vector3(0, 0, -16).project(camera);
  expect(Math.hypot(parent.x - child.x, parent.y - child.y)).toBeGreaterThan(0.05);
});

test("3d layer mode pins inheritance ranks into visibly separated shelves", () => {
  const runtime = new UniverseForceRuntime(createOverviewScene(view), { dimensions: 3, layerMode: true });
  runtime.settle();
  const ranks = new Map<number, number[]>();
  runtime.nodes.forEach((node) => ranks.set(node.layerDepth, [...(ranks.get(node.layerDepth) ?? []), node.y]));
  const means = [...ranks.entries()].sort(([left], [right]) => left - right).map(([, values]) => values.reduce((sum, value) => sum + value, 0) / values.length);
  expect(means.length).toBeGreaterThan(1);
  expect(Math.abs(means[1] - means[0])).toBeGreaterThan(UNIVERSE_LAYER_GAP * 0.7);
  for (const values of ranks.values()) {
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(UNIVERSE_LAYER_GAP * 0.35);
  }
});

test("camera pose keeps the main body of a large settled graph visible", () => {
  const nodes = [
    { x: -180, y: -110, z: 0, layerDepth: 0 },
    { x: 190, y: 120, z: -16, layerDepth: 1 },
    { x: -150, y: 95, z: -48, layerDepth: 3 },
    { x: 165, y: -100, z: -64, layerDepth: 4 },
  ];
  const pose = cameraPoseForNodes(nodes, true);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  const projected = nodes.map((node) => new THREE.Vector3(node.x, node.y, node.z).project(camera));
  expect(projected.filter((point) => Math.abs(point.x) < 1.2 && Math.abs(point.y) < 1.2).length).toBeGreaterThanOrEqual(2);
});

test("camera pose ignores one remote outlier when fitting the readable main constellation", () => {
  const main = Array.from({ length: 30 }, (_, index) => ({
    x: (index % 6) * 20 - 50,
    y: Math.floor(index / 6) * 20 - 40,
    z: (index % 3) * 8,
  }));
  const pose = cameraPoseForNodes([...main, { x: 5000, y: 0, z: 0 }], false);
  expect(Math.abs(pose.target.x)).toBeLessThan(20);
  expect(pose.position.distanceTo(pose.target)).toBeLessThan(500);
});

test("camera pose prioritizes individually readable central nodes over long hierarchy arms", () => {
  const centralCount = Math.round(100 * UNIVERSE_CAMERA_FIT_QUANTILE);
  const central = Array.from({ length: centralCount }, (_, index) => {
    const angle = index / centralCount * Math.PI * 2;
    return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100, z: 0 };
  });
  const arms = Array.from({ length: 100 - centralCount }, (_, index) => {
    const angle = index / (100 - centralCount) * Math.PI * 2;
    return { x: Math.cos(angle) * 1000, y: Math.sin(angle) * 1000, z: 0 };
  });
  const pose = cameraPoseForNodes([...central, ...arms], false);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  const visibleCentral = central
    .map((node) => new THREE.Vector3(node.x, node.y, node.z).project(camera))
    .filter((point) => Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1);
  expect(visibleCentral.length).toBeGreaterThanOrEqual(Math.floor(centralCount * 0.9));
  expect(pose.position.distanceTo(pose.target)).toBeLessThan(300);
});

test("node hit targets remain circular despite generic explorer button styles", async ({ page }) => {
  await page.goto("/dashboard");
  const hit = page.locator(".universe-node-hit").first();
  await expect(hit).toBeAttached();
  expect(await hit.evaluate((element) => getComputedStyle(element).borderRadius)).toBe("50%");
});

test("3d node radius grows with degree but remains bounded", () => {
  const scene = createOverviewScene({
    ...view,
    nodes: [
      { ...view.nodes[0], id: "isolated" },
      { ...view.nodes[0], id: "hub" },
      ...Array.from({ length: 8 }, (_, index) => ({ ...view.nodes[0], id: `leaf-${index}` })),
    ],
    edges: Array.from({ length: 8 }, (_, index) => ({ from: "hub", to: `leaf-${index}`, kind: "relation" as const })),
  });
  const descriptors = buildRenderDescriptors(scene, "dark");
  const isolatedRadius = (descriptors.nodes.find((item) => item.node.id === "isolated")!.mesh.geometry as THREE.SphereGeometry).parameters.radius;
  const hubRadius = (descriptors.nodes.find((item) => item.node.id === "hub")!.mesh.geometry as THREE.SphereGeometry).parameters.radius;
  expect(hubRadius).toBeGreaterThan(isolatedRadius);
  expect(hubRadius).toBeLessThanOrEqual(0.8 * UNIVERSE_LAYOUT_SCALE * UNIVERSE_NODE_RADIUS_SCALE);
});

test("hovering a node highlights every incident edge and dims unrelated edges", () => {
  const scene = createOverviewScene({
    ...view,
    nodes: [...view.nodes, { ...view.nodes[0], id: "other", label: "Other", labelEn: "Other" }],
    edges: [...view.edges, { from: "other", to: "material", kind: "relation" }],
  });
  const highlighted = edgeIdsForHighlight(scene.edges, "material");
  expect(highlighted).toEqual(new Set(scene.edges.map((edge) => edge.stableKey)));
  expect(edgeIdsForHighlight(scene.edges, "process")).toEqual(new Set([scene.edges[0].stableKey]));
});

test("runtime coordinates update edge endpoints immediately while preserving ids", () => {
  const scene = createOverviewScene(view);
  const descriptors = buildRenderDescriptors(scene, "dark");
  const from = new THREE.Vector3(2, 3, 4);
  const to = new THREE.Vector3(-1, 5, 0);
  updateEdgeLine(descriptors.edges[0].line, from, to);
  const positions = descriptors.edges[0].line.geometry.getAttribute("position");
  expect(Array.from(positions.array)).toEqual([2, 3, 4, -1, 5, 0]);
  expect(descriptors.edges[0].userData.edgeId).toBe(scene.edges[0].stableKey);
});

test("theme changes are represented by palette only, leaving scene coordinates deterministic", () => {
  const scene = createOverviewScene(view);
  const before = scene.nodes.map((node) => positionForSeed(node.seed).toArray());
  const themes: UniverseTheme[] = ["dark", "light"];
  themes.forEach((theme) => buildRenderDescriptors(scene, theme));
  expect(scene.nodes.map((node) => positionForSeed(node.seed).toArray())).toEqual(before);
});

test("3d pointer activation rejects long press but accepts a stationary tap", () => {
  expect(shouldActivateNode(false, 100)).toBe(true);
  expect(shouldActivateNode(false, 500)).toBe(false);
  expect(shouldActivateNode(true, 100)).toBe(false);
});
