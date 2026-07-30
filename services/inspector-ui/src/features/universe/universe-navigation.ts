import type { UniverseNode } from "../../domain/universe";

export type SemanticStage = "ontology" | "concept-kg" | "expanded-kg" | "global-kg";

export type UniverseNavigationState = {
  stage: SemanticStage;
  focusId: string | null;
  conceptId: string | null;
  depth: number;
  zoomProgress: number;
  evidence: boolean;
  manualDrill: boolean;
  dimBoundary: boolean;
  zoomTargetId: string | null;
};

export type ZoomAvailability = {
  hasMoreRelations: boolean;
  hasMoreEvidence: boolean;
};

export const initialUniverseNavigation: UniverseNavigationState = {
  stage: "ontology",
  focusId: null,
  conceptId: null,
  depth: 0,
  zoomProgress: 0,
  evidence: false,
  manualDrill: false,
  dimBoundary: false,
  zoomTargetId: null,
};

export const ONTOLOGY_ZOOM_THRESHOLD = 3;
export const SEMANTIC_ZOOM_OUT_THRESHOLD = 3;

/** Return the semantic projection fraction after a global-graph camera zoom. */
export function globalPanelFractionAfterZoomOut(previous: number, deltaY: number): number {
  const clamped = Math.min(1, Math.max(0, previous));
  if (clamped <= 0.5) return clamped;
  if (deltaY <= 0) return Math.min(1, clamped / 0.86);
  return Math.max(0, clamped * 0.86);
}

export function enterConcept(
  state: UniverseNavigationState,
  conceptId: string,
  manual = true,
): UniverseNavigationState {
  return {
    ...state,
    stage: "concept-kg",
    focusId: conceptId,
    conceptId,
    depth: 1,
    zoomProgress: 0,
    evidence: false,
    manualDrill: manual,
    dimBoundary: manual,
    zoomTargetId: null,
  };
}

export function enterEntity(
  state: UniverseNavigationState,
  entityId: string,
  depth = 1,
): UniverseNavigationState {
  const conceptId = state.conceptId ?? (state.stage === "concept-kg" ? state.focusId : null);
  return {
    ...state,
    stage: "expanded-kg",
    focusId: entityId,
    conceptId,
    depth: Math.max(1, depth),
    zoomProgress: 0,
    evidence: false,
    manualDrill: false,
    dimBoundary: false,
    zoomTargetId: null,
  };
}

export function zoomIn(
  state: UniverseNavigationState,
  availability: ZoomAvailability,
  ontologyTargetId?: string,
): UniverseNavigationState {
  if (state.stage === "ontology") {
    if (!ontologyTargetId) return state;
    const sameTarget = state.zoomTargetId === ontologyTargetId;
    return {
      ...state,
      zoomTargetId: ontologyTargetId,
      zoomProgress: sameTarget
        ? Math.min(ONTOLOGY_ZOOM_THRESHOLD, state.zoomProgress + 1)
        : 1,
    };
  }
  if (availability.hasMoreRelations) {
    return { ...state, stage: "expanded-kg", depth: state.depth + 1, zoomProgress: 0 };
  }
  if (state.stage === "concept-kg") return { ...state, zoomProgress: 0 };
  if (availability.hasMoreEvidence && !state.evidence) {
    return { ...state, evidence: true, zoomProgress: 0 };
  }
  return state.zoomProgress ? { ...state, zoomProgress: 0 } : state;
}

export function zoomOut(
  state: UniverseNavigationState,
  panelFraction: number,
): UniverseNavigationState {
  if (state.stage === "ontology") return state;
  void panelFraction;
  const nextProgress = state.zoomProgress + 1;
  if (nextProgress < SEMANTIC_ZOOM_OUT_THRESHOLD) {
    return { ...state, zoomProgress: nextProgress };
  }
  if (state.stage === "global-kg") {
    return { ...initialUniverseNavigation };
  }
  if (state.evidence) return { ...state, evidence: false, zoomProgress: 0 };
  if (state.depth > 1) return { ...state, depth: state.depth - 1, zoomProgress: 0 };
  if (state.stage === "expanded-kg") return { ...state, stage: "concept-kg", focusId: state.conceptId, depth: 1, zoomProgress: 0 };
  if (state.stage === "concept-kg") {
    return { ...initialUniverseNavigation };
  }
  return { ...initialUniverseNavigation };
}

export function enterGlobal(state: UniverseNavigationState): UniverseNavigationState {
  return { ...state, stage: "global-kg", focusId: null, conceptId: null, depth: 1, zoomProgress: 0, evidence: false, dimBoundary: false, zoomTargetId: null };
}

export function resolveZoomTarget(
  nodes: UniverseNode[],
  hoveredId: string | null,
  center: { x: number; y: number },
): string | null {
  const hovered = nodes.find((node) => node.id === hoveredId && node.kind === "concept");
  if (hovered) return hovered.id;
  void center;
  return null;
}
