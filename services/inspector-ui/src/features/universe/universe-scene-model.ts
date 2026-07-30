import type { UniverseEdge, UniverseNode, UniverseNodeKind, UniverseView } from "../../domain/universe";

export type SceneNode = UniverseNode & {
  kind: UniverseNodeKind;
  stableKey: string;
  seed: number;
  selected?: boolean;
  locked?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  reviewStatus?: "core" | "delta" | "edited" | "conflict" | "excluded";
  z?: number;
};

export type SceneEdge = UniverseEdge & {
  stableKey: string;
  snapshotId: string;
  dimmed?: boolean;
  reviewStatus?: "core" | "delta" | "edited" | "conflict" | "excluded";
};

export type SceneBundle = {
  id: string;
  snapshotId: string;
  epoch: number;
  nodeIds: string[];
  edgeIds: string[];
  nodes: SceneNode[];
  edges: SceneEdge[];
};

export type SceneModel = {
  snapshotId: string;
  ontologyVersion: string;
  epoch: number;
  nodes: SceneNode[];
  edges: SceneEdge[];
  seed: number;
};

export function stableNodeKey(snapshotId: string, kind: UniverseNodeKind, id: string): string {
  return `${snapshotId}:node:${kind}:${id}`;
}

export function stableEdgeKey(snapshotId: string, edge: Pick<UniverseEdge, "from" | "to" | "kind" | "predicate">): string {
  const edgeId = "id" in edge && typeof edge.id === "string" ? edge.id : `${edge.kind ?? "relation"}:${edge.from}:${edge.to}:${edge.predicate ?? ""}`;
  return `${snapshotId}:edge:${edgeId}`;
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicSeed(snapshotId: string, ontologyVersion: string): number {
  return stableHash(`${snapshotId}|${ontologyVersion}`);
}

function asSceneNode(node: UniverseNode, snapshotId: string, kind: UniverseNodeKind): SceneNode {
  return {
    ...node,
    color: node.color === "#8f6b39" ? node.color : "",
    kind,
    snapshotId,
    stableKey: stableNodeKey(snapshotId, kind, node.id),
    seed: stableHash(`${snapshotId}|${kind}|${node.id}`),
  };
}

function asSceneEdge(edge: UniverseEdge, snapshotId: string): SceneEdge {
  return {
    ...edge,
    snapshotId,
    stableKey: stableEdgeKey(snapshotId, edge),
  };
}

export function createOverviewScene(view: UniverseView, epoch = 0): SceneModel {
  const snapshotId = view.snapshotId;
  const concepts = view.nodes.map((node) => asSceneNode(node, snapshotId, "concept"));
  const conceptIds = new Set(concepts.map((node) => node.id));
  const edges = view.edges
    .filter((edge) => conceptIds.has(edge.from) && conceptIds.has(edge.to))
    .map((edge) => asSceneEdge({ ...edge, kind: edge.kind ?? "inheritance" }, snapshotId));
  return {
    snapshotId,
    ontologyVersion: view.ontologyVersion,
    epoch,
    nodes: concepts,
    edges,
    seed: deterministicSeed(snapshotId, view.ontologyVersion),
  };
}

export function createBundle(
  snapshotId: string,
  epoch: number,
  id: string,
  nodes: UniverseNode[],
  edges: UniverseEdge[],
  kind: UniverseNodeKind = "entity",
): SceneBundle {
  const sceneNodes = nodes.map((node) => asSceneNode(node, snapshotId, node.kind ?? kind));
  const nodeIds = new Set(sceneNodes.map((node) => node.id));
  const sceneEdges = edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => asSceneEdge(edge, snapshotId));
  return {
    id,
    snapshotId,
    epoch,
    nodeIds: sceneNodes.map((node) => node.stableKey),
    edgeIds: sceneEdges.map((edge) => edge.stableKey),
    nodes: sceneNodes,
    edges: sceneEdges,
  };
}
