# Synthetic Toy 数据说明

这是一套完全虚构的 TOPCon 涂层工艺最小用例，便于评委在不接入任何真实
Provider 的情况下理解 `文档 → Chunks → Embedding → Ontology → KG → Evidence`
的数据关系。

- `source/synthetic-coating-note.md`：唯一的合成原文。
- `chunks.jsonl`：按 section 切分的两个稳定 Chunk；每个 Chunk 回链到原文。
- `embeddings.jsonl`：八维 `local-hash-demo` 确定性示例向量，仅展示数据形态，
  不是任何外部模型的输出。
- `ontology.json`：Process、Material、Parameter、Property、Evidence 及四种关系。
- `entities.jsonl`、`relations.jsonl`：带 Chunk 来源的 Toy KG。
- `manifest.json`：数据集、Snapshot 和溯源策略摘要。

关系端点可用稳定实体 ID 解析；关系证据通过 `source_doc_id` 与
`source_chunk_id` 回到 `chunks.jsonl` 和原文。使用真实 Provider 重新上传原文时，
运行时会生成新的候选结果，Toy Snapshot 不会被直接覆盖。
