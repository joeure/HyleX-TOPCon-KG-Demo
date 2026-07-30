import type { ReactElement } from "react";

export function UniverseControls({ layerMode, onLayerModeChange }: { layerMode: boolean; onLayerModeChange: (enabled: boolean) => void }): ReactElement {
  return <div className="universe-controls" aria-label="Universe layout controls">
    <button type="button" role="switch" aria-checked={layerMode} aria-label="Layer layout" onClick={() => onLayerModeChange(!layerMode)}>
      Layer
    </button>
  </div>;
}
