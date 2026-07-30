import type { SceneEdge, SceneModel, SceneNode } from "./universe-scene-model";

// d3-force-3d ships JavaScript without TypeScript declarations. The runtime is
// intentionally hidden behind this typed adapter so renderers never depend on
// the untyped library surface.
// @ts-expect-error d3-force-3d has no published declarations.
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force-3d";

export type ForceDimensions = 2 | 3;

export type ForceNode = SceneNode & {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
  degree: number;
  radius: number;
  layerDepth: number;
};

export type ForceEdge = SceneEdge & { source: string | ForceNode; target: string | ForceNode };

export type ForceRuntimeOptions = {
  dimensions?: ForceDimensions;
  layerMode?: boolean;
  onTick?: (nodes: ForceNode[]) => void;
};

type Simulation = {
  force: (name: string, force?: unknown) => Simulation;
  stop: () => Simulation;
  restart: () => Simulation;
  tick: (iterations?: number) => Simulation;
  alpha: (value?: number) => Simulation;
  alphaTarget: (value?: number) => Simulation;
  numDimensions: (value?: number) => Simulation;
};

export const UNIVERSE_LAYOUT_SCALE = 10;
export const UNIVERSE_NODE_RADIUS_SCALE = 2;
export const UNIVERSE_LAYER_GAP = 26 * UNIVERSE_LAYOUT_SCALE;
const MAX_RADIUS = 7 * UNIVERSE_NODE_RADIUS_SCALE;

function layerDepths(nodes: SceneNode[], edges: SceneEdge[]): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Map<string, string[]>();
  nodes.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      parents.set(node.id, [node.parentId]);
    }
  });
  edges.forEach((edge) => {
    if (edge.kind !== "inheritance" || !byId.has(edge.from) || !byId.has(edge.to)) return;
    const current = parents.get(edge.to) ?? [];
    if (!current.includes(edge.from)) current.push(edge.from);
    parents.set(edge.to, current);
  });
  const memo = new Map<string, number>();
  const visit = (id: string, trail: Set<string>): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (trail.has(id)) return 0;
    const parentIds = parents.get(id) ?? [];
    if (!parentIds.length) {
      memo.set(id, 0);
      return 0;
    }
    const nextTrail = new Set([...trail, id]);
    const value = Math.max(...parentIds.map((parentId) => visit(parentId, nextTrail) + 1));
    memo.set(id, value);
    return value;
  };
  nodes.forEach((node) => visit(node.id, new Set()));
  return memo;
}

function initialCoordinate(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  // Legacy overview data stores canvas positions as percentages (roughly 0–100),
  // while the shared force scene uses a compact world-space range around zero.
  // Normalize only that unmistakable percentage range; synthetic/runtime values
  // already expressed in world units remain unchanged.
  const coordinate = value >= 18 && value <= 100 ? (value - 50) * 0.18 : value;
  return coordinate * UNIVERSE_LAYOUT_SCALE;
}

export function nodeRadius(degree: number, baseSize = 4): number {
  return Math.min(
    MAX_RADIUS,
    Math.max(2.5, baseSize + Math.min(8, degree) * 0.28) * UNIVERSE_NODE_RADIUS_SCALE,
  );
}

export class UniverseForceRuntime {
  readonly nodes: ForceNode[];
  readonly edges: ForceEdge[];
  readonly simulation: Simulation;
  private dimensions: ForceDimensions;
  private layerMode: boolean;
  private readonly layerForce: (alpha: number) => void;

