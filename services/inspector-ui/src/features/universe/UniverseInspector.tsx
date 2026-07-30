import type { ReactElement } from "react";
import type { SceneEdge, SceneNode } from "./universe-scene-model";

export type UniverseInspectorAnchor = { left: number; top: number };

type Props = {
  node: SceneNode | null;
  edge: SceneEdge | null;
  neighborLabels?: string[];
  anchor?: UniverseInspectorAnchor;
  onClose: () => void;
};

function value(value: unknown, fallback = "—"): string {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export function UniverseInspector({ node, edge, neighborLabels = [], anchor = { left: 50, top: 12 }, onClose }: Props): ReactElement | null {
  if (!node && !edge) return null;
  const style = { left: `${Math.min(76, Math.max(4, anchor.left))}%`, top: `${Math.min(76, Math.max(4, anchor.top))}%` };
  if (edge) {
    return <div className="universe-inspector-floating" data-info-kind="edge" style={style} role="status" aria-label="Edge details">
      <header><strong>{value(edge.predicate, edge.kind ?? "edge")}</strong><button type="button" aria-label="Close edge details" onClick={onClose}>×</button></header>
      <dl><dt>Source</dt><dd>{value(edge.from)}</dd><dt>Target</dt><dd>{value(edge.to)}</dd><dt>Snapshot</dt><dd>{value(edge.snapshotId)}</dd></dl>
      <p>{value((edge as unknown as Record<string, unknown>).description, "No relation description")}</p>
      {Boolean((edge as unknown as Record<string, unknown>).sourceChunkId) && <small>Evidence {value((edge as unknown as Record<string, unknown>).sourceChunkId)}</small>}
    </div>;
  }
  if (!node) return null;
  return <div className="universe-inspector-floating" data-info-kind="node" style={style} role="status" aria-label="Node details">
    <header><strong>{value(node.label, node.id)}</strong><button type="button" aria-label="Close node details" onClick={onClose}>×</button></header>
    <span>{value(node.kind, "node")}</span><p>{value(node.description, "No description")}</p>
    {neighborLabels.length > 0 && <div className="universe-inspector-neighbors" aria-label="Adjacent nodes">{neighborLabels.map((label, index) => <span key={`${label}-${index}`} data-neighbor-name>{label}</span>)}</div>}
  </div>;
}
