export type UniverseLayer = "upper" | "domain" | "reference" | "instance" | "evidence";
export type UniverseNodeKind = "concept" | "entity" | "evidence";
export type UniverseNode = {
  id: string; label: string; labelEn: string; layer: UniverseLayer; parentId?: string;
  x: number; y: number; size: number; count: string; description: string; color: string;
  kind?: UniverseNodeKind; snapshotId?: string; aliases?: string[]; sourceDocId?: string;
};
export type UniverseEdge = { id?: string; from: string; to: string; kind?: "inheritance" | "relation" | "evidence"; proposal?: boolean; predicate?: string; description?: string; sourceDocId?: string; sourceChunkId?: string; evidenceId?: string; snapshotId?: string; dimmed?: boolean };
export type UniverseRelationType = { name: string; domain: string[]; range: string[]; requiresEvidence: boolean; description: string };
export type UniverseView = {
  snapshotId: string; ontologyVersion: string; updatedAt: string; nodes: UniverseNode[];
  edges: UniverseEdge[]; proposalCount: number;
  relationTypes?: UniverseRelationType[];
  instances: Record<string, UniverseNode[]>;
  evidence: Record<string, UniverseNode[]>;
  counts?: { entities?: number; relations?: number; approved_entities?: number; approved_relations?: number; [key: string]: unknown };
};

export type UniverseZoom = "overview" | "concept" | "instance" | "evidence";
export type UniverseGraphMode = "concept" | "entity" | "global" | "evidence";
export type UniverseGraphPageRequest = {
  snapshotId: string;
  mode: UniverseGraphMode;
  focusId?: string;
  depth?: number;
  cursor?: string | null;
  pageSize?: number;
};
export type UniverseGraphNode = {
  id: string;
  kind: UniverseNodeKind;
  layer?: UniverseLayer;
  label: string;
  labelEn?: string;
  description?: string;
  dimmed?: boolean;
  entityType?: string;
  ontologyConceptId?: string;
  aliases?: string[];
  sourceDocId?: string;
  sourceChunkId?: string;
  [key: string]: unknown;
};
export type UniverseGraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: "inheritance" | "relation" | "evidence";
  predicate?: string;
  label?: string;
  description?: string;
  dimmed?: boolean;
  sourceDocId?: string;
  sourceChunkId?: string;
  evidenceId?: string;
  [key: string]: unknown;
};
export type UniverseGraphPage = {
  snapshotId: string;
  ontologyVersion: string;
  scope: { mode: UniverseGraphMode; focusId?: string | null; depth: number };
  nodes: UniverseGraphNode[];
  edges: UniverseGraphEdge[];
  page: {
    nextCursor: string | null;
    complete: boolean;
    loadedNodeCount: number;
    loadedEdgeCount: number;
    totalNodeCount: number;
    totalEdgeCount: number;
  };
};
