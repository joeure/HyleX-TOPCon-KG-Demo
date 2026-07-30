export type IngestionDocumentState = {
  document_version_id: string;
  filename: string;
  status: string;
};

export type IngestionBatch = {
  batch_id: string;
  status: string;
  review_revision: number;
  documents: IngestionDocumentState[];
  snapshot_id?: string;
  updated_at?: string;
};

export type ReviewGraphNode = {
  id: string;
  label?: string;
  group?: string;
  status?: string;
  [key: string]: unknown;
};

export type ReviewGraphEdge = {
  id?: string;
  source: string;
  target: string;
  label?: string;
  status?: string;
  [key: string]: unknown;
};

export type ReviewGraph = { nodes: ReviewGraphNode[]; edges: ReviewGraphEdge[] };

export type IngestionReviewDocument = {
  document_version_id: string;
  filename?: string;
  status?: string;
  graph?: ReviewGraph;
  kg_delta?: { entities?: Array<Record<string, unknown>>; relations?: Array<Record<string, unknown>> };
};

export type IngestionReview = {
  review_revision: number;
  ontology: {
    status?: string;
    concepts?: Array<Record<string, unknown>>;
    relations?: Array<Record<string, unknown>>;
    graph?: ReviewGraph;
  };
  documents: IngestionReviewDocument[];
};
