import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { UniverseEdge, UniverseNode, UniverseView, UniverseZoom } from "../../domain/universe";

type Props = { view: UniverseView; selectedId: string; zoom: UniverseZoom; onSelect: (id: string) => void; showProposals: boolean };

function visibleGraph(view: UniverseView, selectedId: string, zoom: UniverseZoom) {
  const root = view.nodes.find((node) => node.id === "knowledge") ?? view.nodes[0];
  const selected = view.nodes.find((node) => node.id === selectedId) ?? root;
  if (zoom === "overview") return { nodes: view.nodes, edges: view.edges };
  if (zoom === "concept") {
    const childIds = view.nodes.filter((node) => node.parentId === selected.id).map((node) => node.id);
    const nodes = [root, selected, ...view.nodes.filter((node) => childIds.includes(node.id) || node.parentId === selected.parentId && node.layer === "domain")].filter((node, index, all) => all.findIndex((candidate) => candidate.id === node.id) === index);
    return { nodes, edges: view.edges.filter((edge) => nodes.some((node) => node.id === edge.from) && nodes.some((node) => node.id === edge.to)) };
  }
  const instances = view.instances[selected.id] ?? view.instances[selected.parentId ?? ""] ?? [];
  if (zoom === "instance") {
    const nodes = [selected, ...instances];
    const edges = instances.map((node): UniverseEdge => ({ from: selected.id, to: node.id, kind: "relation" }));
    return { nodes, edges };
  }
  const evidence = view.evidence[selected.id] ?? [];
  const nodes = [selected, ...evidence];
  const edges = evidence.map((node): UniverseEdge => ({ from: selected.id, to: node.id, kind: "evidence" }));
  return { nodes, edges };
}

export function UniverseScene({ view, selectedId, zoom, onSelect, showProposals }: Props) {
  const graph = useMemo(() => visibleGraph(view, selectedId, zoom), [view, selectedId, zoom]);
  const positions = useMemo(() => Object.fromEntries(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const activeLayer = graph.nodes.find((node) => node.id === selectedId)?.layer;
  return <div className="universe-stage" aria-label={`Ontology and knowledge graph ${zoom} view`}>
    <svg viewBox="0 0 100 100" role="img" data-testid="universe-scene">
      <ellipse className="orbit" cx="50" cy="50" rx="43" ry="37" /><ellipse className="orbit" cx="50" cy="50" rx="31" ry="25" /><ellipse className="orbit" cx="50" cy="50" rx="18" ry="14" />
      {graph.edges.map((edge) => { const from = positions[edge.from]; const to = positions[edge.to]; if (!from || !to || (edge.proposal && !showProposals)) return null; return <line key={`${edge.from}-${edge.to}`} className={`edge ${edge.kind ?? "relation"}${edge.proposal ? " proposal" : ""}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />; })}
      {graph.nodes.map((node: UniverseNode) => { const isCenter = node.id === "knowledge" && zoom === "overview"; const dim = selectedId !== node.id && zoom === "concept" && node.layer !== activeLayer; const keyHandler = (event: KeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }; return <g key={node.id} className={`node${dim ? " dim" : ""}`} style={{ color: node.color }} onClick={() => onSelect(node.id)} tabIndex={0} role="button" aria-label={node.label} onKeyDown={keyHandler}>
        <circle className={isCenter ? "universe-center" : "node-halo"} cx={node.x} cy={node.y} r={isCenter ? 10 : node.size / 3.1} />
        {!isCenter && <circle className="node-core" fill={node.color} cx={node.x} cy={node.y} r={node.size / 5.2} />}
        <text className={isCenter ? "universe-center-label" : "node-label"} x={node.x} y={node.y + (isCenter ? 1 : node.size / 1.5)}>{node.label}</text>
        <text className={isCenter ? "universe-center-count" : "node-count"} x={node.x} y={node.y + (isCenter ? 6 : node.size / 1.5 + 4)}>{node.count}</text>
      </g>; })}
    </svg>
  </div>;
}
