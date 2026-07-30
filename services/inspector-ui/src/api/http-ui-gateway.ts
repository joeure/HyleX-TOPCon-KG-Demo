import type { UniverseGraphPage, UniverseGraphPageRequest, UniverseView } from "../domain/universe";
import type { PortalPreferences } from "../app/preferences";
import type { QueryConversation, QueryOptions, QueryTurn } from "../domain/query";
import type { InspectorCapabilities, UiGatewayClient, UiSession, UniverseSearchResult } from "./ui-gateway";

export function createHttpUiGatewayClient(baseUrl: string): UiGatewayClient {
  let csrfToken = "";
  const ensureCsrf = async () => {
    if (csrfToken) return csrfToken;
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/auth/csrf`, { credentials: "include" });
    if (!response.ok) throw new Error(`ui-gateway ${response.status}: ${await response.text()}`);
    csrfToken = (await response.json() as { csrf_token: string }).csrf_token;
    return csrfToken;
  };
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) };
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRF-Token"] = await ensureCsrf();
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
    if (!response.ok) throw new Error(`ui-gateway ${response.status}: ${await response.text()}`);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  };
  return {
    login: (username, password) => request<UiSession>("/auth/login", { method: "POST", body: JSON.stringify({ username, password, frontend_id: "inspector-ui" }) }),
    register: (inviteCode, username, password) => request<UiSession>("/auth/register", { method: "POST", body: JSON.stringify({ invite_code: inviteCode, username, password, accept_evaluation_terms: true }) }),
    getSession: () => request<UiSession>("/auth/session?frontend_id=inspector-ui"),
    logout: () => request<void>("/auth/logout", { method: "POST" }),
    changePassword: (currentPassword, newPassword) => request<void>("/auth/password", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }),
    getUniverse: () => request<UniverseView>("/inspector/universe"),
    getUniverseGraphPage: (payload) => request<UniverseGraphPage>("/inspector/universe/graph/pages", { method: "POST", body: JSON.stringify({ snapshot_id: payload.snapshotId, mode: payload.mode, focus_id: payload.focusId, depth: payload.depth ?? 1, cursor: payload.cursor ?? null, page_size: payload.pageSize ?? 500 }) }),
    getConceptInstances: (conceptId, snapshotId, offset = 0, limit = 50) => request(`/inspector/universe/concepts/${encodeURIComponent(conceptId)}/instances?snapshot_id=${encodeURIComponent(snapshotId)}&offset=${offset}&limit=${limit}`),
    getNeighborhood: (snapshotId, entityIds) => request("/inspector/universe/neighborhood", { method: "POST", body: JSON.stringify({ snapshot_id: snapshotId, entity_ids: entityIds }) }),
    getUniverseEvidence: (evidenceId, snapshotId) => request(`/inspector/universe/evidence/${encodeURIComponent(evidenceId)}?snapshot_id=${encodeURIComponent(snapshotId)}`),
    searchUniverse: ({ query, snapshotId, limit = 20, conceptIds = [], relationTypes = [] }) => request<{ results: UniverseSearchResult[]; count: number; snapshotId: string }>("/inspector/universe/search", { method: "POST", body: JSON.stringify({ query, snapshot_id: snapshotId, limit, concept_ids: conceptIds, relation_types: relationTypes }) }),
    getPreferences: () => request<PortalPreferences & { revision: number }>("/inspector/preferences"),
    savePreferences: (preferences) => request<PortalPreferences & { revision: number }>("/inspector/preferences", { method: "PATCH", body: JSON.stringify(preferences) }),
    getQueryOptions: () => request<QueryOptions>("/inspector/query/options"),
    getCapabilities: () => request<InspectorCapabilities>("/inspector/capabilities"),
    getProviderSession: () => request("/inspector/provider-session"),
    saveProviderSession: (purpose, profile) => request(`/inspector/provider-session/${purpose}`, { method: "PUT", body: JSON.stringify(profile) }),
    deleteProviderSession: (purpose) => request(`/inspector/provider-session/${purpose}`, { method: "DELETE" }).then(() => undefined),
    createConversation: (title = "") => request<QueryConversation>("/inspector/query/conversations", { method: "POST", body: JSON.stringify({ title }) }),
    listConversations: (includeArchived = false) => request<{ items: QueryConversation[] }>(`/inspector/query/conversations?include_archived=${includeArchived}`).then((value) => value.items),
    getConversation: (conversationId) => request<QueryConversation>(`/inspector/query/conversations/${encodeURIComponent(conversationId)}`),
    sendTurn: (conversationId, turn) => request<Record<string, unknown>>(`/inspector/query/conversations/${encodeURIComponent(conversationId)}/turns`, { method: "POST", body: JSON.stringify(turn) }),
    archiveConversation: (conversationId) => request<void>(`/inspector/query/conversations/${encodeURIComponent(conversationId)}/archive`, { method: "POST" }),
    getEvidence: (evidenceId, snapshotId, conversationId) => request<Record<string, unknown>>(`/inspector/query/evidence/${encodeURIComponent(evidenceId)}?snapshot_id=${encodeURIComponent(snapshotId)}${conversationId ? `&conversation_id=${encodeURIComponent(conversationId)}` : ""}`),
    // Document ingestion routes are least-privilege: the gateway owns the
    // extractor/embedding defaults and reviewer identity; the client only
    // sends the document and the review decisions.
    uploadIngestionDocument: async (file) => {
      const csrf = await ensureCsrf();
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/inspector/ingestion/documents?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-CSRF-Token": csrf },
        body: file,
      });
      if (!response.ok) throw new Error(`ui-gateway ${response.status}: ${await response.text()}`);
      return response.json();
    },
    createIngestionBatch: (documentVersionIds) => request("/inspector/ingestion/batches", { method: "POST", body: JSON.stringify({ document_version_ids: documentVersionIds }) }),
    listIngestionBatches: () => request<{ batches: import("../domain/ingestion").IngestionBatch[] }>("/inspector/ingestion/batches").then((value) => value.batches ?? []),
    getIngestionBatch: (batchId) => request<{ batch: import("../domain/ingestion").IngestionBatch }>(`/inspector/ingestion/batches/${encodeURIComponent(batchId)}`).then((value) => value.batch),
    getIngestionReview: (batchId) => request(`/inspector/ingestion/batches/${encodeURIComponent(batchId)}/review`),
    decideIngestionOntology: (batchId, decision, expectedRevision) => request(`/inspector/ingestion/batches/${encodeURIComponent(batchId)}/ontology-decision`, { method: "POST", body: JSON.stringify({ decision, expected_revision: expectedRevision }) }),
    decideIngestionKg: (batchId, documentVersionId, decision, expectedRevision) => request(`/inspector/ingestion/batches/${encodeURIComponent(batchId)}/documents/${encodeURIComponent(documentVersionId)}/kg-decision`, { method: "POST", body: JSON.stringify({ decision, expected_revision: expectedRevision }) }),
    publishIngestionBatch: (batchId, acknowledgeWarnings) => request(`/inspector/ingestion/batches/${encodeURIComponent(batchId)}/publish`, { method: "POST", body: JSON.stringify({ acknowledge_warnings: acknowledgeWarnings }) }),
  };
}
