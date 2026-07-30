# 评审版架构

```mermaid
flowchart LR
  B[评委浏览器] --> I[Inspector UI]
  I --> G[UI Gateway 镜像]
  G --> C[Core 镜像]
  G --> Q[Query 镜像]
  Q --> C
  C --> S[本地文件状态与 Toy Snapshot]
  P[运行方 Provider 文件] --> V[一次性 provision CLI]
  V --> C
  V --> Q
```

Inspector 是唯一公开前端。UI Gateway 负责 Demo 用户会话和最小 BFF 路由；Core
负责文件型 Snapshot、Ontology、KG、证据和审核状态；Query 通过 Core 公开 HTTP
契约读取 Snapshot。评审版不启动 PostgreSQL、Neo4j、MinIO、Streamlit、Evaluation、
BI、Safety 或 MinerU。Provider 配置只在运行时由外挂文件导入，永不写入源码、公开
仓库、镜像或日志。
