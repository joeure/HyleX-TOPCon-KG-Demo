import { useEffect, useRef, useState, type PointerEvent, type ReactElement } from "react";
import type { SceneEdge, SceneModel } from "./universe-scene-model";
import {
  UNIVERSE_LAYOUT_SCALE,
  UniverseForceRuntime,
  nodeRadius,
  type ForceNode,
} from "./universe-force-runtime";
import { nodeColorForTheme, type UniverseTheme } from "./universe-three-scene";
import { UniverseZoomControl } from "./UniverseZoomControl";

export type Projected2DNode = { id: string; x: number; y: number; radius: number; layerDepth: number };
export type Projected2DEdge = { id: string; from: string; to: string; x1: number; y1: number; x2: number; y2: number };
export type Hit2D = { kind: "node" | "edge"; id: string };

type Props = {
  model: SceneModel;
  runtime?: UniverseForceRuntime;
  entryFocusId?: string;
  selectedId?: string;
  selectedEdgeId?: string;
  layerMode?: boolean;
  onSelect?: (nodeId: string) => void;
  onEdgeSelect?: (edgeId: string) => void;
  onHoverNode?: (nodeId: string) => void;
  onDragNode?: (nodeId: string, dragging: boolean) => void;
  onZoom?: (deltaY: number, pointedNodeId?: string) => boolean | void;
  onDoubleClick?: (nodeId: string) => void;
};

const MIN_FIT_ZOOM_RATIO = 0.4;
const MAX_FIT_ZOOM_RATIO = 12;

export function scaleFromZoomValue(value: number, fitScale: number): number {
  const normalized = Math.max(0, Math.min(100, value)) / 100;
  const ratio = MIN_FIT_ZOOM_RATIO * Math.pow(MAX_FIT_ZOOM_RATIO / MIN_FIT_ZOOM_RATIO, normalized);
  return Math.max(0.001, fitScale) * ratio;
}

export function zoomValueFromScale(scale: number, fitScale: number): number {
  const ratio = Math.max(MIN_FIT_ZOOM_RATIO, Math.min(MAX_FIT_ZOOM_RATIO, scale / Math.max(0.001, fitScale)));
  return Math.log(ratio / MIN_FIT_ZOOM_RATIO) / Math.log(MAX_FIT_ZOOM_RATIO / MIN_FIT_ZOOM_RATIO) * 100;
}

export function nodeRadius2D(degree: number, baseSize = 8): number {
  return Math.min(12, Math.max(3.5, baseSize * 0.68 + Math.min(20, degree) * 0.28));
}

export function layerCoordinate2D(depth: number): number {
  return depth * 72 * UNIVERSE_LAYOUT_SCALE;
}

