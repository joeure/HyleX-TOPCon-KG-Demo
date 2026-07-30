import type { UniverseView } from "../domain/universe";

export const fixtureUniverse: UniverseView = {
  snapshotId: "toy_snapshot_v1",
  ontologyVersion: "synthetic_ontology_v1",
  updatedAt: "2026-07-30T00:00:00Z",
  proposalCount: 1,
  nodes: [
    { id: "knowledge", label: "Synthetic TOPCon Toy", labelEn: "Synthetic TOPCon Toy", layer: "upper", x: 50, y: 46, size: 32, count: "5 concepts", description: "完全虚构的 TOPCon 涂层最小知识宇宙。", color: "#9fe8ff" },
    { id: "process", label: "Process", labelEn: "Process", layer: "domain", parentId: "knowledge", x: 26, y: 27, size: 21, count: "2", description: "Toy seed-layer pass and cure step.", color: "#8ea5ff" },
    { id: "material", label: "Material", labelEn: "Material", layer: "domain", parentId: "knowledge", x: 74, y: 28, size: 21, count: "1", description: "ToySilica-A synthetic material.", color: "#c4a1ff" },
    { id: "equipment", label: "Document", labelEn: "Document", layer: "domain", parentId: "knowledge", x: 20, y: 72, size: 20, count: "1", description: "Synthetic source document.", color: "#69d9c3" },
    { id: "quality", label: "Property", labelEn: "Property", layer: "domain", parentId: "knowledge", x: 78, y: 70, size: 20, count: "1", description: "Toy film hardness property.", color: "#ffc57c" },
    { id: "parameter", label: "Parameter", labelEn: "Parameter", layer: "reference", parentId: "process", x: 37, y: 84, size: 12, count: "1", description: "Toy cure temperature.", color: "#72aefc" },
    { id: "evidence", label: "Evidence", labelEn: "Evidence", layer: "reference", parentId: "material", x: 63, y: 84, size: 12, count: "2 chunks", description: "Synthetic evidence chunks only.", color: "#ec8fca" },
  ],
  edges: [
    { from: "knowledge", to: "process", kind: "inheritance" }, { from: "knowledge", to: "material", kind: "inheritance" }, { from: "knowledge", to: "equipment", kind: "inheritance" }, { from: "knowledge", to: "quality", kind: "inheritance" },
    { from: "process", to: "parameter", kind: "inheritance" }, { from: "material", to: "evidence", kind: "evidence" }, { from: "equipment", to: "quality", kind: "relation" }, { from: "quality", to: "evidence", kind: "evidence" },
    { from: "parameter", to: "evidence", kind: "relation", proposal: true },
  ],
  instances: {
    process: [
      { id: "process-coating", label: "喷涂工艺", labelEn: "Spray coating", layer: "instance", parentId: "process", x: 24, y: 30, size: 14, count: "18", description: "来自已发布文档的工艺实例。", color: "#9db4ff" },
      { id: "process-curing", label: "固化过程", labelEn: "Curing process", layer: "instance", parentId: "process", x: 50, y: 22, size: 12, count: "11", description: "固化和后处理相关实例。", color: "#7894e9" },
      { id: "process-inspection", label: "过程检验", labelEn: "Process inspection", layer: "instance", parentId: "process", x: 77, y: 31, size: 11, count: "9", description: "过程质量检查实例。", color: "#78d5cb" },
    ],
    material: [
      { id: "material-polymer", label: "聚合物体系", labelEn: "Polymer system", layer: "instance", parentId: "material", x: 30, y: 27, size: 13, count: "22", description: "配方中的聚合物材料。", color: "#d0b2ff" },
      { id: "material-pigment", label: "功能颜料", labelEn: "Functional pigment", layer: "instance", parentId: "material", x: 68, y: 24, size: 13, count: "16", description: "具备功能性的颜料实例。", color: "#bf91ef" },
      { id: "material-solvent", label: "溶剂组分", labelEn: "Solvent component", layer: "instance", parentId: "material", x: 77, y: 45, size: 11, count: "13", description: "溶剂与挥发组分。", color: "#9f84da" },
    ],
    equipment: [{ id: "equipment-line", label: "生产线 A", labelEn: "Production line A", layer: "instance", parentId: "equipment", x: 25, y: 45, size: 14, count: "8", description: "涂层生产线设备实例。", color: "#71e1c9" }],
    quality: [{ id: "quality-adhesion", label: "附着力", labelEn: "Adhesion", layer: "instance", parentId: "quality", x: 74, y: 45, size: 14, count: "21", description: "质量属性和检测结果实例。", color: "#ffd18d" }],
  },
  evidence: {
    "process-coating": [{ id: "evidence-paper", label: "论文 · 涂层工艺", labelEn: "Paper · Coating process", layer: "evidence", parentId: "process-coating", x: 50, y: 50, size: 16, count: "p. 4", description: "证据片段：涂层制备工艺与关键参数。", color: "#f2a8d2" }],
    "material-polymer": [{ id: "evidence-sop", label: "SOP · 配方规范", labelEn: "SOP · Formulation", layer: "evidence", parentId: "material-polymer", x: 50, y: 50, size: 16, count: "§2.1", description: "来源依据：配方和材料使用规范。", color: "#f2a8d2" }],
  },
};
