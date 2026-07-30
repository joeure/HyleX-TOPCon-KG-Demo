import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement } from "react";
import * as THREE from "three";
import type { SceneModel } from "./universe-scene-model";
import { cameraPoseForNodes, createThreeScene, type UniverseTheme, zoomDistance } from "./universe-three-scene";
import type { UniverseForceRuntime } from "./universe-force-runtime";
import { UNIVERSE_LAYOUT_SCALE } from "./universe-force-runtime";
import { prefersReducedMotion } from "./universe-webgl-capability";
import { UniverseZoomControl } from "./UniverseZoomControl";

type Props = {
  model: SceneModel;
  entryFocusId?: string;
  selectedId?: string;
  selectedEdgeId?: string;
  layerMode?: boolean;
  onSelect?: (nodeId: string) => void;
  onEdgeSelect?: (edgeId: string) => void;
  onHoverNode?: (nodeId: string) => void;
  onDragNode?: (nodeId: string, dragging: boolean) => void;
  onZoom?: (deltaY: number, pointedNodeId?: string) => void;
  onDoubleClick?: (nodeId: string) => void;
  onFallback?: () => void;
  runtime?: UniverseForceRuntime;
};

type CameraState = { position: string; target: string; revision: number };

export function shouldActivateNode(moved: boolean, durationMs: number): boolean {
  return !moved && durationMs < 500;
}

function vectorText(vector: THREE.Vector3): string {
  return `${vector.x.toFixed(2)},${vector.y.toFixed(2)},${vector.z.toFixed(2)}`;
}

function currentTheme(): UniverseTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function pointerNdc(event: PointerEvent<HTMLElement>, canvas: HTMLCanvasElement): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
  );
}