export function fitRuntime2D(
  runtime: UniverseForceRuntime,
  width: number,
  height: number,
  layerMode: boolean,
): { scale: number; offset: { x: number; y: number } } {
  if (!runtime.nodes.length) return { scale: 1, offset: { x: 0, y: 0 } };
  const activeNodes = runtime.nodes.filter((node) => !node.dimmed);
  // Layer mode is explicitly about comparing hierarchy ranks, so every rank
  // (including dimmed Core context) must remain inside the viewport.
  const fitNodes = layerMode || !activeNodes.length ? runtime.nodes : activeNodes;
  const positions = fitNodes.map((node) => ({
    x: node.x * 2.2,
    y: layerMode ? layerCoordinate2D(node.layerDepth) : node.y * 2.2,
  }));
  const minX = Math.min(...positions.map((position) => position.x));
  const maxX = Math.max(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxY = Math.max(...positions.map((position) => position.y));
  const padding = 56;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(
    1,
    availableWidth / Math.max(1, maxX - minX),
    availableHeight / Math.max(1, maxY - minY),
  );
  return {
    scale,
    offset: {
      x: -((minX + maxX) / 2) * scale,
      y: -((minY + maxY) / 2) * scale,
    },
  };
}

function seededModel(model: SceneModel): SceneModel {
  return {
    ...model,
    nodes: model.nodes.map((node, index) => ({
      ...node,
      x: node.x || ((node.seed % 97) - 48) * 0.38 + (index % 3) * 0.04,
      y: node.y || ((Math.floor(node.seed / 97) % 61) - 30) * 0.3,
    })),
  };
}

function runtimeFor(model: SceneModel, layerMode: boolean): UniverseForceRuntime {
  const runtime = new UniverseForceRuntime(seededModel(model), { dimensions: 2, layerMode });
  runtime.tick(35);
  return runtime;
}

function projectNodes(runtime: UniverseForceRuntime, width: number, height: number, scale: number, offset: { x: number; y: number }, layerMode: boolean): Projected2DNode[] {
  return runtime.nodes.map((node) => ({
    id: node.id,
    x: width / 2 + offset.x + node.x * 2.2 * scale,
    y: height / 2 + offset.y + (layerMode ? layerCoordinate2D(node.layerDepth) : node.y * 2.2) * scale,
    radius: nodeRadius2D(
      node.degree,
      Math.max(5, nodeRadius(node.degree, 4) / 2 * 1.2),
    ),
    layerDepth: node.layerDepth,
  }));
}

export function projectRuntimeNodes2D(model: SceneModel, width: number, height: number, layerMode = false): Projected2DNode[] {
  return projectNodes(runtimeFor(model, layerMode), width, height, 1, { x: 0, y: 0 }, layerMode);
}

function pointToSegmentDistanceSquared(point: { x: number; y: number }, edge: Projected2DEdge): number {
  const vx = edge.x2 - edge.x1;
  const vy = edge.y2 - edge.y1;
  const wx = point.x - edge.x1;
  const wy = point.y - edge.y1;
  const lengthSquared = vx * vx + vy * vy;
  const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared));
  const dx = point.x - (edge.x1 + projection * vx);
  const dy = point.y - (edge.y1 + projection * vy);
  return dx * dx + dy * dy;
}

