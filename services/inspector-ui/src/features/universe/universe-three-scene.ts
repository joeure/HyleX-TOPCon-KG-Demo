import * as THREE from "three";
import type { SceneEdge, SceneNode, SceneModel } from "./universe-scene-model";
import {
  UNIVERSE_LAYOUT_SCALE,
  UNIVERSE_NODE_RADIUS_SCALE,
  UniverseForceRuntime,
  type ForceDimensions,
  type ForceNode,
} from "./universe-force-runtime";

export type UniverseTheme = "dark" | "light";

export type ThemePalette = {
  background: string;
  node: string;
  nodeGlow: string;
  edge: string;
  edgeHighlight: string;
  edgeDim: string;
  boundary: string;
  star: string;
};

export function nodeColorForTheme(theme: UniverseTheme): ThemePalette {
  return theme === "light"
    ? {
        background: "#f4f7fb",
        node: "#17263d",
        nodeGlow: "#49617d",
        edge: "#536b88",
        edgeHighlight: "#1d314d",
        edgeDim: "#a6b1c0",
        boundary: "#927444",
        star: "#8795a8",
      }
    : {
        background: "#060b19",
        node: "#b8d8ff",
        nodeGlow: "#83b4e8",
        edge: "#7996c3",
        edgeHighlight: "#d7e8ff",
        edgeDim: "#34445f",
        boundary: "#8f6b39",
        star: "#8bb8ff",
      };
}

export type RenderNodeDescriptor = {
  node: SceneNode;
  mesh: THREE.Mesh;
  userData: { nodeId: string; kind: "node" };
  /** Labels are intentionally empty; information is rendered by the inspector layer. */
  label: "";
};

export type RenderEdgeDescriptor = {
  edge: SceneEdge;
  line: THREE.Line;
  userData: { edgeId: string; kind: "edge" };
};

export type RenderDescriptors = {
  nodes: RenderNodeDescriptor[];
  edges: RenderEdgeDescriptor[];
};

export type ThreeSceneOptions = {
  dimensions?: ForceDimensions;
  layerMode?: boolean;
  theme?: UniverseTheme;
  runtime?: UniverseForceRuntime;
};

export function cameraPoseForLayout(layerMode: boolean): { position: THREE.Vector3; target: THREE.Vector3 } {
  // Layer mode stacks inheritance depth along world Y (viewport vertical), so
  // the camera keeps a slight lateral offset for depth cues while looking at
  // the middle of the stack rather than into a z-corridor.
  return layerMode
    ? { position: new THREE.Vector3(12, -8, 50), target: new THREE.Vector3(0, -16, 0) }
    : { position: new THREE.Vector3(0, 2, 48), target: new THREE.Vector3(0, 0, 0) };
}

type CameraFitNode = { x: number; y: number; z: number; layerDepth?: number };

export const UNIVERSE_CAMERA_FIT_QUANTILE = 0.72;
export const UNIVERSE_CAMERA_DISTANCE_FACTOR = 1.05;

function quantile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

export function cameraPoseForNodes(nodes: CameraFitNode[], layerMode: boolean): { position: THREE.Vector3; target: THREE.Vector3 } {
  if (!nodes.length) return cameraPoseForLayout(layerMode);
  const positions = nodes.map((node) => new THREE.Vector3(node.x, node.y, node.z));
  const target = new THREE.Vector3(
    quantile(positions.map((position) => position.x), 0.5),
    quantile(positions.map((position) => position.y), 0.5),
    quantile(positions.map((position) => position.z), 0.5),
  );
  const radius = Math.max(
    1,
    quantile(positions.map((position) => position.distanceTo(target)), UNIVERSE_CAMERA_FIT_QUANTILE),
  );
  const halfFov = THREE.MathUtils.degToRad(42 / 2);
  // Fit the central constellation rather than letting disconnected roots and
  // long hierarchy arms shrink every other concept into an unreadable speck.
  // The remaining nodes stay reachable through orbit, pan, zoom and reset.
  const distance = Math.max(14, radius / Math.sin(halfFov) * UNIVERSE_CAMERA_DISTANCE_FACTOR);
  const direction = layerMode
    ? new THREE.Vector3(0.06, 0, 1).normalize()
    : new THREE.Vector3(0, 0, 1);
  return { position: target.clone().add(direction.multiplyScalar(distance)), target };
}

/** Alpha texture that turns WebGL point sprites into soft circular dots. */
export function roundPointTexture(size = 16): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center) / radius;
      const alpha = distance >= 1 ? 0 : Math.round(255 * (1 - distance) ** 0.7);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export type SceneHit = { kind: "node" | "edge"; id: string };

