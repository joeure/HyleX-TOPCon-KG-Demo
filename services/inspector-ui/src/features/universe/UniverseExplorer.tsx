import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { UiGatewayClient } from "../../api/ui-gateway";
import type { UniverseView } from "../../domain/universe";
import { UniverseCanvas2D } from "./UniverseCanvas2D";
import { UniverseCanvas3D } from "./UniverseCanvas3D";
import { useUniverseExplorer } from "./useUniverseExplorer";
import { UniverseControls } from "./UniverseControls";
import { UniverseInspector } from "./UniverseInspector";
import { UniverseSearch } from "./UniverseSearch";
import { ONTOLOGY_ZOOM_THRESHOLD, SEMANTIC_ZOOM_OUT_THRESHOLD, resolveZoomTarget } from "./universe-navigation";
import { UniverseForceRuntime } from "./universe-force-runtime";

export function UniverseExplorer({ client, initialView }: { client: UiGatewayClient; initialView?: UniverseView }): ReactElement {
  const explorer = useUniverseExplorer(client, initialView);
  const [renderer, setRenderer] = useState<"3d" | "2d">("3d");
  const [layerMode, setLayerMode] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [returnFocusId, setReturnFocusId] = useState<string>();
  // Browser wheel events can be delivered in one React batch.  Keep the
  // semantic progress independently of render timing so three deliberate
  // wheel-ins over the same Concept always mean the same thing.
  const semanticZoomRef = useRef<{ targetId: string | null; progress: number; expiresAt: number }>({ targetId: null, progress: 0, expiresAt: 0 });
  useEffect(() => { if (!initialView) void explorer.loadOverview(); }, [explorer.loadOverview, initialView]);
  useEffect(() => {
    if (explorer.navigation.stage !== "ontology") semanticZoomRef.current = { targetId: null, progress: 0, expiresAt: 0 };
  }, [explorer.navigation.stage]);
  const currentScene = explorer.scene;
  useEffect(() => {
    if (!currentScene) return undefined;
    setTransitioning(true);
    const timer = window.setTimeout(() => setTransitioning(false), 320);
    return () => window.clearTimeout(timer);
  }, [currentScene?.epoch]);
  const sharedRuntime = useMemo(() => {
    if (!currentScene) return undefined;
    const runtime = new UniverseForceRuntime(currentScene, { dimensions: 3, layerMode });
    runtime.settle();
    return runtime;
  }, [currentScene, layerMode]);
  if (!currentScene) return <section className="universe-explorer" data-render-state="loading"><p>{explorer.loading ? "Loading Knowledge Universe…" : explorer.error || "Universe unavailable"}</p></section>;
  const Canvas = renderer === "3d" ? UniverseCanvas3D : UniverseCanvas2D;
  const hoveredNode = currentScene.nodes.find((node) => node.id === hoveredNodeId) ?? null;
  const selectedEdge = currentScene.edges.find((edge) => edge.stableKey === selectedEdgeId) ?? null;
  const neighborLabels = hoveredNode ? currentScene.edges.flatMap((edge) => edge.from === hoveredNode.id ? [currentScene.nodes.find((node) => node.id === edge.to)?.label ?? edge.to] : edge.to === hoveredNode.id ? [currentScene.nodes.find((node) => node.id === edge.from)?.label ?? edge.from] : []) : [];
  const hoveredIndex = hoveredNode ? currentScene.nodes.findIndex((node) => node.id === hoveredNode.id) : 0;
  const inspectorAnchor = { left: 8 + (Math.max(0, hoveredIndex) % 5) * 18, top: 8 + (Math.floor(Math.max(0, hoveredIndex) / 5) % 4) * 18 };
  const focusNode = currentScene.nodes.find((node) => node.id === explorer.navigation.focusId);
  const stageLabel = explorer.navigation.stage === "ontology"
    ? "Ontology"
    : explorer.navigation.stage === "concept-kg"
      ? `Concept KG${focusNode ? ` · ${focusNode.label}` : ""}`
      : explorer.navigation.stage === "expanded-kg"
        ? `${explorer.navigation.evidence ? "Evidence" : "KG neighborhood"}${focusNode ? ` · ${focusNode.label}` : ""}`
        : "Global KG";
  const handleSemanticZoom = (deltaY: number, pointedNodeId?: string): boolean => {
    if (deltaY < 0) {
      if (explorer.navigation.stage === "ontology") {
        // Rerendering a WebGL overlay can momentarily emit pointer-leave between
        // adjacent wheel events. Keep an explicitly hovered Concept alive only
        // for the same short wheel gesture; background zoom never gets a target.
        const retainedTarget = semanticZoomRef.current.progress > 0
          ? semanticZoomRef.current.targetId
          : semanticZoomRef.current.expiresAt > Date.now()
            ? semanticZoomRef.current.targetId
            : null;
        const target = resolveZoomTarget(currentScene.nodes, pointedNodeId || hoveredNodeId || explorer.selectedId || retainedTarget, { x: 0, y: 0 });
        if (!target) return false;
        // A semantic zoom establishes an explicit focus.  This also keeps the
        // target stable when a 2D re-projection moves its hit target beneath a
        // stationary pointer between consecutive wheel ticks.
        explorer.selectNode(target);
        const previous = semanticZoomRef.current;
        const nextProgress = previous.targetId === target ? previous.progress + 1 : 1;
        semanticZoomRef.current = { targetId: target, progress: nextProgress, expiresAt: Date.now() + 5_000 };
        explorer.zoomInNavigation(false, false, target);
        // In 2D the pointer overlay is rebuilt after a selection. Enter on
        // the first explicit Concept wheel event; 3D keeps its three-tick
        // depth gesture because its camera remains spatially continuous.
        const threshold = renderer === "2d" ? 1 : ONTOLOGY_ZOOM_THRESHOLD;
        if (nextProgress < threshold) return true;
        semanticZoomRef.current = { targetId: null, progress: 0, expiresAt: 0 };
        setHoveredNodeId("");
        void explorer.activateNode(target, false);
        return true;
      } else if (explorer.navigation.stage === "global-kg") {
        explorer.zoomInNavigation(false, false);
        return true;
      } else {
        // A 2D Concept wheel is the entry gesture only. Keep the resulting
        // concept KG stable under the remaining ticks of the same scroll;
        // deeper expansion remains an explicit entity double-click.
        if (renderer === "2d" && explorer.navigation.stage === "concept-kg") return true;
        const focusedEntity = currentScene.nodes.find(
          (node) => node.kind === "entity" && node.id === (hoveredNodeId || explorer.selectedId),
        );
        const hasEntities = currentScene.nodes.some((node) => node.kind === "entity");
        const hasMoreRelations = explorer.navigation.stage === "concept-kg"
          ? hasEntities
          : explorer.navigation.stage === "expanded-kg" && explorer.navigation.depth < 3;
        explorer.zoomInNavigation(hasMoreRelations, true, focusedEntity?.id);
        return true;
      }
    } else {
      if (explorer.navigation.zoomProgress + 1 >= SEMANTIC_ZOOM_OUT_THRESHOLD) {
        // A reverse semantic transition should enter the parent scene through
        // the node that led to the child, then let local zoom reveal the full
        // parent graph. Do not land directly on the parent's fitted overview.
        setReturnFocusId(explorer.navigation.focusId ?? explorer.navigation.conceptId ?? undefined);
      }
      explorer.zoomOutNavigation(0);
      return true;
    }
  };
  return <section className="universe-explorer" data-render-state={explorer.loading ? "loading" : "stable"} data-transition-state={transitioning ? "entering" : "stable"} data-navigation-stage={explorer.navigation.stage} data-navigation-depth={explorer.navigation.depth} data-zoom-progress={explorer.navigation.zoomProgress} data-zoom-direction={explorer.navigation.zoomProgress > 0 ? "out" : "idle"} data-scene-node-count={currentScene.nodes.length} data-concept-node-count={currentScene.nodes.filter((node) => node.kind === "concept").length} data-entity-node-count={currentScene.nodes.filter((node) => node.kind === "entity").length} data-evidence-node-count={currentScene.nodes.filter((node) => node.kind === "evidence").length}>
    <header className="universe-explorer__header"><div><span className="eyebrow">Knowledge Universe</span><h1>Ontology + KG</h1><p>Snapshot {currentScene.snapshotId} · Ontology {currentScene.ontologyVersion}</p><strong className="universe-stage-indicator" aria-live="polite">{stageLabel}</strong></div><div className="universe-explorer__actions">{explorer.navigation.stage !== "ontology" && <button type="button" onClick={() => void explorer.loadOverview()}>Back to Ontology</button>}<button type="button" onClick={() => setRenderer("3d")} aria-pressed={renderer === "3d"}>3D</button><button type="button" onClick={() => setRenderer("2d")} aria-pressed={renderer === "2d"}>2D</button></div></header>
    <UniverseSearch onSearch={explorer.search} onClear={explorer.clearSearch} results={explorer.searchResults} onSelectResult={(nodeId) => explorer.activateNode(nodeId)} /><UniverseControls layerMode={layerMode} onLayerModeChange={setLayerMode} />
    {explorer.error && <p role="alert" className="login-error">{explorer.error}</p>}
    <div className={`universe-explorer__stage ${transitioning ? "is-entering" : ""}`}><Canvas model={currentScene} runtime={sharedRuntime} selectedId={explorer.selectedId} selectedEdgeId={selectedEdgeId} layerMode={layerMode} onSelect={(nodeId) => { if (nodeId) explorer.selectNode(nodeId); else { setSelectedEdgeId(""); setHoveredNodeId(""); explorer.clearSearch(); } }} onDoubleClick={(nodeId) => { setHoveredNodeId(""); explorer.activateNode(nodeId); }} onHoverNode={(nodeId) => {
      setHoveredNodeId(nodeId);
      if (nodeId && currentScene.nodes.some((node) => node.id === nodeId && node.kind === "concept")) {
        const current = semanticZoomRef.current;
        semanticZoomRef.current = { targetId: nodeId, progress: current.targetId === nodeId ? current.progress : 0, expiresAt: Date.now() + 5_000 };
      }
    }} onEdgeSelect={setSelectedEdgeId} onZoom={handleSemanticZoom} {...(returnFocusId ? { entryFocusId: returnFocusId } : {})} {...(renderer === "3d" ? { onFallback: () => setRenderer("2d") } : {})} />{explorer.loading && <div className="universe-transition-status" role="status">Loading related graph…</div>}<UniverseInspector node={hoveredNode} edge={hoveredNode ? null : selectedEdge} neighborLabels={neighborLabels} anchor={inspectorAnchor} onClose={() => { setSelectedEdgeId(""); setHoveredNodeId(""); explorer.setInspector(null); }} /></div>
  </section>;
}
