export type PortalMode = "universe" | "query" | "ingestion";
export type Locale = "zh-CN" | "en-US";
export type ThemeMode = "dark" | "light" | "system";

export const modes: Array<{ id: PortalMode; zh: string; en: string; hint: string }> = [
  { id: "universe", zh: "知识宇宙", en: "Knowledge Universe", hint: "Ontology · KG" },
  { id: "query", zh: "查询与搜索", en: "Query / Search", hint: "Retrieval · Evidence" },
  { id: "ingestion", zh: "文档导入", en: "Document Ingestion", hint: "Upload · Review · Publish" },
];