  constructor(model: SceneModel, options: ForceRuntimeOptions = {}) {
    this.dimensions = options.dimensions ?? 3;
    this.layerMode = options.layerMode ?? false;
    const degrees = new Map<string, number>();
    model.edges.forEach((edge) => {
      degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
      degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
    });
    const depths = layerDepths(model.nodes, model.edges);
    this.nodes = model.nodes.map((node, index) => ({
      ...node,
      x: initialCoordinate(node.x, ((index % 7) * 12 - 36) * UNIVERSE_LAYOUT_SCALE),
      y: initialCoordinate(node.y, (Math.floor(index / 7) * 12 - 24) * UNIVERSE_LAYOUT_SCALE),
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      degree: degrees.get(node.id) ?? 0,
      radius: nodeRadius(degrees.get(node.id) ?? 0),
      layerDepth: depths.get(node.id) ?? 0,
    }));
    const nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.edges = model.edges
      .filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to))
      .map((edge) => ({ ...edge, source: edge.from, target: edge.to }));
    this.layerForce = (alpha: number) => {
      for (const node of this.nodes) {
        if (this.layerMode) {
          // Layers must separate along the viewport's vertical axis: in 3D
          // that is world Y (roots on top, deeper inheritance further down),
          // in 2D the projection maps layerDepth to canvas Y directly.
          const target = -node.layerDepth * UNIVERSE_LAYER_GAP;
          if (this.dimensions === 3) {
            node.vy *= 0.45;
            node.vy += (target - node.y) * 0.58 * alpha;
          }
          else node.vy += (target - node.y) * 0.08 * alpha;
        } else if (this.dimensions === 2) {
          node.z = 0;
          node.vz = 0;
        }
      }
    };
    this.simulation = forceSimulation(this.nodes, this.dimensions) as Simulation;
    // Stronger repulsion and longer links than the d3 defaults: a ~150-concept
    // ontology must spread far enough that individual nodes stay separable on
    // screen instead of collapsing into one central cluster.
    this.simulation
      .force("charge", forceManyBody().strength((node: ForceNode) => (-26 - node.degree * 3) * UNIVERSE_LAYOUT_SCALE))
      .force("link", forceLink(this.edges).id((node: ForceNode) => node.id).distance(13 * UNIVERSE_LAYOUT_SCALE).strength(0.45))
      .force("collide", forceCollide((node: ForceNode) => node.radius + 2.2).iterations(3))
      .force("center", forceCenter(0, 0, 0))
      .force("layer", this.layerForce)
      .stop();
    options.onTick?.(this.nodes);
  }

  setDimensions(dimensions: ForceDimensions, reheat = true): void {
    this.dimensions = dimensions;
    this.simulation.numDimensions(dimensions);
    if (dimensions === 2) {
      this.nodes.forEach((node) => {
        node.z = 0;
        node.vz = 0;
      });
    }
    if (reheat) this.reheat();
  }

  setLayerMode(enabled: boolean, reheat = true): void {
    this.layerMode = enabled;
    if (reheat) this.reheat();
  }

  /** Whether the simulation still has energy (or a drag) driving it.
   *
   * d3's collide and center forces apply regardless of alpha, so ticking a
   * "finished" simulation keeps nudging overlapping nodes forever and the
   * overlay hit targets drift out from under the pointer. Render loops must
   * only tick while this is true. */
  isActive(): boolean {
    const simulation = this.simulation as unknown as { alpha: () => number; alphaTarget: () => number };
    return simulation.alpha() > 0.005 || simulation.alphaTarget() > 0;
  }

  tick(iterations = 1): ForceNode[] {
    this.simulation.tick(iterations);
    if (this.dimensions === 2) {
      this.nodes.forEach((node) => {
        node.z = 0;
        node.vz = 0;
      });
    }
    return this.nodes;
  }

  /** Pre-settle the initial layout so hit targets are stable on first paint. */
  settle(iterations = 160): ForceNode[] {
    this.tick(iterations);
    // Zero residual velocities: alpha(0) stops applying forces, but leftover
    // velocity still integrates for dozens of frames and drifts the overlay
    // hit targets out from under the pointer right after load.
    this.nodes.forEach((node) => {
      node.vx = 0;
      node.vy = 0;
      node.vz = 0;
    });
    this.simulation.alpha(0).stop();
    return this.nodes;
  }

  start(): void {
    this.simulation.restart();
  }

  stop(): void {
    this.simulation.stop();
  }

  beginDrag(nodeId: string): ForceNode | undefined {
    const node = this.node(nodeId);
    if (!node) return undefined;
    node.fx = node.x;
    node.fy = node.y;
    node.fz = node.z;
    this.simulation.alphaTarget(0.25).restart();
    return node;
  }

  dragTo(nodeId: string, x: number, y: number, z = 0): ForceNode | undefined {
    const node = this.node(nodeId);
    if (!node) return undefined;
    node.fx = x;
    node.fy = y;
    node.fz = this.dimensions === 3 ? z : 0;
    node.x = x;
    node.y = y;
    node.z = this.dimensions === 3 ? z : 0;
    return node;
  }

  endDrag(nodeId: string): ForceNode | undefined {
    const node = this.node(nodeId);
    if (!node) return undefined;
    node.fx = null;
    node.fy = null;
    node.fz = null;
    this.simulation.alphaTarget(0).restart();
    return node;
  }

  node(nodeId: string): ForceNode | undefined {
    return this.nodes.find((node) => node.id === nodeId);
  }

  private reheat(): void {
    this.simulation.alpha(0.7).restart().stop();
  }
}
