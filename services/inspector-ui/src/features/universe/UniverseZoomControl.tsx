import { useRef, type ReactElement } from "react";

type Props = {
  value: number;
  onChange: (value: number) => void;
  onSemanticStep?: (direction: "in" | "out") => void;
};

const SEMANTIC_SLIDER_INTERVAL = 16;

export function UniverseZoomControl({ value, onChange, onSemanticStep }: Props): ReactElement {
  const semanticAnchorRef = useRef(value);
  const update = (next: number): void => onChange(Math.max(0, Math.min(100, next)));
  const step = (direction: "in" | "out"): void => {
    update(value + (direction === "in" ? 6 : -6));
    semanticAnchorRef.current = value;
    onSemanticStep?.(direction);
  };
  const slide = (next: number): void => {
    update(next);
    const difference = next - semanticAnchorRef.current;
    if (Math.abs(difference) < SEMANTIC_SLIDER_INTERVAL) return;
    semanticAnchorRef.current = next;
    onSemanticStep?.(difference > 0 ? "in" : "out");
  };
  return (
    <div className="universe-zoom-control" aria-label="Universe zoom controls">
      <button type="button" aria-label="Zoom in" onClick={() => step("in")}>+</button>
      <input aria-label="Universe zoom" type="range" min="0" max="100" step="1" value={Math.round(value)} onChange={(event) => slide(Number(event.currentTarget.value))} />
      <button type="button" aria-label="Zoom out" onClick={() => step("out")}>−</button>
    </div>
  );
}
