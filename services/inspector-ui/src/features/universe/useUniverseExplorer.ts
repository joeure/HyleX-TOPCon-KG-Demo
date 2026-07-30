import { useCallback, useRef, useState } from "react";
import type { UniverseGraphEdge, UniverseGraphNode, UniverseGraphPage, UniverseGraphPageRequest, UniverseNode, UniverseView } from "../../domain/universe";
import type { UiGatewayClient } from "../../api/ui-gateway";
import { createBundle, createOverviewScene, deterministicSeed, type SceneModel } from "./universe-scene-model";
import { UniverseWorkingSet } from "./universe-working-set";
import { enterConcept, enterEntity, enterGlobal, initialUniverseNavigation, zoomIn as semanticZoomIn, zoomOut as semanticZoomOut, type UniverseNavigationState } from "./universe-navigation";

export function entityNode(item: Record<string, unknown>, parentId?: string, dimmed = Boolean(item.dimmed)): UniverseNode {
  const fallback = `${parentId ?? "universe"}:${String(item.entity_type ?? item.kind ?? "node")}:${String(item.name ?? item.label ?? item.text ?? "item")}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const id = String(item.entity_id ?? item.id ?? item.relation_id ?? `entity:${fallback || "item"}`);
  const evidence = item.kind === "evidence" || item.layer === "evidence";
  return { id, label: String(item.label ?? item.name ?? item.entity_type ?? id), labelEn: String(item.label_en ?? item.label ?? item.name ?? id), layer: evidence ? "evidence" : "instance", parentId, x: 0, y: 0, size: evidence ? 10 : 14, count: "1", description: String(item.description ?? item.text ?? ""), color: dimmed ? "#8f6b39" : "", kind: evidence ? "evidence" : "entity", aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [], sourceDocId: typeof item.sourceDocId === "string" ? item.sourceDocId : undefined };
}

export type UniverseGraphPageLoader = Pick<UiGatewayClient, "getUniverseGraphPage">;

export type UniverseGraphPageObserver = (page: UniverseGraphPage, accumulated: { nodes: UniverseGraphNode[]; edges: UniverseGraphEdge[] }) => void | Promise<void>;

export async function loadAllUniverseGraphPages(client: UniverseGraphPageLoader, request: UniverseGraphPageRequest, onPage?: UniverseGraphPageObserver): Promise<{ nodes: UniverseGraphNode[]; edges: UniverseGraphEdge[]; snapshotId: string; ontologyVersion: string }> {
  const nodes = new Map<string, UniverseGraphNode>();
  const edges = new Map<string, UniverseGraphEdge>();
  const seenCursors = new Set<string>();
  let cursor: string | null = request.cursor ?? null;
  let snapshotId = request.snapshotId;
  let ontologyVersion = "";
  for (;;) {
    if (cursor && seenCursors.has(cursor)) throw new Error("pagination_cursor_cycle");
    if (cursor) seenCursors.add(cursor);
    const page = await client.getUniverseGraphPage({ ...request, cursor });
    if (page.snapshotId !== request.snapshotId) throw new Error("409 snapshot_context_mismatch");
    snapshotId = page.snapshotId;
    ontologyVersion = page.ontologyVersion;
    page.nodes.forEach((node) => nodes.set(node.id, node));
    page.edges.forEach((edge) => edges.set(edge.id, edge));
    await onPage?.(page, { nodes: [...nodes.values()], edges: [...edges.values()] });
    if (page.page.complete || !page.page.nextCursor) break;
    cursor = page.page.nextCursor;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], snapshotId, ontologyVersion };
}

function emptyGraphScene(view: UniverseView, epoch: number): SceneModel {
  return {
    snapshotId: view.snapshotId,
    ontologyVersion: view.ontologyVersion,
    epoch,
    nodes: [],
    edges: [],
    seed: deterministicSeed(view.snapshotId, view.ontologyVersion),
  };
}

export function buildManualConceptBase(overview: SceneModel, conceptId: string): SceneModel {
  const incidentEdges = overview.edges.filter((edge) => edge.from === conceptId || edge.to === conceptId);
  const contextIds = new Set([
    conceptId,
    ...incidentEdges.flatMap((edge) => [edge.from, edge.to]),
  ]);
  return {
    ...overview,
    nodes: overview.nodes
      .filter((node) => contextIds.has(node.id))
      .map((node) => node.id === conceptId
        ? { ...node, dimmed: false }
        : { ...node, color: "#8f6b39", dimmed: true }),
    edges: incidentEdges.map((edge) => ({ ...edge, dimmed: true })),
  };
}

export function buildAutomaticConceptBase(overview: SceneModel, conceptId: string): SceneModel {
  return {
    ...overview,
    nodes: overview.nodes.filter((node) => node.id === conceptId),
    edges: [],
  };
}

export function buildFocusedEntityBase(scene: SceneModel, entityId: string, epoch: number): SceneModel {
  const focus = scene.nodes.find((node) => node.id === entityId && node.kind === "entity");
  if (!focus) return { ...scene, epoch, nodes: [], edges: [] };
  const concept = focus.parentId
    ? scene.nodes.find((node) => node.id === focus.parentId && node.kind === "concept")
    : undefined;
  const nodes = concept ? [concept, focus] : [focus];
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    ...scene,
    epoch,
    nodes,
    edges: scene.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)),
  };
}

function graphEdge(edge: UniverseGraphEdge, dimmed: boolean): { id?: string; from: string; to: string; kind: UniverseGraphEdge["kind"]; predicate?: string; description?: string; sourceDocId?: string; sourceChunkId?: string; evidenceId?: string; dimmed: boolean } {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    predicate: edge.predicate,
    description: edge.description,
    sourceDocId: edge.sourceDocId,
    sourceChunkId: edge.sourceChunkId,
    evidenceId: edge.evidenceId,
    dimmed,
  };
}

function graphBundle(
  view: UniverseView,
  epoch: number,
  scopeId: string,
  result: { nodes: UniverseGraphNode[]; edges: UniverseGraphEdge[] },
  options: { concept?: UniverseNode; manualBoundary?: boolean } = {},
) {
  const nodes = result.nodes.map((item) => entityNode(item, typeof item.ontologyConceptId === "string" ? item.ontologyConceptId : undefined, Boolean(options.manualBoundary && item.dimmed)));
  const edges = result.edges.map((item) => graphEdge(item, Boolean(options.manualBoundary && item.dimmed)));
  return createBundle(view.snapshotId, epoch, scopeId, options.concept ? [options.concept, ...nodes] : nodes, edges);
}

export function useUniverseExplorer(client: UiGatewayClient, initialView?: UniverseView) {
  const [view, setView] = useState(initialView);
  const [scene, setScene] = useState<SceneModel | null>(initialView ? createOverviewScene(initialView) : null);
  const [loading, setLoading] = useState(!initialView);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [inspector, setInspector] = useState<Record<string, unknown> | null>(null);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; label: string; kind: string }>>([]);
  const [navigation, setNavigation] = useState<UniverseNavigationState>(initialUniverseNavigation);
  const workingSetRef = useRef<UniverseWorkingSet | undefined>(undefined);
  const inFlight = useRef(new Set<string>());
  const sceneRef = useRef<SceneModel | null>(scene);
  const viewRef = useRef<UniverseView | undefined>(view);
  const scopeEpochRef = useRef(0);
  const commitScene = useCallback((next: SceneModel): void => {
    sceneRef.current = next;
    setScene(next);
  }, []);

  const loadOverview = useCallback(async () => {
    const requestEpoch = ++scopeEpochRef.current;
    setLoading(true); setError(""); setSelectedId(""); setInspector(null); setSearchResults([]); setNavigation(initialUniverseNavigation);
    workingSetRef.current = undefined;
    sceneRef.current = null;
    setScene(null);
    try {
      const next = await client.getUniverse();
      if (requestEpoch !== scopeEpochRef.current) return;
      viewRef.current = next;
      setView(next);
      const model = createOverviewScene(next, 1);
      const workingSet = new UniverseWorkingSet("desktop", model);
      workingSetRef.current = workingSet;
      commitScene(model);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "universe_unavailable"); }
    finally { if (requestEpoch === scopeEpochRef.current) setLoading(false); }
  }, [client, commitScene]);

  const loadConcept = useCallback(async (conceptId: string, manualDrill = true, updateNavigation = true) => {
    const currentView = viewRef.current ?? view;
    if (!currentView || inFlight.current.has(`concept:${conceptId}`)) return;
    const requestEpoch = ++scopeEpochRef.current;
    inFlight.current.add(`concept:${conceptId}`); setLoading(true); setError("");
    const overview = createOverviewScene(currentView, (sceneRef.current?.epoch ?? 0) + 1);
    const base = manualDrill
      ? buildManualConceptBase(overview, conceptId)
      : buildAutomaticConceptBase(overview, conceptId);
    const workingSet = new UniverseWorkingSet("desktop", base);
    workingSetRef.current = workingSet;
    let pageIndex = 0;
    try {
      if (updateNavigation) setNavigation((current) => enterConcept(current, conceptId, manualDrill));
      const concept = currentView.nodes.find((node) => node.id === conceptId);
      await loadAllUniverseGraphPages(client, { snapshotId: currentView.snapshotId, mode: "concept", focusId: conceptId, depth: 1, pageSize: 500 }, (_page, { nodes, edges }) => {
        if (requestEpoch !== scopeEpochRef.current) return;
        const bundle = graphBundle(currentView, base.epoch, `concept:${conceptId}:page:${pageIndex++}`, { nodes, edges }, { concept: concept ? { ...concept, kind: "concept" as const } : undefined, manualBoundary: manualDrill });
        workingSet.admit(bundle);
        commitScene({ ...base, nodes: workingSet.nodes, edges: workingSet.edges });
      });
    } catch (cause) {
      if (requestEpoch !== scopeEpochRef.current) return;
      if (cause instanceof Error && cause.message.includes("409")) await loadOverview();
      else setError(cause instanceof Error ? cause.message : "instances_unavailable");
    }
    finally { inFlight.current.delete(`concept:${conceptId}`); if (requestEpoch === scopeEpochRef.current) setLoading(false); }
  }, [client, commitScene, loadOverview, view]);

  const loadEntity = useCallback(async (entityId: string, depth = 1, includeEvidence = false, updateNavigation = true) => {
    const currentView = viewRef.current ?? view;
    const key = `entity:${entityId}:${depth}:${includeEvidence}`;
    if (!currentView || inFlight.current.has(key)) return;
    const requestEpoch = ++scopeEpochRef.current;
    inFlight.current.add(key); setLoading(true); setError("");
    const previousScene = sceneRef.current;
    const base = previousScene
      ? buildFocusedEntityBase(previousScene, entityId, previousScene.epoch + 1)
      : emptyGraphScene(currentView, 1);
    const workingSet = new UniverseWorkingSet("desktop", base);
    workingSetRef.current = workingSet;
    let pageIndex = 0;
    try {
      if (updateNavigation) setNavigation((current) => enterEntity(current, entityId, depth));
      await loadAllUniverseGraphPages(client, { snapshotId: currentView.snapshotId, mode: includeEvidence ? "evidence" : "entity", focusId: entityId, depth, pageSize: 500 }, (_page, { nodes, edges }) => {
        if (requestEpoch !== scopeEpochRef.current) return;
        const bundle = graphBundle(currentView, base.epoch, `${includeEvidence ? "evidence" : "entity"}:${entityId}:${depth}:page:${pageIndex++}`, { nodes, edges });
        workingSet.admit(bundle);
        commitScene({ ...base, nodes: workingSet.nodes, edges: workingSet.edges });
      });
    } catch (cause) {
      if (requestEpoch !== scopeEpochRef.current) return;
      if (cause instanceof Error && cause.message.includes("409")) await loadOverview();
      else setError(cause instanceof Error ? cause.message : "neighborhood_unavailable");
    }
    finally { inFlight.current.delete(key); if (requestEpoch === scopeEpochRef.current) setLoading(false); }
  }, [client, commitScene, loadOverview, view]);

  const loadGlobal = useCallback(async (updateNavigation = true) => {
    const currentView = viewRef.current ?? view;
    if (!currentView || inFlight.current.has("global")) return;
    const requestEpoch = ++scopeEpochRef.current;
    inFlight.current.add("global"); setLoading(true); setError("");
    const base = emptyGraphScene(currentView, (sceneRef.current?.epoch ?? 0) + 1);
    const workingSet = new UniverseWorkingSet("desktop", base);
    workingSetRef.current = workingSet;
    let pageIndex = 0;
    try {
      if (updateNavigation) setNavigation((current) => enterGlobal(current));
      await loadAllUniverseGraphPages(client, { snapshotId: currentView.snapshotId, mode: "global", depth: 1, pageSize: 500 }, (_page, { nodes, edges }) => {
        if (requestEpoch !== scopeEpochRef.current) return;
        const bundle = graphBundle(currentView, base.epoch, `global:page:${pageIndex++}`, { nodes, edges });
        workingSet.admit(bundle);
        commitScene({ ...base, nodes: workingSet.nodes, edges: workingSet.edges });
      });
    } catch (cause) {
      if (requestEpoch !== scopeEpochRef.current) return;
      if (cause instanceof Error && cause.message.includes("409")) await loadOverview();
      else setError(cause instanceof Error ? cause.message : "global_unavailable");
    }
    finally { inFlight.current.delete("global"); if (requestEpoch === scopeEpochRef.current) setLoading(false); }
  }, [client, commitScene, loadOverview, view]);

  const selectNode = useCallback((nodeId: string) => {
    setSelectedId(nodeId);
    const node = sceneRef.current?.nodes.find((item) => item.id === nodeId);
    setInspector(node ? { id: node.id, label: node.label, description: node.description, kind: node.kind } : null);
  }, []);
  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setSelectedId("");
    setInspector(null);
  }, []);
  const search = useCallback(async (query: string) => {
    const currentView = viewRef.current ?? view;
    if (!currentView || !query.trim()) return [];
    const result = await client.searchUniverse({ query: query.trim(), snapshotId: currentView.snapshotId });
    const normalized = result.results.map((item) => ({ id: item.id, label: item.label, kind: item.kind }));
    setSearchResults(normalized);
    if (normalized[0]) {
      const currentScene = sceneRef.current;
      const match = currentScene?.nodes.find((node) => node.id === normalized[0].id);
      if (!match && currentScene) {
        const source = result.results[0];
        const node: UniverseNode = {
          id: source.id,
          label: source.label,
          labelEn: source.label,
          layer: source.kind === "evidence" ? "evidence" : "instance",
          x: 0,
          y: 0,
          size: 16,
          count: "1",
          description: source.description,
          color: "",
          kind: source.kind === "evidence" ? "evidence" : "entity",
          snapshotId: source.snapshotId,
        };
        const sceneNode = createBundle(currentScene.snapshotId, currentScene.epoch, `search:${node.id}`, [node], []).nodes[0];
        commitScene({ ...currentScene, nodes: [...currentScene.nodes, sceneNode] });
        setInspector({ id: sceneNode.id, label: sceneNode.label, description: sceneNode.description, kind: sceneNode.kind });
        setSelectedId(sceneNode.id);
      } else {
        selectNode(normalized[0].id);
      }
    }
    return normalized;
  }, [client, commitScene, selectNode, view]);
  const activateNode = useCallback((nodeId: string, manualDrill = true) => {
    const node = sceneRef.current?.nodes.find((item) => item.id === nodeId);
    if (node?.kind === "concept") {
      if (manualDrill) selectNode(nodeId);
      else { setSelectedId(""); setInspector(null); }
      void loadConcept(nodeId, manualDrill);
    } else {
      selectNode(nodeId);
      if (node?.kind === "entity") void loadEntity(nodeId);
    }
  }, [loadConcept, loadEntity, selectNode]);
  const zoomInNavigation = useCallback((hasMoreRelations: boolean, hasMoreEvidence: boolean, focusId?: string) => {
    const current = navigation;
    const next = semanticZoomIn(current, { hasMoreRelations, hasMoreEvidence }, focusId);
    if (current.stage === "ontology") {
      setNavigation(next);
      return;
    }
    if (next.stage === "expanded-kg" && current.stage === "concept-kg") {
      const candidate = focusId ?? sceneRef.current?.nodes.find((node) => node.kind === "entity" && node.parentId === current.focusId)?.id ?? sceneRef.current?.nodes.find((node) => node.kind === "entity")?.id;
      if (candidate) {
        const focused = { ...next, focusId: candidate };
        setNavigation(focused);
        void loadEntity(candidate, next.depth, next.evidence, false);
      }
      return;
    }
    setNavigation(next);
    if (next.stage === "expanded-kg" && next.focusId && (next.depth !== current.depth || next.evidence !== current.evidence)) {
      void loadEntity(next.focusId, next.depth, next.evidence, false);
    }
  }, [loadEntity, navigation]);
  const zoomOutNavigation = useCallback((panelFraction: number) => {
    const current = navigation;
    const next = semanticZoomOut(current, panelFraction);
    setNavigation(next);
    if (next.stage === "ontology" && current.stage !== "ontology") {
      void loadOverview();
    } else if (next.stage === "global-kg" && current.stage !== "global-kg") {
      void loadGlobal(false);
    } else if (next.stage === "concept-kg" && current.stage === "expanded-kg" && next.focusId) {
      void loadConcept(next.focusId, current.manualDrill, false);
    } else if (next.stage === "expanded-kg" && next.focusId && (next.depth !== current.depth || next.evidence !== current.evidence)) {
      void loadEntity(next.focusId, next.depth, next.evidence, false);
    }
  }, [loadConcept, loadEntity, loadGlobal, loadOverview, navigation]);
  return { view, scene, loading, error, selectedId, inspector, navigation, loadOverview, search, searchResults, clearSearch, selectNode, activateNode, setInspector, zoomInNavigation, zoomOutNavigation };
}
