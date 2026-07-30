import type { SceneBundle, SceneEdge, SceneModel, SceneNode } from "./universe-scene-model";

type DeviceClass = "desktop" | "mobile";

export class UniverseWorkingSet {
  private readonly bundles = new Map<string, SceneBundle>();
  private readonly pinned = new Set<string>();
  private epochValue: number;

  constructor(_device: DeviceClass = "desktop", private model: SceneModel) {
    this.epochValue = model.epoch;
  }

  get epoch(): number { return this.epochValue; }
  get snapshotId(): string { return this.model.snapshotId; }
  get nodes(): SceneNode[] { return this.model.nodes; }
  get edges(): SceneEdge[] { return this.model.edges; }

  reset(model: SceneModel): void {
    this.bundles.clear();
    this.pinned.clear();
    this.model = model;
    this.epochValue = model.epoch;
  }

  pinNode(stableKey: string): void { this.pinned.add(stableKey); }
  unpinNode(stableKey: string): void { this.pinned.delete(stableKey); }

  admit(bundle: SceneBundle): boolean {
    if (bundle.snapshotId !== this.model.snapshotId || bundle.epoch !== this.epochValue) return false;
    if (this.bundles.has(bundle.id)) return true;
    this.bundles.set(bundle.id, bundle);
    this.rebuild();
    return true;
  }

  rejectStale(bundle: SceneBundle): boolean {
    return bundle.snapshotId !== this.model.snapshotId || bundle.epoch !== this.epochValue;
  }

  private rebuild(): void {
    const baseNodes = this.model.nodes;
    const baseEdges = this.model.edges;
    const nodes = new Map(baseNodes.map((node) => [node.stableKey, node]));
    const edges = new Map(baseEdges.map((edge) => [edge.stableKey, edge]));
    for (const bundle of this.bundles.values()) {
      for (const node of bundle.nodes) nodes.set(node.stableKey, node);
      for (const edge of bundle.edges) edges.set(edge.stableKey, edge);
    }
    const allNodes = [...nodes.values()];
    const keep = allNodes.slice();
    const keptIds = new Set(keep.map((node) => node.stableKey));
    const kindById = new Map(allNodes.map((node) => [node.id, node.kind]));
    const keptEdges = [...edges.values()].filter(
      (edge) => keptIds.has(`${this.model.snapshotId}:node:${kindById.get(edge.from) ?? "entity"}:${edge.from}`)
        && keptIds.has(`${this.model.snapshotId}:node:${kindById.get(edge.to) ?? "entity"}:${edge.to}`),
    );
    this.model = { ...this.model, nodes: keep, edges: keptEdges };
  }
}