export function UniverseCanvas3D({ model, entryFocusId, selectedId: selectedIdProp = "", selectedEdgeId: selectedEdgeIdProp = "", layerMode = false, onSelect, onEdgeSelect, onHoverNode, onDragNode, onZoom, onDoubleClick, onFallback, runtime }: Props): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderState, setRenderState] = useState<"loading" | "stable" | "fallback">("loading");
  const [theme, setTheme] = useState<UniverseTheme>(currentTheme);
  const [cameraState, setCameraState] = useState<CameraState>({ position: "0,2,48", target: "0,0,0", revision: 0 });
  const [selectedId, setSelectedId] = useState<string>(selectedIdProp);
  const [hoveredId, setHoveredId] = useState<string>("");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>(selectedEdgeIdProp);
  const [nodePositions, setNodePositions] = useState<Record<string, { left: number; top: number }>>({});
  const [lockedId, setLockedId] = useState<string>("");
  const handleRef = useRef<ReturnType<typeof createThreeScene> | undefined>(undefined);
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const returnFitDistanceRef = useRef<number | undefined>(undefined);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; button: number; nodeId?: string; edgeId?: string; moved: boolean; dragStarted?: boolean; startedAt: number } | undefined>(undefined);
  const lastHitRef = useRef<"node" | "edge" | "background">("background");
  // Rotation is opt-in. Orbit drags may retain only a small, quickly decaying
  // amount of inertia; an idle scene remains still.
  const spinRef = useRef({ velocity: 0, decay: 1 });
  const orbitVelocityRef = useRef(0);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  // The parent recreates callback props on every render; keeping them out of
  // the scene effect's dependencies prevents a full three.js scene rebuild
  // (and overlay reprojection) on unrelated re-renders such as hover state.
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;
  const [spinning, setSpinning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomValue, setZoomValue] = useState(50);
  useEffect(() => setSelectedId(selectedIdProp), [selectedIdProp]);
  useEffect(() => setSelectedEdgeId(selectedEdgeIdProp), [selectedEdgeIdProp]);
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      clearSelection();
      setSelectedEdgeId("");
      onEdgeSelect?.("");
      onHoverNode?.("");
      handleRef.current?.setSelectedEdge("");
      setHoveredId("");
      setLockedId("");
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onEdgeSelect, onHoverNode]);
  const clearSelection = (): void => {
    setSelectedId("");
    onSelect?.("");
  };
  const highlightedIds = useMemo(() => {
    const activeId = hoveredId || selectedId;
    if (!activeId) return new Set<string>();
    const ids = new Set([activeId]);
    model.edges.forEach((edge) => {
      if (edge.from === activeId) ids.add(edge.to);
      if (edge.to === activeId) ids.add(edge.from);
    });
    return ids;
  }, [model.edges, hoveredId, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;
    let handle: ReturnType<typeof createThreeScene> | undefined;
    let frame = 0;
    try {
      handle = createThreeScene(canvas, model, { theme: currentTheme(), dimensions: 3, layerMode, runtime });
      handleRef.current = handle;
      const activeNodes = handle.runtime.nodes.filter((node) => !node.dimmed);
      const fittedPose = cameraPoseForNodes(activeNodes.length ? activeNodes : handle.runtime.nodes, layerMode);
      const entryNode = entryFocusId ? handle.runtime.node(entryFocusId) : undefined;
      if (entryNode) {
        const focus = new THREE.Vector3(entryNode.x, entryNode.y, entryNode.z);
        const fittedDistance = fittedPose.position.distanceTo(fittedPose.target);
        targetRef.current.copy(focus);
        handle.camera.position.copy(focus).add(new THREE.Vector3(0, 1.5, Math.max(12, fittedDistance / 3)));
        handle.camera.lookAt(targetRef.current);
        returnFitDistanceRef.current = fittedDistance;
      } else {
        targetRef.current.copy(fittedPose.target);
        returnFitDistanceRef.current = undefined;
      }
      const initialCameraPosition = vectorText(handle.camera.position);
      const initialCameraTarget = vectorText(targetRef.current);
      setCameraState((current) => ({
        position: initialCameraPosition,
        target: initialCameraTarget,
        revision: current.revision,
      }));
      const contextLost = (event: Event): void => {
        event.preventDefault();
        setRenderState("fallback");
        onFallbackRef.current?.();
      };
      canvas.addEventListener("webglcontextlost", contextLost);
      const resize = (): void => handle?.resize(host.clientWidth, host.clientHeight);
      resize();
      const updateNodePositions = (): void => {
        if (!handle) return;
        const activeHandle = handle;
        const next: Record<string, { left: number; top: number }> = {};
        activeHandle.runtime.nodes.forEach((node) => {
          const projected = new THREE.Vector3(node.x, node.y, node.z).project(activeHandle.camera);
          next[node.id] = {
            left: Math.min(98, Math.max(2, ((projected.x + 1) / 2) * 100)),
            top: Math.min(98, Math.max(2, ((1 - projected.y) / 2) * 100)),
          };
        });
        setNodePositions(next);
      };
      let frameCount = 0;
      const draw = (): void => {
        if (!handle) return;
        if (handle.runtime.isActive()) handle.tick(1);
        const spin = spinRef.current;
        if (!dragRef.current && Math.abs(spin.velocity) > 0.00005) {
          const offset = handle.camera.position.clone().sub(targetRef.current);
          const spherical = new THREE.Spherical().setFromVector3(offset);
          spherical.theta += spin.velocity;
          handle.camera.position.copy(targetRef.current).add(new THREE.Vector3().setFromSpherical(spherical));
          handle.camera.lookAt(targetRef.current);
          spin.velocity *= spin.decay;
          if (Math.abs(spin.velocity) <= 0.00005) spin.velocity = 0;
          if (frameCount % 10 === 0) publishCamera();
        }
        frameCount += 1;
        updateNodePositions();
        handle.renderer.render(handle.scene, handle.camera);
        frame = requestAnimationFrame(draw);
      };
      draw();
      setRenderState("stable");
      let resizeFrame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(resize);
      });
      observer.observe(host);
      const themeObserver = new MutationObserver(() => {
        const nextTheme = currentTheme();
        setTheme(nextTheme);
        handle?.setTheme(nextTheme);
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => {
        observer.disconnect();
        themeObserver.disconnect();
        cancelAnimationFrame(resizeFrame);
        cancelAnimationFrame(frame);
        canvas.removeEventListener("webglcontextlost", contextLost);
        handle?.dispose();
        handleRef.current = undefined;
      };
    } catch {
      setRenderState("fallback");
      onFallbackRef.current?.();
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = currentTheme() === "light" ? "#f4f7fb" : "#060b19";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = currentTheme() === "light" ? "#17263d" : "#8bb8ff";
        for (let index = 0; index < 80; index += 1) {
          const x = (index * 83) % Math.max(canvas.width, 1);
          const y = (index * 47) % Math.max(canvas.height, 1);
          context.fillRect(x, y, 1, 1);
        }
      }
      return undefined;
    }
  }, [entryFocusId, model, layerMode, runtime]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setHighlight(hoveredId || selectedId);
  }, [hoveredId, selectedId]);

  useEffect(() => { handleRef.current?.setSelectedEdge(selectedEdgeId); }, [selectedEdgeId]);

  const select = (nodeId: string, activate = true): void => {
    if (selectedId === nodeId) setLockedId(nodeId);
    setSelectedId(nodeId);
    if (activate) onSelect?.(nodeId);
  };

  const hoverNode = (nodeId: string): void => {
    setHoveredId(nodeId);
    onHoverNode?.(nodeId);
  };

  const hitAt = (event: PointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    const handle = handleRef.current;
    if (!canvas || !handle) return undefined;
    const ndc = pointerNdc(event, canvas);
    return { ndc, hit: handle.hitTest(ndc.x, ndc.y) };
  };

  const publishCamera = (): void => {
    const handle = handleRef.current;
    if (!handle) return;
    setCameraState((current) => ({
      position: vectorText(handle.camera.position),
      target: vectorText(targetRef.current),
      revision: current.revision + 1,
    }));
  };

  const stopSpin = (): void => {
    spinRef.current = { velocity: 0, decay: 1 };
    setSpinning(false);
  };

  const applyZoomValue = (value: number): void => {
    const handle = handleRef.current;
    if (!handle) return;
    const bounded = Math.max(0, Math.min(100, value));
    const minDistance = 5;
    const maxDistance = 120 * UNIVERSE_LAYOUT_SCALE;
    const distance = maxDistance * (minDistance / maxDistance) ** (bounded / 100);
    const offset = handle.camera.position.clone().sub(targetRef.current);
    const direction = offset.lengthSq() > 0 ? offset.normalize() : new THREE.Vector3(0, 0, 1);
    handle.camera.position.copy(targetRef.current).add(direction.multiplyScalar(distance));
    handle.camera.lookAt(targetRef.current);
    setZoomValue(bounded);
    stopSpin();
    publishCamera();
  };

  // React attaches wheel listeners passively, so a synthetic onWheel cannot
  // preventDefault and the browser zooms/scrolls the whole page instead of the
  // scene. The zoom must run from a native non-passive listener.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const wheelHandler = (event: globalThis.WheelEvent): void => {
      event.preventDefault();
      const handle = handleRef.current;
      if (!handle) return;
      const offset = handle.camera.position.clone().sub(targetRef.current);
      const returnFitDistance = returnFitDistanceRef.current;
      const normalized = Math.min(1.5, Math.max(0.15, Math.abs(event.deltaY) / 100));
      const nextDistance = event.deltaY > 0 && returnFitDistance !== undefined && offset.length() < returnFitDistance
        ? Math.min(returnFitDistance, offset.length() * Math.exp(0.11 * normalized))
        : zoomDistance(offset.length(), event.deltaY);
      handle.camera.position.copy(targetRef.current).add(offset.normalize().multiplyScalar(nextDistance));
      handle.camera.lookAt(targetRef.current);
      const minDistance = 5;
      const maxDistance = 120 * UNIVERSE_LAYOUT_SCALE;
      setZoomValue(100 * Math.log(maxDistance / nextDistance) / Math.log(maxDistance / minDistance));
      stopSpin();
      const pointed = document.elementFromPoint(event.clientX, event.clientY) ?? event.target;
      const nodeTarget = pointed instanceof HTMLElement ? pointed.closest<HTMLElement>("[data-node-id]") : null;
      if (!(event.deltaY > 0 && returnFitDistance !== undefined && nextDistance < returnFitDistance * 0.98)) {
        onZoomRef.current?.(event.deltaY, nodeTarget?.dataset.nodeId);
      }
      publishCamera();
    };
    host.addEventListener("wheel", wheelHandler, { passive: false });
    return () => host.removeEventListener("wheel", wheelHandler);
    // publishCamera and refs are stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLElement>): void => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    const result = hitAt(event);
    lastHitRef.current = result?.hit?.kind ?? "background";
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, button: event.button, moved: false, startedAt: performance.now(), nodeId: result?.hit?.kind === "node" ? result.hit.id : undefined, edgeId: result?.hit?.kind === "edge" ? result.hit.id : undefined };
    if (result?.hit?.kind === "node") {
      select(result.hit.id, false);
      hoverNode(result.hit.id);
    }
    orbitVelocityRef.current = 0;
    stopSpin();
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    const handle = handleRef.current;
    if (!drag || !handle || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    if (drag.nodeId && drag.button === 0) {
      drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 2;
      if (drag.moved && !drag.dragStarted) {
        handle.beginDrag(drag.nodeId);
        drag.dragStarted = true;
        onDragNode?.(drag.nodeId, true);
      }
      const result = hitAt(event);
      if (drag.dragStarted && result) handle.dragNode(drag.nodeId, result.ndc.x, result.ndc.y);
      return;
    }
    if (drag.button === 0 && !event.shiftKey) {
      const offset = handle.camera.position.clone().sub(targetRef.current);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.16, Math.min(Math.PI - 0.16, spherical.phi - dy * 0.008));
      handle.camera.position.copy(targetRef.current).add(new THREE.Vector3().setFromSpherical(spherical));
      drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 2;
      orbitVelocityRef.current = -dx * 0.008;
    } else {
      const distance = handle.camera.position.distanceTo(targetRef.current);
      const pan = new THREE.Vector3(-dx * distance * 0.0015, dy * distance * 0.0015, 0);
      pan.applyQuaternion(handle.camera.quaternion);
      targetRef.current.add(pan);
      handle.camera.position.add(pan);
    }
    handle.camera.lookAt(targetRef.current);
    publishCamera();
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const handle = handleRef.current;
    if (drag.nodeId && handle) {
      if (drag.dragStarted) {
        handle.endDrag(drag.nodeId);
        onDragNode?.(drag.nodeId, false);
      }
      if (shouldActivateNode(drag.moved, performance.now() - drag.startedAt)) onSelect?.(drag.nodeId);
    } else if (drag.edgeId && !drag.moved) {
      setSelectedEdgeId(drag.edgeId);
      handle?.setSelectedEdge(drag.edgeId);
      onEdgeSelect?.(drag.edgeId);
    } else if (!drag.moved && !drag.edgeId) {
      setSelectedEdgeId("");
      handle?.setSelectedEdge("");
      clearSelection();
      setHoveredId("");
      onHoverNode?.("");
    } else if (drag.moved && !drag.edgeId) {
      // An orbit drag hands its release velocity over as decaying inertia.
      const velocity = Math.max(-0.015, Math.min(0.015, orbitVelocityRef.current));
      if (Math.abs(velocity) > 0.0008) spinRef.current = { velocity, decay: 0.95 };
    }
    dragRef.current = undefined;
  };

  const resetCamera = (): void => {
    const handle = handleRef.current;
    if (!handle) return;
    const pose = cameraPoseForNodes(handle.runtime.nodes, layerMode);
    targetRef.current.copy(pose.target);
    handle.camera.position.copy(pose.position);
    handle.camera.far = Math.max(200, pose.position.distanceTo(pose.target) * 4);
    handle.camera.updateProjectionMatrix();
    handle.camera.lookAt(targetRef.current);
    stopSpin();
    publishCamera();
  };

  const fitSelection = (): void => {
    const handle = handleRef.current;
    const node = handle?.runtime.nodes.find((item) => item.id === selectedId);
    if (!handle || !node) return;
    const focus = new THREE.Vector3(node.x, node.y, node.z);
    targetRef.current.copy(focus);
    handle.camera.position.copy(focus).add(new THREE.Vector3(0, 1.5, 12));
    handle.camera.lookAt(targetRef.current);
    publishCamera();
  };

  useEffect(() => {
    const listener = (): void => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);

  return (
    <div
      ref={hostRef}
      className="universe-canvas-3d"
      data-render-state={renderState}
      data-theme={theme}
      data-layer-mode={layerMode}
      data-camera-position={cameraState.position}
      data-camera-target={cameraState.target}
      data-camera-revision={cameraState.revision}
      data-selected-id={selectedId}
      data-selected-edge-id={selectedEdgeId}
      data-locked-id={lockedId}
      data-hovered-id={hoveredId}
      role="application"
      aria-label="Knowledge Universe 3D scene"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          clearSelection();
          setSelectedEdgeId("");
          onEdgeSelect?.("");
          handleRef.current?.setSelectedEdge("");
          setLockedId("");
        }
      }}
      onPointerLeave={() => { setHoveredId(""); onHoverNode?.(""); handleRef.current?.setHighlight(selectedId); }}
      onClick={(event) => {
        if (!(event.target instanceof HTMLElement && event.target.closest("button")) && !dragRef.current && lastHitRef.current === "background") {
          clearSelection();
          setSelectedEdgeId("");
          onEdgeSelect?.("");
          handleRef.current?.setSelectedEdge("");
        }
        lastHitRef.current = "background";
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <UniverseZoomControl
        value={zoomValue}
        onChange={applyZoomValue}
        onSemanticStep={(direction) => {
          const handle = handleRef.current;
          const returnFitDistance = returnFitDistanceRef.current;
          const distance = handle ? handle.camera.position.distanceTo(targetRef.current) : 0;
          if (direction === "out" && returnFitDistance !== undefined && distance < returnFitDistance * 0.98) return;
          onZoomRef.current?.(direction === "in" ? -100 : 100);
        }}
      />
      <div className="universe-camera-controls" aria-label="Camera controls">
        <button type="button" data-action="fit-selection" onClick={fitSelection}>Fit</button>
        <button type="button" data-action="reset-camera" onClick={resetCamera}>Reset</button>
        <button type="button" data-action="auto-rotate" aria-pressed={spinning} disabled={prefersReducedMotion()} onClick={() => {
          if (spinning) { spinRef.current = { velocity: spinRef.current.velocity, decay: 0.92 }; setSpinning(false); }
          else { spinRef.current = { velocity: 0.001, decay: 1 }; setSpinning(true); }
        }}>
          {spinning ? "Stop rotation" : "Auto rotate"}
        </button>
        <button type="button" data-action={isFullscreen ? "fullscreen-exit" : "fullscreen"} onClick={() => void (isFullscreen ? document.exitFullscreen?.() : hostRef.current?.requestFullscreen?.())}>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</button>
      </div>
      <div className="universe-canvas-node-overlay" aria-label="Universe nodes">
        {model.edges.map((edge) => {
          const from = nodePositions[edge.from];
          const to = nodePositions[edge.to];
          if (!from || !to) return null;
          return <button key={edge.stableKey} type="button" data-edge-id={edge.stableKey} className="universe-edge-hit" aria-label={`Select edge ${edge.stableKey}`} style={{ left: `${(from.left + to.left) / 2}%`, top: `${(from.top + to.top) / 2}%` }} onClick={(event) => { event.stopPropagation(); setSelectedEdgeId(edge.stableKey); handleRef.current?.setSelectedEdge(edge.stableKey); onEdgeSelect?.(edge.stableKey); }} />;
        })}
        {model.nodes.map((node) => (
          <button
            key={node.stableKey}
            type="button"
            data-node-id={node.id}
            data-layer-depth={handleRef.current?.runtime.node(node.id)?.layerDepth ?? 0}
            data-world-y={handleRef.current?.runtime.node(node.id)?.y ?? 0}
            className={`universe-node-hit ${selectedId === node.id ? "is-selected" : ""} ${node.color === "#8f6b39" || (selectedId && !highlightedIds.has(node.id)) ? "is-dimmed" : ""}`}
            data-highlighted={highlightedIds.has(node.id)}
            style={{ left: `${nodePositions[node.id]?.left ?? 50}%`, top: `${nodePositions[node.id]?.top ?? 50}%`, color: "transparent", background: "transparent" }}
            onPointerDown={(event) => {
              const handle = handleRef.current;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, button: event.button, nodeId: node.id, moved: false, startedAt: performance.now() };
              select(node.id, false);
              hoverNode(node.id);
            }}
            onPointerEnter={() => hoverNode(node.id)}
            onPointerLeave={() => { setHoveredId(""); onHoverNode?.(""); handleRef.current?.setHighlight(selectedId); }}
            onClick={() => setSelectedId(node.id)}
            onPointerUp={onPointerUp}
            onDoubleClick={() => onDoubleClick?.(node.id)}
            aria-label={`Select ${node.label}`}
          />
        ))}
      </div>
    </div>
  );
}