export type ThreeSceneHandle = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  runtime: UniverseForceRuntime;
  descriptors: RenderDescriptors;
  resize: (width: number, height: number) => void;
  tick: (iterations?: number) => void;
  hitTest: (normalizedX: number, normalizedY: number) => SceneHit | undefined;
  beginDrag: (nodeId: string) => boolean;
  dragNode: (nodeId: string, normalizedX: number, normalizedY: number) => boolean;
  endDrag: (nodeId: string) => boolean;
  setHighlight: (nodeId: string) => void;
  setSelectedEdge: (edgeId: string) => void;
  setTheme: (theme: UniverseTheme) => void;
  dispose: () => void;
};

function colorForNode(theme: UniverseTheme): THREE.Color {
  return new THREE.Color(nodeColorForTheme(theme).node);
}

export function positionForSeed(seed: number, radius = 8): THREE.Vector3 {
  const u = (seed % 10000) / 10000;
  const v = ((Math.floor(seed / 10000)) % 10000) / 10000;
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  return new THREE.Vector3(
    radius * UNIVERSE_LAYOUT_SCALE * Math.sin(phi) * Math.cos(theta),
    radius * UNIVERSE_LAYOUT_SCALE * Math.cos(phi),
    radius * UNIVERSE_LAYOUT_SCALE * Math.sin(phi) * Math.sin(theta),
  );
}

export function nodeRadius3D(degree: number, baseSize = 10): number {
  const safeDegree = Math.min(20, Math.max(0, degree));
  const safeBaseSize = Math.min(24, Math.max(0, baseSize));
  // Individual nodes must stay readable at the fitted camera distance; the
  // previous 0.36 ceiling rendered every sphere as a sub-pixel dot.
  // Camera fitting moves roughly UNIVERSE_LAYOUT_SCALE times farther away when
  // the world layout expands. Compensate for that perspective distance first,
  // then apply the requested visible node-radius multiplier.
  return Math.min(0.8, Math.max(0.26, 0.26 + safeDegree * 0.02 + safeBaseSize / 160))
    * UNIVERSE_LAYOUT_SCALE
    * UNIVERSE_NODE_RADIUS_SCALE;
}

export function zoomDistance(distance: number, deltaY: number): number {
  const normalized = Math.min(1.5, Math.max(0.15, Math.abs(deltaY) / 100));
  const factor = Math.exp((deltaY < 0 ? -0.04 : 0.04) * normalized);
  return Math.min(120 * UNIVERSE_LAYOUT_SCALE, Math.max(5, distance * factor));
}

