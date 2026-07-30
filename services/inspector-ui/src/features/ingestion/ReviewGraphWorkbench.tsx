import { useMemo, useState, type ReactElement } from "react";
import type { ReviewGraph } from "../../domain/ingestion";
import { UniverseCanvas2D } from "../universe/UniverseCanvas2D";
import { UniverseControls } from "../universe/UniverseControls";
import { UniverseInspector } from "../universe/UniverseInspector";
import type { SceneModel } from "../universe/universe-scene-model";

const REVIEW_COLORS = {
  core: "#858d9b",
  delta: "#ff625f",
  edited: "#f2ae49",
  conflict: "#dc4fb3",
  excluded: "#6f7683",
} as const;

type ReviewStatus = keyof typeof REVIEW_COLORS;

function reviewStatus(value: unknown): ReviewStatus {
  const status = String(value ?? "delta").toLowerCase();
  if (status in REVIEW_COLORS) return status as ReviewStatus;
  return "delta";
}

/** Adapt a Core review graph without losing hierarchy or review-state semantics. */
export function reviewGraphToSceneModel(graph: ReviewGraph | undefined, sceneId: string): SceneModel {
  const nodes = (graph?.nodes ?? []).map((node, index) => {
    const status = reviewStatus(node.status);
    return {
      id: String(node.id),
      label: String(node.label ?? node.id),
      labelEn: String(node.label ?? node.id),
      layer: "domain" as const,
      x: 0,
      y: 0,
      size: 16,
      count: "",
      description: String(node.definition ?? node.description ?? node.group ?? `Review status: ${status}`),
      color: REVIEW_COLORS[status],
      kind: "concept" as const,
      stableKey: `${sceneId}:node:${node.id}`,
      seed: (index + 1) * 977,
      dimmed: status === "core" || status === "excluded",
      reviewStatus: status,
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (graph?.edges ?? [])
    .filter((edge) => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)))
    .map((edge, index) => {
      const label = String(edge.label ?? "");
      const proposedParent = ["proposed_parent", "parent_of"].includes(label.toLowerCase());
      const status = reviewStatus(edge.status);
      return {
        // Core emits proposed_parent as candidate → parent. The Universe layer
        // runtime expects inheritance as parent → child.
        from: String(proposedParent ? edge.target : edge.source),
        to: String(proposedParent ? edge.source : edge.target),
        kind: (proposedParent || label.toLowerCase().includes("parent") ? "inheritance" : "relation") as "inheritance" | "relation",
        predicate: label,
        description: String(edge.description ?? `Review status: ${status}`),
        sourceChunkId: typeof edge.evidence_chunk_id === "string" ? edge.evidence_chunk_id : undefined,
        stableKey: `${sceneId}:edge:${edge.id ?? index}`,
        snapshotId: sceneId,
        dimmed: status === "core" || status === "excluded",
        reviewStatus: status,
      };
    });
  return { snapshotId: sceneId, ontologyVersion: sceneId, epoch: 0, nodes, edges, seed: 7 };
}

type Props = {
  graph?: ReviewGraph;
  sceneId: string;
  title: string;
};

export function ReviewGraphWorkbench({ graph, sceneId, title }: Props): ReactElement {
  const [layerMode, setLayerMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const scene = useMemo(() => reviewGraphToSceneModel(graph, sceneId), [graph, sceneId]);
  const selectedNode = scene.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = scene.edges.find((edge) => edge.stableKey === selectedEdgeId) ?? null;
  const neighborLabels = selectedNode
    ? scene.edges.flatMap((edge) => edge.from === selectedNode.id
      ? [scene.nodes.find((node) => node.id === edge.to)?.label ?? edge.to]
      : edge.to === selectedNode.id
        ? [scene.nodes.find((node) => node.id === edge.from)?.label ?? edge.from]
        : [])
    : [];
  const count = (status: ReviewStatus): number => scene.nodes.filter((node) => node.reviewStatus === status).length;

  return <section className="review-graph-workbench" data-testid="review-graph-workbench" data-layer-mode={layerMode}>
    <header className="review-graph-workbench__header">
      <div><strong>{title}</strong><span>{scene.nodes.length} nodes · {scene.edges.length} edges</span></div>
      <UniverseControls layerMode={layerMode} onLayerModeChange={setLayerMode} />
    </header>
    <div className="review-graph-legend" aria-label="Review graph legend">
      <span className="core">Core {count("core")}</span>
      <span className="delta">Delta {count("delta")}</span>
      {count("edited") > 0 && <span className="edited">Edited {count("edited")}</span>}
      {count("conflict") > 0 && <span className="conflict">Conflict {count("conflict")}</span>}
      {count("excluded") > 0 && <span className="excluded">Excluded {count("excluded")}</span>}
    </div>
    <div className="review-graph-workbench__canvas">
      <UniverseCanvas2D
        model={scene}
        layerMode={layerMode}
        selectedId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onSelect={(nodeId) => { setSelectedNodeId(nodeId); if (nodeId) setSelectedEdgeId(""); }}
        onEdgeSelect={(edgeId) => { setSelectedEdgeId(edgeId); if (edgeId) setSelectedNodeId(""); }}
      />
      <UniverseInspector
        node={selectedNode}
        edge={selectedNode ? null : selectedEdge}
        neighborLabels={neighborLabels}
        anchor={{ left: 66, top: 8 }}
        onClose={() => { setSelectedNodeId(""); setSelectedEdgeId(""); }}
      />
    </div>
  </section>;
}
