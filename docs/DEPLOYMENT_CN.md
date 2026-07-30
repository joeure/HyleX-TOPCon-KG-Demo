# Public Demo 部署边界

公开仓库通过 GitHub Pages 部署完整 Inspector 前端。交互式 Core、Query 和 UI Gateway 在独立 VPS 上运行；后端源码、镜像和 Secret 不上传 GitHub。

## 两个入口

- `https://joeure.github.io/HyleX-TOPCon-KG-Demo/`：完整三模式 Inspector 的公开预览；Universe 使用 Toy 数据，后端域名未启用时 Query/Ingestion 只显示准确的准备状态。
- `https://app-demo.<your-domain>/`：后续配置的 VPS 交互应用。没有域名时仅通过 SSH 隧道访问 `127.0.0.1:18512`。

## 公网前置条件

1. VPS 使用 `/opt/hylex-topcon-public`、独立 Compose project、网络、卷和 Secret。
2. Provider 策略使用 `public_https` 模式，允许通过 SSRF 检查的公开 HTTPS OpenAI-compatible API；管理员可通过 `denied_hosts` 收紧范围，策略更新不需要重建服务。
3. DNS 配置 `demo.<domain>` 指向 `joeure.github.io`，`app-demo.<domain>` 的 A 记录指向 VPS；80/443 只交给 Public Caddy。
4. 先用 loopback 完成无 Provider 和内部 Fake Provider 验收，再开放公网。

## 运行边界

Public Core 使用文件状态和 Synthetic Toy Snapshot，不连接主系统 PostgreSQL、Neo4j、MinIO、MinerU 或卷。Public Gateway 创建邀请码和 `public_inspector` 用户；Provider Key 只在当前会话内存中临时存在。用户只能查看自己的候选文档和 Query 会话，不能 Audit、Approve、Publish 或 Promote。

主栈的清理只允许定向删除 Docker Build Cache；不得运行全局 prune、删除主数据或删除主栈卷。