export function orbitPosition(position: THREE.Vector3, target: THREE.Vector3, dx: number, dy: number): THREE.Vector3 {
  const offset = position.clone().sub(target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= dx * 0.008;
  spherical.phi = Math.max(0.16, Math.min(Math.PI - 0.16, spherical.phi - dy * 0.008));
  return target.clone().add(new THREE.Vector3().setFromSpherical(spherical));
}

export function panCamera(position: THREE.Vector3, target: THREE.Vector3, dx: number, dy: number): { position: THREE.Vector3; target: THREE.Vector3 } {
  const distance = position.distanceTo(target);
  const pan = new THREE.Vector3(-dx * distance * 0.0015, dy * distance * 0.0015, 0);
  const nextTarget = target.clone().add(pan);
  return { target: nextTarget, position: position.clone().add(pan) };
}

export function edgeIdsForHighlight(edges: SceneEdge[], nodeId: string): Set<string> {
  return new Set(edges.filter((edge) => edge.from === nodeId || edge.to === nodeId).map((edge) => edge.stableKey));
}

export function updateEdgeLine(line: THREE.Line, from: THREE.Vector3, to: THREE.Vector3): void {
  const position = line.geometry.getAttribute("position");
  if (!(position instanceof THREE.BufferAttribute) || position.count < 2) return;
  position.setXYZ(0, from.x, from.y, from.z);
  position.setXYZ(1, to.x, to.y, to.z);
  position.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

function addStarField(scene: THREE.Scene, seed: number, palette: ThemePalette): THREE.Points {
  const positions = new Float32Array(420 * 3);
  let value = seed || 1;
  for (let index = 0; index < 420; index += 1) {
    value = Math.imul(value ^ (value >>> 13), 0x5bd1e995);
    const angle = (value >>> 0) / 0xffffffff * Math.PI * 2;
    value = Math.imul(value ^ (value >>> 15), 0x5bd1e995);
    const radius = 28 + (value >>> 0) / 0xffffffff * 38;
    value = Math.imul(value ^ (value >>> 13), 0x5bd1e995);
    const height = ((value >>> 0) / 0xffffffff - 0.5) * 42;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: palette.star, size: 0.12, map: roundPointTexture(), transparent: true, opacity: 0.72, alphaTest: 0.02, depthWrite: false });
  const stars = new THREE.Points(geometry, material);
  stars.name = "star-field";
  scene.add(stars);
  return stars;
}

function createNodeDescriptor(node: SceneNode, theme: UniverseTheme, position: THREE.Vector3, visualRadius = nodeRadius3D(0, node.size)): RenderNodeDescriptor {
  const palette = nodeColorForTheme(theme);
  const boundary = node.color === "#8f6b39";
  const radius = visualRadius;
  const geometry = new THREE.SphereGeometry(radius, 12, 8);
  const material = new THREE.MeshBasicMaterial({ color: boundary ? palette.boundary : colorForNode(theme), transparent: true, opacity: boundary ? 0.34 : 0.96 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `node:${node.id}`;
  mesh.userData = { nodeId: node.id, kind: "node" as const };
  mesh.position.copy(position);
  const glowGeometry = new THREE.SphereGeometry(radius * 2.4, 10, 6);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: boundary ? palette.boundary : nodeColorForTheme(theme).nodeGlow, transparent: true, opacity: boundary ? 0.04 : 0.12, depthWrite: false });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = `node-glow:${node.id}`;
  glow.userData = { nodeId: node.id, kind: "node-glow" };
  mesh.add(glow);
  return { node, mesh, userData: { nodeId: node.id, kind: "node" }, label: "" };
}

function createEdgeDescriptor(edge: SceneEdge, palette: ThemePalette, from: THREE.Vector3, to: THREE.Vector3): RenderEdgeDescriptor {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const material = new THREE.LineBasicMaterial({ color: edge.dimmed ? palette.boundary : palette.edge, transparent: true, opacity: edge.dimmed ? 0.24 : 0.62 });
  const line = new THREE.Line(geometry, material);
  line.name = `edge:${edge.stableKey}`;
  line.userData = { edgeId: edge.stableKey, kind: "edge" as const };
  return { edge, line, userData: { edgeId: edge.stableKey, kind: "edge" } };
}

/** Build renderer objects without creating a WebGL context; useful for hit-test and visual contract tests. */
export function buildRenderDescriptors(model: SceneModel, theme: UniverseTheme): RenderDescriptors {
  const palette = nodeColorForTheme(theme);
  const degrees = new Map<string, number>();
  model.edges.forEach((edge) => {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  });
  const nodes = model.nodes.map((node) => createNodeDescriptor(node, theme, positionForSeed(node.seed), nodeRadius3D(degrees.get(node.id) ?? 0, node.size)));
  const positions = new Map(nodes.map((item) => [item.node.id, item.mesh.position]));
  const edges = model.edges.flatMap((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    return from && to ? [createEdgeDescriptor(edge, palette, from, to)] : [];
  });
  return { nodes, edges };
}

function applyNodePalette(descriptors: RenderDescriptors, palette: ThemePalette): void {
  descriptors.nodes.forEach(({ mesh }) => {
    const material = mesh.material as THREE.MeshBasicMaterial;
    const node = descriptors.nodes.find((item) => item.mesh === mesh)?.node;
    material.color.set(node?.color === "#8f6b39" ? palette.boundary : palette.node);
    const glow = mesh.children.find((child) => child.name.startsWith("node-glow:")) as THREE.Mesh | undefined;
    if (glow) (glow.material as THREE.MeshBasicMaterial).color.set(palette.nodeGlow);
  });
  descriptors.edges.forEach(({ edge, line }) => (line.material as THREE.LineBasicMaterial).color.set(edge.dimmed ? palette.boundary : palette.edge));
}

export function createThreeScene(canvas: HTMLCanvasElement, model: SceneModel, options: ThreeSceneOptions = {}): ThreeSceneHandle {
  const theme = options.theme ?? "dark";
  let palette = nodeColorForTheme(theme);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.background);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const runtime = options.runtime ?? new UniverseForceRuntime(model, { dimensions: options.dimensions ?? 3, layerMode: options.layerMode ?? false });
  runtime.setDimensions(options.dimensions ?? 3, false);
  runtime.setLayerMode(options.layerMode ?? false, false);
  if (!options.runtime) runtime.settle();
  const activeNodes = runtime.nodes.filter((node) => !node.dimmed);
  const cameraPose = cameraPoseForNodes(activeNodes.length ? activeNodes : runtime.nodes, options.layerMode ?? false);
  camera.position.copy(cameraPose.position);
  camera.far = Math.max(200, camera.position.distanceTo(cameraPose.target) * 4);
  camera.lookAt(cameraPose.target);
  camera.updateProjectionMatrix();
  const nodes = new Map(runtime.nodes.map((node) => [node.id, node]));
  const descriptors: RenderDescriptors = { nodes: [], edges: [] };
  runtime.nodes.forEach((node) => {
    const descriptor = createNodeDescriptor(node, theme, new THREE.Vector3(node.x, node.y, node.z), nodeRadius3D(node.degree, node.size));
    descriptors.nodes.push(descriptor);
    scene.add(descriptor.mesh);
  });
  runtime.edges.forEach((edge) => {
    const from = nodes.get(typeof edge.source === "string" ? edge.source : edge.source.id);
    const to = nodes.get(typeof edge.target === "string" ? edge.target : edge.target.id);
    if (!from || !to) return;
    const descriptor = createEdgeDescriptor(edge, palette, new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z));
    descriptors.edges.push(descriptor);
    scene.add(descriptor.line);
  });
  const stars = addStarField(scene, model.seed, palette);
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 0.45;
  const nodeMeshes = descriptors.nodes.map(({ mesh }) => mesh);
  const edgeLines = descriptors.edges.map(({ line }) => line);
  const sync = (): void => {
    runtime.nodes.forEach((node) => {
      const descriptor = descriptors.nodes.find((item) => item.node.id === node.id);
      if (descriptor) descriptor.mesh.position.set(node.x, node.y, node.z);
    });
    descriptors.edges.forEach(({ edge, line }) => {
      const from = nodes.get(edge.from);
      const to = nodes.get(edge.to);
      if (from && to) updateEdgeLine(line, new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z));
    });
  };
  const setHighlight = (nodeId: string): void => {
    const highlighted = edgeIdsForHighlight(model.edges, nodeId);
    descriptors.edges.forEach(({ edge, line }) => {
      const material = line.material as THREE.LineBasicMaterial;
      const active = Boolean(nodeId) && highlighted.has(edge.stableKey);
      material.color.set(active ? palette.edgeHighlight : (edge.dimmed ? palette.boundary : palette.edge));
      material.opacity = nodeId ? (active ? 0.95 : 0.22) : (edge.dimmed ? 0.24 : 0.62);
    });
    descriptors.nodes.forEach(({ node, mesh }) => {
      const boundary = node.color === "#8f6b39";
      (mesh.material as THREE.MeshBasicMaterial).opacity = boundary ? 0.34 : (nodeId && node.id !== nodeId ? 0.38 : 0.96);
    });
  };
  const setSelectedEdge = (edgeId: string): void => {
    descriptors.edges.forEach(({ edge, line }) => {
      const material = line.material as THREE.LineBasicMaterial;
      const active = edge.stableKey === edgeId;
      material.color.set(active ? palette.edgeHighlight : (edge.dimmed ? palette.boundary : palette.edge));
      material.opacity = edgeId ? (active ? 1 : 0.28) : (edge.dimmed ? 0.24 : 0.62);
    });
  };
  const resize = (width: number, height: number): void => {
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  return {
    scene,
    camera,
    renderer,
    runtime,
    descriptors,
    resize,
    tick: (iterations = 1) => { runtime.tick(iterations); sync(); },
    hitTest: (normalizedX, normalizedY) => {
      raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), camera);
      const hit = raycaster.intersectObjects([...nodeMeshes, ...edgeLines], true)[0];
      if (!hit) return undefined;
      const object = hit.object;
      if (typeof object.userData.nodeId === "string") return { kind: "node", id: object.userData.nodeId };
      if (typeof object.userData.edgeId === "string") return { kind: "edge", id: object.userData.edgeId };
      return undefined;
    },
    beginDrag: (nodeId) => Boolean(runtime.beginDrag(nodeId)),
    dragNode: (nodeId, normalizedX, normalizedY) => Boolean(runtime.dragTo(
      nodeId,
      normalizedX * 12 * UNIVERSE_LAYOUT_SCALE,
      -normalizedY * 12 * UNIVERSE_LAYOUT_SCALE,
      0,
    ) && (sync(), true)),
    endDrag: (nodeId) => Boolean(runtime.endDrag(nodeId)),
    setHighlight,
    setSelectedEdge,
    setTheme: (nextTheme) => {
      palette = nodeColorForTheme(nextTheme);
      scene.background = new THREE.Color(palette.background);
      (stars.material as THREE.PointsMaterial).color.set(palette.star);
      applyNodePalette(descriptors, palette);
    },
    dispose: () => {
      runtime.stop();
      (stars.material as THREE.PointsMaterial).map?.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      renderer.dispose();
    },
  };
}
