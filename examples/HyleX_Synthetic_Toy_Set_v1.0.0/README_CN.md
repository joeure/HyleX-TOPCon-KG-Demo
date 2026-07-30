# HyleX Synthetic Toy Set v1.0.0

这是一份可独立分发、完全合成的最小知识图谱示例。它展示一份虚构涂层工艺笔记
如何被组织成 Chunks、示例 Embedding、Ontology、KG 实体、KG 关系和 Evidence
回链。数据不来自真实论文、企业文件、实验记录或完整系统。

## 1. 用例

合成原文只表达两个简单事实：

1. Toy seed-layer pass 使用虚构材料 `ToySilica-A`。
2. Toy cure temperature 影响 Toy film hardness。

用例刻意保持小而清晰，便于人工逐行核对端点、类型和证据，不用于证明任何真实
TOPCon 或涂层工艺结论。

## 2. 文件

| 文件 | 作用 |
|---|---|
| `source/synthetic-coating-note.md` | 唯一合成原文，可重新上传到 Inspector |
| `chunks.jsonl` | 两个稳定 Chunk，含文档、章节和来源路径 |
| `embeddings.jsonl` | 与 Chunk 对应的 8 维确定性示例向量 |
| `ontology.json` | Toy 概念类型与关系类型 |
| `entities.jsonl` | 五个 Toy KG 实体 |
| `relations.jsonl` | 三条带 Evidence 的 Toy KG 关系 |
| `manifest.json` | 数据集 ID、Snapshot、Ontology 版本和派生文件 |
| `checksums.txt` | 本示例包内文件的 SHA-256 |

`embeddings.jsonl` 使用 `local-hash-demo` 生成的固定示例值，只用于说明 Chunk 与
向量记录的对应关系。它不是项目方或任何外部 Provider 的模型输出，也不用于评价
语义检索质量。

## 3. 数据关系

```text
source/synthetic-coating-note.md
  ├─ toy:chunk-1
  │   ├─ toy:process-seed-pass
  │   ├─ toy:process-cure
  │   ├─ toy:material-silica
  │   └─ toy:rel-uses
  └─ toy:chunk-2
      ├─ toy:parameter-temperature
      ├─ toy:property-hardness
      ├─ toy:rel-parameter
      └─ toy:rel-affects
```

关系端点使用 `subject` 和 `object` 指向 `entities.jsonl` 中的稳定实体 ID。
`source_doc_id` 与 `source_chunk_id` 将实体和关系回链到 `chunks.jsonl`，Chunk
再通过 `source_path` 回到唯一原文。

## 4. 人工核对

1. 打开 `manifest.json`，确认 `synthetic_only` 为 `true`。
2. 对 `chunks.jsonl` 中每个 `chunk_id`，在 `embeddings.jsonl` 找到同 ID 记录。
3. 对 `entities.jsonl` 中每个 `type`，在 `ontology.json` 找到相应 concept。
4. 对 `relations.jsonl` 中每个 `predicate`，在 `ontology.json` 找到相应 relation。
5. 对每条关系的 `subject` 和 `object`，在 `entities.jsonl` 找到端点。
6. 沿 `source_chunk_id` 回到 Chunk，再沿 `source_path` 回到原文并核对证据。
7. 在 Linux 上执行 `sha256sum -c checksums.txt` 检查文件完整性。

## 5. 在评审版中运行

首次启动评审版时，根目录的同一套 `toy-data/` 会自动加载为 `toy_snapshot_v1`。
登录 Inspector 后可以直接查看 Universe、关系和 Evidence，无需 Provider。

若要验证新文档抽取：

1. 按评审包根目录 `README_CN.md` 配置运行方自己的 Extraction Provider。
2. 在 Inspector 的“文档摄取”上传
   `source/synthetic-coating-note.md`。
3. 查看 Parsing、Extraction、Ontology Proposal 和 KG Delta。
4. 先审核 Ontology，再审核 Document KG，最后 Publish。
5. 返回“知识宇宙”查看新 Snapshot 和 Evidence。

不同 Provider 可能产生不同的切分、实体命名、候选关系或置信度，因此重新抽取的
结果不要求逐字等于本包的确定性参考文件。应核对的是工作流可运行、关系端点有效、
每条获批知识有来源证据、发布后可在 Inspector 中追溯。

## 6. 数据与许可

所有名称、ID、文字和数值均为评审用途的合成内容。`ToySilica-A` 等名称不代表
真实产品、材料或企业。该示例包可以随 HyleX TOPCon KG 比赛评审材料使用；后端
运行镜像仍受评审包根目录 `EVALUATION-NOTICE.md` 约束。