export function hitTest2D(point: { x: number; y: number }, nodes: Projected2DNode[], edges: Projected2DEdge[]): Hit2D | undefined {
  const node = [...nodes].reverse().find((candidate) => ((candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2) <= candidate.radius ** 2);
  if (node) return { kind: "node", id: node.id };
  const edge = edges.find((candidate) => pointToSegmentDistanceSquared(point, candidate) <= 14 ** 2);
  return edge ? { kind: "edge", id: edge.id } : undefined;
}

export function touchGesture(distance: number, durationMs: number): "tap" | "long-press" | "drag" {
  if (distance >= 12) return "drag";
  return durationMs >= 500 ? "long-press" : "tap";
}

function currentTheme(): UniverseTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function pointerPoint(event: PointerEvent<HTMLElement>, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function drawScene(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, runtime: UniverseForceRuntime, model: SceneModel, width: number, height: number, scale: number, offset: { x: number; y: number }, layerMode: boolean, selectedId: string, hoveredId: string, selectedEdgeId: string, theme: UniverseTheme): { nodes: Projected2DNode[]; edges: Projected2DEdge[] } {
  if (runtime.isActive()) runtime.tick(1);
  const palette = nodeColorForTheme(theme);
  context.clearRect(0, 0, width, height);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = palette.star;
  for (let index = 0; index < 180; index += 1) context.fillRect((index * 83) % width, (index * 47) % height, 1, 1);
  const nodes = projectNodes(runtime, width, height, scale, offset, layerMode);
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const edges: Projected2DEdge[] = model.edges.flatMap((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    return from && to ? [{ id: edge.stableKey, from: edge.from, to: edge.to, x1: from.x, y1: from.y, x2: to.x, y2: to.y }] : [];
  });
  const activeId = hoveredId || selectedId;
  const incident = new Set(edges.filter((edge) => edge.from === activeId || edge.to === activeId).map((edge) => edge.id));
  edges.forEach((edge) => {
    const active = edge.id === selectedEdgeId || (Boolean(activeId) && incident.has(edge.id));
    const source = model.edges.find((item) => item.stableKey === edge.id);
    const boundary = source?.dimmed;
    context.strokeStyle = active ? palette.edgeHighlight : (boundary ? palette.boundary : palette.edge);
    context.globalAlpha = boundary ? 0.24 : (selectedEdgeId || activeId ? (active ? 0.95 : 0.2) : 0.62);
    context.lineWidth = active ? 2 : 1;
    context.beginPath(); context.moveTo(edge.x1, edge.y1); context.lineTo(edge.x2, edge.y2); context.stroke();
  });
  context.globalAlpha = 1;
  nodes.forEach((node) => {
    const active = node.id === selectedId || node.id === hoveredId;
    const source = model.nodes.find((item) => item.id === node.id);
    const boundary = source?.reviewStatus === "core" || source?.color === "#8f6b39";
    context.fillStyle = source?.reviewStatus ? (source.color || palette.node) : (boundary ? palette.boundary : palette.node);
    const excluded = source?.reviewStatus === "excluded";
    context.globalAlpha = excluded ? 0.22 : boundary ? 0.42 : (activeId && !active && !incident.has(node.id) ? 0.38 : 0.96);
    context.beginPath(); context.arc(node.x, node.y, node.radius * (active ? 1.12 : 1), 0, Math.PI * 2); context.fill();
  });
  context.globalAlpha = 1;
  return { nodes, edges };
}

export function UniverseCanvas2D({ model, runtime, entryFocusId, selectedId: selectedIdProp = "", selectedEdgeId: selectedEdgeIdProp = "", layerMode = false, onSelect, onEdgeSelect, onHoverNode, onDragNode, onZoom, onDoubleClick }: Props): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<UniverseForceRuntime | undefined>(undefined);
  const projectedRef = useRef<{ nodes: Projected2DNode[]; edges: Projected2DEdge[] }>({ nodes: [], edges: [] });
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const fitScaleRef = useRef(1);
  const [selectedId, setSelectedId] = useState(selectedIdProp);
  const [hoveredId, setHoveredId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState(selectedEdgeIdProp);
  const [overlayNodes, setOverlayNodes] = useState<Projected2DNode[]>([]);
  const [overlayEdges, setOverlayEdges] = useState<Projected2DEdge[]>([]);
  const [renderVersion, setRenderVersion] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const zoomValue = zoomValueFromScale(scale, fitScaleRef.current);
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number; nodeId?: string; edgeId?: string; startedAt: number; moved: boolean; dragStarted?: boolean } | undefined>(undefined);
  const lastHitRef = useRef<"node" | "edge" | "background">("background");
  const theme = currentTheme();
  useEffect(() => setSelectedId(selectedIdProp), [selectedIdProp]);
  useEffect(() => setSelectedEdgeId(selectedEdgeIdProp), [selectedEdgeIdProp]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setSelectedId(""); setSelectedEdgeId(""); setHoveredId("");
      onSelect?.(""); onEdgeSelect?.(""); onHoverNode?.("");
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onSelect, onEdgeSelect, onHoverNode]);
  useEffect(() => {
    runtimeRef.current?.stop();
    const nextRuntime = runtime ?? runtimeFor(model, layerMode);
    nextRuntime.setDimensions(2, false);
    nextRuntime.setLayerMode(layerMode, false);
    runtimeRef.current = nextRuntime;
    const host = hostRef.current;
    const fit = (): void => {
      if (!host) return;
      const fitted = fitRuntime2D(nextRuntime, host.clientWidth || 800, host.clientHeight || 500, layerMode);
      fitScaleRef.current = fitted.scale;
      const focus = entryFocusId ? nextRuntime.node(entryFocusId) : undefined;
      if (focus) {
        const focusedScale = fitted.scale * 4;
        setScale(focusedScale);
        setOffset({
          x: -focus.x * 2.2 * focusedScale,
          y: -(layerMode ? layerCoordinate2D(focus.layerDepth) : focus.y * 2.2) * focusedScale,
        });
      } else {
        setScale(fitted.scale);
        setOffset(fitted.offset);
      }
    };
    fit();
    const frame = requestAnimationFrame(fit);
    const resizeObserver = host ? new ResizeObserver(fit) : undefined;
    if (host) resizeObserver?.observe(host);
    return () => { cancelAnimationFrame(frame); resizeObserver?.disconnect(); runtimeRef.current?.stop(); };
  }, [entryFocusId, model, layerMode, runtime]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = (): void => {
      const width = host.clientWidth || 800;
      const height = host.clientHeight || 500;
      canvas.width = width; canvas.height = height;
      if (runtimeRef.current) {
        projectedRef.current = drawScene(canvas, context, runtimeRef.current, model, width, height, scale, offset, layerMode, selectedId, hoveredId, selectedEdgeId, theme);
        setOverlayNodes(projectedRef.current.nodes);
        setOverlayEdges(projectedRef.current.edges);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    return () => observer.disconnect();
  }, [model, offset, scale, layerMode, selectedId, hoveredId, selectedEdgeId, theme, renderVersion]);

  const clear = (): void => {
    setSelectedId(""); setSelectedEdgeId(""); setHoveredId("");
    onSelect?.(""); onHoverNode?.("");
  };
  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    const canvas = canvasRef.current;
    const hit = canvas ? hitTest2D(pointerPoint(event, canvas), projectedRef.current.nodes, projectedRef.current.edges) : undefined;
    lastHitRef.current = hit?.kind ?? "background";
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, nodeId: hit?.kind === "node" ? hit.id : undefined, edgeId: hit?.kind === "edge" ? hit.id : undefined, startedAt: performance.now(), moved: false };
    if (hit?.kind === "node") { setSelectedId(hit.id); setHoveredId(hit.id); onHoverNode?.(hit.id); }
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x; const dy = event.clientY - current.y;
    current.x = event.clientX; current.y = event.clientY;
    current.moved = current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 12;
    if (current.nodeId) {
      if (current.moved && !current.dragStarted) {
        runtimeRef.current?.beginDrag(current.nodeId);
        current.dragStarted = true;
        onDragNode?.(current.nodeId, true);
      }
      const canvas = canvasRef.current;
      if (canvas && current.dragStarted) {
        const point = pointerPoint(event, canvas);
        const width = canvas.clientWidth || 800; const height = canvas.clientHeight || 500;
        runtimeRef.current?.dragTo(current.nodeId, (point.x - width / 2 - offset.x) / (2.2 * scale), (point.y - height / 2 - offset.y) / (2.2 * scale));
        setRenderVersion((value) => value + 1);
      }
    } else { setOffset((value) => ({ x: value.x + dx, y: value.y + dy })); }
  };
  const up = (event: PointerEvent<HTMLElement>): void => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.nodeId) {
      if (current.dragStarted) {
        runtimeRef.current?.endDrag(current.nodeId);
        onDragNode?.(current.nodeId, false);
      }
      if (!current.moved && touchGesture(0, performance.now() - current.startedAt) !== "long-press") onSelect?.(current.nodeId);
    }
    else if (current.edgeId && !current.moved) { setSelectedEdgeId(current.edgeId); onEdgeSelect?.(current.edgeId); }
    else if (!current.moved && touchGesture(0, performance.now() - current.startedAt) !== "long-press") clear();
    drag.current = undefined;
  };
  const hover = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current) return;
    const canvas = canvasRef.current;
    const hit = canvas ? hitTest2D(pointerPoint(event, canvas), projectedRef.current.nodes, projectedRef.current.edges) : undefined;
    const nodeId = hit?.kind === "node" ? hit.id : "";
    if (nodeId !== hoveredId) { setHoveredId(nodeId); onHoverNode?.(nodeId); }
  };
  // React wheel listeners are passive, so preventDefault from a synthetic
  // handler cannot stop the browser from scrolling/zooming the page; the
  // scene zoom must run from a native non-passive listener.
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const wheelHandler = (event: globalThis.WheelEvent): void => {
      event.preventDefault();
      if (event.deltaY > 0 && entryFocusId && scaleRef.current > fitScaleRef.current * 1.02) {
        const normalized = Math.min(1.5, Math.max(0.15, Math.abs(event.deltaY) / 100));
        setScale((value) => Math.max(fitScaleRef.current, value * Math.exp(-0.11 * normalized)));
        return;
      }
      const pointed = document.elementFromPoint(event.clientX, event.clientY) ?? event.target;
      const nodeTarget = pointed instanceof HTMLElement ? pointed.closest<HTMLElement>("[data-node-id]") : null;
      const semanticHandled = onZoomRef.current?.(event.deltaY, nodeTarget?.dataset.nodeId);
      if (!semanticHandled) {
        const normalized = Math.min(1.5, Math.max(0.15, Math.abs(event.deltaY) / 100));
        const factor = Math.exp((event.deltaY < 0 ? 0.035 : -0.035) * normalized);
        setScale((value) => Math.max(0.35, Math.min(3, value * factor)));
      }
    };
    // Listen in capture phase on the document: the transparent SVG/canvas hit
    // overlay is recreated while 2D projects, and some browsers retarget a
    // subsequent wheel tick away from the host before bubbling reaches it.
    const capturedWheel = (event: globalThis.WheelEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || (!host.contains(target) && !host.matches(":hover"))) return;
      wheelHandler(event);
    };
    document.addEventListener("wheel", capturedWheel, { capture: true, passive: false });
    return () => document.removeEventListener("wheel", capturedWheel, { capture: true });
  }, [entryFocusId]);
  return <div ref={hostRef} className="universe-canvas-2d" data-render-state="stable" data-2d-scale={scale} data-selected-id={selectedId} data-selected-edge-id={selectedEdgeId} data-hovered-id={hoveredId} data-layer-mode={layerMode} role="application" aria-label="Knowledge Universe 2D scene" tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { setHoveredId(""); onHoverNode?.(""); }} onKeyDown={(event) => { if (event.key === "Escape") { clear(); onEdgeSelect?.(""); } }} onClick={(event) => { if (!(event.target instanceof HTMLElement && event.target.closest("button")) && !drag.current && lastHitRef.current === "background") { clear(); onEdgeSelect?.(""); } lastHitRef.current = "background"; }}>
    <canvas ref={canvasRef} aria-hidden="true" />
    <UniverseZoomControl
      value={zoomValue}
      onChange={(value) => setScale(scaleFromZoomValue(value, fitScaleRef.current))}
      onSemanticStep={onZoom ? (direction) => {
        if (direction === "out" && entryFocusId && scaleRef.current > fitScaleRef.current * 1.02) return;
        onZoom(direction === "in" ? -100 : 100);
      } : undefined}
    />
    <div className="universe-canvas-node-overlay" aria-label="Universe hit targets">
      {overlayEdges.map((edge) => <button key={edge.id} type="button" data-edge-id={edge.id} className="universe-edge-hit" aria-label={`Select edge ${edge.id}`} style={{ left: `${(edge.x1 + edge.x2) / 2}px`, top: `${(edge.y1 + edge.y2) / 2}px` }} onClick={(event) => { event.stopPropagation(); setHoveredId(""); onHoverNode?.(""); setSelectedEdgeId(edge.id); onEdgeSelect?.(edge.id); }} />)}
      {overlayNodes.map((node) => <button key={node.id} type="button" data-node-id={node.id} data-layer-depth={node.layerDepth} data-projected-y={node.y} className={`universe-node-hit ${model.nodes.find((item) => item.id === node.id)?.color === "#8f6b39" ? "is-dimmed" : ""}`} aria-label={`Select ${model.nodes.find((item) => item.id === node.id)?.label ?? node.id}`} style={{ left: `${node.x}px`, top: `${node.y}px`, color: "transparent", background: "transparent" }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); lastHitRef.current = "node"; drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, nodeId: node.id, startedAt: performance.now(), moved: false }; setSelectedId(node.id); setHoveredId(node.id); onHoverNode?.(node.id); }} onPointerEnter={() => { setHoveredId(node.id); onHoverNode?.(node.id); }} onPointerLeave={() => { setHoveredId(""); onHoverNode?.(""); }} onWheel={(event) => { if (!event.defaultPrevented) { event.preventDefault(); onZoom?.(event.deltaY, node.id); } }} onClick={() => setSelectedId(node.id)} onPointerUp={up} onDoubleClick={() => onDoubleClick?.(node.id)} />)}
    </div>
  </div>;
}
