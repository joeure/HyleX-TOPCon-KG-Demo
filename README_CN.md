# HyleX TOPCon Public Demo

这是比赛 Public Demo 的公开内容仓库。它只包含完整 Inspector UI、GitHub Pages 构建入口、完全合成的 Toy 数据和接口/数据说明；Core、Query、UI Gateway 的源码、二进制和 OCI 镜像均不在本仓库。

## 公开站点

GitHub Pages 默认地址：`https://joeure.github.io/HyleX-TOPCon-KG-Demo/`

Pages 根页面直接是完整的三模式 Inspector：Knowledge Universe、Query/Search、Document Ingestion。无 VPS Gateway 时，Universe 使用 `toy_snapshot_v1` 的只读预览，Query 和 Ingestion 仍然可打开并显示 Provider/后端准备状态，不伪造成功结果。正式交互式登录、Provider、Query 和文档上传通过独立 VPS 应用提供。

## 本地查看 Inspector UI

需要 Node.js 18+。在 `services/inspector-ui` 中运行 `npm ci`、`npm run typecheck` 和 `npm run build` 即可检查公开前端。公开仓库不包含后端，因此不能仅靠 GitHub Pages 启动完整 Inspector。

## Toy 示例

`toy-data/` 是一份独立、完全虚构的 TOPCon 涂层示例，包含：

- `chunks.jsonl`：带来源和位置的文本片段；
- `embeddings.jsonl`：示例向量及其模型标签；
- `ontology.json`：概念和关系约束；
- `entities.jsonl`、`relations.jsonl`：实体、关系和 evidence/chunk 回链。

数据不包含真实论文、企业文件、Provider、API Key 或主仓库标识。

## Public Demo 边界

评委使用一次性邀请码注册 `public_inspector` 账户。第一版允许符合 SSRF 防护规则的公开 HTTPS OpenAI-compatible Provider；管理员可以通过 `denied_hosts` 收紧策略。API Key 只在当前 Gateway 进程的 Session Vault 中临时保存。用户可以查看 Toy Universe、配置 Query/Extraction Provider、查询自己的会话并上传文档查看候选解析结果，但不能 Audit、Approve、Decision、Publish 或访问其他用户数据。候选数据在 24 小时后清理。

## 许可证和数据说明

请先阅读 [`EVALUATION-NOTICE.md`](EVALUATION-NOTICE.md)、[`docs/DATA_AND_IP_NOTICE_CN.md`](docs/DATA_AND_IP_NOTICE_CN.md) 和 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
