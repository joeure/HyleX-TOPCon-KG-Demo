import { fixtureUniverse } from "../fixtures/universe";
import type { UniverseGraphPage, UniverseGraphPageRequest, UniverseView } from "../domain/universe";
import type { PortalPreferences } from "../app/preferences";
import type { QueryConversation, QueryOptions, QueryTurn } from "../domain/query";
import type { IngestionBatch, IngestionReview } from "../domain/ingestion";

export type UiIdentity = { userId: "demo"; role: "inspector_demo" };
export type UiSession = { user?: { user_id: string; role: string; allowed_frontends: string[] }; must_change_password?: boolean };
export type InspectorCapabilities = { universe: { enabled: boolean }; evidence: { enabled: boolean }; ingestion: { enabled: boolean; provider_required_for_extraction?: boolean }; query: { enabled: boolean; provider_required?: boolean; reason?: string } };
export type ProviderSessionProfile = { configured: boolean; provider_type?: string; masked_host?: string; model_label?: string; expires_at?: string };
export type ProviderSessionState = { query: ProviderSessionProfile | null; extraction: ProviderSessionProfile | null };
export type UniverseSearchResult = { id: string; kind: string; label: string; description: string; score?: number; conceptId?: string; predicate?: string; snapshotId: string };

export interface UiGatewayClient {
  login(username: string, password: string): Promise<UiSession>;
  register(inviteCode: string, username: string, password: string): Promise<UiSession>;
  getSession(): Promise<UiSession>;
  logout(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  getUniverse(): Promise<UniverseView>;
  getUniverseGraphPage(payload: UniverseGraphPageRequest): Promise<UniverseGraphPage>;
  getConceptInstances(conceptId: string, snapshotId: string, offset?: number, limit?: number): Promise<{ items: Array<Record<string, unknown>>; total: number }>;
  getNeighborhood(snapshotId: string, entityIds: string[]): Promise<Record<string, unknown>>;
  getUniverseEvidence(evidenceId: string, snapshotId: string): Promise<Record<string, unknown>>;
  searchUniverse(payload: { query: string; snapshotId: string; limit?: number; conceptIds?: string[]; relationTypes?: string[] }): Promise<{ results: UniverseSearchResult[]; count: number; snapshotId: string }>;
  getPreferences(): Promise<PortalPreferences & { revision: number }>;
  savePreferences(preferences: PortalPreferences & { revision: number }): Promise<PortalPreferences & { revision: number }>;
  getQueryOptions(): Promise<QueryOptions>;
  getCapabilities(): Promise<InspectorCapabilities>;
  getProviderSession(): Promise<ProviderSessionState>;
  saveProviderSession(purpose: "query" | "extraction", profile: { provider_type: string; base_url: string; model_id: string; api_key: string }): Promise<ProviderSessionProfile>;
  deleteProviderSession(purpose: "query" | "extraction"): Promise<void>;
  createConversation(title?: string): Promise<QueryConversation>;
  listConversations(includeArchived?: boolean): Promise<QueryConversation[]>;
  getConversation(conversationId: string): Promise<QueryConversation>;
  sendTurn(conversationId: string, turn: QueryTurn): Promise<Record<string, unknown>>;
  archiveConversation(conversationId: string): Promise<void>;
  getEvidence(evidenceId: string, snapshotId: string, conversationId?: string): Promise<Record<string, unknown>>;
  uploadIngestionDocument(file: File): Promise<{ document_version_id: string; filename: string }>;
  createIngestionBatch(documentVersionIds: string[]): Promise<IngestionBatch>;
  listIngestionBatches(): Promise<IngestionBatch[]>;
  getIngestionBatch(batchId: string): Promise<IngestionBatch>;
  getIngestionReview(batchId: string): Promise<IngestionReview>;
  decideIngestionOntology(batchId: string, decision: "approved" | "rejected", expectedRevision: number): Promise<IngestionBatch>;
  decideIngestionKg(batchId: string, documentVersionId: string, decision: "approved" | "rejected", expectedRevision: number): Promise<IngestionBatch>;
  publishIngestionBatch(batchId: string, acknowledgeWarnings: string[]): Promise<{ batch: IngestionBatch; snapshot_id?: string }>;
}

const fixturePreferences = new Map<string, PortalPreferences & { revision: number }>();
const fixtureConversations: QueryConversation[] = [];
let fixtureConversationCounter = 0;
const fixtureEntities = Object.values(fixtureUniverse.instances).flat();
const fixtureEvidence = Object.values(fixtureUniverse.evidence).flat();
const fixtureEntityEdges = [
  { id: "fixture-rel-process", from: "process-coating", to: "process-curing", kind: "relation" as const, predicate: "PART_OF" },
  { id: "fixture-rel-inspection", from: "process-curing", to: "process-inspection", kind: "relation" as const, predicate: "MEASURES" },
  { id: "fixture-rel-material", from: "material-polymer", to: "material-pigment", kind: "relation" as const, predicate: "USES" },
];
const fixtureEntityAdjacency = new Map<string, string[]>();
fixtureEntityEdges.forEach((edge) => {
  fixtureEntityAdjacency.set(edge.from, [...(fixtureEntityAdjacency.get(edge.from) ?? []), edge.to]);
  fixtureEntityAdjacency.set(edge.to, [...(fixtureEntityAdjacency.get(edge.to) ?? []), edge.from]);
});
export const fixtureGateway: UiGatewayClient = {
  async login() { return { user: { user_id: "demo", role: "inspector_demo", allowed_frontends: ["inspector-ui"] } }; },
  async register() { return { user: { user_id: "demo", role: "inspector_demo", allowed_frontends: ["inspector-ui"] } }; },
  async getSession() { return { user: { user_id: "demo", role: "inspector_demo", allowed_frontends: ["inspector-ui"] } }; },
  async logout() {},
  async changePassword() {},
  async getUniverse() { return fixtureUniverse; },
  async getUniverseGraphPage(payload) {
    const pageSize = payload.pageSize ?? 500;
    const offset = payload.cursor ? Math.max(0, Number(payload.cursor) || 0) : 0;
    let selectedIds = new Set<string>();
    if (payload.mode === "concept" && payload.focusId) {
      (fixtureUniverse.instances[payload.focusId.replace(/^concept:/, "")] ?? []).forEach((node) => selectedIds.add(node.id));
    } else if (payload.mode === "entity" || payload.mode === "evidence") {
      const focus = payload.focusId?.replace(/^entity:/, "");
      if (focus && fixtureEntities.some((node) => node.id === focus)) {
        selectedIds.add(focus);
        let frontier = [focus];
        for (let hop = 0; hop < (payload.depth ?? 1); hop += 1) {
          const next = frontier.flatMap((id) => fixtureEntityAdjacency.get(id) ?? []).filter((id) => !selectedIds.has(id));
          next.forEach((id) => selectedIds.add(id));
          frontier = next;
          if (!frontier.length) break;
        }
      }
    } else {
      fixtureEntities.forEach((node) => selectedIds.add(node.id));
    }
    const scopedNodes = fixtureEntities.filter((node) => selectedIds.has(node.id));
    const evidenceNodes = payload.mode === "evidence" ? fixtureEvidence.filter((node) => selectedIds.has(node.parentId ?? "")) : [];
    const allScopedNodes = [...scopedNodes, ...evidenceNodes];
    const nodeIds = new Set(allScopedNodes.map((node) => node.id));
    const scopedEdges = fixtureEntityEdges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
    const evidenceEdges = evidenceNodes.map((node, index) => ({ id: `fixture-evidence-${index}`, from: node.parentId ?? "", to: node.id, kind: "evidence" as const, predicate: "SUPPORTED_BY" }));
    const allEdges = [...scopedEdges, ...evidenceEdges];
    const nodes = allScopedNodes.slice(offset, offset + pageSize).map((node) => ({
      ...node,
      kind: node.layer === "evidence" ? "evidence" as const : "entity" as const,
      dimmed: false,
    }));
    const end = offset + nodes.length;
    return {
      snapshotId: payload.snapshotId,
      ontologyVersion: fixtureUniverse.ontologyVersion,
      scope: { mode: payload.mode, focusId: payload.focusId ?? null, depth: payload.depth ?? 1 },
      nodes,
      edges: allEdges.filter((edge) => nodes.some((node) => node.id === edge.from || node.id === edge.to)),
      page: { nextCursor: end < allScopedNodes.length ? String(end) : null, complete: end >= allScopedNodes.length, loadedNodeCount: end, loadedEdgeCount: allEdges.length, totalNodeCount: allScopedNodes.length, totalEdgeCount: allEdges.length },
    };
  },
  async getConceptInstances() { return { items: [], total: 0 }; },
  async getNeighborhood() { return { nodes: [], edges: [] }; },
  async getUniverseEvidence(evidenceId) { return { evidence_id: evidenceId, excerpt: "Fixture evidence" }; },
  async searchUniverse({ query, snapshotId, limit = 20 }) { const needle = query.toLocaleLowerCase(); const results = fixtureUniverse.nodes.filter((node) => `${node.label} ${node.labelEn}`.toLocaleLowerCase().includes(needle)).slice(0, limit).map((node) => ({ id: node.id, kind: "concept", label: node.label, description: node.description, snapshotId })); if (!results.length) results.push({ id: `search:${query}`, kind: "entity", label: query, description: "Search result", snapshotId }); return { snapshotId, results, count: results.length }; },
  async getPreferences() { return fixturePreferences.get("demo") ?? { revision: 0, mode: "universe", locale: "zh-CN", theme: "dark" }; },
  async savePreferences(value) { const next = { ...value, revision: value.revision + 1 }; fixturePreferences.set("demo", next); return next; },
  async getQueryOptions() { return { provider_sets: [{ provider_set_id: "fixture", label: "Fixture", execution_mode: "deterministic" }], snapshot: { snapshot_id: fixtureUniverse.snapshotId, ontology_version: fixtureUniverse.ontologyVersion } }; },
  async getCapabilities() { return { universe: { enabled: true }, evidence: { enabled: true }, ingestion: { enabled: true }, query: { enabled: true } }; },
  async getProviderSession() { return { query: null, extraction: null }; },
  async saveProviderSession() { return { configured: true }; },
  async deleteProviderSession() {},
  async createConversation(title = "New conversation") { const value: QueryConversation = { conversation_id: `fixture-${Date.now()}-${fixtureConversationCounter++}`, snapshot_id: fixtureUniverse.snapshotId, title, status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), upstream: { messages: [], runs: [] } }; fixtureConversations.unshift(value); return value; },
  async listConversations() { return fixtureConversations; },
  async getConversation(conversationId) { const value = fixtureConversations.find((item) => item.conversation_id === conversationId); if (!value) throw new Error("conversation_not_found"); return value; },
  async sendTurn(conversationId, turn) { const value = fixtureConversations.find((item) => item.conversation_id === conversationId); if (!value) throw new Error("conversation_not_found"); const messages = value.upstream?.messages ?? []; messages.push({ role: "user", content: turn.question }, { role: "assistant", content: "Fixture response" }); value.upstream = { ...value.upstream, messages }; return { answer: "Fixture response", conversation_id: conversationId, snapshot_id: value.snapshot_id }; },
  async archiveConversation(conversationId) { const value = fixtureConversations.find((item) => item.conversation_id === conversationId); if (value) value.status = "archived"; },
  async getEvidence(evidenceId) { return { evidence_id: evidenceId, excerpt: "Fixture evidence" }; },
  async uploadIngestionDocument(file) {
    return { document_version_id: `docver-fixture-${++fixtureIngestionCounter}`, filename: file.name };
  },
  async createIngestionBatch(documentVersionIds) {
    const batch: FixtureIngestionState = {
      polls: 0,
      batch: {
        batch_id: `batch-fixture-${++fixtureIngestionCounter}`,
        status: "running",
        review_revision: 0,
        documents: documentVersionIds.map((id, index) => ({ document_version_id: id, filename: `document-${index + 1}.pdf`, status: "running" })),
      },
    };
    fixtureIngestionBatches.set(batch.batch.batch_id, batch);
    return structuredClone(batch.batch);
  },
  async listIngestionBatches() {
    return [...fixtureIngestionBatches.values()].map((item) => structuredClone(item.batch));
  },
  async getIngestionBatch(batchId) {
    const state = fixtureIngestionBatches.get(batchId);
    if (!state) throw new Error("ingestion_batch_not_found");
    // Deterministic progress: the second poll completes extraction.
    state.polls += 1;
    if (state.batch.status === "running" && state.polls >= 2) {
      state.batch.status = "awaiting_ontology_review";
      state.batch.documents.forEach((document) => { document.status = "awaiting_kg_review"; });
    }
    return structuredClone(state.batch);
  },
  async getIngestionReview(batchId) {
    const state = fixtureIngestionBatches.get(batchId);
    if (!state) throw new Error("ingestion_batch_not_found");
    return {
      review_revision: state.batch.review_revision,
      ontology: {
        status: state.batch.status === "awaiting_ontology_review" ? "pending" : "approved",
        concepts: [{ candidate_id: "novel-binder", preferred_label: "NovelBinder", definition: "Fixture proposal" }],
        relations: [],
        graph: {
          nodes: [
            { id: "concept:Material", label: "Material", status: "core" },
            { id: "novel-binder", label: "NovelBinder", status: "delta" },
          ],
          edges: [{ id: "delta-parent", source: "novel-binder", target: "concept:Material", label: "PARENT_OF", status: "delta" }],
        },
      },
      documents: state.batch.documents.map((document) => ({
        document_version_id: document.document_version_id,
        filename: document.filename,
        status: document.status,
        graph: {
          nodes: [
            { id: "entity-proc", label: "Coating Process", status: "delta" },
            { id: "entity-mat", label: "Coating Material", status: "delta" },
          ],
          edges: [{ id: "rel-uses", source: "entity-proc", target: "entity-mat", label: "USES_MATERIAL", status: "delta" }],
        },
        kg_delta: { entities: [{ entity_id: "entity-proc" }, { entity_id: "entity-mat" }], relations: [{ relation_id: "rel-uses" }] },
      })),
    };
  },
  async decideIngestionOntology(batchId, decision, expectedRevision) {
    const state = fixtureIngestionBatches.get(batchId);
    if (!state) throw new Error("ingestion_batch_not_found");
    if (expectedRevision !== state.batch.review_revision) throw new Error("409 review_revision_conflict");
    state.batch.review_revision += 1;
    state.batch.status = decision === "approved" ? "awaiting_kg_review" : "ontology_rejected";
    return structuredClone(state.batch);
  },
  async decideIngestionKg(batchId, documentVersionId, decision, expectedRevision) {
    const state = fixtureIngestionBatches.get(batchId);
    if (!state) throw new Error("ingestion_batch_not_found");
    if (expectedRevision !== state.batch.review_revision) throw new Error("409 review_revision_conflict");
    state.batch.review_revision += 1;
    const document = state.batch.documents.find((item) => item.document_version_id === documentVersionId);
    if (document) document.status = decision === "approved" ? "approved" : "rejected";
    if (state.batch.documents.every((item) => item.status === "approved" || item.status === "rejected")) {
      state.batch.status = "ready_to_publish";
    }
    return structuredClone(state.batch);
  },
  async publishIngestionBatch(batchId) {
    const state = fixtureIngestionBatches.get(batchId);
    if (!state) throw new Error("ingestion_batch_not_found");
    state.batch.status = "published";
    state.batch.snapshot_id = `kg_snapshot_fixture_${batchId}`;
    return { batch: structuredClone(state.batch), snapshot_id: state.batch.snapshot_id };
  },
};

type FixtureIngestionState = { polls: number; batch: IngestionBatch };
const fixtureIngestionBatches = new Map<string, FixtureIngestionState>();
let fixtureIngestionCounter = 0;

export const fixtureIdentity: UiIdentity = { userId: "demo", role: "inspector_demo" };
